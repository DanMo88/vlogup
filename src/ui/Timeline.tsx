import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Clip, MediaAsset, Project, TextItem } from '../model/types';
import { clipLen, clipStarts, duration, fmtTime, MAX_IMAGE_SECONDS, MIN_CLIP } from '../model/timeline';

interface Props {
  project: Project;
  time: number;
  playing: boolean;
  selectedClip: string | null;
  selectedText: string | null;
  onSeek: (t: number) => void;
  onSelectClip: (id: string | null) => void;
  onSelectText: (id: string | null) => void;
  onTrim: (clipId: string, inT: number, outT: number) => void;
  fileId: string;
}

/** InShot-style timeline: fixed centre playhead, the tracks scroll underneath it. */
export function Timeline(props: Props) {
  const { project, time, playing } = props;
  const tl = project.timeline;
  const [pps, setPps] = useState(48); // pixels per second
  const scroller = useRef<HTMLDivElement>(null);
  const programmatic = useRef<number | null>(null); // scrollLeft we set ourselves
  const [drag, setDrag] = useState<{ id: string; edge: 'l' | 'r'; x0: number; in0: number; out0: number; in: number; out: number } | null>(null);
  const pinch = useRef<{ d0: number; pps0: number } | null>(null);
  const pointers = useRef(new Map<number, number>());

  const total = duration(tl);
  const starts = clipStarts(tl);

  // Keep the playhead centred on `time`.
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    const target = time * pps;
    if (Math.abs(el.scrollLeft - target) > 1) { el.scrollLeft = target; programmatic.current = el.scrollLeft; }
  }, [time, pps, total]);

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    if (programmatic.current != null && Math.abs(el.scrollLeft - programmatic.current) < 2) return;
    programmatic.current = null;
    if (playing) return;
    props.onSeek(Math.min(total, el.scrollLeft / pps));
  };

  // Pinch / ctrl+wheel zoom.
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setPps((p) => Math.max(8, Math.min(400, p * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const ptrDown = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, e.clientX);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d0: Math.abs(a - b) || 1, pps0: pps };
    }
  };
  const ptrMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, e.clientX);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setPps(Math.max(8, Math.min(400, (pinch.current.pps0 * Math.abs(a - b)) / pinch.current.d0)));
    }
  };
  const ptrUp = (e: PointerEvent) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; };

  // Trim handles.
  const startTrim = (e: PointerEvent, c: Clip, edge: 'l' | 'r') => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: c.id, edge, x0: e.clientX, in0: c.in, out0: c.out, in: c.in, out: c.out });
  };
  const moveTrim = (e: PointerEvent, m: MediaAsset | undefined) => {
    if (!drag) return;
    const dt = (e.clientX - drag.x0) / pps;
    const max = !m || m.kind === 'image' ? MAX_IMAGE_SECONDS : m.duration;
    if (drag.edge === 'l') setDrag({ ...drag, in: Math.max(0, Math.min(drag.out0 - MIN_CLIP, drag.in0 + dt)) });
    else setDrag({ ...drag, out: Math.min(max, Math.max(drag.in0 + MIN_CLIP, drag.out0 + dt)) });
  };
  const endTrim = () => {
    if (drag && (drag.in !== drag.in0 || drag.out !== drag.out0)) props.onTrim(drag.id, drag.in, drag.out);
    setDrag(null);
  };

  const ticks: number[] = [];
  const step = pps > 120 ? 1 : pps > 40 ? 2 : pps > 16 ? 5 : 10;
  for (let s = 0; s <= total + 0.001; s += step) ticks.push(s);

  return (
    <div class="timeline">
      <div class="tl-time"><b>{fmtTime(time)}</b><span class="muted"> / {fmtTime(total)}</span>
        <span class="tl-zoom">
          <button class="icon-btn sm" aria-label="Zoom out" onClick={() => setPps((p) => Math.max(8, p / 1.5))}>−</button>
          <button class="icon-btn sm" aria-label="Zoom in" onClick={() => setPps((p) => Math.min(400, p * 1.5))}>＋</button>
        </span>
      </div>
      <div class="tl-scroll" ref={scroller} onScroll={onScroll} onPointerDown={ptrDown} onPointerMove={ptrMove} onPointerUp={ptrUp} onPointerCancel={ptrUp} data-testid="timeline">
        <div class="tl-inner" style={{ width: `${Math.max(total, 1) * pps}px` }}>
          <div class="tl-ruler" style={{ width: `${total * pps}px` }}>
            {ticks.map((s) => <span style={{ left: `${s * pps}px` }}>{fmtTime(s).replace(/\.0$/, '')}</span>)}
          </div>
          <div class="tl-track video" style={{ width: `${total * pps}px` }}>
            {tl.tracks.video.map((c, i) => {
              const m = project.media[c.mediaId];
              const sel = props.selectedClip === c.id;
              const d = drag && drag.id === c.id ? drag : null;
              const len = d ? d.out - d.in : clipLen(c);
              return (
                <div
                  key={c.id}
                  class={`tl-clip${sel ? ' sel' : ''}`}
                  data-testid="clip"
                  style={{ left: `${starts[i] * pps}px`, width: `${Math.max(4, len * pps)}px`, backgroundImage: m?.thumb ? `url(${m.thumb})` : undefined }}
                  onClick={(e) => { e.stopPropagation(); props.onSelectClip(sel ? null : c.id); }}
                  onPointerMove={(e) => moveTrim(e as PointerEvent, m)}
                  onPointerUp={endTrim}
                  onPointerCancel={endTrim}
                >
                  <span class="tl-clip-label">{m?.kind === 'image' ? '🖼 ' : ''}{fmtTime(len)}{c.muted || c.volume === 0 ? ' 🔇' : c.volume !== 1 ? ` ${Math.round(c.volume * 100)}%` : ''}</span>
                  {sel && <>
                    <span class="tl-handle l" onPointerDown={(e) => startTrim(e as PointerEvent, c, 'l')} aria-label="Trim start" />
                    <span class="tl-handle r" onPointerDown={(e) => startTrim(e as PointerEvent, c, 'r')} aria-label="Trim end" />
                  </>}
                </div>
              );
            })}
          </div>
          <div class="tl-track text" style={{ width: `${Math.max(total, 1) * pps}px` }}>
            {tl.tracks.text.map((t: TextItem) => (
              <div key={t.id} class={`tl-text${props.selectedText === t.id ? ' sel' : ''}`}
                style={{ left: `${t.start * pps}px`, width: `${Math.max(16, (t.end - t.start) * pps)}px` }}
                onClick={(e) => { e.stopPropagation(); props.onSelectText(props.selectedText === t.id ? null : t.id); }}>
                T {t.text}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div class="tl-playhead" aria-hidden="true" />
      <label class="tl-add" for={props.fileId} data-testid="add-clips" aria-label="Add clips" >＋</label>
    </div>
  );
}
