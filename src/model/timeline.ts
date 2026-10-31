import {
  Clip, MediaAsset, Op, OpBody, Project, Timeline, TIMELINE_SCHEMA, TIMELINE_SCHEMA_VERSION, Actor,
} from './types';

export const MIN_CLIP = 0.1; // seconds
export const DEFAULT_IMAGE_SECONDS = 3;
export const MAX_IMAGE_SECONDS = 60;

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export function emptyTimeline(): Timeline {
  return {
    schema: TIMELINE_SCHEMA,
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    aspect: '16:9',
    fps: 30,
    tracks: { video: [], text: [], overlay: [], audio: [], captions: [] },
  };
}

export const clipLen = (c: Clip) => Math.max(0, c.out - c.in);
export const duration = (t: Timeline) => t.tracks.video.reduce((s, c) => s + clipLen(c), 0);

/** Timeline start time of every clip. */
export function clipStarts(t: Timeline): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const c of t.tracks.video) { out.push(acc); acc += clipLen(c); }
  return out;
}

/** Which clip plays at timeline time `time`, and the source time inside it. */
export function locate(t: Timeline, time: number): { index: number; clip: Clip; start: number; src: number } | null {
  const v = t.tracks.video;
  let acc = 0;
  for (let i = 0; i < v.length; i++) {
    const len = clipLen(v[i]);
    if (time < acc + len || i === v.length - 1) {
      const local = Math.min(Math.max(0, time - acc), len);
      return { index: i, clip: v[i], start: acc, src: v[i].in + local };
    }
    acc += len;
  }
  return null;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Pure reducer for one (non-undo/redo) op. Invalid ops are ignored, never throw. */
export function applyOp(t: Timeline, op: OpBody, media: Record<string, MediaAsset>): Timeline {
  const n = clone(t);
  const v = n.tracks.video;
  const find = (id: string) => v.findIndex((c) => c.id === id);
  const maxOut = (c: Clip) => {
    const m = media[c.mediaId];
    return !m || m.kind === 'image' ? MAX_IMAGE_SECONDS : m.duration;
  };
  switch (op.type) {
    case 'addClips': {
      const at = op.index == null ? v.length : Math.max(0, Math.min(v.length, op.index));
      v.splice(at, 0, ...clone(op.clips));
      break;
    }
    case 'moveClip': {
      const i = find(op.clipId);
      if (i < 0) break;
      const [c] = v.splice(i, 1);
      v.splice(Math.max(0, Math.min(v.length, op.toIndex)), 0, c);
      break;
    }
    case 'trimClip': {
      const i = find(op.clipId);
      if (i < 0) break;
      const c = v[i];
      const lo = Math.max(0, Math.min(op.in, maxOut(c) - MIN_CLIP));
      const hi = Math.min(maxOut(c), Math.max(op.out, lo + MIN_CLIP));
      c.in = lo; c.out = hi;
      break;
    }
    case 'splitClip': {
      const i = find(op.clipId);
      if (i < 0) break;
      const c = v[i];
      if (op.at <= c.in + MIN_CLIP / 2 || op.at >= c.out - MIN_CLIP / 2) break;
      const b: Clip = { ...c, id: op.newId, in: op.at };
      c.out = op.at;
      v.splice(i + 1, 0, b);
      break;
    }
    case 'deleteClip': {
      const i = find(op.clipId);
      if (i >= 0) v.splice(i, 1);
      break;
    }
    case 'setVolume': {
      const i = find(op.clipId);
      if (i < 0) break;
      v[i].volume = Math.max(0, Math.min(2, op.volume));
      if (op.muted !== undefined) v[i].muted = op.muted;
      break;
    }
    case 'addText':
      n.tracks.text.push(clone(op.item));
      break;
    case 'updateText': {
      const it = n.tracks.text.find((x) => x.id === op.id);
      if (it) Object.assign(it, clone(op.patch));
      break;
    }
    case 'deleteText':
      n.tracks.text = n.tracks.text.filter((x) => x.id !== op.id);
      break;
    case 'setAspect':
      n.aspect = op.aspect;
      break;
  }
  return n;
}

/** Which ops are currently in effect (undo/redo resolved). */
export function effectiveOps(log: Op[]): Op[] {
  const undone = new Set<number>();
  for (const op of log) {
    if (op.type === 'undo') undone.add(op.target);
    else if (op.type === 'redo') undone.delete(op.target);
  }
  return log.filter((op) => op.type !== 'undo' && op.type !== 'redo' && !undone.has(op.seq));
}

export function replay(p: Pick<Project, 'base' | 'log' | 'media'>): Timeline {
  return effectiveOps(p.log).reduce((t, op) => applyOp(t, op, p.media), clone(p.base));
}

/** The undo stack is the effective edit ops in order; redo stack = ops undone since the last new edit. */
export function undoTarget(log: Op[]): number | null {
  const eff = effectiveOps(log);
  return eff.length ? eff[eff.length - 1].seq : null;
}

export function redoTarget(log: Op[]): number | null {
  // Walk back: a new edit op clears redo; undo ops (not later redone) are redo candidates (LIFO).
  const stack: number[] = [];
  for (const op of log) {
    if (op.type === 'undo') stack.push(op.target);
    else if (op.type === 'redo') { const i = stack.lastIndexOf(op.target); if (i >= 0) stack.splice(i, 1); }
    else stack.length = 0;
  }
  return stack.length ? stack[stack.length - 1] : null;
}

/** Append an op to the project (returns a new project object). */
export function commit(p: Project, body: OpBody, by: Actor = 'user'): Project {
  const seq = (p.log.length ? p.log[p.log.length - 1].seq : 0) + 1;
  const op = { ...body, seq, ts: new Date().toISOString(), by } as Op;
  const log = [...p.log, op];
  const next: Project = { ...p, log, updatedAt: op.ts };
  next.timeline = replay(next);
  return next;
}

export function newProject(name: string): Project {
  const now = new Date().toISOString();
  const base = emptyTimeline();
  return { id: uid('p_'), name, createdAt: now, updatedAt: now, media: {}, base, log: [], timeline: clone(base) };
}

/** Portable export of the project document (no media bytes). */
export function exportProjectJson(p: Project): string {
  return JSON.stringify({ schema: 'vlogup/project', schemaVersion: 1, project: { ...p, timeline: replay(p) } }, null, 2);
}

export const fmtTime = (s: number) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
};
