import { useEffect, useRef, useState } from 'preact/hooks';
import type { Aspect, Clip, MediaAsset, OpBody, Project, TextItem } from '../model/types';
import {
  clipLen, commit, DEFAULT_IMAGE_SECONDS, duration, exportProjectJson, fmtTime, locate, redoTarget, uid, undoTarget,
} from '../model/timeline';
import { getBlob, loadProject, mediaKey, proxyKey, putBlob, saveProject, storageBackend } from '../media/storage';
import { probeFile, withTimeout, codecName } from '../media/probe';
import { makeProxy, needsProxy } from '../media/proxy';
import { Player } from '../engine/player';
import { Timeline } from './Timeline';
import { ChatSheet } from './ChatSheet';
import { ExportDialog } from './ExportDialog';
import { TemplatesPanel } from './TemplatesPanel';
import { Dialog } from './Dialog';

type Tool = 'templates' | 'canvas' | 'trim' | 'volume' | 'order' | 'text' | null;

const TOOLS: { id: string; icon: string; label: string; soon?: string }[] = [
  { id: 'templates', icon: '✨', label: 'Templates' },
  { id: 'canvas', icon: '📐', label: 'Canvas' },
  { id: 'trim', icon: '↔️', label: 'Trim' },
  { id: 'split', icon: '✂️', label: 'Split' },
  { id: 'volume', icon: '🔊', label: 'Volume' },
  { id: 'order', icon: '🔀', label: 'Order' },
  { id: 'delete', icon: '🗑', label: 'Delete' },
  { id: 'text', icon: 'T', label: 'Text' },
  { id: 'captions', icon: '💬', label: 'Captions', soon: 'M2' },
  { id: 'audio', icon: '🎚', label: 'Audio', soon: 'M2' },
  { id: 'voicefx', icon: '🎙', label: 'Voice FX', soon: 'M2' },
  { id: 'music', icon: '🎵', label: 'Music', soon: 'M2' },
  { id: 'sfx', icon: '💥', label: 'SFX', soon: 'M2' },
  { id: 'transitions', icon: '🌀', label: 'Transitions', soon: 'M3' },
  { id: 'color', icon: '🎨', label: 'Color', soon: 'M3' },
  { id: 'motion', icon: '🎥', label: 'Motion', soon: 'M3' },
  { id: 'speed', icon: '⏩', label: 'Speed', soon: 'M3' },
];

const HEVC_TIP = 'Tip: in Samsung Camera ▸ Settings ▸ Advanced video options turn off “High efficiency videos” (Pixel: Camera ▸ Settings ▸ Video ▸ turn off H.265/HEVC).';

const val = (e: Event) => +(e.target as HTMLInputElement).value;

const COLORS = ['#ffffff', '#ffd400', '#ff4d6d', '#4dd2ff', '#7cff6b', '#000000'];

const FILE_ID = 'vlogup-file-input';

export function Editor({ id, back }: { id: string; back: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selClip, setSelClip] = useState<string | null>(null);
  const [selText, setSelText] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [report, setReport] = useState<{ name: string; msg: string; added: boolean }[] | null>(null);
  const [proxyMsg, setProxyMsg] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [backend, setBackend] = useState('');
  const [sources, setSources] = useState<Record<string, { url: string; kind: 'video' | 'image' }>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const projRef = useRef<Project | null>(null);
  const urls = useRef<string[]>([]);
  projRef.current = project;

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast((t) => (t === m ? null : t)), 2600); };

  // ---------- load ----------
  useEffect(() => {
    let alive = true;
    storageBackend().then(setBackend);
    loadProject(id).then(async (p) => {
      if (!alive) return;
      if (!p) { setMissing(true); return; }
      setProject(p);
      await refreshSources(p);
      resumeProxies(p);
    });
    return () => { alive = false; urls.current.forEach((u) => URL.revokeObjectURL(u)); };
  }, [id]);

  useEffect(() => {
    if (!canvasRef.current || !hostRef.current || player.current) return;
    const pl = new Player(canvasRef.current, hostRef.current);
    pl.onTime = (t, pg) => { setTime(t); setPlaying(pg); };
    player.current = pl;
    return () => { pl.destroy(); player.current = null; };
  }, [project !== null]);

  useEffect(() => {
    if (project && player.current) player.current.setProject(project, sources);
  }, [project, sources]);

  async function refreshSources(p: Project) {
    const next: Record<string, { url: string; kind: 'video' | 'image' }> = {};
    for (const m of Object.values(p.media)) {
      const blob = (m.proxy?.status === 'ready' ? await getBlob(proxyKey(p.id, m.id)) : null) ?? (await getBlob(mediaKey(p.id, m.id)));
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      next[m.id] = { url, kind: m.kind };
    }
    setSources(next);
  }

  // ---------- persistence ----------
  const saveTimer = useRef<number>(0);
  const persist = (p: Project) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveProject(p).catch((e) => flash(`Save failed: ${e.message}`)), 250);
  };
  const update = (p: Project) => { setProject(p); persist(p); };
  const dispatch = (op: OpBody) => { const p = projRef.current; if (p) update(commit(p, op)); };

  // ---------- proxies (background, one at a time) ----------
  const proxyBusy = useRef(false);
  async function resumeProxies(p0: Project) {
    if (proxyBusy.current) return;
    proxyBusy.current = true;
    try {
      for (;;) {
        const p = projRef.current ?? p0;
        const m = Object.values(p.media).find((a) => a.proxy?.status === 'pending');
        if (!m) break;
        let status: 'ready' | 'failed' | 'skipped' = 'skipped';
        let h: number | undefined;
        if (needsProxy(m)) {
          try {
            const blob = await getBlob(mediaKey(p.id, m.id));
            if (!blob) throw new Error('missing');
            const out = await makeProxy(blob, m, (x) => setProxyMsg(`Optimising preview · ${m.name} ${Math.round(x * 100)}%`));
            await putBlob(proxyKey(p.id, m.id), out);
            status = 'ready'; h = 540;
          } catch { status = 'failed'; }
        }
        const cur = projRef.current ?? p;
        const media = { ...cur.media, [m.id]: { ...cur.media[m.id], proxy: { status, height: h } } };
        const np = { ...cur, media };
        update(np);
        projRef.current = np;
        if (status === 'ready') {
          const b = await getBlob(proxyKey(np.id, m.id));
          if (b) { const url = URL.createObjectURL(b); urls.current.push(url); setSources((s) => ({ ...s, [m.id]: { url, kind: 'video' } })); }
        }
      }
    } finally { proxyBusy.current = false; setProxyMsg(null); }
  }

  // ---------- import ----------
  const onFiles = async (input: HTMLInputElement) => {
    const p0 = projRef.current;
    const list = Array.from(input.files ?? []);
    input.value = ''; // allow picking the same file again
    if (!p0) return;
    if (!list.length) { flash('No files were selected'); return; }
    const assets: MediaAsset[] = [];
    const problems: { name: string; msg: string; added: boolean }[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const label = `${i + 1}/${list.length} · ${f.name || 'file'}`;
      setImporting(`Importing ${label}`);
      try {
        const a = await probeFile(f, (step) => setImporting(`${step} · ${label}`));
        setImporting(`Saving to this device${f.size ? ` (${(f.size / 1e6).toFixed(0)} MB)` : ''} · ${label}`);
        await withTimeout(putBlob(mediaKey(p0.id, a.id), f), 10 * 60_000, 'Saving');
        if (a.kind === 'video' && a.decodable === false) {
          problems.push({ name: f.name, added: true, msg: `${codecName(a.codec)} video: this browser can't decode it, so it plays in the preview only if the phone supports it, and it can't be exported yet. ${HEVC_TIP}` });
        }
        assets.push(a);
      } catch (e: any) {
        console.error('import failed', f.name, e);
        problems.push({ name: f.name || 'file', added: false, msg: e?.message ?? 'Unsupported file' });
      }
    }
    setImporting(null);
    if (problems.length) setReport(problems);
    if (!assets.length) { if (!problems.length) flash('Nothing was imported'); return; }
    const cur = projRef.current!;
    const media = { ...cur.media };
    assets.forEach((a) => (media[a.id] = a));
    const clips: Clip[] = assets.map((a) => ({
      id: uid('c_'), mediaId: a.id, in: 0, out: a.kind === 'image' ? DEFAULT_IMAGE_SECONDS : a.duration, volume: 1,
    }));
    let np: Project = { ...cur, media, thumb: cur.thumb ?? assets.find((a) => a.thumb)?.thumb };
    // First import: match the canvas to the first clip's orientation.
    if (!cur.timeline.tracks.video.length && assets[0].height > assets[0].width) np = commit(np, { type: 'setAspect', aspect: '9:16' });
    np = commit(np, { type: 'addClips', clips });
    update(np);
    projRef.current = np;
    await refreshSources(np);
    flash(`Added ${clips.length} clip${clips.length > 1 ? 's' : ''}`);
    resumeProxies(np);
  };

  // ---------- derived ----------
  const tl = project?.timeline;
  const total = tl ? duration(tl) : 0;
  const clipAtHead = tl ? locate(tl, time) : null;
  const sel = tl?.tracks.video.find((c) => c.id === selClip) ?? null;
  const target = sel ?? clipAtHead?.clip ?? null;
  const selTextItem = tl?.tracks.text.find((t) => t.id === selText) ?? null;
  const canUndo = project ? undoTarget(project.log) != null : false;
  const canRedo = project ? redoTarget(project.log) != null : false;

  const undo = () => { const p = projRef.current; const t = p && undoTarget(p.log); if (p && t != null) update(commit(p, { type: 'undo', target: t })); };
  const redo = () => { const p = projRef.current; const t = p && redoTarget(p.log); if (p && t != null) update(commit(p, { type: 'redo', target: t })); };

  const seek = (t: number) => { player.current?.pause(); player.current?.seek(t); setTime(t); };

  const runTool = (tid: string) => {
    const t = TOOLS.find((x) => x.id === tid)!;
    if (t.soon) { flash(`${t.label} is coming in ${t.soon}`); return; }
    if (!tl) return;
    if (tid === 'templates' || tid === 'canvas' || tid === 'order') { setTool(tool === tid ? null : (tid as Tool)); return; }
    if (tid === 'text') { addText(); return; }
    if (!tl.tracks.video.length) { flash('Add a clip first: tap ＋'); return; }
    if (tid === 'split') {
      const loc = locate(tl, time);
      if (!loc) return;
      const at = loc.src;
      if (at - loc.clip.in < 0.1 || loc.clip.out - at < 0.1) { flash('Move the playhead inside a clip to split'); return; }
      const newId = uid('c_');
      dispatch({ type: 'splitClip', clipId: loc.clip.id, at, newId });
      setSelClip(newId);
      flash('Split');
      return;
    }
    if (tid === 'delete') {
      if (!target) return;
      dispatch({ type: 'deleteClip', clipId: target.id });
      setSelClip(null);
      flash('Clip deleted · Undo to restore');
      return;
    }
    if (tid === 'trim' || tid === 'volume') {
      if (target) setSelClip(target.id);
      setTool(tool === tid ? null : (tid as Tool));
    }
  };

  const addText = () => {
    const start = Math.min(time, Math.max(0, total - 0.5));
    const item: TextItem = {
      id: uid('t_'), text: 'Your text', start, end: Math.min(Math.max(total, start + 3), start + 3),
      x: 0.5, y: 0.8, size: 0.07, color: '#ffffff', style: 'outline',
    };
    dispatch({ type: 'addText', item });
    setSelText(item.id); setSelClip(null); setTool('text');
  };

  // Drag a selected text on the preview to position it.
  const dragText = useRef<{ id: string } | null>(null);
  const previewPointer = (e: PointerEvent, phase: 'down' | 'move' | 'up') => {
    const c = canvasRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (phase === 'down') {
      if (selTextItem && time >= selTextItem.start && time < selTextItem.end) {
        dragText.current = { id: selTextItem.id };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else { player.current?.toggle(); }
    } else if (phase === 'move' && dragText.current && selTextItem) {
      // live position without logging every pixel: mutate a local copy
      const p = projRef.current!;
      const t = { ...p, timeline: { ...p.timeline, tracks: { ...p.timeline.tracks, text: p.timeline.tracks.text.map((it) => it.id === selTextItem.id ? { ...it, x, y } : it) } } };
      setProject(t);
    } else if (phase === 'up' && dragText.current) {
      dragText.current = null;
      const p = projRef.current!;
      const it = p.timeline.tracks.text.find((i) => i.id === selTextItem?.id);
      // One op with the final position (commit() replays base + log, discarding the live drag copy).
      if (it) update(commit(p, { type: 'updateText', id: it.id, patch: { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) } }));
    }
  };

  const shareJson = () => {
    if (!project) return;
    const blob = new Blob([exportProjectJson(project)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name}.vlogup.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (missing) return <div class="home"><p>Project not found.</p><button class="btn" onClick={back}>Back</button></div>;
  if (!project || !tl) return <div class="home"><p class="muted">Opening…</p></div>;

  return (
    <div class="editor">
      <header class="topbar">
        <button class="icon-btn" aria-label="Back" onClick={back}>‹</button>
        <input class="title-input" value={project.name} aria-label="Project name"
          onChange={(e) => update({ ...project, name: (e.target as HTMLInputElement).value || 'Untitled', updatedAt: new Date().toISOString() })} />
        <button class={`icon-btn${canUndo ? '' : ' dim'}`} aria-label="Undo" onClick={() => (canUndo ? undo() : flash('Nothing to undo'))}>↶</button>
        <button class={`icon-btn${canRedo ? '' : ' dim'}`} aria-label="Redo" onClick={() => (canRedo ? redo() : flash('Nothing to redo'))}>↷</button>
        <button class="icon-btn" aria-label="Project info" onClick={() => setShowInfo(true)}>ⓘ</button>
        <button class={`btn primary sm${tl.tracks.video.length ? '' : ' dim'}`} data-testid="export" onClick={() => { if (!tl.tracks.video.length) { flash('Add a clip first: tap ＋'); return; } player.current?.pause(); setShowExport(true); }}>Export</button>
      </header>

      <section class="preview" ref={hostRef}>
        <canvas ref={canvasRef} class={`preview-canvas a${tl.aspect.replace(':', 'x')}`} data-testid="preview"
          onPointerDown={(e) => previewPointer(e as PointerEvent, 'down')}
          onPointerMove={(e) => previewPointer(e as PointerEvent, 'move')}
          onPointerUp={(e) => previewPointer(e as PointerEvent, 'up')} />
        {!tl.tracks.video.length && (
          <label class="empty-add" for={FILE_ID} data-testid="empty-add" >
            <span class="plus">＋</span><span>Add clips & photos in order</span>
          </label>
        )}
        <div class="preview-bar">
          <button class="play" aria-label={playing ? 'Pause' : 'Play'} data-testid="play" onClick={() => player.current?.toggle()}>{playing ? '❚❚' : '▶'}</button>
          {proxyMsg && !importing && <span class="chip-status">{proxyMsg}</span>}
        </div>
      </section>

      <nav class="toolrow" aria-label="Tools">
        {TOOLS.map((t) => (
          <button key={t.id} class={`tool${tool === t.id ? ' on' : ''}${t.soon ? ' soon' : ''}`} data-tool={t.id} onClick={() => runTool(t.id)}>
            <span class="ti">{t.icon}</span><span class="tl">{t.label}</span>{t.soon && <span class="badge">{t.soon}</span>}
          </button>
        ))}
      </nav>

      <Timeline project={project} time={time} playing={playing} selectedClip={selClip} selectedText={selText}
        onSeek={seek}
        onSelectClip={(cid) => { setSelClip(cid); setSelText(null); if (!cid && (tool === 'trim' || tool === 'volume')) setTool(null); }}
        onSelectText={(tid) => { setSelText(tid); setSelClip(null); setTool(tid ? 'text' : null); }}
        onTrim={(cid, i, o) => dispatch({ type: 'trimClip', clipId: cid, in: i, out: o })}
        fileId={FILE_ID} />

      {/* Visually hidden (not display:none) and opened via <label for>: the most reliable way to open the Android/iOS picker. */}
      <input ref={fileRef} id={FILE_ID} class="file-input" type="file" accept="video/*,image/*" multiple data-testid="file-input"
        onChange={(e) => onFiles(e.currentTarget as HTMLInputElement)} />
      {importing && (
        <div class="import-card" role="status" data-testid="importing"><span class="spinner" /> {importing}</div>
      )}

      {tool ? (
        <section class="panel" aria-label="Tool panel">
          <div class="panel-head">
            <b>{TOOLS.find((t) => t.id === tool)?.label}</b>
            <button class="icon-btn" aria-label="Close panel" onClick={() => setTool(null)}>✓</button>
          </div>
          <div class="panel-body">
            {tool === 'templates' && <TemplatesPanel />}
            {tool === 'canvas' && <CanvasPanel aspect={tl.aspect} set={(a) => dispatch({ type: 'setAspect', aspect: a })} />}
            {tool === 'trim' && target && <TrimPanel clip={target} media={project.media[target.mediaId]} onTrim={(i, o) => dispatch({ type: 'trimClip', clipId: target.id, in: i, out: o })} />}
            {tool === 'volume' && target && <VolumePanel clip={target} set={(v, m) => dispatch({ type: 'setVolume', clipId: target.id, volume: v, muted: m })} />}
            {(tool === 'trim' || tool === 'volume') && !target && <p class="muted">Select a clip on the timeline.</p>}
            {tool === 'order' && <OrderPanel project={project} move={(cid, to) => dispatch({ type: 'moveClip', clipId: cid, toIndex: to })} />}
            {tool === 'text' && (selTextItem
              ? <TextPanel item={selTextItem} total={total}
                  set={(patch) => dispatch({ type: 'updateText', id: selTextItem.id, patch })}
                  del={() => { dispatch({ type: 'deleteText', id: selTextItem.id }); setSelText(null); setTool(null); }} />
              : <div><p class="muted">Select a text item on the timeline, or</p><button class="btn" onClick={addText}>＋ Add text at playhead</button></div>)}
          </div>
        </section>
      ) : (
        <ChatSheet />
      )}

      {toast && <div class="toast" role="status" data-testid="toast">{toast}</div>}
      {report && (
        <Dialog title="Import report" onClose={() => setReport(null)}>
          <ul class="report" data-testid="import-report">{report.map((r) => <li><b>{r.added ? '⚠️' : '❌'} {r.name}</b><span class="small">{r.added ? 'Added with a warning. ' : 'Not added. '}{r.msg}</span></li>)}</ul>
          <button class="btn primary" onClick={() => setReport(null)}>OK</button>
        </Dialog>
      )}
      {showExport && <ExportDialog project={project} onClose={() => setShowExport(false)} />}
      {showInfo && (
        <Dialog title="Project" onClose={() => setShowInfo(false)}>
          <p class="small">Timeline schema <code>{tl.schema}</code> v{tl.schemaVersion} · {tl.tracks.video.length} clips · {tl.tracks.text.length} texts · {fmtTime(total)}</p>
          <p class="small">Edit log: {project.log.length} ops (append-only). Storage: {backend || '…'}.</p>
          <ol class="oplog small">{project.log.slice(-12).reverse().map((o) => <li key={o.seq}>#{o.seq} {o.type} <span class="muted">· {o.by} · {new Date(o.ts).toLocaleTimeString()}</span></li>)}</ol>
          <button class="btn" onClick={shareJson}>Download project JSON</button>
        </Dialog>
      )}
    </div>
  );
}

function CanvasPanel({ aspect, set }: { aspect: Aspect; set: (a: Aspect) => void }) {
  const opts: { a: Aspect; label: string }[] = [
    { a: '16:9', label: 'YouTube 16:9' }, { a: '9:16', label: 'Shorts / Reels 9:16' }, { a: '1:1', label: 'Square 1:1' },
  ];
  return <div class="seg">{opts.map((o) => <button class={`btn${aspect === o.a ? ' primary' : ''}`} onClick={() => set(o.a)}>{o.label}</button>)}</div>;
}

function TrimPanel({ clip, media, onTrim }: { clip: Clip; media?: MediaAsset; onTrim: (i: number, o: number) => void }) {
  const max = !media || media.kind === 'image' ? 60 : media.duration;
  const [i, setI] = useState(clip.in);
  const [o, setO] = useState(clip.out);
  useEffect(() => { setI(clip.in); setO(clip.out); }, [clip.id, clip.in, clip.out]);
  return (
    <div class="form">
      {media?.kind === 'image' ? (
        <label>Duration <b>{fmtTime(o - i)}</b>
          <input type="range" min={0.5} max={max} step={0.1} value={o - i}
            onInput={(e) => setO(i + val(e))} onChange={(e) => onTrim(i, i + val(e))} />
        </label>
      ) : (<>
        <label>Start <b>{fmtTime(i)}</b>
          <input type="range" min={0} max={max} step={0.05} value={i} data-testid="trim-start"
            onInput={(e) => setI(Math.min(val(e), o - 0.1))} onChange={(e) => onTrim(Math.min(val(e), o - 0.1), o)} />
        </label>
        <label>End <b>{fmtTime(o)}</b>
          <input type="range" min={0} max={max} step={0.05} value={o} data-testid="trim-end"
            onInput={(e) => setO(Math.max(val(e), i + 0.1))} onChange={(e) => onTrim(i, Math.max(val(e), i + 0.1))} />
        </label>
      </>)}
      <p class="muted small">Clip length {fmtTime(clipLen({ ...clip, in: i, out: o }))} of {fmtTime(max)}. Tip: drag the white handles on the selected clip.</p>
    </div>
  );
}

function VolumePanel({ clip, set }: { clip: Clip; set: (v: number, m?: boolean) => void }) {
  const [v, setV] = useState(clip.volume);
  useEffect(() => setV(clip.volume), [clip.id, clip.volume]);
  return (
    <div class="form">
      <label>Volume <b>{Math.round(v * 100)}%</b>
        <input type="range" min={0} max={2} step={0.05} value={v} onInput={(e) => setV(val(e))} onChange={(e) => set(val(e))} />
      </label>
      <div class="seg">
        <button class={`btn${clip.muted ? ' primary' : ''}`} onClick={() => set(clip.volume, !clip.muted)}>{clip.muted ? '🔇 Muted' : '🔈 Mute'}</button>
        <button class="btn" onClick={() => set(1, false)}>Reset 100%</button>
      </div>
    </div>
  );
}

function OrderPanel({ project, move }: { project: Project; move: (id: string, to: number) => void }) {
  const clips = project.timeline.tracks.video;
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const indexAt = (y: number) => {
    const items = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    for (let i = 0; i < items.length; i++) { const r = items[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return i; }
    return items.length - 1;
  };
  return (
    <ol class="order" ref={listRef}>
      {clips.map((c, i) => {
        const m = project.media[c.mediaId];
        return (
          <li key={c.id} class={`${dragId === c.id ? 'dragging' : ''}${over === i && dragId ? ' over' : ''}`}>
            <span class="grip" aria-label="Drag to reorder"
              onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture((e as PointerEvent).pointerId); setDragId(c.id); }}
              onPointerMove={(e) => dragId && setOver(indexAt((e as PointerEvent).clientY))}
              onPointerUp={() => { if (dragId && over != null && over !== i) move(dragId, over); setDragId(null); setOver(null); }}>⠿</span>
            <span class="othumb" style={m?.thumb ? { backgroundImage: `url(${m.thumb})` } : undefined} />
            <span class="oname">{i + 1}. {m?.name ?? 'clip'} <span class="muted small">{fmtTime(clipLen(c))}</span></span>
            <button class="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => move(c.id, i - 1)}>↑</button>
            <button class="icon-btn sm" aria-label="Move down" disabled={i === clips.length - 1} onClick={() => move(c.id, i + 1)}>↓</button>
          </li>
        );
      })}
    </ol>
  );
}

function TextPanel({ item, total, set, del }: { item: TextItem; total: number; set: (p: Partial<TextItem>) => void; del: () => void }) {
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.id]);
  const maxT = Math.max(total, item.end, 1);
  return (
    <div class="form">
      <textarea rows={2} value={text} aria-label="Text" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} onBlur={() => text !== item.text && set({ text })} />
      <div class="seg">
        {(['outline', 'box', 'plain'] as const).map((s) => <button class={`btn sm${item.style === s ? ' primary' : ''}`} onClick={() => set({ style: s })}>{s[0].toUpperCase() + s.slice(1)}</button>)}
        {COLORS.map((c) => <button class={`swatch${item.color === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => set({ color: c })} />)}
      </div>
      <label>Size <input type="range" min={0.03} max={0.18} step={0.005} value={item.size} onChange={(e) => set({ size: +(e.target as HTMLInputElement).value })} /></label>
      <div class="seg">
        <button class="btn sm" onClick={() => set({ y: 0.15 })}>Top</button>
        <button class="btn sm" onClick={() => set({ y: 0.5 })}>Middle</button>
        <button class="btn sm" onClick={() => set({ y: 0.82 })}>Bottom</button>
      </div>
      <label>Starts <b>{fmtTime(item.start)}</b><input type="range" min={0} max={maxT} step={0.1} value={item.start} onChange={(e) => { const s = +(e.target as HTMLInputElement).value; set({ start: Math.min(s, item.end - 0.2) }); }} /></label>
      <label>Ends <b>{fmtTime(item.end)}</b><input type="range" min={0} max={maxT} step={0.1} value={item.end} onChange={(e) => { const s = +(e.target as HTMLInputElement).value; set({ end: Math.max(s, item.start + 0.2) }); }} /></label>
      <p class="muted small">Tip: drag the text on the preview to move it.</p>
      <button class="btn danger" onClick={del}>Delete text</button>
    </div>
  );
}

