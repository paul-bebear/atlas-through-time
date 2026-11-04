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

// Bump when the output changes, so the worker's on-device cache is rebuilt.
export const SIMPLIFY_VERSION = 2;

// Spherical area of a ring in steradians, summed exactly as d3-geo does
// (geoArea / geoBounds): positive when d3 reads the ring as enclosing the
// small region it outlines, negative when it reads "everything but".
function ringArea(ring) {
  const rad = Math.PI / 180, n = ring.length;
  let sum = 0, l0 = ring[0][0] * rad, p = ring[0][1] * rad / 2 + Math.PI / 4;
  let cos0 = Math.cos(p), sin0 = Math.sin(p);
  for (let i = 1; i <= n; i++) {          // i = n closes an unclosed ring (a no-op when closed)
    const l = ring[i % n][0] * rad;
    p = ring[i % n][1] * rad / 2 + Math.PI / 4;
    const d = l - l0, s = d >= 0 ? 1 : -1, cos = Math.cos(p), sin = Math.sin(p), k = sin0 * sin;
    sum += Math.atan2(k * s * Math.sin(s * d), cos0 * cos + k * Math.cos(s * d));
    l0 = l; cos0 = cos; sin0 = sin;
  }
  return 2 * sum;
}

const MIN_AREA = 1e-9;   // sr, ~0.04 km²: slivers and self-crossing figure-8s

// The globe's triangulator asks d3-geo for a polygon's bounds; a ring wound
// the wrong way means "the whole sphere except this", so its invisible cap
// covers the globe and wins every hover and click (Chile's Navarino ring in
// 1920–2010, and hundreds of islands that Douglas-Peucker reversed or
// flattened). Rewind such rings (outer rings positive, holes negative) and
// drop slivers whose winding is noise.
function orientRing(ring, outer) {
  const a = ringArea(ring);
  if (Math.abs(a) < MIN_AREA) return null;
  return (a > 0) === outer ? ring : ring.slice().reverse();
}

// Simplified ring, or the original when simplifying ruined it; null if neither renders.
const fitRing = (ring, tol, outer) => {
  const r = simplifyRing(ring, tol);
  return (r && orientRing(r, outer)) || orientRing(ring, outer);
};

const simplifyPoly = (poly, tol) => {
  const rings = [];
  for (let i = 0; i < poly.length; i++) {
    const r = fitRing(poly[i], tol, i === 0);
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
