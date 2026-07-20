// Border fetch worker: network + JSON.parse + simplification all happen
// off the main thread, so snapshot switches never freeze the globe.

import { simplifyFC } from "./simplify.js";

self.onmessage = async e => {
  const { id, url, tol } = e.data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gj = await res.json();
    simplifyFC(gj, tol);
    self.postMessage({ id, gj });
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
