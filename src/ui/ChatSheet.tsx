import { useState } from 'preact/hooks';
import { AiSettings, clearAiKeys, loadAi, maskKey, PROVIDERS, providerInfo, ProviderId, saveAi } from '../ai/settings';
import { Dialog } from './Dialog';

const CHIPS = ['Remove silences', 'Cut bad takes', 'Captions', 'Clean voice', 'Add music + duck', 'Hook first 3s', 'Make Short 9:16', 'Apply look'];
type Height = 'collapsed' | 'half' | 'full';

/** AI chat bottom sheet. M1: placeholder + BYO-key settings. The AI editor lands in M4. */
export function ChatSheet() {
  const [h, setH] = useState<Height>('collapsed');
  const [ai, setAi] = useState<AiSettings>(loadAi());
  const [settings, setSettings] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const info = providerInfo(ai.provider);
  const hasKey = !!ai.keys[ai.provider];
  const cycle = () => setH(h === 'collapsed' ? 'half' : h === 'half' ? 'full' : 'collapsed');

  const send = () => {
    if (!draft.trim()) return;
    setNote(`Saved idea: “${draft.trim()}”. The AI editor arrives in M4, so nothing was sent and no credits were used.`);
    setDraft('');
    if (h === 'collapsed') setH('half');
  };

  return (
    <section class={`chat ${h}`} aria-label="AI editor" data-testid="chat">
      <button class="chat-grip" aria-label="Resize AI chat" onClick={cycle}><span /></button>
      <div class="chat-head">
        <span class="badge prov" title={info.vendor}>{info.label}</span>
        <span class="muted small">{hasKey ? `key ${maskKey(ai.keys[ai.provider])}` : 'no key'}</span>
        <span class="cost small" title="Cost meter (M4)">$0.00</span>
        <button class="icon-btn sm" aria-label="AI settings" data-testid="ai-settings" onClick={() => setSettings(true)}>⚙︎</button>
      </div>
      {h !== 'collapsed' && (
        <div class="chat-body">
          <div class="msg bot">
            👋 I'm your AI editor. <b>Coming in M4:</b> type how you want your vlog (“fast daily vlog, 60 s, strong hook”) and I'll cut,
            caption, grade and mix it on this timeline, then show <b>Done</b> with a change list you can undo.
            Bring your own Grok, Claude or ChatGPT key. Your footage never leaves the phone.
          </div>
          {note && <div class="msg bot small">{note}</div>}
        </div>
      )}
      <div class="chips">{CHIPS.map((c) => <button class="chip" disabled title="Coming in M2/M4">{c}</button>)}</div>
      <form class="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={draft} placeholder="Describe your edit… (AI arrives in M4)" aria-label="Message the AI editor"
          onFocus={() => h === 'collapsed' && setH('half')} onInput={(e) => setDraft((e.target as HTMLInputElement).value)} />
        <button class="btn primary sm" type="submit">Send</button>
      </form>

      {settings && <AiSettingsDialog ai={ai} onClose={() => setSettings(false)} onSave={(s) => { saveAi(s); setAi(s); }} />}
    </section>
  );
}

function AiSettingsDialog({ ai, onClose, onSave }: { ai: AiSettings; onClose: () => void; onSave: (s: AiSettings) => void }) {
  const [s, setS] = useState<AiSettings>({ ...ai, keys: { ...ai.keys }, models: { ...ai.models } });
  const [show, setShow] = useState(false);
  const p = providerInfo(s.provider);
  const key = s.keys[s.provider] ?? '';
  const warn = key && !key.startsWith(p.keyPrefix) ? `${p.label} keys usually start with “${p.keyPrefix}”.` : null;
  return (
    <Dialog title="AI editor settings" onClose={onClose}>
      <div class="form">
        <div class="seg" role="radiogroup" aria-label="Provider">
          {PROVIDERS.map((x) => (
            <button class={`btn${s.provider === x.id ? ' primary' : ''}`} role="radio" aria-checked={s.provider === x.id}
              onClick={() => setS({ ...s, provider: x.id as ProviderId })}>{x.label}</button>
          ))}
        </div>
        <label>{p.label} API key ({p.vendor})
          <input type={(show ? 'text' : 'password') as any} autocomplete="off" spellcheck={false} value={key} placeholder={`${p.keyPrefix}…`}
            data-testid="ai-key" onInput={(e) => setS({ ...s, keys: { ...s.keys, [s.provider]: (e.target as HTMLInputElement).value.trim() } })} />
        </label>
        <label class="row small"><input type="checkbox" checked={show} onChange={() => setShow(!show)} /> Show key</label>
        {warn && <p class="warn small">{warn}</p>}
        <label>Model
          <input value={s.models[s.provider] ?? ''} placeholder={p.defaultModel}
            onInput={(e) => setS({ ...s, models: { ...s.models, [s.provider]: (e.target as HTMLInputElement).value.trim() } })} />
        </label>
        <label>Optional CORS proxy URL (advanced)
          <input value={s.proxyUrl ?? ''} placeholder="https://your-worker.example.workers.dev" onInput={(e) => setS({ ...s, proxyUrl: (e.target as HTMLInputElement).value.trim() || undefined })} />
        </label>
        <p class="muted small">
          Get a key at <a href={p.keysUrl} target="_blank" rel="noopener">{p.keysUrl.replace('https://', '')}</a>. Keys are stored only in this browser
          (localStorage) and will be sent only to {p.vendor} when the AI editor ships in <b>M4</b>. Set a spend limit on your provider account.
        </p>
        <div class="seg">
          <button class="btn primary" data-testid="ai-save" onClick={() => { onSave(s); onClose(); }}>Save</button>
          <button class="btn danger" onClick={() => { clearAiKeys(); onSave({ ...s, keys: {} }); onClose(); }}>Remove all keys</button>
        </div>
      </div>
    </Dialog>
  );
}
