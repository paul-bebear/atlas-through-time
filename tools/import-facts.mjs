#!/usr/bin/env node
// Deeper facts — time-qualified rulers + population from Wikidata, for the
// polities that appear in continuity threads (the ones users step through).
//
//   node tools/import-facts.mjs
//
// Writes data/db/fact-deep.json:
//   key = head_of_state | head_of_government  (value = person, from/to year)
//   key = population                           (value_num, from_year = P585)
//
// Scoped to thread members so it's fast/reliable; widen later.

import { readFile, writeFile } from "node:fs/promises";

const SPARQL = "https://query.wikidata.org/sparql";
const UA = "AtlasThroughTime/0.1 (educational historical dataset)";
const root = new URL("..", import.meta.url);
const j = async f => JSON.parse(await readFile(new URL(`data/db/${f}`, root)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseYear(iso) {
  if (!iso) return null;
  const m = /^([+-]?)0*(\d+)-/.exec(iso);
  if (!m) return null;
  const y = parseInt(m[2], 10);
  return Number.isFinite(y) ? (m[1] === "-" ? -y : y) : null;
}

async function sparql(query, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": UA }
    });
    if (r.ok) return (await r.json()).results.bindings;
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
    throw new Error(`SPARQL ${r.status}`);
  }
  throw new Error("SPARQL failed");
}

const RULERS = qids => `
SELECT ?item ?role ?personLabel ?start ?end WHERE {
  VALUES ?item { ${qids.map(q => "wd:" + q).join(" ")} }
  {
    ?item p:P35 ?st. ?st ps:P35 ?person. BIND("head_of_state" AS ?role)
    OPTIONAL { ?st pq:P580 ?start. } OPTIONAL { ?st pq:P582 ?end. }
  } UNION {
    ?item p:P6 ?st. ?st ps:P6 ?person. BIND("head_of_government" AS ?role)
    OPTIONAL { ?st pq:P580 ?start. } OPTIONAL { ?st pq:P582 ?end. }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

const POP = qids => `
SELECT ?item ?pop ?when WHERE {
  VALUES ?item { ${qids.map(q => "wd:" + q).join(" ")} }
  ?item p:P1082 ?st. ?st ps:P1082 ?pop.
  OPTIONAL { ?st pq:P585 ?when. }
}`;

const qidOf = u => u.split("/").pop();

async function main() {
  // Every polity in the registry with a Wikidata QID — pulls heads of
  // state / government with reign dates + population time-series for the
  // full set, not just thread members.
  const P = await j("polity.json");
  const qids = [...new Set(P.map(p => p.wikidata_qid).filter(Boolean))];
  console.log(`Polities with QID: ${qids.length}`);

  const facts = [];
  for (let i = 0; i < qids.length; i += 25) {
    const batch = qids.slice(i, i + 25);
    let rulers = [], pops = [];
    try { rulers = await sparql(RULERS(batch)); } catch (e) { console.warn("rulers", e.message); }
    await sleep(600);
    try { pops = await sparql(POP(batch)); } catch (e) { console.warn("pop", e.message); }

    for (const b of rulers) {
      const name = b.personLabel?.value;
      if (!name || /^Q\d+$/.test(name)) continue;
      facts.push({
        subject_qid: qidOf(b.item.value), key: b.role.value, value: name,
        from_year: parseYear(b.start?.value), to_year: parseYear(b.end?.value),
        source: "wikidata", confidence: 0.6, method: "auto"
      });
    }
    for (const b of pops) {
      const n = Number(b.pop.value);
      if (!Number.isFinite(n)) continue;
      facts.push({
        subject_qid: qidOf(b.item.value), key: "population",
        value: n.toLocaleString(), value_num: n,
        from_year: parseYear(b.when?.value), to_year: null,
        source: "wikidata", confidence: 0.6, method: "auto"
      });
    }
    process.stdout.write(`  ${Math.min(i + 25, qids.length)}/${qids.length}\r`);
    await sleep(700);
  }

  // Dedupe identical (subject,key,value,from).
  const seen = new Set();
  const out = facts.filter(f => {
    const k = [f.subject_qid, f.key, f.value, f.from_year].join("|");
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  await writeFile(new URL("data/db/fact-deep.json", root), JSON.stringify(out));
  const by = {};
  out.forEach(f => by[f.key] = (by[f.key] || 0) + 1);
  console.log("\nfact-deep.json:", JSON.stringify(by), "total", out.length);
}

main().catch(e => { console.error(e); process.exit(1); });
