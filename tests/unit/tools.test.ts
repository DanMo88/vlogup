import { describe, expect, it } from 'vitest';
import { commit, newProject } from '../../src/model/timeline';
import { planTool } from '../../src/ai/tools';
import type { MediaAsset } from '../../src/model/types';

const media: Record<string, MediaAsset> = {
  a: { id: 'a', name: 'a.mp4', mime: 'video/mp4', size: 1, kind: 'video', duration: 10, width: 1920, height: 1080, hasAudio: true },
  i: { id: 'i', name: 'p.png', mime: 'image/png', size: 1, kind: 'image', duration: 0, width: 800, height: 600, hasAudio: false },
};
const proj = () => commit({ ...newProject('t'), media }, { type: 'addClips', clips: [{ id: 'c1', mediaId: 'a', in: 0, out: 10, volume: 1 }, { id: 'c2', mediaId: 'i', in: 0, out: 3, volume: 1 }] });

describe('AI tools', () => {
  it('validates and plans ops', () => {
    const p = proj();
    expect(planTool(p, 'move_clip', { clip: '2', to_position: 1 }).ops).toEqual([{ type: 'moveClip', clipId: 'c2', toIndex: 0 }]);
    expect(planTool(p, 'trim_clip', { clip: 'c1', start: 2, end: 50 }).ops[0]).toMatchObject({ in: 2, out: 10 });
    expect(planTool(p, 'split_clip', { clip: 1, at: 4 }).ops[0]).toMatchObject({ type: 'splitClip', at: 4 });
    expect((planTool(p, 'set_photo_duration', { clip: '1', seconds: 5 }).result as any).ok).toBe(false);
    expect(planTool(p, 'set_photo_duration', { clip: '2', seconds: 5 }).ops[0]).toMatchObject({ in: 0, out: 5 });
    expect((planTool(p, 'delete_clip', { clip: '7' }).result as any).error).toContain('not found');
    const t = planTool(p, 'add_text', { text: 'سلام', start: 1, end: 99, position: 'top', color: 'red' });
    expect(t.ops[0]).toMatchObject({ type: 'addText', item: { text: 'سلام', start: 1, end: 13, y: 0.15, color: '#ffffff' } });
    expect((planTool(p, 'nope', {}).result as any).ok).toBe(false);
  });
});
