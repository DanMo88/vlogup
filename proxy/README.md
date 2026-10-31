# Optional AI proxy

VlogUp calls the AI provider **directly from your browser** with your own key. As of 2026-10-31, browser calls work
for all three providers:
- xAI (`api.x.ai`) answers CORS preflights with `Access-Control-Allow-Origin: *`;
- Anthropic works when the `anthropic-dangerous-direct-browser-access` header is sent;
- OpenAI allows browser calls.

If a provider starts blocking browser requests, VlogUp shows this in the chat:
"Couldn't reach … the provider may be blocking browser requests (CORS)". In that case, deploy this tiny proxy:

1. Go to https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Worker** (the free plan is fine).
2. Replace the code with [`cloudflare-worker.js`](cloudflare-worker.js), then press **Deploy**.
3. In VlogUp, open ⚙︎ **AI settings** → **Optional CORS proxy URL** and paste `https://<worker-name>.<account>.workers.dev`.

The worker:
- forwards only the request you send, and adds CORS headers;
- **stores nothing and logs nothing**;
- only accepts requests from `https://danmo88.github.io`. Edit `ALLOWED_ORIGINS` if you host VlogUp elsewhere.

The app's Content-Security-Policy allows `*.workers.dev` and `*.supabase.co` proxy hosts.
