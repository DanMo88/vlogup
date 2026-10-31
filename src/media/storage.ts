/**
 * Storage:
 *  - media bytes (originals + proxies) → OPFS when available, otherwise IndexedDB blobs;
 *  - project documents (timeline JSON + append-only log) → IndexedDB.
 * Nothing ever leaves the device.
 */
import { createStore, get, set, del, keys, getMany } from 'idb-keyval';
import type { Project } from '../model/types';

const projects = createStore('vlogup', 'projects');
const blobs = createStore('vlogup-media', 'blobs');

let opfsRoot: Promise<FileSystemDirectoryHandle | null> | null = null;
function opfs(): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsRoot) {
    opfsRoot = (async () => {
      try {
        if (!navigator.storage?.getDirectory) return null;
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('vlogup-media', { create: true });
        // Probe that writable streams work (older Safari only supports sync handles in workers).
        const probe = await dir.getFileHandle('.probe', { create: true });
        const w = await (probe as any).createWritable?.();
        if (!w) return null;
        await w.write(new Uint8Array([1]));
        await w.close();
        return dir;
      } catch {
        return null;
      }
    })();
  }
  return opfsRoot;
}

export async function storageBackend(): Promise<'opfs' | 'indexeddb'> {
  return (await opfs()) ? 'opfs' : 'indexeddb';
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  const dir = await opfs();
  if (dir) {
    const fh = await dir.getFileHandle(key, { create: true });
    const w = await (fh as any).createWritable();
    await w.write(blob);
    await w.close();
    return;
  }
  await set(key, blob, blobs);
}

export async function getBlob(key: string): Promise<Blob | null> {
  const dir = await opfs();
  if (dir) {
    try {
      const fh = await dir.getFileHandle(key);
      return await fh.getFile();
    } catch { /* fall through to IDB (e.g. stored before OPFS was available) */ }
  }
  return (await get<Blob>(key, blobs)) ?? null;
}

export async function deleteBlob(key: string): Promise<void> {
  const dir = await opfs();
  if (dir) { try { await dir.removeEntry(key); } catch { /* ignore */ } }
  await del(key, blobs);
}

export const mediaKey = (projectId: string, mediaId: string) => `${projectId}__${mediaId}`;
export const proxyKey = (projectId: string, mediaId: string) => `${projectId}__${mediaId}__proxy.mp4`;

export async function saveProject(p: Project): Promise<void> {
  await set(p.id, p, projects);
}

export async function loadProject(id: string): Promise<Project | null> {
  return (await get<Project>(id, projects)) ?? null;
}

export async function listProjects(): Promise<Project[]> {
  const ks = await keys(projects);
  const all = (await getMany<Project>(ks as string[], projects)).filter((x): x is Project => !!x);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProject(p: Project): Promise<void> {
  for (const id of Object.keys(p.media)) {
    await deleteBlob(mediaKey(p.id, id));
    await deleteBlob(proxyKey(p.id, id));
  }
  await del(p.id, projects);
}

export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
