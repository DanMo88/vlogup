import { describe, expect, it } from 'vitest';
import { commit, duration, newProject, redoTarget, replay, undoTarget, locate } from '../../src/model/timeline';
import type { MediaAsset } from '../../src/model/types';

const media: Record<string, MediaAsset> = {
  a: { id: 'a', name: 'a.mp4', mime: 'video/mp4', size: 1, kind: 'video', duration: 10, width: 1920, height: 1080, hasAudio: true },
  b: { id: 'b', name: 'b.mp4', mime: 'video/mp4', size: 1, kind: 'video', duration: 5, width: 1920, height: 1080, hasAudio: true },
};
const start = () => {
  let p = { ...newProject('t'), media };
  p = commit(p, { type: 'addClips', clips: [{ id: 'c1', mediaId: 'a', in: 0, out: 10, volume: 1 }, { id: 'c2', mediaId: 'b', in: 0, out: 5, volume: 1 }] });
  return p;
};

describe('timeline ops + append-only log', () => {
  it('adds, trims, splits, moves, deletes', () => {
    let p = start();
    expect(duration(p.timeline)).toBe(15);
    p = commit(p, { type: 'trimClip', clipId: 'c1', in: 1, out: 9 });
    expect(duration(p.timeline)).toBe(13);
    p = commit(p, { type: 'splitClip', clipId: 'c1', at: 4, newId: 'c3' });
    expect(p.timeline.tracks.video.map((c) => c.id)).toEqual(['c1', 'c3', 'c2']);
    p = commit(p, { type: 'moveClip', clipId: 'c2', toIndex: 0 });
    expect(p.timeline.tracks.video.map((c) => c.id)).toEqual(['c2', 'c1', 'c3']);
    p = commit(p, { type: 'deleteClip', clipId: 'c1' });
    expect(p.timeline.tracks.video.map((c) => c.id)).toEqual(['c2', 'c3']);
    expect(p.log.map((o) => o.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(replay(p)).toEqual(p.timeline);
  });
  it('clamps trims to media bounds', () => {
    let p = start();
    p = commit(p, { type: 'trimClip', clipId: 'c2', in: -3, out: 99 });
    expect(p.timeline.tracks.video[1]).toMatchObject({ in: 0, out: 5 });
  });
  it('undo/redo are ops too (log never shrinks)', () => {
    let p = start();
    p = commit(p, { type: 'deleteClip', clipId: 'c1' });
    expect(p.timeline.tracks.video.length).toBe(1);
    p = commit(p, { type: 'undo', target: undoTarget(p.log)! });
    expect(p.timeline.tracks.video.length).toBe(2);
    expect(p.log.length).toBe(3);
    p = commit(p, { type: 'redo', target: redoTarget(p.log)! });
    expect(p.timeline.tracks.video.length).toBe(1);
    p = commit(p, { type: 'undo', target: undoTarget(p.log)! });
    p = commit(p, { type: 'setVolume', clipId: 'c1', volume: 0.5 });
    expect(redoTarget(p.log)).toBeNull(); // new edit clears redo
  });
  it('locates the clip under the playhead', () => {
    const p = start();
    expect(locate(p.timeline, 12)).toMatchObject({ index: 1, src: 2 });
  });
});
