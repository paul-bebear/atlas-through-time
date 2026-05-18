#!/usr/bin/env node
// Loads data/db/*.json into Supabase via the PostgREST API (service_role
// key — bypasses RLS). Dependency-free: plain fetch.
//
// Setup (one-time):
//   1. Run db/schema.sql then db/grants.sql in the Supabase SQL editor.
//   2. Dashboard → Settings → API → Exposed schemas → add `atlas`.
//   3. Create .env (gitignored) in the project root with:
//        SUPABASE_URL=https://<project>.supabase.co
//        SUPABASE_SERVICE_KEY=<service_role key>
//
//   node tools/load-db.mjs
//
// Idempotent-ish: it INSERTs. Re-run only after truncating atlas tables.

import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);

async function loadEnv() {
  const env = { ...process.env };
  try {
    const txt = await readFile(new URL(".env", root), "utf8");
    for (const line of txt.split("\n")) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* env may come from the shell */ }
  return env;
}

const env = await loadEnv();
const BASE = (env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_KEY;
if (!BASE || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY (.env or shell).");
  process.exit(1);
}

const json = async f => JSON.parse(await readFile(new URL(`data/db/${f}`, root)));

async function insert(table, rows, { returning = false } = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await fetch(`${BASE}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "Content-Profile": "atlas",
        Prefer: returning ? "return=representation" : "return=minimal"
      },
      body: JSON.stringify(chunk)
    });
    if (!res.ok) {
      throw new Error(`${table} insert ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    if (returning) out.push(...await res.json());
    process.stdout.write(`  ${table}: ${Math.min(i + 500, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ${table}: ${rows.length} ✓                    `);
  return out;
}

const main = async () => {
  const [polity, pname, relation, fact, reference, nameRes] = await Promise.all(
    ["polity.json", "polity_name.json", "relation.json", "fact.json",
     "reference.json", "name_resolution.json"].map(json));

  console.log(`Loading into ${BASE} (schema atlas)…`);

  // 1. polity — insert and capture id <-> qid.
  const inserted = await insert("polity",
    polity.map(p => ({
      wikidata_qid: p.wikidata_qid, canonical_name: p.canonical_name,
      type: p.type, start_year: p.start_year, end_year: p.end_year,
      lat: p.lat, lng: p.lng, source: p.source,
      confidence: p.confidence, method: p.method
    })), { returning: true });
  const idOf = new Map(inserted.map(r => [r.wikidata_qid, r.id]));
  console.log(`  → ${idOf.size} polity ids mapped`);

  // 2. dependents — resolve qid → id, drop rows we can't anchor.
  let dropped = 0;
  const pn = pname.flatMap(r => {
    const id = idOf.get(r.polity_qid);
    if (!id) { dropped++; return []; }
    return [{ polity_id: id, name: r.name, kind: r.kind, source: r.source, confidence: r.confidence }];
  });
  await insert("polity_name", pn);

  const rel = relation.flatMap(r => {
    const s = idOf.get(r.subject_qid), o = idOf.get(r.object_qid);
    if (!s || !o) { dropped++; return []; }
    return [{
      subject_type: "polity", subject_id: s, object_type: "polity", object_id: o,
      dimension: r.dimension, type: r.type, source: r.source,
      confidence: r.confidence, method: r.method
    }];
  });
  await insert("relation", rel);

  const fc = fact.flatMap(r => {
    const id = idOf.get(r.subject_qid);
    if (!id) { dropped++; return []; }
    return [{
      subject_type: "polity", subject_id: id, key: r.key, value: r.value,
      from_year: r.from_year, to_year: r.to_year, source: r.source,
      confidence: r.confidence, method: r.method
    }];
  });
  await insert("fact", fc);

  const ref = reference.flatMap(r => {
    const id = idOf.get(r.subject_qid);
    if (!id) { dropped++; return []; }
    return [{ subject_type: "polity", subject_id: id, kind: r.kind, url: r.url, source: r.source }];
  });
  await insert("reference", ref);

  const nr = nameRes.flatMap(r => {
    const id = idOf.get(r.polity_qid);
    if (!id) { dropped++; return []; }
    return [{
      source_dataset: r.source_dataset, source_string: r.source_string,
      polity_id: id, confidence: r.confidence, method: r.method
    }];
  });
  await insert("name_resolution", nr);

  console.log(`\nDone. Rows skipped (unresolved qid): ${dropped}`);
};

main().catch(e => { console.error("\n" + e.message); process.exit(1); });
