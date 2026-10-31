import type { MediaAsset } from '../model/types';
import { uid } from '../model/timeline';

/** Rejects if `p` doesn't settle in `ms` (phones can hang on unsupported codecs). */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${what} timed out`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

const IMG_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i;
const VID_EXT = /\.(mp4|m4v|mov|3gp|webm|mkv)$/i;
export const isImageFile = (f: File) => f.type.startsWith('image/') || (!f.type && IMG_EXT.test(f.name));
export const isVideoFile = (f: File) => f.type.startsWith('video/') || (!f.type && VID_EXT.test(f.name)) || (!f.type && !IMG_EXT.test(f.name));

function canvasThumb(src: CanvasImageSource, w: number, h: number): string {
  const tw = 160, th = Math.max(1, Math.round((tw * h) / Math.max(1, w)));
  const c = document.createElement('canvas');
  c.width = tw; c.height = Math.min(th, 284);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

const CODEC_NAMES: Record<string, string> = { avc: 'H.264', hevc: 'HEVC (H.265)', vp9: 'VP9', av1: 'AV1', vp8: 'VP8' };
export const codecName = (c?: string | null) => (c ? CODEC_NAMES[c] ?? c.toUpperCase() : 'unknown');

/**
 * Read metadata + a thumbnail. Every step has a timeout so a phone can never get stuck on
 * "Importing…". Mediabunny (container metadata, WebCodecs decode check) first, then a
 * <video> element fallback (uses loadedmetadata, which Android fires without playback).
 */
export async function probeFile(file: File, onStep?: (s: string) => void): Promise<MediaAsset> {
  const id = uid('m_');
  if (isImageFile(file)) {
    onStep?.('Reading photo');
    let bmp: ImageBitmap;
    try { bmp = await withTimeout(createImageBitmap(file), 15000, 'Reading the photo'); }
    catch { throw new Error(/heic|heif/i.test(file.name + file.type) ? 'HEIC photos are not supported by this browser. Share it as JPEG instead.' : 'This photo format cannot be read.'); }
    const a: MediaAsset = {
      id, name: file.name || 'photo', mime: file.type || 'image/jpeg', size: file.size, kind: 'image',
      duration: 0, width: bmp.width, height: bmp.height, hasAudio: false,
      proxy: { status: 'skipped' }, thumb: canvasThumb(bmp, bmp.width, bmp.height),
    };
    bmp.close();
    return a;
  }
  let a: MediaAsset | null = null;
  try {
    onStep?.('Reading video');
    a = await withTimeout(probeMediabunny(file, id, onStep), 20000, 'Reading the video');
  } catch (e) {
    console.warn('Mediabunny probe failed, falling back to <video>', e);
  }
  if (!a) a = await withTimeout(probeWithVideoElement(file, id), 15000, 'Opening the video').catch((e) => {
    throw new Error(`This video can't be opened in this browser (${e?.message ?? e}).`);
  });
  if (!a.thumb) a.thumb = await withTimeout(videoElementThumb(file), 6000, 'thumbnail').catch(() => undefined);
  return a;
}

async function probeMediabunny(file: File, id: string, onStep?: (s: string) => void): Promise<MediaAsset> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const vt = await input.getPrimaryVideoTrack();
    const at = await input.getPrimaryAudioTrack();
    if (!vt) throw new Error('no video track');
    const dur = await input.computeDuration();
    const codec = vt.codec;
    const decodable = await withTimeout(vt.canDecode(), 5000, 'decoder check').catch(() => false);
    const audioDecodable = at ? await withTimeout(at.canDecode(), 5000, 'audio check').catch(() => false) : false;
    let thumb: string | undefined;
    if (decodable) {
      onStep?.('Making thumbnail');
      try {
        const sink = new mb.CanvasSink(vt, { width: 160, fit: 'contain', poolSize: 1 });
        const first = await vt.getFirstTimestamp();
        const wc = await withTimeout(sink.getCanvas(first + Math.min(0.5, dur / 3)), 6000, 'thumbnail');
        if (wc) thumb = canvasThumb(wc.canvas as CanvasImageSource, wc.canvas.width, wc.canvas.height);
      } catch { /* optional */ }
    }
    return {
      id, name: file.name || 'video', mime: file.type || 'video/mp4', size: file.size, kind: 'video',
      duration: dur, width: vt.displayWidth, height: vt.displayHeight, hasAudio: !!at,
      codec: codec ?? undefined, decodable, audioDecodable,
      proxy: { status: 'pending' }, thumb,
    };
  } finally {
    input.dispose();
  }
}

function loadVideo(file: Blob, need: 'meta' | 'data'): Promise<HTMLVideoElement> {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = need === 'meta' ? 'metadata' : 'auto';
    v.src = URL.createObjectURL(file);
    if (need === 'meta') v.onloadedmetadata = () => res(v); else v.onloadeddata = () => res(v);
    v.onerror = () => rej(new Error('format not playable'));
    v.load();
  });
}

async function videoElementThumb(file: Blob): Promise<string> {
  const v = await loadVideo(file, 'data');
  try {
    await new Promise<void>((r) => { v.onseeked = () => r(); v.currentTime = Math.min(0.5, (v.duration || 1) / 3); });
    return canvasThumb(v, v.videoWidth, v.videoHeight);
  } finally { URL.revokeObjectURL(v.src); }
}

async function probeWithVideoElement(file: File, id: string): Promise<MediaAsset> {
  const v = await loadVideo(file, 'meta');
  URL.revokeObjectURL(v.src);
  if (!isFinite(v.duration) || !v.videoWidth) throw new Error('no duration');
  return {
    id, name: file.name || 'video', mime: file.type || 'video/mp4', size: file.size, kind: 'video',
    duration: v.duration, width: v.videoWidth, height: v.videoHeight, hasAudio: true,
    decodable: false, proxy: { status: 'skipped' },
  };
}
