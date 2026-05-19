#!/usr/bin/env node
// Wipes all rows from the atlas tables (service_role, bypasses RLS) so the
// regeneratable dataset can be reloaded cleanly. No user data lives here.
//
//   node tools/reset-db.mjs && node tools/load-db.mjs && \
//   node tools/load-threads.mjs && node tools/load-facts.mjs

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
  "Content-Profile": "atlas", "Accept-Profile": "atlas" };

// FK-safe order; most cascade from polity/thread but delete explicitly.
const PLAN = [
  ["relation", "id"], ["fact", "id"], ["reference", "id"],
  ["event_polity", "event_id"], ["event", "id"],
  ["name_resolution", "id"], ["thread_polity", "thread_id"],
  ["thread", "id"], ["territory", "id"],
  ["polity_name", "id"], ["polity", "id"]
];

for (const [table, col] of PLAN) {
  const r = await fetch(`${BASE}/rest/v1/${table}?${col}=gte.0`, { method: "DELETE", headers: H });
  if (!r.ok && r.status !== 404) {
    console.error(`${table}: ${r.status} ${(await r.text()).slice(0, 140)}`);
    process.exit(1);
  }
  console.log(`cleared ${table}`);
}
console.log("atlas wiped — reload now.");
