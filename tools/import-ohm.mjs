#!/usr/bin/env node
// OpenHistoricalMap proof-of-concept (CC0 borders — the redistributable
// replacement for GPL historical-basemaps in the `territory` data layer).
//
//   node tools/import-ohm.mjs
//
// Validates the make-or-break questions before building a full pipeline:
//   1. Does OHM's Overpass return admin boundaries for a region?
//   2. Do features carry start_date / end_date (era validity)?
//   3. Do they carry wikidata=Q* (joins to our polity registry)?
//   4. How many OHM QIDs overlap our existing polities?
//   5. Can we get geometry out as GeoJSON?
//
// Outputs data/db/ohm-poc-report.json + data/db/ohm-sample.geojson.
// Does NOT load anything into Supabase — this is a spike.

import { readFile, writeFile } from "node:fs/promises";

const OVERPASS = "https://overpass-api.openhistoricalmap.org/api/interpreter";
const root = new URL("..", import.meta.url);

// Europe bbox (south,west,north,east) — OHM's strongest coverage region.
const BBOX = "34,-12,72,45";
const TEST_YEARS = [-500, 1, 1000, 1500, 1815, 1914, 2000];

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
      "User-Agent": "AtlasThroughTime/0.1 (border PoC)" },
    body: "data=" + encodeURIComponent(query)
  });
  if (!r.ok) throw new Error(`Overpass ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function main() {
  // 1–4: metadata sweep (tags only — cheap, answers coverage questions).
  console.log("Querying OHM Overpass (Europe admin boundaries, tags only)…");
  const q = `[out:json][timeout:120];
    ( relation["boundary"="administrative"]["admin_level"~"^[234]$"](${BBOX}); );
    out tags;`;
  const data = await overpass(q);
  const rels = (data.elements || []).filter(e => e.type === "relation");
  console.log(`  ${rels.length} boundary relations`);

  let withStart = 0, withEnd = 0, withWd = 0;
  const qids = new Set();
  for (const r of rels) {
    const t = r.tags || {};
    if (t.start_date) withStart++;
    if (t.end_date) withEnd++;
    if (t.wikidata && /^Q\d+$/.test(t.wikidata)) { withWd++; qids.add(t.wikidata); }
  }

  // Overlap with our existing polity registry.
  let ourQids = new Set();
  try {
    const P = JSON.parse(await readFile(new URL("data/db/polity.json", root)));
    ourQids = new Set(P.map(p => p.wikidata_qid));
  } catch { /* polity.json optional here */ }
  const overlap = [...qids].filter(q => ourQids.has(q));

  // Active-at-year coverage (the slider use case).
  const activeByYear = {};
  for (const y of TEST_YEARS) {
    activeByYear[y] = rels.filter(r => {
      const t = r.tags || {};
      const s = yearOf(t.start_date), e = yearOf(t.end_date);
      return (s == null || s <= y) && (e == null || e >= y);
    }).length;
  }

  // 5: geometry spike — pull one wikidata-matched relation WITH geometry.
  const sample = rels.find(r => {
    const w = (r.tags || {}).wikidata;
    return w && ourQids.has(w) && (r.tags.start_date || r.tags.end_date);
  }) || rels.find(r => (r.tags || {}).wikidata);

  let geojson = { type: "FeatureCollection", features: [] };
  let geomNote = "no wikidata-tagged relation found to sample";
  if (sample) {
    const g = await overpass(
      `[out:json][timeout:120]; relation(${sample.id}); out geom;`);
    const rel = (g.elements || []).find(e => e.type === "relation");
    const outers = (rel?.members || [])
      .filter(m => m.role === "outer" && Array.isArray(m.geometry))
      .map(m => m.geometry.map(p => [p.lon, p.lat]));
    geojson = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          name: sample.tags.name, wikidata: sample.tags.wikidata,
          start_date: sample.tags.start_date, end_date: sample.tags.end_date,
          _note: "outer member ways as MultiLineString — production needs proper ring assembly (osmtogeojson/osmium)"
        },
        geometry: { type: "MultiLineString", coordinates: outers }
      }]
    };
    geomNote = `sampled "${sample.tags.name}" (${sample.tags.wikidata}); ` +
      `${outers.length} outer ways, ${outers.reduce((n, a) => n + a.length, 0)} pts`;
  }

  const report = {
    generated: new Date().toISOString(),
    region: "Europe bbox " + BBOX,
    relations_total: rels.length,
    with_start_date: withStart,
    with_end_date: withEnd,
    with_wikidata: withWd,
    distinct_wikidata: qids.size,
    overlap_with_our_polities: overlap.length,
    overlap_sample: overlap.slice(0, 15),
    active_relations_by_year: activeByYear,
    geometry_spike: geomNote,
    verdict_hints: {
      date_coverage_pct: rels.length ? Math.round(100 * withStart / rels.length) : 0,
      qid_coverage_pct: rels.length ? Math.round(100 * withWd / rels.length) : 0
    }
  };
  await writeFile(new URL("data/db/ohm-poc-report.json", root), JSON.stringify(report, null, 2));
  await writeFile(new URL("data/db/ohm-sample.geojson", root), JSON.stringify(geojson));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => { console.error(e.message); process.exit(1); });
