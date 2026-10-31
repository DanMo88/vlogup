/**
 * VlogUp timeline model — schema "vlogup/timeline" v1.
 *
 * The timeline is a plain, versioned JSON document. It is never mutated directly:
 * every change is an Op appended to an append-only edit log (pattern borrowed from
 * Cutboard/OpenCardboard, MIT). The current timeline is always `replay(base, log)`.
 * This gives exact undo/redo, crash recovery and — from M4 — compact diffs for the AI.
 */

export const TIMELINE_SCHEMA = 'vlogup/timeline' as const;
export const TIMELINE_SCHEMA_VERSION = 1 as const;

export type Aspect = '16:9' | '9:16' | '1:1';

/** An imported media file (stored in OPFS / IndexedDB, referenced by id). */
export interface MediaAsset {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: 'video' | 'image';
  duration: number; // seconds (images: 0)
  width: number;
  height: number;
  hasAudio: boolean;
  /** Low-res proxy for smooth preview (540p), created in the background. */
  proxy?: { status: 'pending' | 'ready' | 'failed' | 'skipped'; height?: number };
  thumb?: string; // small data: URL JPEG
}

/** A clip on the main (A-roll) video track. Clips play back to back. */
export interface Clip {
  id: string;
  mediaId: string;
  /** Source in/out points in seconds. For images, out - in is the display length. */
  in: number;
  out: number;
  /** 0..2 (1 = 100%). */
  volume: number;
  muted?: boolean;
}

export type TextStyle = 'plain' | 'outline' | 'box';

/** A basic text overlay on the text track, positioned in timeline time. */
export interface TextItem {
  id: string;
  text: string;
  start: number; // timeline seconds
  end: number;
  /** Centre position, normalised 0..1 of the frame. */
  x: number;
  y: number;
  /** Font size as a fraction of frame height. */
  size: number;
  color: string;
  style: TextStyle;
}

export interface Timeline {
  schema: typeof TIMELINE_SCHEMA;
  schemaVersion: typeof TIMELINE_SCHEMA_VERSION;
  aspect: Aspect;
  fps: number;
  tracks: {
    video: Clip[];
    text: TextItem[];
    // Reserved for later milestones (kept in the schema so files stay forward-compatible):
    overlay: unknown[]; // M3 b-roll
    audio: unknown[]; // M2 music / voice / SFX
    captions: unknown[]; // M2
  };
}

/** Who produced an op. 'ai' and 'template' arrive in M4. */
export type Actor = 'user' | 'ai' | 'template' | 'system';

export type OpBody =
  | { type: 'addClips'; clips: Clip[]; index?: number }
  | { type: 'moveClip'; clipId: string; toIndex: number }
  | { type: 'trimClip'; clipId: string; in: number; out: number }
  | { type: 'splitClip'; clipId: string; at: number; newId: string } // `at` = source seconds
  | { type: 'deleteClip'; clipId: string }
  | { type: 'setVolume'; clipId: string; volume: number; muted?: boolean }
  | { type: 'addText'; item: TextItem }
  | { type: 'updateText'; id: string; patch: Partial<Omit<TextItem, 'id'>> }
  | { type: 'deleteText'; id: string }
  | { type: 'setAspect'; aspect: Aspect }
  | { type: 'undo'; target: number } // seq of the op being undone
  | { type: 'redo'; target: number };

/** Log entry. `ts` = ISO time the op was recorded. */
export type Op = OpBody & { seq: number; ts: string; by: Actor };

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  media: Record<string, MediaAsset>;
  /** Starting timeline; together with `log` it fully defines the project. */
  base: Timeline;
  /** Append-only edit log. Ops are never removed or rewritten. */
  log: Op[];
  /** Materialised snapshot of replay(base, log) for fast loading (a cache, not the source of truth). */
  timeline: Timeline;
  thumb?: string;
}
