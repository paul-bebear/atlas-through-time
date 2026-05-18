#!/usr/bin/env node
// Name resolver — maps historical-basemaps polygon name strings to polity
// QIDs, isolating the fuzzy reconciliation in one place (the
// name_resolution table). Manual overrides win; everything else is scored.
//
//   node tools/import-wikidata.mjs   (first, produces polity_name.json)
//   node tools/resolve-names.mjs
//
// Outputs data/db/name_resolution.json and data/db/unmatched-names.json
// (the unmatched list is the worklist for continent-by-continent curation).

import { readFile, writeFile } from "node:fs/promises";

const CDN = "https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@master/geojson";
// A spread of snapshots → broad name coverage without fetching all 50+.
const SNAPSHOTS = ["bc500", "1", "1000", "1500", "1715", "1880", "1945", "2010"];

const norm = s => s.toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const STRIP = /^(kingdom|republic|empire|duchy|grand duchy|principality|tsardom|crown|state|county|emirate|sultanate|caliphate) of /;
const core = s => norm(s).replace(STRIP, "");

async function main() {
  const polityNames = JSON.parse(
    await readFile(new URL("../data/db/polity_name.json", import.meta.url)));

  // Build match indexes from polity names.
  const exact = new Map();   // normalised name -> qid
  const coreIdx = new Map(); // core (strip "kingdom of") -> qid
  for (const r of polityNames) {
    const n = norm(r.name);
    if (n && !exact.has(n)) exact.set(n, r.polity_qid);
    const c = core(r.name);
    if (c && !coreIdx.has(c)) coreIdx.set(c, r.polity_qid);
  }

  let overrides = {};
  try {
    overrides = JSON.parse(
      await readFile(new URL("../data/db/name-overrides.json", import.meta.url)));
  } catch { /* optional */ }

  // Collect distinct source strings from a spread of snapshots.
  const sourceNames = new Set();
  for (const tag of SNAPSHOTS) {
    try {
      const r = await fetch(`${CDN}/world_${tag}.geojson`);
      if (!r.ok) continue;
      const gj = await r.json();
      for (const f of gj.features || []) {
        const p = f.properties || {};
        const nm = p.NAME || p.name || p.SUBJECTO || p.ABBREVN;
        if (nm) sourceNames.add(String(nm).trim());
      }
    } catch { /* skip snapshot */ }
  }

  const resolution = [];
  const unmatched = [];
  for (const s of [...sourceNames].sort()) {
    if (overrides[s]) {
      resolution.push({ source_dataset: "historical-basemaps", source_string: s,
        polity_qid: overrides[s], confidence: 1.0, method: "manual" });
      continue;
    }
    const n = norm(s);
    if (exact.has(n)) {
      resolution.push({ source_dataset: "historical-basemaps", source_string: s,
        polity_qid: exact.get(n), confidence: 0.95, method: "auto-exact" });
    } else if (coreIdx.has(core(s))) {
      resolution.push({ source_dataset: "historical-basemaps", source_string: s,
        polity_qid: coreIdx.get(core(s)), confidence: 0.7, method: "auto-core" });
    } else {
      unmatched.push(s);
    }
  }

  await writeFile(new URL("../data/db/name_resolution.json", import.meta.url),
    JSON.stringify(resolution));
  await writeFile(new URL("../data/db/unmatched-names.json", import.meta.url),
    JSON.stringify(unmatched, null, 2));

  const tot = sourceNames.size;
  console.log(`Source names: ${tot}`);
  console.log(`Resolved: ${resolution.length} (${(100 * resolution.length / tot).toFixed(0)}%)`);
  console.log(`Unmatched: ${unmatched.length} → data/db/unmatched-names.json (curation worklist)`);
}

main().catch(e => { console.error(e); process.exit(1); });
