/**
 * Proxy pipeline: transcode each imported clip to a small 540p H.264/AAC MP4 with
 * Mediabunny's Conversion API so phones can scrub and play the preview smoothly.
 * Export always renders from the originals.
 */
import type { MediaAsset } from '../model/types';

export const PROXY_HEIGHT = 540;

export function needsProxy(a: MediaAsset): boolean {
  return a.kind === 'video' && Math.min(a.width, a.height) > PROXY_HEIGHT + 60;
}

export async function makeProxy(file: Blob, a: MediaAsset, onProgress?: (p: number) => void): Promise<Blob> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  const scale = PROXY_HEIGHT / Math.min(a.width, a.height);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const w = even(a.width * scale), h = even(a.height * scale);
  // AAC encoding is missing on some platforms (e.g. desktop Linux Chrome) → Opus in MP4.
  const aCodec = await mb.getFirstEncodableAudioCodec(['aac', 'opus']);
  const vCodec = await mb.getFirstEncodableVideoCodec(['avc', 'vp9'], { width: w, height: h });
  if (!vCodec) throw new Error('No video encoder for proxies');
  const conv = await mb.Conversion.init({
    input, output,
    video: { width: w, height: h, fit: 'fill', codec: vCodec, bitrate: 1_500_000, forceTranscode: true },
    audio: { codec: aCodec ?? 'aac', bitrate: 96_000 },
  });
  if (!conv.isValid) throw new Error('Proxy conversion not possible on this device');
  // A proxy without the clip's sound would make the preview silent: better to use the original.
  if (a.hasAudio && !conv.utilizedTracks.some((t) => t.isAudioTrack())) throw new Error('Audio cannot be re-encoded for the proxy');
  conv.onProgress = (p) => onProgress?.(p);
  await conv.execute();
  const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
  return new Blob([buf], { type: 'video/mp4' });
}
