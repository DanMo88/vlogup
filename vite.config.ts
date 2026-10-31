import { defineConfig, Plugin } from 'vite';
import preact from '@preact/preset-vite';

/** Generates dist/sw.js with a precache list of every built file (no third-party PWA plugin needed). */
function serviceWorker(): Plugin {
  return {
    name: 'vlogup-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const version = `vlogup-${Date.now().toString(36)}`;
      const precache = ['./', ...files, 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-48.png', 'icons/logo.svg'];
      const src = `// VlogUp service worker (generated at build). Offline after first load.
const VERSION = ${JSON.stringify(version)};
const PRECACHE = ${JSON.stringify([...new Set(precache)])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // AI provider APIs etc. go straight to the network
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(VERSION).then((x) => x.put('./', c)); return r; })
      .catch(async () => (await caches.match('./')) || (await caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && url.pathname.includes('/assets/')) { const c = r.clone(); caches.open(VERSION).then((x) => x.put(req, c)); }
    return r;
  })));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

/** Strict CSP in production: no third-party scripts; network only to self and the 3 AI providers. */
function csp(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "connect-src 'self' blob: data: https://api.x.ai https://api.anthropic.com https://api.openai.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'vlogup-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig({
  base: '/vlogup/',
  plugins: [preact(), serviceWorker(), csp()],
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
});
