/**
 * Bring-your-own-key AI settings. Stored ONLY in this browser's localStorage, never synced,
 * never sent anywhere except (from M4) directly to the chosen provider's API over HTTPS.
 */
export type ProviderId = 'grok' | 'claude' | 'chatgpt';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  vendor: string;
  defaultModel: string;
  keyPrefix: string;
  keysUrl: string;
  endpoint: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: 'grok', label: 'Grok', vendor: 'xAI', defaultModel: 'grok-4', keyPrefix: 'xai-', keysUrl: 'https://console.x.ai/', endpoint: 'https://api.x.ai/v1' },
  { id: 'claude', label: 'Claude', vendor: 'Anthropic', defaultModel: 'claude-sonnet-4-5', keyPrefix: 'sk-ant-', keysUrl: 'https://console.anthropic.com/settings/keys', endpoint: 'https://api.anthropic.com/v1' },
  { id: 'chatgpt', label: 'ChatGPT', vendor: 'OpenAI', defaultModel: 'gpt-5-mini', keyPrefix: 'sk-', keysUrl: 'https://platform.openai.com/api-keys', endpoint: 'https://api.openai.com/v1' },
];

export interface AiSettings {
  provider: ProviderId;
  keys: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
  proxyUrl?: string; // optional self-hosted CORS proxy (see spec)
}

const KEY = 'vlogup.ai.v1';

export function loadAi(): AiSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.provider) return { keys: {}, models: {}, ...s };
  } catch { /* ignore */ }
  return { provider: 'grok', keys: {}, models: {} };
}

export function saveAi(s: AiSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearAiKeys() {
  const s = loadAi();
  s.keys = {};
  saveAi(s);
}

export const maskKey = (k?: string) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '');
export const providerInfo = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!;
