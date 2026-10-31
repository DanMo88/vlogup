import { useEffect, useState } from 'preact/hooks';
import { onUpdateReady, updateReady } from './install';
import { VERSION_LABEL } from '../version';

const IGNORE = /ResizeObserver loop|AbortError|Export cancelled|play\(\) request was interrupted|The play\(\) request|NotAllowedError/i;

/** Global runtime-error banner (with Reload) and "new version ready" prompt. */
export function Banners() {
  const [err, setErr] = useState<string | null>(null);
  const [upd, setUpd] = useState(updateReady);
  useEffect(() => {
    const onErr = (e: ErrorEvent) => { const m = e.message || String(e.error); if (!IGNORE.test(m)) setErr(m); };
    const onRej = (e: PromiseRejectionEvent) => { const m = e.reason?.message ?? String(e.reason); if (!IGNORE.test(m) && !IGNORE.test(e.reason?.name ?? '')) setErr(m); };
    addEventListener('error', onErr);
    addEventListener('unhandledrejection', onRej);
    const off = onUpdateReady(() => setUpd(true));
    return () => { removeEventListener('error', onErr); removeEventListener('unhandledrejection', onRej); off(); };
  }, []);
  return (
    <>
      {upd && (
        <div class="banner update" role="status" data-testid="update-banner">
          <span>✨ A new version of VlogUp is ready.</span>
          <button class="btn sm primary" onClick={() => location.reload()}>Reload</button>
        </div>
      )}
      {err && (
        <div class="banner error" role="alert" data-testid="error-banner">
          <span>⚠️ Something went wrong: {err.slice(0, 160)} <span class="muted small">· {VERSION_LABEL}</span></span>
          <span class="banner-btns">
            <button class="btn sm primary" onClick={() => location.reload()}>Reload</button>
            <button class="btn sm" aria-label="Dismiss" onClick={() => setErr(null)}>✕</button>
          </span>
        </div>
      )}
    </>
  );
}
