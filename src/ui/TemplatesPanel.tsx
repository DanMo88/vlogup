import { useEffect, useState } from 'preact/hooks';
import { loadTemplates, TemplateSummary } from '../templates';

/** Reserved tab: lists bundled templates (if any). Applying them arrives with the AI editor (M4). */
export function TemplatesPanel() {
  const [list, setList] = useState<TemplateSummary[] | null>(null);
  useEffect(() => { loadTemplates().then(setList); }, []);
  return (
    <div>
      <p class="muted small">
        Pick a ready-made style and the AI edits your clips the same way: pacing, transitions, colour, captions, music and SFX.
        <b> Applying templates arrives with the AI editor (M4).</b>
      </p>
      {list === null ? <p class="muted">Loading…</p> : list.length === 0 ? <p class="muted">Templates are on the way.</p> : (
        <ul class="tpl-list">
          {list.map((t) => (
            <li key={t.id}><b>{t.name}</b>{t.description && <span class="muted small">{t.description}</span>}<span class="badge">Soon</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}
