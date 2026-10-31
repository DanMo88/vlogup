import type { MediaAsset } from '../model/types';
import { uid } from '../model/timeline';

const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|avif)$/i.test(f.name);

function canvasThumb(src: CanvasImageSource, w: number, h: number): string {
  const tw = 160, th = Math.max(1, Math.round((tw * h) / Math.max(1, w)));
  const c = document.createElement('canvas');
  c.width = tw; c.height = Math.min(th, 284);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

/** Read metadata + a thumbnail. Uses Mediabunny first, falls back to a <video> element. */
export async function probeFile(file: File): Promise<MediaAsset> {
  const id = uid('m_');
  if (isImage(file)) {
    const bmp = await createImageBitmap(file);
    const a: MediaAsset = {
      id, name: file.name, mime: file.type || 'image/jpeg', size: file.size, kind: 'image',
      duration: 0, width: bmp.width, height: bmp.height, hasAudio: false,
      proxy: { status: 'skipped' }, thumb: canvasThumb(bmp, bmp.width, bmp.height),
    };
    bmp.close();
    return a;
  }
  try {
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const vt = await input.getPrimaryVideoTrack();
    const at = await input.getPrimaryAudioTrack();
    if (!vt) throw new Error('no video track');
    const dur = await input.computeDuration();
    let thumb: string | undefined;
    try {
      if (await vt.canDecode()) {
        const sink = new mb.CanvasSink(vt, { width: 160, fit: 'contain', poolSize: 1 });
        const first = await vt.getFirstTimestamp();
        const wc = await sink.getCanvas(first + Math.min(0.5, dur / 3));
        if (wc) thumb = canvasThumb(wc.canvas as CanvasImageSource, wc.canvas.width, wc.canvas.height);
      }
    } catch { /* thumbnail optional */ }
    const a: MediaAsset = {
      id, name: file.name, mime: file.type || 'video/mp4', size: file.size, kind: 'video',
      duration: dur, width: vt.displayWidth, height: vt.displayHeight, hasAudio: !!at,
      proxy: { status: 'pending' }, thumb,
    };
    input.dispose?.();
    if (!thumb) a.thumb = await videoElementThumb(file).catch(() => undefined);
    return a;
  } catch {
    return probeWithVideoElement(file, id);
  }
}

function loadVideo(file: Blob): Promise<HTMLVideoElement> {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.src = URL.createObjectURL(file);
    v.onloadeddata = () => res(v);
    v.onerror = () => rej(new Error('This file type cannot be played in this browser.'));
  });
}

async function videoElementThumb(file: Blob): Promise<string> {
  const v = await loadVideo(file);
  await new Promise<void>((r) => { v.onseeked = () => r(); v.currentTime = Math.min(0.5, (v.duration || 1) / 3); });
  const t = canvasThumb(v, v.videoWidth, v.videoHeight);
  URL.revokeObjectURL(v.src);
  return t;
}

async function probeWithVideoElement(file: File, id: string): Promise<MediaAsset> {
  const v = await loadVideo(file);
  const a: MediaAsset = {
    id, name: file.name, mime: file.type || 'video/mp4', size: file.size, kind: 'video',
    duration: v.duration, width: v.videoWidth, height: v.videoHeight, hasAudio: true,
    proxy: { status: 'skipped' },
  };
  try { a.thumb = await videoElementThumb(file); } catch { /* ignore */ }
  URL.revokeObjectURL(v.src);
  return a;
}
