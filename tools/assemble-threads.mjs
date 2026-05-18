#!/usr/bin/env node
// Thread assembly — continuity threads ("a history of a people"):
// Francia → West Francia → Kingdom of France → … → France is ONE thread.
//
// Wikidata's succession graph (P1365/P155) conflates territorial
// absorption with national continuity and explodes when walked, so
// threads are CURATED in data/db/thread-overrides.json (the editorial
// "leading records" spine) against the Wikidata polity QIDs. A polity in
// >1 thread is SHARED (Polish–Lithuanian Commonwealth ∈ Poland AND
// Lithuania; Kievan Rus' ∈ Russia AND Belarus — aggregate, don't pick).
//
//   node tools/assemble-threads.mjs
//
// Reads data/db/polity.json + thread-overrides.json
// → writes data/db/thread.json + thread_polity.json

import { readFile, writeFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const j = async f => JSON.parse(await readFile(new URL(`data/db/${f}`, root)));

async function main() {
  const P = await j("polity.json");
  const { threads: defs } = await j("thread-overrides.json");
  const byq = new Map(P.map(p => [p.wikidata_qid, p]));

  // Count thread memberships per polity → 'shared' when in >1 thread.
  const count = new Map();
  for (const t of defs)
    for (const q of new Set(t.members)) count.set(q, (count.get(q) || 0) + 1);

  const threads = [];
  const thread_polity = [];
  const missing = [];

  for (const t of defs) {
    threads.push({
      slug: t.slug, display_name: t.display_name, region: t.region || "Europe",
      source: "curated", confidence: 0.85, method: "manual"
    });
    for (const q of t.members) {
      const p = byq.get(q);
      if (!p) { missing.push(`${t.slug}:${q}`); continue; }
      thread_polity.push({
        thread_slug: t.slug, polity_qid: q,
        role: q === t.core ? "core" : (count.get(q) > 1 ? "shared" : "member"),
        from_year: p.start_year ?? null, to_year: p.end_year ?? null,
        source: "curated", confidence: 0.85
      });
    }
  }

  await writeFile(new URL("data/db/thread.json", root), JSON.stringify(threads));
  await writeFile(new URL("data/db/thread_polity.json", root), JSON.stringify(thread_polity));

  console.log(`threads: ${threads.length} | links: ${thread_polity.length}`);
  if (missing.length) console.log(`⚠ QIDs not in polity set (skipped): ${missing.join(", ")}`);
  const order = s => thread_polity.filter(t => t.thread_slug === s)
    .sort((a, b) => (a.from_year ?? 0) - (b.from_year ?? 0))
    .map(t => `${byq.get(t.polity_qid).canonical_name}${t.role === "shared" ? "*" : ""}`);
  console.log("france :", order("france").join(" → "));
  console.log("poland :", order("poland").join(" → "));
  console.log("lithuania:", order("lithuania").join(" → "));
  console.log("(* = shared across threads)");
}

main().catch(e => { console.error(e); process.exit(1); });
