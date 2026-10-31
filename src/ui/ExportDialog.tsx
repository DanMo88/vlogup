import { useEffect, useRef, useState } from 'preact/hooks';
import type { Project } from '../model/types';
import { duration, fmtTime } from '../model/timeline';
import { detectCaps, Caps } from '../media/caps';
import { exportProject, ExportResult } from '../engine/export';
import { frameSize } from '../engine/render';
import { Dialog } from './Dialog';

export function ExportDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [res, setRes] = useState<720 | 1080>(1080);
  const [caps, setCaps] = useState<Caps | null>(null);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [prog, setProg] = useState({ p: 0, label: '' });
  const [out, setOut] = useState<ExportResult | null>(null);
  const [err, setErr] = useState('');
  const [url, setUrl] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { detectCaps().then(setCaps); return () => { abort.current?.abort(); }; }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const { w, h } = frameSize(project.timeline.aspect, res);
  const start = async () => {
    setState('running'); setErr('');
    abort.current = new AbortController();
    const wake = await (navigator as any).wakeLock?.request?.('screen').catch(() => null);
    try {
      const r = await exportProject(project, { shortSide: res, fps: 30, signal: abort.current.signal, onProgress: (p, label) => setProg({ p, label }) });
      setOut(r); setUrl(URL.createObjectURL(r.blob)); setState('done');
    } catch (e: any) {
      if (e?.name === 'AbortError') { setState('idle'); return; }
      console.warn('export failed', e);
      setErr(e?.message ?? String(e)); setState('error');
    } finally { wake?.release?.(); }
  };

  const share = async () => {
    if (!out) return;
    const file = new File([out.blob], out.name, { type: 'video/mp4' });
    if ((navigator as any).canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: project.name }); } catch { /* cancelled */ }
    } else download();
  };
  const download = () => {
    if (!out) return;
    const a = document.createElement('a'); a.href = url; a.download = out.name; a.click();
  };

  return (
    <Dialog title="Export video" onClose={() => { abort.current?.abort(); onClose(); }}>
      {state === 'idle' || state === 'error' ? (
        <div class="form">
          <div class="seg">
            {([720, 1080] as const).map((r) => <button class={`btn${res === r ? ' primary' : ''}`} onClick={() => setRes(r)}>{r}p</button>)}
          </div>
          <p class="small">MP4 · {w}×{h} · 30 fps · {project.timeline.aspect} · {fmtTime(duration(project.timeline))}</p>
          {caps?.reason && <p class="warn small">{caps.reason}</p>}
          {err && <p class="warn small" data-testid="export-error">Export failed: {err}</p>}
          <p class="muted small">Keep VlogUp open and the screen on while exporting. Rendering uses the original files, not the preview proxies.</p>
          <button class="btn primary big" data-testid="export-start" disabled={!!caps && !caps.webcodecs} onClick={start}>Export {res}p MP4</button>
        </div>
      ) : state === 'running' ? (
        <div class="form">
          <div class="progress"><span style={{ width: `${Math.round(prog.p * 100)}%` }} /></div>
          <p class="small">{Math.round(prog.p * 100)}% · {prog.label}</p>
          <button class="btn" onClick={() => abort.current?.abort()}>Cancel</button>
        </div>
      ) : out && (
        <div class="form" data-testid="export-done">
          <video src={url} controls playsInline class="export-video" />
          <p class="small">{out.name} · {(out.blob.size / 1e6).toFixed(1)} MB · {out.width}×{out.height} · {out.codec} · {out.seconds.toFixed(1)} s</p>
          <div class="seg">
            <button class="btn primary" onClick={share}>Share / Save</button>
            <button class="btn" data-testid="export-download" onClick={download}>Download</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
