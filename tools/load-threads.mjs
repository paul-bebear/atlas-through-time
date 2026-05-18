#!/usr/bin/env node
// Loads data/db/thread.json + thread_polity.json into Supabase (atlas)
// via PostgREST + service_role key. Resolves polity QID -> id and thread
// slug -> id. Idempotent on thread.slug (re-runnable).
//
//   node tools/assemble-threads.mjs   (first)
//   node tools/load-threads.mjs

import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);

async function env() {
  const e = { ...process.env };
  try {
    for (const l of (await readFile(new URL(".env", root), "utf8")).split("\n")) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(l);
      if (m) e[m[1]] = m[2].trim().replace(/^[<"']+|[>"']+$/g, "").trim();
    }
  } catch { /* shell env */ }
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
const j = async f => JSON.parse(await readFile(new URL(`data/db/${f}`, root)));

async function rest(method, path, body, extraPrefer) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: { ...H, Prefer: ["return=representation", extraPrefer].filter(Boolean).join(",") },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function main() {
  const threads = await j("thread.json");
  const tp = await j("thread_polity.json");

  // polity qid -> id (paged out of Supabase).
  const idOf = new Map();
  for (let from = 0; ; from += 1000) {
    const page = await fetch(`${BASE}/rest/v1/polity?select=id,wikidata_qid`, {
      headers: { ...H, Range: `${from}-${from + 999}` }
    }).then(r => r.json());
    page.forEach(p => idOf.set(p.wikidata_qid, p.id));
    if (page.length < 1000) break;
  }
  console.log(`polity ids: ${idOf.size}`);

  const tIds = new Map();
  for (const row of await rest("POST", "thread?on_conflict=slug",
    threads, "resolution=merge-duplicates"))
    tIds.set(row.slug, row.id);
  console.log(`threads upserted: ${tIds.size}`);

  let skipped = 0;
  const rows = tp.flatMap(r => {
    const tid = tIds.get(r.thread_slug), pid = idOf.get(r.polity_qid);
    if (!tid || !pid) { skipped++; return []; }
    return [{
      thread_id: tid, polity_id: pid, role: r.role,
      from_year: r.from_year, to_year: r.to_year,
      source: r.source, confidence: r.confidence
    }];
  });
  await rest("POST", "thread_polity?on_conflict=thread_id,polity_id,role",
    rows, "resolution=merge-duplicates,return=minimal").catch(async () => {
      // some PostgREST builds dislike composite on_conflict + minimal; retry plain
      await rest("POST", "thread_polity", rows, "return=minimal");
    });
  console.log(`thread_polity links: ${rows.length} (skipped ${skipped})`);
}

main().catch(e => { console.error("\n" + e.message); process.exit(1); });
