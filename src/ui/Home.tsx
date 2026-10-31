import { useEffect, useState } from 'preact/hooks';
import type { Project } from '../model/types';
import { duration, fmtTime, newProject } from '../model/timeline';
import { deleteProject, listProjects, saveProject, requestPersistence } from '../media/storage';
import { detectCaps, Caps } from '../media/caps';
import { install, isStandalone, onInstallChange, InstallHelp } from './install';
import { Dialog } from './Dialog';

export function Home({ open }: { open: (id: string) => void }) {
  const [list, setList] = useState<Project[] | null>(null);
  const [caps, setCaps] = useState<Caps | null>(null);
  const [standalone, setStandalone] = useState(isStandalone());
  const [help, setHelp] = useState<InstallHelp>(null);

  const refresh = () => listProjects().then(setList).catch(() => setList([]));
  useEffect(() => {
    refresh();
    detectCaps().then(setCaps);
    return onInstallChange(() => setStandalone(isStandalone()));
  }, []);

  const create = async () => {
    const n = (list?.length ?? 0) + 1;
    const p = newProject(`My Vlog ${n}`);
    await saveProject(p);
    requestPersistence();
    open(p.id);
  };

  const remove = async (p: Project) => {
    if (!confirm(`Delete “${p.name}” and its media from this device?`)) return;
    await deleteProject(p);
    refresh();
  };

  return (
    <div class="home">
      <header class="home-head">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" class="logo" width={44} height={44} />
        <div>
          <h1>VlogUp</h1>
          <p class="muted">Become a vlogger. Edit on your phone, with an AI editor.</p>
        </div>
      </header>

      {!standalone && (
        <div class="install-bar" id="installBar">
          <div>
            <b>Install VlogUp</b>
            <span class="muted small">Android · iPhone · Windows · Mac. Works offline.</span>
          </div>
          <button class="btn primary" data-testid="install" onClick={async () => setHelp(await install())}>📲 Install app</button>
        </div>
      )}

      {caps?.reason && <div class="warn">⚠️ {caps.reason}</div>}

      <button class="btn primary big" data-testid="new-vlog" onClick={create}>＋ New Vlog</button>

      <h2 class="section">Your projects</h2>
      {list === null ? <p class="muted">Loading…</p> : list.length === 0 ? (
        <p class="muted">No projects yet. Tap “New Vlog”, add your clips, trim, add text and export a 1080p MP4. Everything stays on this device.</p>
      ) : (
        <ul class="projects">
          {list.map((p) => (
            <li key={p.id}>
              <button class="proj" onClick={() => open(p.id)}>
                <span class="proj-thumb" style={p.thumb ? { backgroundImage: `url(${p.thumb})` } : undefined} />
                <span class="proj-meta">
                  <b>{p.name}</b>
                  <span class="muted small">{p.timeline.tracks.video.length} clips · {fmtTime(duration(p.timeline))} · {new Date(p.updatedAt).toLocaleDateString()}</span>
                </span>
              </button>
              <button class="icon-btn" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}>🗑</button>
            </li>
          ))}
        </ul>
      )}

      <footer class="home-foot muted small">
        <p>Milestone M1 · core editor. AI editing (Grok, Claude, ChatGPT with your own key) arrives in M4.</p>
        <p>
          Open source (MIT) · <a href="https://github.com/DanMo88/vlogup" target="_blank" rel="noopener">GitHub</a> · Your footage never leaves your device.
        </p>
      </footer>

      {help && (
        <Dialog title={help.title} onClose={() => setHelp(null)}>
          <ol class="steps">{help.steps.map((s) => <li>{s}</li>)}</ol>
        </Dialog>
      )}
    </div>
  );
}
