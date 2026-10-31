/**
 * Typed AI tools → timeline ops. The model never touches the timeline directly: each tool call
 * is validated, converted to an OpBody and committed to the append-only edit log with actor 'ai'
 * (so the user can undo every AI change). Invalid calls return a clear error to the model.
 */
import type { Aspect, OpBody, Project, TextItem, TextStyle } from '../model/types';
import { clipLen, clipStarts, duration, MAX_IMAGE_SECONDS, MIN_CLIP, uid, undoTarget } from '../model/timeline';

export interface ToolDef { name: string; description: string; parameters: Record<string, unknown> }

const clipRef = { type: 'string', description: 'Clip position number as a string ("1" = first) or the clip id from the timeline.' };

export const TOOLS: ToolDef[] = [
  { name: 'get_timeline', description: 'Return the current timeline (clips in order with durations, texts, canvas). Call after edits if you need fresh numbers.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'move_clip', description: 'Move a clip to a new position in the order.', parameters: { type: 'object', properties: { clip: clipRef, to_position: { type: 'integer', minimum: 1, description: 'New position, 1 = first.' } }, required: ['clip', 'to_position'] } },
  { name: 'trim_clip', description: 'Set which part of the source clip is used, in SOURCE seconds (0 = start of the original file). E.g. keep 2.0–7.5 of the original.', parameters: { type: 'object', properties: { clip: clipRef, start: { type: 'number', minimum: 0 }, end: { type: 'number', minimum: 0 } }, required: ['clip', 'start', 'end'] } },
  { name: 'split_clip', description: 'Split a clip into two at a time measured from the START OF THAT CLIP as it currently plays (seconds).', parameters: { type: 'object', properties: { clip: clipRef, at: { type: 'number', minimum: 0 } }, required: ['clip', 'at'] } },
  { name: 'delete_clip', description: 'Remove a clip from the timeline.', parameters: { type: 'object', properties: { clip: clipRef }, required: ['clip'] } },
  { name: 'set_volume', description: 'Set clip volume in percent (0–200; 100 = original) and/or mute it.', parameters: { type: 'object', properties: { clip: clipRef, percent: { type: 'number', minimum: 0, maximum: 200 }, muted: { type: 'boolean' } }, required: ['clip'] } },
  { name: 'set_photo_duration', description: 'Set how long a PHOTO clip is shown (seconds, 0.5–60).', parameters: { type: 'object', properties: { clip: clipRef, seconds: { type: 'number', minimum: 0.5, maximum: 60 } }, required: ['clip', 'seconds'] } },
  {
    name: 'add_text', description: 'Add a text overlay (title, caption, label) on the timeline. Times are TIMELINE seconds.',
    parameters: {
      type: 'object', properties: {
        text: { type: 'string', description: 'Text to show; use \\n for a second line. Any language.' },
        start: { type: 'number', minimum: 0 }, end: { type: 'number', minimum: 0 },
        position: { type: 'string', enum: ['top', 'middle', 'bottom'] },
        style: { type: 'string', enum: ['outline', 'box', 'plain'] },
        color: { type: 'string', description: 'CSS hex colour, e.g. #ffffff, #ffd400' },
        size: { type: 'string', enum: ['small', 'medium', 'large', 'huge'] },
      }, required: ['text', 'start', 'end'],
    },
  },
  {
    name: 'update_text', description: 'Change an existing text overlay by id.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' }, start: { type: 'number' }, end: { type: 'number' }, position: { type: 'string', enum: ['top', 'middle', 'bottom'] }, style: { type: 'string', enum: ['outline', 'box', 'plain'] }, color: { type: 'string' }, size: { type: 'string', enum: ['small', 'medium', 'large', 'huge'] } }, required: ['id'] },
  },
  { name: 'delete_text', description: 'Remove a text overlay by id.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'set_canvas', description: 'Set the video format: 16:9 (YouTube), 9:16 (Shorts/Reels/TikTok) or 1:1 (square).', parameters: { type: 'object', properties: { aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] } }, required: ['aspect'] } },
  { name: 'undo', description: 'Undo the most recent edit(s) (user or AI).', parameters: { type: 'object', properties: { steps: { type: 'integer', minimum: 1, maximum: 20 } } } },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Compact, model-friendly view of the project. */
export function timelineBrief(p: Project) {
  const tl = p.timeline;
  const starts = clipStarts(tl);
  return {
    canvas: tl.aspect,
    total_seconds: r2(duration(tl)),
    clips: tl.tracks.video.map((c, i) => {
      const m = p.media[c.mediaId];
      return {
        position: i + 1, id: c.id, name: m?.name ?? 'clip', kind: m?.kind ?? 'video',
        timeline_start: r2(starts[i]), length: r2(clipLen(c)),
        source_in: r2(c.in), source_out: r2(c.out), source_duration: m?.kind === 'image' ? null : r2(m?.duration ?? 0),
        volume_percent: Math.round(c.volume * 100), muted: !!c.muted, has_audio: !!m?.hasAudio,
        resolution: m ? `${m.width}x${m.height}` : undefined,
      };
    }),
    texts: tl.tracks.text.map((t) => ({ id: t.id, text: t.text, start: r2(t.start), end: r2(t.end), y: r2(t.y), style: t.style, color: t.color })),
  };
}

const SIZES: Record<string, number> = { small: 0.045, medium: 0.065, large: 0.09, huge: 0.13 };
const POS: Record<string, number> = { top: 0.15, middle: 0.5, bottom: 0.82 };
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

class ToolError extends Error {}
const num = (v: unknown, name: string): number => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (typeof n !== 'number' || !isFinite(n)) throw new ToolError(`"${name}" must be a number`);
  return n;
};

export interface ToolOutcome { result: unknown; ops: OpBody[]; summary?: string; undoSteps?: number }

function findClip(p: Project, ref: unknown) {
  const v = p.timeline.tracks.video;
  if (ref == null || ref === '') throw new ToolError('"clip" is required');
  let i = -1;
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) i = Number(ref) - 1;
  if (i < 0 || i >= v.length) i = v.findIndex((c) => c.id === String(ref));
  if (i < 0 || i >= v.length) throw new ToolError(`Clip "${ref}" not found. There are ${v.length} clips (positions 1–${v.length}).`);
  return { clip: v[i], index: i, media: p.media[v[i].mediaId] };
}

/** Validate a tool call against the current project and turn it into ops (pure: does not commit). */
export function planTool(p: Project, name: string, args: Record<string, any>): ToolOutcome {
  try {
    switch (name) {
      case 'get_timeline':
        return { result: timelineBrief(p), ops: [] };
      case 'move_clip': {
        const { clip, index } = findClip(p, args.clip);
        const to = Math.max(1, Math.min(p.timeline.tracks.video.length, Math.round(num(args.to_position, 'to_position'))));
        return { result: { ok: true }, ops: [{ type: 'moveClip', clipId: clip.id, toIndex: to - 1 }], summary: `Moved clip ${index + 1} → position ${to}` };
      }
      case 'trim_clip': {
        const { clip, index, media } = findClip(p, args.clip);
        const max = !media || media.kind === 'image' ? MAX_IMAGE_SECONDS : media.duration;
        let s = num(args.start, 'start'), e = num(args.end, 'end');
        s = Math.max(0, Math.min(s, max)); e = Math.max(0, Math.min(e, max));
        if (e - s < MIN_CLIP) throw new ToolError(`end must be > start (source length is ${r2(max)} s)`);
        return { result: { ok: true, new_length: r2(e - s) }, ops: [{ type: 'trimClip', clipId: clip.id, in: s, out: e }], summary: `Trimmed clip ${index + 1} to ${r2(s)}–${r2(e)} s` };
      }
      case 'split_clip': {
        const { clip, index } = findClip(p, args.clip);
        const at = num(args.at, 'at');
        if (at <= MIN_CLIP || at >= clipLen(clip) - MIN_CLIP) throw new ToolError(`"at" must be between 0.1 and ${r2(clipLen(clip) - 0.1)} (clip length ${r2(clipLen(clip))} s)`);
        return { result: { ok: true }, ops: [{ type: 'splitClip', clipId: clip.id, at: clip.in + at, newId: uid('c_') }], summary: `Split clip ${index + 1} at ${r2(at)} s` };
      }
      case 'delete_clip': {
        const { clip, index } = findClip(p, args.clip);
        return { result: { ok: true }, ops: [{ type: 'deleteClip', clipId: clip.id }], summary: `Deleted clip ${index + 1}` };
      }
      case 'set_volume': {
        const { clip, index } = findClip(p, args.clip);
        const vol = args.percent == null ? clip.volume : Math.max(0, Math.min(200, num(args.percent, 'percent'))) / 100;
        const muted = args.muted == null ? clip.muted : !!args.muted;
        return { result: { ok: true }, ops: [{ type: 'setVolume', clipId: clip.id, volume: vol, muted }], summary: `Clip ${index + 1} volume ${muted ? 'muted' : Math.round(vol * 100) + '%'}` };
      }
      case 'set_photo_duration': {
        const { clip, index, media } = findClip(p, args.clip);
        if (media?.kind !== 'image') throw new ToolError(`Clip ${index + 1} is a video, not a photo. Use trim_clip.`);
        const sec = Math.max(0.5, Math.min(60, num(args.seconds, 'seconds')));
        return { result: { ok: true }, ops: [{ type: 'trimClip', clipId: clip.id, in: 0, out: sec }], summary: `Photo ${index + 1} shows for ${r2(sec)} s` };
      }
      case 'add_text': {
        const text = String(args.text ?? '').slice(0, 300);
        if (!text.trim()) throw new ToolError('"text" is empty');
        const total = Math.max(duration(p.timeline), 0.5);
        let s = Math.max(0, num(args.start ?? 0, 'start'));
        let e = num(args.end ?? s + 3, 'end');
        s = Math.min(s, total - 0.2); e = Math.max(Math.min(e, total), s + 0.2);
        const item: TextItem = {
          id: uid('t_'), text, start: s, end: e, x: 0.5, y: POS[args.position] ?? 0.82,
          size: SIZES[args.size] ?? 0.07, color: HEX.test(args.color ?? '') ? args.color : '#ffffff',
          style: (['outline', 'box', 'plain'].includes(args.style) ? args.style : 'outline') as TextStyle,
        };
        return { result: { ok: true, id: item.id }, ops: [{ type: 'addText', item }], summary: `Added text “${text.length > 30 ? text.slice(0, 30) + '…' : text}” ${r2(s)}–${r2(e)} s` };
      }
      case 'update_text': {
        const it = p.timeline.tracks.text.find((t) => t.id === args.id);
        if (!it) throw new ToolError(`Text "${args.id}" not found`);
        const patch: Partial<TextItem> = {};
        if (args.text != null) patch.text = String(args.text).slice(0, 300);
        if (args.start != null) patch.start = Math.max(0, num(args.start, 'start'));
        if (args.end != null) patch.end = num(args.end, 'end');
        if (args.position) patch.y = POS[args.position] ?? it.y;
        if (args.style && ['outline', 'box', 'plain'].includes(args.style)) patch.style = args.style;
        if (args.color && HEX.test(args.color)) patch.color = args.color;
        if (args.size) patch.size = SIZES[args.size] ?? it.size;
        const s = patch.start ?? it.start, e = patch.end ?? it.end;
        if (e - s < 0.2) throw new ToolError('end must be at least 0.2 s after start');
        return { result: { ok: true }, ops: [{ type: 'updateText', id: it.id, patch }], summary: `Updated text “${(patch.text ?? it.text).slice(0, 30)}”` };
      }
      case 'delete_text': {
        const it = p.timeline.tracks.text.find((t) => t.id === args.id);
        if (!it) throw new ToolError(`Text "${args.id}" not found`);
        return { result: { ok: true }, ops: [{ type: 'deleteText', id: it.id }], summary: `Removed text “${it.text.slice(0, 30)}”` };
      }
      case 'set_canvas': {
        if (!['16:9', '9:16', '1:1'].includes(args.aspect)) throw new ToolError('aspect must be 16:9, 9:16 or 1:1');
        return { result: { ok: true }, ops: [{ type: 'setAspect', aspect: args.aspect as Aspect }], summary: `Canvas ${args.aspect}` };
      }
      case 'undo': {
        const steps = Math.max(1, Math.min(20, Math.round(num(args.steps ?? 1, 'steps'))));
        if (undoTarget(p.log) == null) throw new ToolError('Nothing to undo');
        return { result: { ok: true }, ops: [], undoSteps: steps, summary: `Undid ${steps} edit${steps > 1 ? 's' : ''}` };
      }
      default:
        throw new ToolError(`Unknown tool "${name}"`);
    }
  } catch (e: any) {
    return { result: { ok: false, error: e instanceof ToolError ? e.message : `Invalid arguments: ${e?.message ?? e}` }, ops: [] };
  }
}
