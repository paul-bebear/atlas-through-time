#!/usr/bin/env node
// Simplify CShapes 2.0 for browser rendering.
//
// The raw file is ~25 MB of full-resolution coastlines — parsing it and
// tessellating 150+ complex polygons into 3D meshes crashes the globe.
// This applies Douglas-Peucker simplification, drops tiny islands, rounds
// coordinates, and keeps only the properties the app needs.
//
//   node tools/simplify-cshapes.mjs
//
// Output: data/cshapes.min.geojson  (the app loads this; raw is fallback).

import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../data/cshapes.geojson", import.meta.url);
const OUT = new URL("../data/cshapes.min.geojson", import.meta.url);

const EPS = Number(process.env.EPS ?? 0.15);      // tolerance, degrees (~15 km — fine at globe scale)
const MIN_RING = Number(process.env.MIN_RING ?? 0.15); // drop islands/holes below this bbox area (deg^2)
const PREC = 1e2;        // 2-decimal coordinate precision (~1 km)

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1e-12;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const left = rdp(pts.slice(0, idx + 1), eps);
    const right = rdp(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

// RDP on a closed ring is degenerate (start == end → zero-length baseline).
// Break the ring at its farthest point from the start, simplify the two
// open arcs separately, then recombine and re-close.
function rdpRing(ring, eps) {
  const pts = ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1) : ring.slice();
  if (pts.length < 4) return ring;
  const [ax, ay] = pts[0];
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - ax) ** 2 + (pts[i][1] - ay) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const arc1 = rdp(pts.slice(0, far + 1), eps);
  const arc2 = rdp(pts.slice(far).concat([pts[0]]), eps);
  const merged = arc1.slice(0, -1).concat(arc2);
  merged[merged.length - 1] = merged[0];
  return merged;
}

function ringArea(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}

const round = ring => ring.map(([x, y]) =>
  [Math.round(x * PREC) / PREC, Math.round(y * PREC) / PREC]);

// Simplify one polygon (outer ring + holes). `keepOuter` forces the outer
// ring to survive even if it's tiny (used for a country's largest polygon).
function simplifyPolygon(rings, keepOuter) {
  const out = [];
  rings.forEach((ring, i) => {
    if (i > 0 && ringArea(ring) < MIN_RING) return; // drop small holes
    let s = round(rdpRing(ring, EPS));
    if (s.length < 4) {
      if (i === 0 && keepOuter) { s = round(ring); }
      else return;
    }
    if (s.length < 4) return;
    s[s.length - 1] = s[0];
    out.push(s);
  });
  return out.length && out[0].length >= 4 ? out : null;
}

function simplifyGeom(g) {
  if (g.type === "Polygon") {
    const r = simplifyPolygon(g.coordinates, true);
    return r ? { type: "Polygon", coordinates: r } : null;
  }
  if (g.type === "MultiPolygon") {
    // Keep the largest sub-polygon always; keep others only if big enough.
    let bestI = 0, bestA = -1;
    g.coordinates.forEach((p, i) => {
      const a = ringArea(p[0]);
      if (a > bestA) { bestA = a; bestI = i; }
    });
    const polys = [];
    g.coordinates.forEach((p, i) => {
      if (i !== bestI && ringArea(p[0]) < MIN_RING) return; // drop tiny islands
      const sp = simplifyPolygon(p, i === bestI);
      if (sp) polys.push(sp);
    });
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
  }
  return g;
}

const src = JSON.parse(readFileSync(SRC));
let vIn = 0, vOut = 0;
const countV = g => JSON.stringify(g.coordinates).split(",").length / 2;

const features = [];
for (const f of src.features) {
  const p = f.properties;
  vIn += countV(f.geometry);
  const geom = simplifyGeom(f.geometry);
  if (!geom) continue;
  vOut += countV(geom);
  features.push({
    type: "Feature",
    properties: {
      cntry_name: p.cntry_name,
      gwsyear: p.gwsyear,
      gweyear: p.gweyear
    },
    geometry: geom
  });
}

writeFileSync(OUT, JSON.stringify({ type: "FeatureCollection", features }));
console.log(`Features: ${features.length}`);
console.log(`Vertices: ${vIn.toLocaleString()} -> ${vOut.toLocaleString()} ` +
  `(${(100 * (1 - vOut / vIn)).toFixed(1)}% reduction)`);
