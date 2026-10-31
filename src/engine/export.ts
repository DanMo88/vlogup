/**
 * MP4 export with WebCodecs via Mediabunny (MPL-2.0).
 * Renders every frame from the ORIGINAL media (not the proxy) through the same Canvas2D
 * compositor as the preview, mixes audio with per-clip volume and short anti-click fades
 * on every cut, and muxes H.264/AAC (or VP9/Opus where H.264 isn't available) into MP4.
 * Pattern reference: Timeline Studio's Mediabunny export pipeline (MIT).
 */
import type { MediaAsset, Project, Clip } from '../model/types';
import { clipLen } from '../model/timeline';
import { drawMedia, drawTexts, frameSize } from './render';
import { getBlob, mediaKey } from '../media/storage';

export interface ExportOptions {
  shortSide: 720 | 1080;
  fps: 30;
  onProgress?: (p: number, label: string) => void;
  signal?: AbortSignal;
}

export interface ExportResult { blob: Blob; name: string; codec: string; seconds: number; width: number; height: number }

const SR = 48000;
const FADE = 0.008; // 8 ms fade in/out at every cut, avoids clicks

export async function exportProject(p: Project, opts: ExportOptions): Promise<ExportResult> {
  const mb = await import('mediabunny');
  const t0 = performance.now();
  const tl = p.timeline;
  const clips = tl.tracks.video;
  if (!clips.length) throw new Error('Add at least one clip first.');
  const { w: W, h: H } = frameSize(tl.aspect, opts.shortSide);
  const fps = opts.fps;
  const total = clips.reduce((s, c) => s + clipLen(c), 0);

  const vCodec = await mb.getFirstEncodableVideoCodec(['avc', 'vp9', 'av1', 'vp8'], { width: W, height: H });
  if (!vCodec) throw new Error(`This device cannot encode ${W}×${H} video. Try 720p.`);
  const aCodec = await mb.getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SR });

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  const vSrc = new mb.CanvasSource(canvas, {
    codec: vCodec,
    bitrate: opts.shortSide >= 1080 ? 10_000_000 : 5_000_000,
    keyFrameInterval: 2,
    latencyMode: 'quality',
  } as any);
  output.addVideoTrack(vSrc, { frameRate: fps });
  const aSrc = aCodec ? new mb.AudioBufferSource({ codec: aCodec, bitrate: 192_000 }) : null;
  if (aSrc) output.addAudioTrack(aSrc);
  await output.start();

  let T = 0; // timeline time of the current clip start
  let framesDone = 0;
  const totalFrames = Math.max(1, Math.round(total * fps));
  const check = () => { if (opts.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError'); };

  try {
    for (let ci = 0; ci < clips.length; ci++) {
      check();
      const clip = clips[ci];
      const asset = p.media[clip.mediaId];
      const blob = await getBlob(mediaKey(p.id, clip.mediaId));
      if (!asset || !blob) throw new Error(`Media for clip ${ci + 1} is missing.`);
      const len = clipLen(clip);
      const nFrames = Math.max(1, Math.round((T + len) * fps) - Math.round(T * fps));
      const label = `Clip ${ci + 1}/${clips.length}`;

      // ---- audio first (small), then video ----
      if (aSrc) await aSrc.add(await clipAudio(mb, clip, asset, blob, nFrames / fps)); // keep A/V locked to the frame grid

      if (asset.kind === 'image') {
        const bmp = await createImageBitmap(blob);
        for (let k = 0; k < nFrames; k++) {
          check();
          const tt = T + k / fps;
          drawMedia(ctx, W, H, bmp, bmp.width, bmp.height);
          drawTexts(ctx, W, H, tl.tracks.text, tt);
          await vSrc.add(tt, 1 / fps);
          framesDone++;
          if (k % 10 === 0) opts.onProgress?.(framesDone / totalFrames, label);
        }
        bmp.close();
      } else {
        const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
        const vt = await input.getPrimaryVideoTrack();
        if (!vt || !(await vt.canDecode())) throw new Error(`Clip ${ci + 1} (${asset.name}) cannot be decoded on this device.`);
        const sw = vt.displayWidth, sh = vt.displayHeight;
        const fit = Math.min(1, Math.max(W / sw, H / sh)); // never decode-to-canvas larger than needed
        const sink = new mb.CanvasSink(vt, {
          width: Math.max(2, Math.round((sw * fit) / 2) * 2),
          height: Math.max(2, Math.round((sh * fit) / 2) * 2),
          fit: 'fill',
          poolSize: 2,
        });
        const first = await vt.getFirstTimestamp();
        const stamps = function* () {
          for (let k = 0; k < nFrames; k++) yield Math.max(first, clip.in + k / fps);
        };
        let k = 0;
        let last: CanvasImageSource | null = null;
        let lw = 0, lh = 0;
        for await (const wc of sink.canvasesAtTimestamps(stamps())) {
          check();
          if (wc) { last = wc.canvas as CanvasImageSource; lw = wc.canvas.width; lh = wc.canvas.height; }
          const tt = T + k / fps;
          drawMedia(ctx, W, H, last, lw, lh);
          drawTexts(ctx, W, H, tl.tracks.text, tt);
          await vSrc.add(tt, 1 / fps);
          k++; framesDone++;
          if (k % 10 === 0) opts.onProgress?.(framesDone / totalFrames, label);
          if (k >= nFrames) break;
        }
        // Pad if the decoder delivered fewer frames than expected.
        for (; k < nFrames; k++) {
          const tt = T + k / fps;
          drawMedia(ctx, W, H, last, lw, lh);
          drawTexts(ctx, W, H, tl.tracks.text, tt);
          await vSrc.add(tt, 1 / fps);
          framesDone++;
        }
        input.dispose();
      }
      T += nFrames / fps;
    }
    opts.onProgress?.(0.99, 'Finalising');
    await output.finalize();
  } catch (e) {
    try { await output.cancel(); } catch { /* ignore */ }
    throw e;
  }
  const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
  const name = `${p.name.replace(/[^\w\- ]+/g, '').trim() || 'vlog'}-${tl.aspect.replace(':', 'x')}-${opts.shortSide}p.mp4`;
  return {
    blob: new Blob([buf], { type: 'video/mp4' }), name, codec: `${vCodec}${aCodec ? '+' + aCodec : ''}`,
    seconds: (performance.now() - t0) / 1000, width: W, height: H,
  };
}

/** Decode, resample to 48 kHz stereo, apply volume + edge fades for one clip. */
async function clipAudio(mb: typeof import('mediabunny'), clip: Clip, asset: MediaAsset, blob: Blob, len: number): Promise<AudioBuffer> {
  const end = clip.in + len;
  const n = Math.max(1, Math.round(len * SR));
  const out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: SR });
  const gain = clip.muted ? 0 : clip.volume;
  if (asset.kind !== 'video' || !asset.hasAudio || gain === 0) return out;
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const at = await input.getPrimaryAudioTrack();
    if (!at || !(await at.canDecode())) return out;
    const L = out.getChannelData(0), R = out.getChannelData(1);
    // AudioSampleSink + copyTo (instead of AudioBufferSink) so zero-length decoder outputs are simply skipped.
    const sink = new mb.AudioSampleSink(at);
    for await (const smp of sink.samples(clip.in, end)) {
      try {
        const frames = smp.numberOfFrames;
        if (!frames) continue;
        const chs = smp.numberOfChannels;
        const p0 = new Float32Array(frames);
        smp.copyTo(p0, { planeIndex: 0, format: 'f32-planar' });
        let p1 = p0;
        if (chs > 1) { p1 = new Float32Array(frames); smp.copyTo(p1, { planeIndex: 1, format: 'f32-planar' }); }
        const ratio = smp.sampleRate / SR;
        const startOut = Math.round((smp.timestamp - clip.in) * SR);
        const outLen = Math.floor(frames / ratio);
        for (let i = 0; i < outLen; i++) {
          const o = startOut + i;
          if (o < 0) continue;
          if (o >= n) break;
          const x = i * ratio;
          const j = Math.floor(x);
          const f = x - j;
          const j1 = Math.min(j + 1, frames - 1);
          L[o] = p0[j] + (p0[j1] - p0[j]) * f;
          R[o] = p1[j] + (p1[j1] - p1[j]) * f;
        }
      } finally { smp.close(); }
    }
    const fade = Math.min(Math.round(FADE * SR), Math.floor(n / 4));
    for (let i = 0; i < n; i++) {
      let g = gain;
      if (i < fade) g *= i / fade;
      else if (i > n - fade) g *= (n - i) / fade;
      L[i] = Math.max(-1, Math.min(1, L[i] * g));
      R[i] = Math.max(-1, Math.min(1, R[i] * g));
    }
    return out;
  } finally {
    input.dispose();
  }
}
