/** Feature detection for the editing engine. */
export interface Caps {
  webcodecs: boolean;
  videoEncode: string | null; // first encodable codec at 1080p
  audioEncode: string | null;
  opfs: boolean;
  ios: boolean;
  reason?: string;
}

let cached: Promise<Caps> | null = null;

export function detectCaps(): Promise<Caps> {
  if (cached) return cached;
  cached = (async () => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const webcodecs = typeof (globalThis as any).VideoEncoder === 'function' && typeof (globalThis as any).VideoDecoder === 'function';
    let videoEncode: string | null = null;
    let audioEncode: string | null = null;
    if (webcodecs) {
      try {
        const mb = await import('mediabunny');
        videoEncode = await mb.getFirstEncodableVideoCodec(['avc', 'vp9', 'av1', 'vp8'], { width: 1920, height: 1080 });
        audioEncode = await mb.getFirstEncodableAudioCodec(['aac', 'opus']);
      } catch { /* ignore */ }
    }
    const opfs = !!navigator.storage?.getDirectory;
    let reason: string | undefined;
    if (!webcodecs) reason = ios
      ? 'Export needs iOS/iPadOS 26 or newer (WebCodecs). Please update iOS, then reopen VlogUp.'
      : 'This browser has no WebCodecs, so it cannot export video. Use Chrome, Edge, Samsung Internet or Safari 26+.';
    else if (!videoEncode) reason = 'This device cannot encode H.264/VP9 video at 1080p. Try 720p or another browser.';
    return { webcodecs, videoEncode, audioEncode, opfs, ios, reason };
  })();
  return cached;
}
