/**
 * VlogUp optional AI proxy (Cloudflare Worker). Only needed if a provider blocks direct
 * browser calls (CORS). It forwards the request — including YOUR key from the app — to the
 * provider and adds CORS headers. It stores nothing and logs nothing.
 *
 *   /grok/v1/...    → https://api.x.ai/v1/...
 *   /claude/v1/...  → https://api.anthropic.com/v1/...
 *   /chatgpt/v1/... → https://api.openai.com/v1/...
 *
 * Deploy: dash.cloudflare.com → Workers → Create → paste this file → Deploy.
 * Then in VlogUp: ⚙︎ AI settings → "Optional CORS proxy URL" → https://<name>.<you>.workers.dev
 */
const UPSTREAM = { grok: 'https://api.x.ai', claude: 'https://api.anthropic.com', chatgpt: 'https://api.openai.com' };
// Lock the proxy to the app's origin so others can't use it.
const ALLOWED_ORIGINS = ['https://danmo88.github.io', 'http://localhost:5173', 'http://localhost:4173'];
const FORWARD = ['authorization', 'x-api-key', 'anthropic-version', 'anthropic-beta', 'content-type'];

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-api-key, anthropic-version, anthropic-beta, anthropic-dangerous-direct-browser-access, content-type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden origin', { status: 403, headers: cors });
    const url = new URL(req.url);
    const [, provider, ...rest] = url.pathname.split('/');
    const base = UPSTREAM[provider];
    if (!base || rest[0] !== 'v1') return new Response('Not found', { status: 404, headers: cors });
    const headers = new Headers();
    for (const h of FORWARD) { const v = req.headers.get(h); if (v) headers.set(h, v); }
    const upstream = await fetch(`${base}/${rest.join('/')}${url.search}`, { method: req.method, headers, body: req.method === 'GET' ? undefined : req.body });
    const out = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) out.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
