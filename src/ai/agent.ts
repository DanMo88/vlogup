/**
 * AI editor agent loop. Provider adapters for xAI Grok and OpenAI (OpenAI-compatible
 * chat/completions with function calling) and Anthropic Claude (Messages API with tools).
 * Calls go straight from the browser to the provider with the user's own key, or through
 * the user's optional proxy (see proxy/README.md). Nothing is sent anywhere else.
 */
import type { OpBody, Project } from '../model/types';
import { AiSettings, providerInfo, ProviderId } from './settings';
import { planTool, timelineBrief, TOOLS } from './tools';

export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface Usage { input: number; output: number; usd: number }
export interface AgentResult { reply: string; changes: string[]; usage: Usage; seqs: number[] }

export class AiError extends Error {
  constructor(message: string, public kind: 'key' | 'rate' | 'network' | 'model' | 'server' | 'other') { super(message); }
}

interface Host {
  getProject: () => Project;
  /** Commit ops to the edit log as actor 'ai'; returns the new project and the seqs written. */
  apply: (ops: OpBody[]) => { project: Project; seqs: number[] };
  undo: (steps: number) => { project: Project; seqs: number[] };
  onStep?: (s: string) => void;
}

// Rough list prices (USD per 1M tokens, Oct 2026) for the visible cost meter.
const PRICES: Record<string, [number, number]> = {
  'grok-4.7': [2, 6], 'grok-4.3': [1.25, 2.5], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5], 'gpt-6.1-terra': [1, 5], 'gpt-5.4-mini': [0.25, 2],
};
const price = (model: string, inp: number, out: number) => {
  const [a, b] = PRICES[model] ?? [2, 8];
  return (inp * a + out * b) / 1e6;
};

const SYSTEM = `You are VlogUp's AI video editor inside a phone vlog-editing app.
You edit the user's REAL timeline only by calling the provided tools. Never claim an edit you did not make with a tool.
Rules:
- Clips play back to back in order. "position" 1 is the first clip. Use the numbers in the timeline JSON; don't invent clips.
- trim_clip uses SOURCE seconds (source_in/source_out of the original file). split_clip "at" is measured from the start of that clip. add_text uses TIMELINE seconds.
- Make all needed tool calls (you may call several at once), then answer with a SHORT summary (1–4 lines) of what you changed.
- If the request needs features that don't exist yet (music, captions from speech, transitions, filters, speed, colour), do what you can with the tools and say briefly that the rest comes in a later update.
- Reply in the same language the user writes in (e.g. Persian/فارسی or English). Text overlays should be in the language the user asks for.
- If the timeline is empty, tell the user to tap ＋ to add clips first.`;

function friendly(status: number, body: string, provider: ProviderId, model: string): AiError {
  const label = providerInfo(provider).label;
  let detail = '';
  try { const j = JSON.parse(body); detail = j.error?.message ?? j.error ?? j.message ?? ''; if (typeof detail !== 'string') detail = JSON.stringify(detail); } catch { detail = body.slice(0, 200); }
  if (status === 401 || status === 403 || (status === 400 && /api key|x-api-key|authentication|unauthori[sz]ed/i.test(detail))) return new AiError(`${label} rejected the API key (${status}). Open ⚙︎ AI settings and paste a valid key.${detail ? ` Details: ${detail}` : ''}`, 'key');
  if (status === 429) return new AiError(`${label} rate limit or out of credits (429). Wait a minute, or add credits / raise the limit in your ${label} console.${detail ? ` Details: ${detail}` : ''}`, 'rate');
  if (status === 404 || (status === 400 && /model/i.test(detail))) return new AiError(`${label} doesn't know the model "${model}". Change the model in ⚙︎ AI settings.${detail ? ` Details: ${detail}` : ''}`, 'model');
  if (status >= 500) return new AiError(`${label} server error (${status}). Try again in a moment.`, 'server');
  return new AiError(`${label} error ${status}: ${detail || 'request failed'}`, 'other');
}

async function post(url: string, headers: Record<string, string>, body: unknown, provider: ProviderId, model: string, signal?: AbortSignal): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 120_000);
  signal?.addEventListener('abort', () => ctl.abort());
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e: any) {
    if (signal?.aborted) throw new AiError('Stopped.', 'other');
    if (ctl.signal.aborted) throw new AiError(`${providerInfo(provider).label} took too long to answer (timeout). Try again.`, 'network');
    throw new AiError(`Couldn't reach ${new URL(url).host}. Check your internet connection. If it keeps failing, the provider may be blocking browser requests (CORS): set an optional proxy URL in ⚙︎ AI settings (see the README).`, 'network');
  } finally { clearTimeout(timer); }
  const text = await r.text();
  if (!r.ok) throw friendly(r.status, text, provider, model);
  try { return JSON.parse(text); } catch { throw new AiError('The provider sent an unreadable answer.', 'server'); }
}

const baseUrl = (s: AiSettings) => {
  const info = providerInfo(s.provider);
  return s.proxyUrl ? `${s.proxyUrl.replace(/\/+$/, '')}/${s.provider}/v1` : info.endpoint;
};

export async function runAgent(s: AiSettings, history: ChatTurn[], userText: string, host: Host, signal?: AbortSignal): Promise<AgentResult> {
  const key = s.keys[s.provider];
  const info = providerInfo(s.provider);
  if (!key) throw new AiError(`Add your ${info.label} API key first: tap ⚙︎ (AI settings).`, 'key');
  const model = s.models[s.provider] || info.defaultModel;
  const changes: string[] = [];
  const seqs: number[] = [];
  const usage: Usage = { input: 0, output: 0, usd: 0 };
  const ctx = () => `Current timeline JSON:\n${JSON.stringify(timelineBrief(host.getProject()))}`;
  const userMsg = `${ctx()}\n\nUser request:\n${userText}`;

  const exec = (name: string, rawArgs: unknown): string => {
    let args: Record<string, any> = {};
    try { args = typeof rawArgs === 'string' ? (rawArgs.trim() ? JSON.parse(rawArgs) : {}) : (rawArgs as any) ?? {}; }
    catch { return JSON.stringify({ ok: false, error: 'Arguments were not valid JSON' }); }
    const plan = planTool(host.getProject(), name, args);
    if (plan.undoSteps) { const r = host.undo(plan.undoSteps); seqs.push(...r.seqs); }
    if (plan.ops.length) { const r = host.apply(plan.ops); seqs.push(...r.seqs); }
    if (plan.summary && (plan.ops.length || plan.undoSteps)) { changes.push(plan.summary); host.onStep?.(plan.summary); }
    const res = plan.result as any;
    return JSON.stringify(res?.ok === false || name === 'get_timeline' ? res : { ...res, timeline: timelineBrief(host.getProject()) });
  };

  const MAX_ROUNDS = 8;
  if (s.provider === 'claude') {
    const url = `${baseUrl(s)}/messages`;
    const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    const msgs: any[] = [...history.map((h) => ({ role: h.role, content: h.content })), { role: 'user', content: userMsg }];
    for (let round = 0; round < MAX_ROUNDS; round++) {
      host.onStep?.(round === 0 ? `${info.label} is thinking…` : `${info.label} is editing…`);
      const j = await post(url, headers, { model, max_tokens: 2048, system: SYSTEM, messages: msgs, tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) }, s.provider, model, signal);
      usage.input += j.usage?.input_tokens ?? 0; usage.output += j.usage?.output_tokens ?? 0;
      const blocks: any[] = j.content ?? [];
      const uses = blocks.filter((b) => b.type === 'tool_use');
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (!uses.length) { usage.usd = price(model, usage.input, usage.output); return { reply: text || (changes.length ? 'Done.' : 'No changes.'), changes, usage, seqs }; }
      msgs.push({ role: 'assistant', content: blocks });
      msgs.push({ role: 'user', content: uses.map((u) => ({ type: 'tool_result', tool_use_id: u.id, content: exec(u.name, u.input) })) });
    }
  } else {
    const url = `${baseUrl(s)}/chat/completions`;
    const headers = { Authorization: `Bearer ${key}` };
    const msgs: any[] = [{ role: 'system', content: SYSTEM }, ...history.map((h) => ({ role: h.role, content: h.content })), { role: 'user', content: userMsg }];
    const tools = TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    for (let round = 0; round < MAX_ROUNDS; round++) {
      host.onStep?.(round === 0 ? `${info.label} is thinking…` : `${info.label} is editing…`);
      const j = await post(url, headers, { model, messages: msgs, tools, tool_choice: 'auto' }, s.provider, model, signal);
      usage.input += j.usage?.prompt_tokens ?? 0; usage.output += j.usage?.completion_tokens ?? 0;
      const m = j.choices?.[0]?.message;
      if (!m) throw new AiError('The provider sent an empty answer.', 'server');
      const calls: any[] = m.tool_calls ?? [];
      if (!calls.length) { usage.usd = price(model, usage.input, usage.output); return { reply: (m.content ?? '').trim() || (changes.length ? 'Done.' : 'No changes.'), changes, usage, seqs }; }
      msgs.push({ role: 'assistant', content: m.content ?? null, tool_calls: calls });
      for (const c of calls) msgs.push({ role: 'tool', tool_call_id: c.id, content: exec(c.function?.name, c.function?.arguments) });
    }
  }
  usage.usd = price(model, usage.input, usage.output);
  return { reply: changes.length ? 'Done (stopped after the maximum number of steps).' : 'I could not finish this request. Try rephrasing it.', changes, usage, seqs };
}
