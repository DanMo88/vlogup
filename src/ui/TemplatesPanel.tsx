import { useEffect, useState } from 'preact/hooks';
import { loadTemplates, TemplateSummary } from '../templates';

/** Templates tab (placeholder): lists the bundled templates. AI apply arrives in M4. */
export function TemplatesPanel() {
  const [list, setList] = useState<TemplateSummary[] | null>(null);
  useEffect(() => { loadTemplates().then(setList); }, []);
  return (
    <div data-testid="templates">
      <p class="small"><span class="badge soon-badge">AI apply coming in M4</span></p>
      <p class="muted small">
        Pick a ready-made style and the AI will edit your clips the same way: pacing, transitions, colour, captions, music and SFX.
      </p>
      {list === null ? <p class="muted">Loading…</p> : (
        <ul class="tpl-list">
          {list.map((t) => (
            <li key={t.id} data-testid="template">
              <b>{t.name}</b>
              {t.description && <span class="muted small">{t.description}</span>}
              <span class="tpl-meta small">{[t.category, t.aspect].filter(Boolean).join(' · ')}</span>
              <button class="btn sm" disabled title="AI apply coming in M4">Use template · M4</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
