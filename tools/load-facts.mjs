#!/usr/bin/env node
// Loads data/db/fact-deep.json (time-qualified rulers + population) into
// Supabase. Idempotent: first deletes prior auto rows for those polities
// and keys, then inserts. Service_role key (bypasses RLS).
//
//   node tools/import-facts.mjs   (first)
//   node tools/load-facts.mjs

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

const H = {
  apikey: KEY, Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Content-Profile": "atlas", "Accept-Profile": "atlas"
};

async function main() {
  const facts = JSON.parse(await readFile(new URL("data/db/fact-deep.json", root)));

  // qid -> polity id
  const idOf = new Map();
  for (let from = 0; ; from += 1000) {
    const page = await fetch(`${BASE}/rest/v1/polity?select=id,wikidata_qid`, {
      headers: { ...H, Range: `${from}-${from + 999}` }
    }).then(r => r.json());
    page.forEach(p => idOf.set(p.wikidata_qid, p.id));
    if (page.length < 1000) break;
  }

  const rows = facts.flatMap(f => {
    const id = idOf.get(f.subject_qid);
    if (!id) return [];
    return [{
      subject_type: "polity", subject_id: id, key: f.key,
      value: f.value, value_num: f.value_num ?? null,
      from_year: f.from_year, to_year: f.to_year,
      source: f.source, confidence: f.confidence, method: f.method
    }];
  });
  const ids = [...new Set(rows.map(r => r.subject_id))];

  // Idempotent: drop previous auto rulers/population for these polities.
  const del = await fetch(
    `${BASE}/rest/v1/fact?subject_type=eq.polity&method=eq.auto` +
    `&key=in.(head_of_state,head_of_government,population)` +
    `&subject_id=in.(${ids.join(",")})`,
    { method: "DELETE", headers: H });
  if (!del.ok) throw new Error(`delete ${del.status}: ${(await del.text()).slice(0, 160)}`);

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const r = await fetch(`${BASE}/rest/v1/fact`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify(chunk)
    });
    if (!r.ok) throw new Error(`insert ${r.status}: ${(await r.text()).slice(0, 160)}`);
    process.stdout.write(`  ${Math.min(i + 500, rows.length)}/${rows.length}\r`);
  }
  console.log(`\nLoaded ${rows.length} deep facts across ${ids.length} polities.`);
}

main().catch(e => { console.error("\n" + e.message); process.exit(1); });
