#!/usr/bin/env node
// OHM borders pilot — USA states (admin_level=4). CC0 → safe for the
// redistributable `territory` layer. Full pipeline: Overpass → ring
// assembly → date parse → Wikidata QID join → simplify → territory.json.
//
//   node tools/import-ohm-usa.mjs
//
// Validate output before loading to Supabase (eyeball ohm-usa-sample.geojson).

import { readFile, writeFile } from "node:fs/promises";

const OVERPASS = "https://overpass-api.openhistoricalmap.org/api/interpreter";
const root = new URL("..", import.meta.url);
// Covers CONUS + Alaska + Hawaii + territories (south,west,north,east).
const BBOX = "15,-179.9,72,-66";
const TEST_YEARS = [1776, 1800, 1850, 1900, 1912, 1959, 2000];
const EPS = 1e-6;       // endpoint-match tolerance for ring stitching
const SIMPLIFY = 0.02;  // RDP tolerance in degrees (~2 km — fine for states)

const yearOf = iso => {
  if (!iso) return null;
  const m = /^\s*([+-]?)0*(\d{1,6})\b/.exec(String(iso));
  if (!m) return null;
  const y = parseInt(m[2], 10);
  return Number.isFinite(y) ? (m[1] === "-" ? -y : y) : null;
};

async function overpass(query) {
  const r = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "AtlasThroughTime/0.1 (USA borders pilot)" },
    body: "data=" + encodeURIComponent(query)
  });
  if (!r.ok) throw new Error(`Overpass ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const key = (x, y) => `${Math.round(x / EPS)}:${Math.round(y / EPS)}`;
const closed = r => r.length > 3 &&
  Math.abs(r[0][0] - r[r.length - 1][0]) < EPS && Math.abs(r[0][1] - r[r.length - 1][1]) < EPS;

// Stitch loose ways (each [[lng,lat],…]) into closed rings.
function stitch(ways) {
  const segs = ways.map(w => w.slice());
  const rings = [];
  let open = 0;
  while (segs.length) {
    let ring = segs.shift();
    let guard = 0;
    while (!closed(ring) && guard++ < 100000) {
      const tail = ring[ring.length - 1];
      let i = segs.findIndex(s =>
        key(s[0][0], s[0][1]) === key(tail[0], tail[1]) ||
        key(s[s.length - 1][0], s[s.length - 1][1]) === key(tail[0], tail[1]));
      if (i === -1) break;
      let s = segs.splice(i, 1)[0];
      if (key(s[s.length - 1][0], s[s.length - 1][1]) === key(tail[0], tail[1])) s = s.reverse();
      ring = ring.concat(s.slice(1));
    }
    if (closed(ring)) rings.push(ring);
    else { open++; if (ring.length > 3) { ring.push(ring[0]); rings.push(ring); } }
  }
  return { rings, open };
}

function ringArea(r) { // signed shoelace (for outer/inner orientation only)
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += (r[j][0] * r[i][1]) - (r[i][0] * r[j][1]);
  return a / 2;
}
function bbox(r) {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const [x, y] of r) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return [a, b, c, d];
}
function inRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > p[1]) !== (yj > p[1])) &&
        (p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// Douglas-Peucker on an open polyline.
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) return dp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(dp(pts.slice(idx), eps));
  return [pts[0], pts[pts.length - 1]];
}
function simplifyRing(r) {
  if (r.length < 5) return r;
  const open = r.slice(0, -1);
  let far = 0, fd = -1;
  for (let i = 1; i < open.length; i++) {
    const d = (open[i][0] - open[0][0]) ** 2 + (open[i][1] - open[0][1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const a = dp(open.slice(0, far + 1), SIMPLIFY);
  const b = dp(open.slice(far).concat([open[0]]), SIMPLIFY);
  const m = a.slice(0, -1).concat(b);
  m[m.length - 1] = m[0];
  return m.length >= 4 ? m : r;
}

// Relation members → GeoJSON MultiPolygon (outer rings with inner holes).
function toMultiPolygon(rel) {
  const W = role => (rel.members || [])
    .filter(m => m.type === "way" && m.role === role && Array.isArray(m.geometry))
    .map(m => m.geometry.map(g => [g.lon, g.lat]));
  const outer = stitch(W("outer"));
  const inner = stitch(W("inner"));
  const polys = outer.rings.map(simplifyRing).map(r => [r]);
  for (const hole of inner.rings.map(simplifyRing)) {
    const c = hole[0];
    const host = polys.find(p => inRing(c, p[0]));
    (host || polys[0])?.push(hole);
  }
  return { mp: polys.length ? { type: "MultiPolygon", coordinates: polys } : null,
    openRings: outer.open + inner.open };
}

async function main() {
  let ourQids = new Set();
  try {
    ourQids = new Set(JSON.parse(
      await readFile(new URL("data/db/polity.json", root))).map(p => p.wikidata_qid));
  } catch { /* optional */ }

  console.log("Querying OHM Overpass (USA states, admin_level=4, with geometry)…");
  const data = await overpass(`[out:json][timeout:180];
    ( relation["boundary"="administrative"]["admin_level"="4"](${BBOX}); );
    out geom;`);
  const rels = (data.elements || []).filter(e => e.type === "relation");
  console.log(`  ${rels.length} state/territory relations`);

  const territory = [];
  let okGeom = 0, openTotal = 0, withWd = 0, matched = 0;
  const sample = { type: "FeatureCollection", features: [] };

  for (const r of rels) {
    const t = r.tags || {};
    const { mp, openRings } = toMultiPolygon(r);
    openTotal += openRings;
    if (!mp) continue;
    okGeom++;
    const qid = /^Q\d+$/.test(t.wikidata || "") ? t.wikidata : null;
    if (qid) withWd++;
    if (qid && ourQids.has(qid)) matched++;
    const row = {
      ohm_id: r.id, name: t.name || null, wikidata: qid,
      from_year: yearOf(t.start_date), to_year: yearOf(t.end_date),
      admin_level: t.admin_level, geometry: mp
    };
    territory.push(row);
    if (sample.features.length < 8)
      sample.features.push({ type: "Feature",
        properties: { name: row.name, wikidata: qid, from: row.from_year, to: row.to_year },
        geometry: mp });
  }

  const activeByYear = {};
  for (const y of TEST_YEARS)
    activeByYear[y] = territory.filter(r =>
      (r.from_year == null || r.from_year <= y) && (r.to_year == null || r.to_year >= y)).length;

  const report = {
    generated: new Date().toISOString(), source: "OpenHistoricalMap (CC0)",
    region: "USA bbox " + BBOX, relations_total: rels.length,
    geometry_ok: okGeom, open_ring_warnings: openTotal,
    with_wikidata: withWd, matched_our_polities: matched,
    distinct_polygons: territory.length,
    active_by_year: activeByYear,
    note: "PILOT — not loaded to Supabase. Eyeball ohm-usa-sample.geojson. " +
      "US states likely absent from polity registry (we imported sovereign-state classes) — " +
      "follow-up: import states as polities, or key territory by wikidata directly."
  };
  await writeFile(new URL("data/db/territory.usa.json", root), JSON.stringify(territory));
  await writeFile(new URL("data/db/ohm-usa-sample.geojson", root), JSON.stringify(sample));
  await writeFile(new URL("data/db/ohm-usa-report.json", root), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => { console.error(e.message); process.exit(1); });
