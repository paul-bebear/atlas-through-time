#!/usr/bin/env node
// Name resolver — maps historical-basemaps polygon name strings to polity
// QIDs (the name_resolution bridge). Year-aware: each map label appears in
// dated snapshots, so among same-named candidates we pick the polity whose
// lifespan actually covers those years. Tiers: manual override > exact >
// core (strip "Kingdom of"/articles/qualifiers) > token-subset fuzzy.
//
//   node tools/import-wikidata.mjs   (first → polity_name.json, polity.json)
//   node tools/resolve-names.mjs
//
// Writes data/db/name_resolution.json + data/db/unmatched-names.json.

import { readFile, writeFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const j = async f => JSON.parse(await readFile(new URL(`data/db/${f}`, root)));
const CDN = "https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@master/geojson";

// Broad spread of snapshots; tag → year (bc500 → -500).
const SNAPSHOTS = [
  "bc2000", "bc1000", "bc500", "bc323", "bc1", "100", "400", "600", "800",
  "1000", "1200", "1300", "1400", "1500", "1600", "1700", "1715", "1783",
  "1800", "1880", "1900", "1914", "1920", "1938", "1945", "1960", "1994", "2010"
];
const tagYear = t => t.startsWith("bc") ? -parseInt(t.slice(2), 10) : parseInt(t, 10);

const norm = s => String(s).toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[‐-―−]/g, "-")
  .replace(/\([^)]*\)/g, " ")                 // drop "(1918–1940)" qualifiers
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const STRIP_PRE = /^(the |kingdom of |republic of |grand duchy of |duchy of |principality of |tsardom of |crown of |state of |county of |emirate of |sultanate of |caliphate of |empire of |union of |federation of |confederation of |first |second |third |united )/;
const STRIP_POST = / (empire|kingdom|republic|dynasty|caliphate|sultanate|khanate|confederation|federation|state|union)$/;
function core(s) {
  let n = norm(s);
  for (let i = 0; i < 3; i++) { const m = n.replace(STRIP_PRE, ""); if (m === n) break; n = m; }
  n = n.replace(STRIP_POST, "").trim();
  return n;
}

async function main() {
  const polityNames = await j("polity_name.json");
  const polities = await j("polity.json");
  const meta = new Map(polities.map(p => [p.wikidata_qid,
    { start: p.start_year, end: p.end_year, type: (p.type || "").toLowerCase(),
      name: p.canonical_name }]));

  const toks = s => new Set(core(s).split(" ").filter(t => t.length > 2));
  // Guard against confidently-wrong matches (e.g. Azerbaijan→Gansu): the
  // chosen polity's name must share a real token with the source label.
  // Tokens "match" if equal or one is a ≥4-char prefix of the other, so
  // inflections pass (Poland↔Polish, Lithuania↔Lithuanian) but unrelated
  // names (Azerbaijan↔Gansu) still fail.
  const tokMatch = (x, y) =>
    x === y || (x.length >= 4 && y.startsWith(x)) || (y.length >= 4 && x.startsWith(y));
  const plausible = (qid, s) => {
    const m = meta.get(qid); if (!m) return false;
    const a = [...toks(s)], b = [...toks(m.name)];
    return a.some(x => b.some(y => tokMatch(x, y)));
  };

  const typeRank = t =>
    /sovereign|country/.test(t) ? 3 : /republic|empire|kingdom|state/.test(t) ? 2 : 1;

  // index: key -> [{qid}]
  const exact = new Map(), coreIdx = new Map(), token = new Map();
  const add = (map, k, qid) => { if (!k) return; (map.get(k) || map.set(k, []).get(k)).push(qid); };
  for (const r of polityNames) {
    add(exact, norm(r.name), r.polity_qid);
    add(coreIdx, core(r.name), r.polity_qid);
    for (const tk of core(r.name).split(" ")) if (tk.length > 2) add(token, tk, r.polity_qid);
  }

  // Pick the candidate whose lifespan best covers the years the label is
  // seen in; tiebreak by entity-type rank then longevity.
  const pick = (qids, years) => {
    const uniq = [...new Set(qids)];
    if (uniq.length === 1) return uniq[0];
    let best = uniq[0], bestScore = -1;
    for (const q of uniq) {
      const m = meta.get(q); if (!m) continue;
      const s = m.start ?? -1e9, e = m.end ?? 1e9;
      const cover = years.filter(y => y >= s && y <= e).length;
      const span = Math.min(e, 3000) - Math.max(s, -4000);
      const score = cover * 1000 + typeRank(m.type) * 100 + Math.min(span, 9999) / 10000;
      if (score > bestScore) { bestScore = score; best = q; }
    }
    return best;
  };

  let overrides = {};
  try { overrides = await j("name-overrides.json"); } catch { /* optional */ }

  // Collect source label → set of years it appears in.
  const seen = new Map();
  for (const tag of SNAPSHOTS) {
    let gj;
    try {
      const r = await fetch(`${CDN}/world_${tag}.geojson`);
      if (!r.ok) continue;
      gj = await r.json();
    } catch { continue; }
    const y = tagYear(tag);
    for (const f of gj.features || []) {
      const p = f.properties || {};
      const nm = p.NAME || p.name || p.SUBJECTO || p.ABBREVN;
      if (!nm) continue;
      const s = String(nm).trim();
      (seen.get(s) || seen.set(s, []).get(s)).push(y);
    }
  }

  const resolution = [], unmatched = [];
  for (const [s, years] of [...seen.entries()].sort()) {
    const row = (qid, confidence, method) => resolution.push({
      source_dataset: "historical-basemaps", source_string: s,
      polity_qid: qid, confidence, method
    });
    if (overrides[s]) { row(overrides[s], 1.0, "manual"); continue; }
    const n = norm(s), c = core(s);
    let qid = null, conf = 0, method = "";
    if (exact.has(n)) { qid = pick(exact.get(n), years); conf = 0.9; method = "auto-exact"; }
    else if (coreIdx.has(c)) { qid = pick(coreIdx.get(c), years); conf = 0.7; method = "auto-core"; }
    else {
      const ct = c.split(" ").filter(t => t.length > 2);
      let cand = null;
      for (const t of ct) {
        const set = new Set(token.get(t) || []);
        cand = cand == null ? set : new Set([...cand].filter(x => set.has(x)));
        if (!cand.size) break;
      }
      if (cand && cand.size) { qid = pick([...cand], years); conf = 0.5; method = "auto-fuzzy"; }
    }
    // Reject confidently-wrong matches that share no real token.
    if (qid && plausible(qid, s)) row(qid, conf, method);
    else unmatched.push(s);
  }

  await writeFile(new URL("data/db/name_resolution.json", root), JSON.stringify(resolution));
  await writeFile(new URL("data/db/unmatched-names.json", root),
    JSON.stringify(unmatched, null, 2));

  const tot = seen.size;
  const by = {};
  resolution.forEach(r => by[r.method] = (by[r.method] || 0) + 1);
  console.log(`Source names: ${tot}`);
  console.log(`Resolved: ${resolution.length} (${(100 * resolution.length / tot).toFixed(0)}%) ${JSON.stringify(by)}`);
  console.log(`Unmatched: ${unmatched.length} → data/db/unmatched-names.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
