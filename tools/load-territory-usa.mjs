#!/usr/bin/env node
// Loads the OHM USA pilot (territory.usa.json, CC0) into Supabase:
//   • each distinct entity → a sub-national `polity` (type U.S. state/
//     territory), linked `part_of` USA (Q30) via the generic relation
//   • each OHM time-slice → a `territory` row (valid_from/to + geometry)
// Idempotent: everything is tagged source='ohm-usa' and wiped first.
// CC0 → this geometry is allowed in the redistributable territory layer.
//
//   node tools/import-ohm-usa.mjs   (first)
//   node tools/load-territory-usa.mjs

import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
async function env() {
  const e = { ...process.env };
  try {
    for (const l of (await readFile(new URL(".env", root), "utf8")).split("\n")) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(l);
      if (m) e[m[1]] = m[2].trim().replace(/^[<"']+|[>"']+$/g, "").trim();
    }
  } catch { /* shell */ }
  return e;
}
const E = await env();
const BASE = (E.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = E.SUPABASE_SERVICE_KEY;
if (!BASE || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json", "Content-Profile": "atlas", "Accept-Profile": "atlas" };

const api = async (method, path, body, prefer) => {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok && r.status !== 404) throw new Error(`${method} ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
};
const chunked = async (path, rows, size, prefer) => {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const r = await api("POST", path, rows.slice(i, i + size), prefer);
    if (Array.isArray(r)) out.push(...r);
    process.stdout.write(`  ${path.split("?")[0]}: ${Math.min(i + size, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ${path.split("?")[0]}: ${rows.length} ✓                       `);
  return out;
};

async function main() {
  const rows = JSON.parse(await readFile(new URL("data/db/territory.usa.json", root)));
  console.log(`territory.usa.json: ${rows.length} slices`);

  // existing polity qid -> id (for USA Q30 + any states already present)
  const idByQid = new Map();
  for (let from = 0; ; from += 1000) {
    const page = await fetch(`${BASE}/rest/v1/polity?select=id,wikidata_qid`, {
      headers: { ...H, Range: `${from}-${from + 999}` }
    }).then(r => r.json());
    page.forEach(p => p.wikidata_qid && idByQid.set(p.wikidata_qid, p.id));
    if (page.length < 1000) break;
  }
  const usaId = idByQid.get("Q30");
  console.log(`USA polity (Q30): ${usaId ?? "NOT FOUND"}`);

  // Idempotent wipe of this subset.
  await api("DELETE", "relation?source=eq.ohm-usa&id=gte.0");
  await api("DELETE", "territory?source=eq.ohm-usa&id=gte.0");
  await api("DELETE", "polity?source=eq.ohm-usa&id=gte.0"); // cascades its territory

  // Group slices into entities (by wikidata, else by name).
  const groups = new Map();
  for (const r of rows) {
    const k = r.wikidata || ("name:" + (r.name || "unknown-" + r.ohm_id));
    (groups.get(k) || groups.set(k, []).get(k)).push(r);
  }

  // Create polities for groups not already in the registry.
  const toCreate = [];
  const polityIdByKey = new Map();
  for (const [k, slices] of groups) {
    const qid = k.startsWith("name:") ? null : k;
    if (qid && idByQid.has(qid)) { polityIdByKey.set(k, idByQid.get(qid)); continue; }
    const froms = slices.map(s => s.from_year).filter(v => v != null);
    const tos = slices.map(s => s.to_year).filter(v => v != null);
    toCreate.push({
      _k: k, wikidata_qid: qid,
      canonical_name: slices[0].name || k,
      type: "U.S. state / territory",
      start_year: froms.length ? Math.min(...froms) : null,
      end_year: tos.length && slices.every(s => s.to_year != null) ? Math.max(...tos) : null,
      source: "ohm-usa", confidence: 0.8, method: "auto"
    });
  }
  const created = await chunked("polity", toCreate.map(({ _k, ...p }) => p),
    100, "return=representation");
  // Map back by wikidata (or by order for null-qid rows).
  let ci = 0;
  for (const t of toCreate) {
    const row = t.wikidata_qid
      ? created.find(c => c.wikidata_qid === t.wikidata_qid)
      : created[ci];
    if (row) polityIdByKey.set(t._k, row.id);
    if (!t.wikidata_qid) ci++;
  }
  console.log(`  polities: ${created.length} created, ${groups.size - created.length} reused`);

  // part_of USA relations.
  if (usaId) {
    const rels = [...polityIdByKey.values()]
      .filter(id => id !== usaId)
      .map(id => ({ subject_type: "polity", subject_id: id, object_type: "polity",
        object_id: usaId, dimension: "part_of", type: "part_of",
        source: "ohm-usa", confidence: 0.8, method: "auto" }));
    await chunked("relation", rels, 200, "return=minimal");
  }

  // Territory slices.
  const terr = rows.map(r => {
    const k = r.wikidata || ("name:" + (r.name || "unknown-" + r.ohm_id));
    return {
      polity_id: polityIdByKey.get(k),
      valid_from: r.from_year, valid_to: r.to_year,
      geometry: r.geometry, geom_source: "OpenHistoricalMap",
      simplified: true, source: "ohm-usa", confidence: 0.8
    };
  }).filter(t => t.polity_id);
  await chunked("territory", terr, 25, "return=minimal");

  console.log(`\nDone. ${terr.length} territory slices, ${polityIdByKey.size} polities.`);
}

main().catch(e => { console.error("\n" + e.message); process.exit(1); });
