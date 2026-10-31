/**
 * One compositor for preview and export, so what you see is what you export.
 * M1 uses Canvas2D (cheap on every phone). M3 moves this to a PixiJS/WebGL2 pipeline for
 * shader transitions, LUTs and motion; the call signature is designed to stay the same.
 */
import type { Aspect, TextItem } from '../model/types';

export function frameSize(aspect: Aspect, shortSide: number): { w: number; h: number } {
  const long = Math.round((shortSide * 16) / 9 / 2) * 2;
  if (aspect === '16:9') return { w: long, h: shortSide };
  if (aspect === '9:16') return { w: shortSide, h: long };
  return { w: shortSide, h: shortSide };
}

let blurCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
function blurCtx(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!blurCanvas) {
    blurCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(24, 24) : document.createElement('canvas');
  }
  return blurCanvas.getContext('2d') as any;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draw a source frame "fit" inside the canvas over a soft blurred fill (InShot-style). */
export function drawMedia(ctx: Ctx, W: number, H: number, src: CanvasImageSource | null, sw: number, sh: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (!src || !sw || !sh) return;
  const fit = Math.min(W / sw, H / sh);
  const dw = sw * fit, dh = sh * fit;
  if (Math.abs(dw - W) > 2 || Math.abs(dh - H) > 2) {
    // Cheap cross-browser blur: downscale to a tiny canvas, then upscale with smoothing.
    const b = blurCtx();
    const bw = 24, bh = Math.max(8, Math.round((24 * H) / W));
    (b.canvas as any).width = bw; (b.canvas as any).height = bh;
    const cover = Math.max(bw / sw, bh / sh);
    b.drawImage(src, (bw - sw * cover) / 2, (bh - sh * cover) / 2, sw * cover, sh * cover);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 0.85;
    ctx.drawImage(b.canvas as CanvasImageSource, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

export function drawTexts(ctx: Ctx, W: number, H: number, texts: TextItem[], t: number) {
  for (const it of texts) {
    if (t < it.start || t >= it.end || !it.text.trim()) continue;
    const px = Math.max(8, Math.round(it.size * H));
    ctx.font = `800 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = it.text.split('\n');
    const lh = px * 1.18;
    const cx = it.x * W;
    const cy = it.y * H - ((lines.length - 1) * lh) / 2;
    if (it.style === 'box') {
      const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const pad = px * 0.35;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, cx - wMax / 2 - pad, cy - lh / 2 - pad * 0.6, wMax + pad * 2, lh * lines.length + pad * 1.2, px * 0.25);
      ctx.fill();
    }
    lines.forEach((line, i) => {
      const y = cy + i * lh;
      if (it.style === 'outline') {
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, px * 0.14);
        ctx.strokeStyle = '#000';
        ctx.strokeText(line, cx, y);
      } else if (it.style === 'plain') {
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = px * 0.15;
      }
      ctx.fillStyle = it.color;
      ctx.fillText(line, cx, y);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    });
  }
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
