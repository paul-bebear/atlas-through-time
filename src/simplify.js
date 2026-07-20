// Douglas-Peucker geometry simplification for the border layer.
// Runs client-side (worker) at fetch time — the GPL source files are
// display-only and must not be committed or re-served in simplified form.

// Iterative DP on one ring. Returns a reduced ring, or null if the ring
// collapses below a renderable polygon (caller drops it).
export function simplifyRing(ring, tol) {
  const n = ring.length;
  if (n <= 5) return ring;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const t2 = tol * tol;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = -1, idx = -1;
    const ax = ring[a][0], ay = ring[a][1];
    const dx = ring[b][0] - ax, dy = ring[b][1] - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const px = ring[i][0] - ax, py = ring[i][1] - ay;
      let d2;
      if (len2 === 0) d2 = px * px + py * py;
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const qx = px - t * dx, qy = py - t * dy;
        d2 = qx * qx + qy * qy;
      }
      if (d2 > maxD) { maxD = d2; idx = i; }
    }
    if (maxD > t2) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i]);
  return out.length >= 4 ? out : null;
}

const simplifyPoly = (poly, tol) => {
  const rings = [];
  for (let i = 0; i < poly.length; i++) {
    const r = simplifyRing(poly[i], tol);
    if (i === 0 && !r) return null;   // outer ring collapsed → drop the poly
    if (r) rings.push(r);             // collapsed holes just disappear
  }
  return rings;
};

// Mutates a FeatureCollection in place. Returns {before, after} vertex counts.
export function simplifyFC(gj, tol = 0.03) {
  let before = 0, after = 0;
  const count = polys => { let v = 0; for (const p of polys) for (const r of p) v += r.length; return v; };
  for (const f of gj.features || []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") {
      before += count([g.coordinates]);
      g.coordinates = simplifyPoly(g.coordinates, tol) || g.coordinates;
      after += count([g.coordinates]);
    } else if (g.type === "MultiPolygon") {
      before += count(g.coordinates);
      const out = [];
      for (const poly of g.coordinates) {
        const p = simplifyPoly(poly, tol);
        if (p) out.push(p);
      }
      if (out.length) g.coordinates = out;
      after += count(g.coordinates);
    }
  }
  return { before, after };
}
