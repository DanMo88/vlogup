import { useEffect, useRef, useState } from 'preact/hooks';
import type { OpBody, Project } from '../model/types';
import { AiError, ChatTurn, runAgent } from '../ai/agent';
import { VERSION_LABEL } from '../version';
import { AiSettings, clearAiKeys, loadAi, maskKey, PROVIDERS, providerInfo, ProviderId, saveAi } from '../ai/settings';
import { Dialog } from './Dialog';

const CHIPS = ['Make it a 9:16 Short', 'Add a title at the start', 'Shorten every clip to 3 s', 'Mute all clips', 'Put the best clip first', 'Undo the last change'];
type Height = 'collapsed' | 'half' | 'full';

type Msg =
  | { who: 'user'; text: string }
  | { who: 'bot'; text: string; changes?: string[]; seqs?: number[]; usd?: number; error?: boolean; done?: boolean };

interface Props {
  host: { getProject: () => Project; apply: (ops: OpBody[]) => { project: Project; seqs: number[] }; undo: (n: number) => { project: Project; seqs: number[] } };
  play: () => void;
  undoRun: (seqs: number[]) => void;
}

/** AI chat bottom sheet: the AI editor (Grok first; Claude and ChatGPT too) with the user's own key. */
export function ChatSheet({ host, play, undoRun }: Props) {
  const [h, setH] = useState<Height>('collapsed');
  const [ai, setAi] = useState<AiSettings>(loadAi());
  const [settings, setSettings] = useState(false);
  const [draft, setDraft] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const b = bodyRef.current; if (b) b.scrollTop = b.scrollHeight; }, [msgs, h, busy]);
  const info = providerInfo(ai.provider);
  const hasKey = !!ai.keys[ai.provider];
  const cycle = () => setH(h === 'collapsed' ? 'half' : h === 'half' ? 'full' : 'collapsed');

  // Never silent: every send shows the user's message and then a reply, a result or a clear error.
  const send = async (text = draft) => {
    const t = text.trim();
    if (h === 'collapsed') setH('half');
    if (busy) return;
    if (!t) { setMsgs((m) => [...m, { who: 'bot', text: 'Type what you want, e.g. “put clip 3 first and add the title Paris Day 1”.' }]); return; }
    setDraft('');
    setMsgs((m) => [...m, { who: 'user', text: t }]);
    const settingsNow = loadAi();
    if (!settingsNow.keys[settingsNow.provider]) {
      setMsgs((m) => [...m, { who: 'bot', error: true, text: `To let ${providerInfo(settingsNow.provider).label} edit your vlog, add your API key: tap ⚙︎ above (AI settings), paste the key, Save, then send again.` }]);
      return;
    }
    const history: ChatTurn[] = msgs.filter((m) => !(m.who === 'bot' && m.error)).slice(-10)
      .map((m) => ({ role: m.who === 'user' ? 'user' : 'assistant', content: m.who === 'bot' && m.changes?.length ? `${m.text}\n(Changes: ${m.changes.join('; ')})` : m.text }));
    abort.current = new AbortController();
    setBusy(`${providerInfo(settingsNow.provider).label} is thinking…`);
    try {
      const r = await runAgent(settingsNow, history, t, { ...host, onStep: (s) => setBusy(s) }, abort.current.signal);
      const spent = (settingsNow.spentUsd ?? 0) + r.usage.usd;
      const ns = { ...loadAi(), spentUsd: spent }; saveAi(ns); setAi(ns);
      setMsgs((m) => [...m, { who: 'bot', text: r.reply, changes: r.changes, seqs: r.seqs, usd: r.usage.usd, done: r.changes.length > 0 }]);
    } catch (e: any) {
      const msg = e instanceof AiError ? e.message : `Something went wrong: ${e?.message ?? e}`;
      setMsgs((m) => [...m, { who: 'bot', error: true, text: `⚠️ ${msg}` }]);
    } finally {
      setBusy(null); abort.current = null;
    }
  };

  return (
    <section class={`chat ${h}`} aria-label="AI editor" data-testid="chat">
      <button class="chat-grip" aria-label="Resize AI chat" onClick={cycle}><span /></button>
      <div class="chat-head">
        <span class="badge prov" title={info.vendor}>{info.label}</span>
        <span class="muted small">{hasKey ? `key ${maskKey(ai.keys[ai.provider])}` : 'no key · tap ⚙︎'}</span>
        <span class="cost small" title="Approximate AI cost on this device" data-testid="cost">${(ai.spentUsd ?? 0).toFixed(2)}</span>
        <button class="icon-btn sm" aria-label="AI settings" data-testid="ai-settings" onClick={() => setSettings(true)}>⚙︎</button>
      </div>
      {h !== 'collapsed' && (
        <div class="chat-body" ref={bodyRef}>
          <div class="msg bot">
            👋 I'm your AI editor. Tell me how to edit, in any language. For example: “Put clip 3 first, cut the first 2 seconds of clip 1,
            add the title <i>Paris Day 1</i> at the top, make it 9:16.” Every change is undoable.
          </div>
          {msgs.map((m, i) => m.who === 'user'
            ? <div key={i} class="msg user" dir="auto" data-testid="msg-user">{m.text}</div>
            : (
              <div key={i} class={`msg bot${m.error ? ' err' : ''}`} dir="auto" data-testid={m.error ? 'msg-error' : 'msg-bot'}>
                <div>{m.text}</div>
                {!!m.changes?.length && <ul class="changes small" data-testid="changes">{m.changes.map((c) => <li>✓ {c}</li>)}</ul>}
                {m.done && (
                  <div class="done-row">
                    <span class="chip done" data-testid="done-chip">✅ Done · {m.changes!.length} change{m.changes!.length > 1 ? 's' : ''}</span>
                    <button class="chip" data-testid="done-play" onClick={() => { play(); setH('collapsed'); }}>▶ Play</button>
                    <button class="chip" onClick={() => undoRun(m.seqs ?? [])}>↶ Undo</button>
                    {m.usd != null && <span class="muted small">≈ ${m.usd.toFixed(3)}</span>}
                  </div>
                )}
              </div>
            ))}
          {busy && <div class="msg bot thinking" data-testid="thinking"><span class="spinner" /> {busy} <button class="chip" onClick={() => abort.current?.abort()}>Stop</button></div>}
        </div>
      )}
      <div class="chips">{CHIPS.map((c) => <button class="chip" type="button" disabled={!!busy} onClick={() => send(c)}>{c}</button>)}</div>
      <form class="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={draft} data-testid="chat-input" enterkeyhint="send" dir="auto" placeholder={`Tell ${info.label} how to edit…`} aria-label="Message the AI editor"
          onFocus={() => h === 'collapsed' && setH('half')} onInput={(e) => setDraft((e.target as HTMLInputElement).value)} />
        <button class="btn primary sm" type="submit" data-testid="chat-send" disabled={!!busy}>{busy ? '…' : 'Send'}</button>
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
          <input value={s.models[s.provider] ?? ''} placeholder={`${p.defaultModel} (default)`}
            onInput={(e) => setS({ ...s, models: { ...s.models, [s.provider]: (e.target as HTMLInputElement).value.trim() } })} />
        </label>
        <label>Optional CORS proxy URL (advanced)
          <input value={s.proxyUrl ?? ''} placeholder="https://your-worker.example.workers.dev" onInput={(e) => setS({ ...s, proxyUrl: (e.target as HTMLInputElement).value.trim() || undefined })} />
        </label>
        <p class="muted small">
          Get a key at <a href={p.keysUrl} target="_blank" rel="noopener">{p.keysUrl.replace('https://', '')}</a>. Keys are stored only in this browser
          (localStorage) and are sent only to {p.vendor} (or your own proxy). Set a spend limit on your provider account. Cost so far on this device: ${(s.spentUsd ?? 0).toFixed(2)}.
        </p>
        <p class="muted small" data-testid="app-version">VlogUp {VERSION_LABEL}</p>
        <div class="seg">
          <button class="btn primary" data-testid="ai-save" onClick={() => { onSave(s); onClose(); }}>Save</button>
          <button class="btn danger" onClick={() => { clearAiKeys(); onSave({ ...s, keys: {} }); onClose(); }}>Remove all keys</button>
        </div>
      </div>
    </Dialog>
  );
}
