#!/usr/bin/env node
// Reloads data/db/name_resolution.json into Supabase (atlas). Idempotent:
// clears name_resolution then re-inserts with polity QID → id resolved.
//
//   node tools/resolve-names.mjs   (first)
//   node tools/load-names.mjs

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

const rows = JSON.parse(await readFile(new URL("data/db/name_resolution.json", root)));

// qid -> polity id
const idOf = new Map();
for (let from = 0; ; from += 1000) {
  const page = await fetch(`${BASE}/rest/v1/polity?select=id,wikidata_qid`, {
    headers: { ...H, Range: `${from}-${from + 999}` }
  }).then(r => r.json());
  page.forEach(p => idOf.set(p.wikidata_qid, p.id));
  if (page.length < 1000) break;
}

const del = await fetch(`${BASE}/rest/v1/name_resolution?id=gte.0`, { method: "DELETE", headers: H });
if (!del.ok && del.status !== 404) { console.error("delete", del.status, await del.text()); process.exit(1); }

const payload = rows.flatMap(r => {
  const pid = idOf.get(r.polity_qid);
  if (!pid) return [];
  return [{
    source_dataset: r.source_dataset, source_string: r.source_string,
    polity_id: pid, confidence: r.confidence, method: r.method
  }];
});

for (let i = 0; i < payload.length; i += 500) {
  const r = await fetch(`${BASE}/rest/v1/name_resolution`, {
    method: "POST",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify(payload.slice(i, i + 500))
  });
  if (!r.ok) { console.error("insert", r.status, (await r.text()).slice(0, 160)); process.exit(1); }
  process.stdout.write(`  ${Math.min(i + 500, payload.length)}/${payload.length}\r`);
}
console.log(`\nname_resolution: ${payload.length} loaded (skipped ${rows.length - payload.length}).`);
