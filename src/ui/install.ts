/** "Install app" for Android, iPhone/iPad and desktop (same approach as Gitgather). */
let deferred: any = null;
const listeners = new Set<() => void>();
const ua = navigator.userAgent || '';
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|FxiOS|Firefox|SamsungBrowser/i.test(ua);
const isFirefox = /Firefox|FxiOS/i.test(ua);

export function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: window-controls-overlay)').matches ||
    (navigator as any).standalone === true
  );
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
export const onInstallChange = (f: () => void) => { listeners.add(f); return () => listeners.delete(f); };

export type InstallHelp = { title: string; steps: string[] } | null;

/** Triggers the native prompt when possible; otherwise returns manual steps to show. */
export async function install(): Promise<InstallHelp> {
  if (isStandalone()) return null;
  if (deferred) {
    deferred.prompt();
    try { await deferred.userChoice; } finally { deferred = null; listeners.forEach((f) => f()); }
    return null;
  }
  if (isIOS) {
    return {
      title: 'Install on iPhone / iPad',
      steps: isSafari
        ? ['Tap the Share button (square with an arrow) in Safari.', 'Scroll and choose “Add to Home Screen”.', 'Tap “Add”. VlogUp appears on your Home Screen.']
        : ['Open this page in Safari.', 'Tap the Share button.', 'Choose “Add to Home Screen”, then “Add”.'],
    };
  }
  if (isAndroid) return { title: 'Install on Android', steps: ['Open the browser menu ⋮ (Chrome).', 'Tap “Install app” or “Add to Home screen”.', 'Confirm. VlogUp installs like an app.'] };
  if (isSafari) return { title: 'Install on Mac', steps: ['In Safari, open the File menu.', 'Choose “Add to Dock…”, then “Add”.'] };
  if (isFirefox) return { title: 'Install on desktop', steps: ['Firefox cannot install web apps.', 'Open this page in Chrome or Edge and press “Install app”.'] };
  return { title: 'Install on desktop', steps: ['Click the install icon ⊕ in the address bar,', 'or open the ⋮ menu → “Install VlogUp” / “Cast, save and share → Install page as app”.'] };
}

export function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}
