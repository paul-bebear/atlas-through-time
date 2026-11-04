// Border fetch worker: network + JSON.parse + simplification all happen
// off the main thread, so snapshot switches never freeze the globe.
// Simplified snapshots are kept in IndexedDB, so a repeat visit or a scrub
// back to a snapshot skips both the download and the simplify step.
//
// ⚠️ LICENSING: historical-basemaps is GPL-3.0 → DISPLAY-ONLY. This cache
// lives in the visitor's browser and nowhere else. Never upload, re-serve,
// export or commit simplified snapshots (see borders.js).

import { simplifyFC, SIMPLIFY_VERSION } from "./simplify.js";

const DB = "atlas-borders", STORE = "snapshots";

// Resolves to null when IndexedDB is unavailable (private mode, blocked
// storage); the worker then fetches every time, as before.
let dbP;
const openDB = () => dbP ??= new Promise((resolve, reject) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
}).catch(() => null);

const done = r => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

async function cacheGet(key) {
  try {
    const db = await openDB();
    return db ? await done(db.transaction(STORE).objectStore(STORE).get(key)) : undefined;
  } catch { return undefined; }
}

let pruned = false;
async function cachePut(key, gj, url, tol) {
  try {
    const db = await openDB();
    if (!db) return;
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    store.put(gj, key);
    if (pruned) return;
    pruned = true;
    // Once per session: drop snapshots of an older pinned commit, tolerance or simplifier.
    const dir = url.slice(0, url.lastIndexOf("/") + 1), tail = `@${tol}v${SIMPLIFY_VERSION}`;
    for (const k of await done(store.getAllKeys()))
      if (!k.startsWith(dir) || !k.endsWith(tail)) store.delete(k);
  } catch { /* quota or blocked storage: the snapshot is still returned */ }
}

self.onmessage = async e => {
  const { id, url, tol } = e.data;
  try {
    // The URL carries the pinned commit, so a bumped SHA misses the cache.
    const key = `${url}@${tol}v${SIMPLIFY_VERSION}`;
    let gj = await cacheGet(key);
    if (!gj) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      gj = await res.json();
      simplifyFC(gj, tol);
      cachePut(key, gj, url, tol);
    }
    self.postMessage({ id, gj });
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
