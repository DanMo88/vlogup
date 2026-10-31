/**
 * Preview player. Plays the timeline (proxies when ready, otherwise originals) through two
 * alternating <video> elements so the next clip is already seeked when a cut arrives, and
 * paints every frame into the preview canvas with the shared compositor (render.ts).
 */
import type { Project, Clip } from '../model/types';
import { clipLen, clipStarts, duration, locate } from '../model/timeline';
import { drawMedia, drawTexts, frameSize } from './render';

type Src = { url: string; kind: 'video' | 'image' };

export class Player {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private els: [HTMLVideoElement, HTMLVideoElement];
  private active = 0;
  private activeClipId: string | null = null;
  private images = new Map<string, HTMLImageElement>();
  private project: Project | null = null;
  private sources: Record<string, Src> = {};
  private raf = 0;
  private playing = false;
  private time = 0;
  private imageClock: { wall: number; t: number } | null = null;
  private audio: AudioContext | null = null;
  private gains: (GainNode | null)[] = [null, null];
  onTime?: (t: number, playing: boolean) => void;

  constructor(canvas: HTMLCanvasElement, host: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    const mk = () => {
      const v = document.createElement('video');
      v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
      v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      v.className = 'player-src';
      host.appendChild(v);
      return v;
    };
    this.els = [mk(), mk()];
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.els.forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); });
    this.audio?.close().catch(() => {});
  }

  get currentTime() { return this.time; }
  get isPlaying() { return this.playing; }

  setProject(p: Project, sources: Record<string, Src>) {
    const sizeChanged = !this.project || this.project.timeline.aspect !== p.timeline.aspect;
    this.project = p;
    this.sources = sources;
    if (sizeChanged) {
      const { w, h } = frameSize(p.timeline.aspect, 540);
      this.canvas.width = w; this.canvas.height = h;
    }
    const d = duration(p.timeline);
    if (this.time > d) this.time = d;
    // Force a re-bind (clip in/out or source may have changed).
    this.activeClipId = null;
    if (!this.playing) this.seek(this.time);
  }

  private ensureAudio() {
    if (this.audio) { this.audio.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.audio = new AC();
      this.els.forEach((v, i) => {
        const src = this.audio!.createMediaElementSource(v);
        const g = this.audio!.createGain();
        src.connect(g).connect(this.audio!.destination);
        this.gains[i] = g;
      });
    } catch { this.audio = null; }
  }

  private applyVolume(i: number, clip: Clip) {
    const vol = clip.muted ? 0 : clip.volume;
    const g = this.gains[i];
    if (g) { g.gain.value = vol; this.els[i].volume = 1; }
    else this.els[i].volume = Math.min(1, vol);
  }

  private bind(i: number, clip: Clip, srcTime: number) {
    const s = this.sources[clip.mediaId];
    const v = this.els[i];
    if (!s) return;
    if (s.kind === 'image') {
      if (!this.images.has(s.url)) { const im = new Image(); im.src = s.url; this.images.set(s.url, im); }
      return;
    }
    if (v.dataset.url !== s.url) { v.src = s.url; v.dataset.url = s.url; }
    if (Math.abs(v.currentTime - srcTime) > 0.04) v.currentTime = srcTime;
    this.applyVolume(i, clip);
  }

  /** Prepare the clip that follows `index` in the idle element. */
  private preloadNext(index: number) {
    const p = this.project; if (!p) return;
    const next = p.timeline.tracks.video[index + 1];
    if (next && this.sources[next.mediaId]?.kind === 'video') this.bind(1 - this.active, next, next.in);
  }

  seek(t: number) {
    const p = this.project; if (!p) return;
    this.time = Math.max(0, Math.min(t, duration(p.timeline)));
    const loc = locate(p.timeline, this.time);
    if (!loc) { this.activeClipId = null; return; }
    if (this.activeClipId !== loc.clip.id) {
      const other = 1 - this.active;
      const ov = this.els[other];
      const s = this.sources[loc.clip.mediaId];
      // Reuse the pre-seeked element if it already holds this clip's source.
      if (s && ov.dataset.url === s.url && Math.abs(ov.currentTime - loc.src) < 0.25) this.active = other;
      this.els[1 - this.active].pause();
      this.activeClipId = loc.clip.id;
    }
    this.bind(this.active, loc.clip, loc.src);
    if (this.playing) this.startActive(loc.clip);
    this.preloadNext(loc.index);
    this.imageClock = { wall: performance.now(), t: this.time };
    this.onTime?.(this.time, this.playing);
  }

  private startActive(clip: Clip) {
    const s = this.sources[clip.mediaId];
    if (s?.kind === 'video') this.els[this.active].play().catch(() => {});
  }

  play() {
    const p = this.project; if (!p || !p.timeline.tracks.video.length) return;
    this.ensureAudio();
    if (this.time >= duration(p.timeline) - 0.05) this.time = 0;
    this.playing = true;
    this.seek(this.time);
  }

  pause() {
    this.playing = false;
    this.els.forEach((v) => v.pause());
    this.onTime?.(this.time, false);
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  private loop() {
    this.raf = requestAnimationFrame(this.loop);
    const p = this.project;
    const { width: W, height: H } = this.canvas;
    if (!p || !p.timeline.tracks.video.length) {
      this.ctx.fillStyle = '#0b0b10'; this.ctx.fillRect(0, 0, W, H);
      return;
    }
    const loc = locate(p.timeline, this.time);
    if (!loc) return;
    const s = this.sources[loc.clip.mediaId];
    const v = this.els[this.active];

    if (this.playing) {
      let srcNow: number;
      if (s?.kind === 'video') srcNow = v.currentTime;
      else {
        const now = performance.now();
        srcNow = loc.clip.in + (this.imageClock ? this.imageClock.t + (now - this.imageClock.wall) / 1000 - loc.start : 0);
      }
      const clipEnd = loc.clip.out;
      const ended = srcNow >= clipEnd - 0.02 || (s?.kind === 'video' && v.ended);
      if (ended) {
        const next = loc.start + clipLen(loc.clip) + 0.0005;
        if (next >= duration(p.timeline) - 0.001) { this.time = duration(p.timeline); this.pause(); }
        else this.seek(next);
      } else {
        this.time = loc.start + Math.max(0, srcNow - loc.clip.in);
        this.onTime?.(this.time, true);
      }
    }

    let img: CanvasImageSource | null = null, sw = 0, sh = 0;
    if (s?.kind === 'image') {
      const im = this.images.get(s.url);
      if (im?.complete && im.naturalWidth) { img = im; sw = im.naturalWidth; sh = im.naturalHeight; }
      else return; // keep last frame
    } else if (v.readyState >= 2) { img = v; sw = v.videoWidth; sh = v.videoHeight; }
    else return; // keep last painted frame while seeking
    drawMedia(this.ctx, W, H, img, sw, sh);
    drawTexts(this.ctx, W, H, p.timeline.tracks.text, this.time);
  }

  /** Timeline start times (for the UI). */
  starts() { return this.project ? clipStarts(this.project.timeline) : []; }
}
