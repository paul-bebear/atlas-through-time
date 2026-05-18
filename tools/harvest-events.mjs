#!/usr/bin/env node
// Wikidata harvester — mass-expands the event store.
//
// Pulls battles & sieges that have BOTH coordinates and a date, and writes
// them to data/events.generated.json. The app merges this with the curated
// data/events.json automatically (it's optional — absent = curated only).
//
//   node tools/harvest-events.mjs
//
// Re-run any time to refresh. Curated events always take precedence in spirit
// (they're hand-checked); generated ones add breadth. Tune LIMIT / the SPARQL
// query as needed.

import { writeFile } from "node:fs/promises";

const ENDPOINT = "https://query.wikidata.org/sparql";
const LIMIT = 4000;

// Battles (Q178561) and sieges (Q188055) with a point in time (P585) and
// coordinate location (P625). Bound to year >= -3000 to match the slider.
const QUERY = `
SELECT ?item ?itemLabel ?when ?coord WHERE {
  VALUES ?cls { wd:Q178561 wd:Q188055 }
  ?item wdt:P31 ?cls ;
        wdt:P585 ?when ;
        wdt:P625 ?coord .
  FILTER( YEAR(?when) >= -3000 )
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${LIMIT}`;

function parsePoint(wkt) {
  // "Point(lng lat)"
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(wkt);
  return m ? { lng: +m[1], lat: +m[2] } : null;
}

// Wikidata dates look like "-0490-09-12T00:00:00Z" (BCE) or "1815-06-18T..".
// JS Date can't parse negative years, so read the signed year directly.
function parseYear(iso) {
  const m = /^([+-]?)0*(\d+)-/.exec(iso);
  if (!m) return null;
  const y = parseInt(m[2], 10);
  return m[1] === "-" ? -y : y;
}

const main = async () => {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(QUERY)}`;
  console.log("Querying Wikidata… (this can take a minute)");
  const res = await fetch(url, {
    headers: {
      "Accept": "application/sparql-results+json",
      "User-Agent": "AtlasThroughTime/0.1 (educational history visualisation)"
    }
  });
  if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}`);
  const json = await res.json();

  const seen = new Set();
  const events = [];
  for (const b of json.results.bindings) {
    const pt = parsePoint(b.coord.value);
    if (!pt) continue;
    const id = "wd-" + b.item.value.split("/").pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const year = parseYear(b.when.value);
    if (year == null || year < -3000 || year > 2025) continue;
    const label = b.itemLabel?.value || "";
    if (!label || /^Q\d+$/.test(label)) continue; // skip unlabeled
    events.push({
      id,
      title: label,
      lat: pt.lat,
      lng: pt.lng,
      startYear: year,
      category: "war",
      wikiTitle: label
    });
  }

  await writeFile(
    new URL("../data/events.generated.json", import.meta.url),
    JSON.stringify(events, null, 0)
  );
  console.log(`Wrote ${events.length} events → data/events.generated.json`);
};

main().catch(e => { console.error(e); process.exit(1); });
