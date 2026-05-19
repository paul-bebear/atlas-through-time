#!/usr/bin/env node
// Wikidata importer — Europe first. Seeds the unified dataset's polity graph.
//
//   node tools/import-wikidata.mjs
//
// Outputs normalised JSON tables under data/db/ (polity, polity_name,
// relation, fact, reference, + import-report). QID is the universal join
// key; a later loader maps QIDs -> Postgres ids when Supabase exists.
//
// v1 scope: identity, time span, type, capital, coordinates, succession
// edges (P155/P156/P1365/P1366), aliases, Wikipedia reference. Time-
// qualified leaders/population (P35/P6/P1082 + P585 qualifiers) are a
// documented next iteration — the `fact` table already supports them.

import { writeFile } from "node:fs/promises";

const SPARQL = "https://query.wikidata.org/sparql";
const WD_API = "https://www.wikidata.org/w/api.php";
const UA = "AtlasThroughTime/0.1 (educational historical dataset)";

// Guaranteed-coverage seeds (resolved by enwiki title -> QID, so we don't
// rely on memorised QIDs). Test cases + major ancient lineages.
const SEED_TITLES = [
  "France", "Kingdom of France", "West Francia", "Francia", "French First Republic",
  "First French Empire", "Kingdom of the Franks",
  "Poland", "Kingdom of Poland", "Polish–Lithuanian Commonwealth", "Duchy of Warsaw",
  "Second Polish Republic", "Lithuania", "Grand Duchy of Lithuania",
  "Germany", "German Empire", "Nazi Germany", "Kingdom of Prussia", "Weimar Republic",
  "East Germany", "West Germany", "Holy Roman Empire",
  "Italy", "Kingdom of Italy", "Papal States", "Roman Empire", "Roman Republic",
  "Western Roman Empire", "Byzantine Empire",
  "Spain", "Crown of Castile", "Crown of Aragon", "Habsburg Spain",
  "England", "Kingdom of England", "United Kingdom", "Kingdom of Great Britain",
  "Russia", "Russian Empire", "Soviet Union", "Grand Duchy of Moscow", "Tsardom of Russia",
  "Ottoman Empire", "Achaemenid Empire", "Austria-Hungary", "Austrian Empire",
  "Habsburg monarchy", "Dutch Republic", "Kingdom of the Netherlands",
  "Kingdom of Portugal", "Swedish Empire", "Kingdom of Hungary", "Bohemia",
  "Kingdom of Bohemia", "Serbia", "Kingdom of Serbia", "Yugoslavia",
  "Kingdom of Greece", "Ancient Greece", "Kievan Rus'", "Golden Horde",
  // Global anchors so non-EU coverage has its key threads guaranteed.
  "China", "Qing dynasty", "Ming dynasty", "Han dynasty", "Tang dynasty",
  "Republic of China", "Japan", "Empire of Japan", "Tokugawa shogunate",
  "Korea", "Joseon", "Goryeo", "India", "Mughal Empire", "British Raj",
  "Maurya Empire", "Gupta Empire", "Vietnam", "Khmer Empire", "Siam",
  "Thailand", "Indonesia", "Majapahit", "Mongol Empire",
  "Ottoman Empire", "Safavid Iran", "Qajar Iran", "Pahlavi Iran", "Iran",
  "Achaemenid Empire", "Sasanian Empire", "Azerbaijan",
  "Azerbaijan Democratic Republic", "Armenia", "Georgia (country)",
  "Saudi Arabia", "Egypt", "Ptolemaic Kingdom", "Ancient Egypt",
  "Mali Empire", "Songhai Empire", "Ghana Empire", "Kingdom of Aksum",
  "Ethiopian Empire", "Kingdom of Kongo", "Zulu Kingdom", "Nigeria",
  "South Africa", "United States", "Confederate States of America",
  "Mexico", "Aztec Empire", "Inca Empire", "Brazil", "Empire of Brazil",
  "Argentina", "Gran Colombia", "Canada", "Australia", "New Zealand"
];

// Country-like classes with an inception, tied to a continent (directly or
// via present-day country). Run per continent to keep each query light.
const CONTINENTS = {
  Europe: "Q46", Asia: "Q48", Africa: "Q15",
  "North America": "Q49", "South America": "Q18", Oceania: "Q55838"
};
const candidateQuery = cont => `
SELECT DISTINCT ?item WHERE {
  VALUES ?cls { wd:Q3624078 wd:Q3024240 wd:Q417175 wd:Q48349 wd:Q6256 wd:Q1250464 }
  ?item wdt:P31 ?cls ; wdt:P571 ?inc .
  { ?item wdt:P30 wd:${cont} } UNION { ?item wdt:P17 ?c . ?c wdt:P30 wd:${cont} }
}
LIMIT 700`;

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
    const res = await fetch(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": UA }
    });
    if (res.ok) return (await res.json()).results.bindings;
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
    throw new Error(`SPARQL HTTP ${res.status}`);
  }
  throw new Error("SPARQL failed after retries");
}

// Resolve enwiki titles -> QIDs via the Wikidata API (50 per call).
async function resolveTitles(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const u = new URL(WD_API);
    u.search = new URLSearchParams({
      action: "wbgetentities", sites: "enwiki", titles: chunk.join("|"),
      props: "info", format: "json", origin: "*"
    }).toString();
    const r = await fetch(u, { headers: { "User-Agent": UA } });
    if (!r.ok) continue;
    const j = await r.json();
    for (const [qid, ent] of Object.entries(j.entities || {})) {
      if (qid.startsWith("Q") && ent.title) out.set(qid, true);
    }
    await sleep(300);
  }
  return [...out.keys()];
}

const DETAIL = qids => `
SELECT ?item ?itemLabel ?type ?typeLabel ?inc ?dis ?coord
       ?capLabel ?follows ?followedBy ?replaces ?replacedBy ?article
       (GROUP_CONCAT(DISTINCT ?alt; separator="||") AS ?aliases) WHERE {
  VALUES ?item { ${qids.map(q => "wd:" + q).join(" ")} }
  OPTIONAL { ?item wdt:P31 ?type. }
  OPTIONAL { ?item wdt:P571 ?inc. }
  OPTIONAL { ?item wdt:P576 ?dis. }
  OPTIONAL { ?item wdt:P625 ?coord. }
  OPTIONAL { ?item wdt:P36 ?cap. }
  OPTIONAL { ?item wdt:P155 ?follows. }
  OPTIONAL { ?item wdt:P156 ?followedBy. }
  OPTIONAL { ?item wdt:P1365 ?replaces. }
  OPTIONAL { ?item wdt:P1366 ?replacedBy. }
  OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }
  OPTIONAL { ?item skos:altLabel ?alt. FILTER(LANG(?alt)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en".
    ?item rdfs:label ?itemLabel. ?type rdfs:label ?typeLabel. ?cap rdfs:label ?capLabel. }
}
GROUP BY ?item ?itemLabel ?type ?typeLabel ?inc ?dis ?coord ?capLabel
         ?follows ?followedBy ?replaces ?replacedBy ?article`;

const qidOf = uri => uri.split("/").pop();

async function main() {
  console.log("Resolving seed titles → QIDs…");
  const seedQids = await resolveTitles(SEED_TITLES);
  console.log(`  ${seedQids.length} seed QIDs`);

  let candQids = [];
  for (const [name, qid] of Object.entries(CONTINENTS)) {
    try {
      const r = (await sparql(candidateQuery(qid))).map(b => qidOf(b.item.value));
      candQids.push(...r);
      console.log(`  ${name}: ${r.length}`);
    } catch (e) { console.warn(`  ${name} failed: ${e.message}`); }
    await sleep(800);
  }
  console.log(`  candidates total: ${candQids.length}`);

  const qids = [...new Set([...seedQids, ...candQids])];
  console.log(`Fetching details for ${qids.length} polities…`);

  const polity = new Map();          // qid -> row
  const polity_name = [];
  const relation = [];
  const fact = [];
  const reference = [];

  for (let i = 0; i < qids.length; i += 40) {
    const batch = qids.slice(i, i + 40);
    let rows;
    try { rows = await sparql(DETAIL(batch)); }
    catch (e) { console.warn(`  batch ${i} failed: ${e.message}`); continue; }
    for (const b of rows) {
      const qid = qidOf(b.item.value);
      if (!polity.has(qid)) {
        const m = b.coord && /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value);
        polity.set(qid, {
          wikidata_qid: qid,
          canonical_name: b.itemLabel?.value || qid,
          type: b.typeLabel?.value || null,
          start_year: parseYear(b.inc?.value),
          end_year: parseYear(b.dis?.value),
          lat: m ? +m[2] : null,
          lng: m ? +m[1] : null,
          source: "wikidata", confidence: 0.7, method: "auto"
        });
        const label = b.itemLabel?.value;
        if (label && label !== qid)
          polity_name.push({ polity_qid: qid, name: label, kind: "common", source: "wikidata", confidence: 0.8 });
        for (const a of (b.aliases?.value || "").split("||").filter(Boolean))
          polity_name.push({ polity_qid: qid, name: a, kind: "alias", source: "wikidata", confidence: 0.6 });
        if (b.capLabel?.value)
          fact.push({ subject_type: "polity", subject_qid: qid, key: "capital",
            value: b.capLabel.value, from_year: parseYear(b.inc?.value),
            to_year: parseYear(b.dis?.value), source: "wikidata", confidence: 0.7, method: "auto" });
        if (b.article?.value)
          reference.push({ subject_type: "polity", subject_qid: qid, kind: "wikipedia",
            url: b.article.value, source: "wikidata" });
      }
      const edge = (objUri, type) => objUri && relation.push({
        subject_type: "polity", subject_qid: qid,
        object_type: "polity", object_qid: qidOf(objUri),
        dimension: "succession", type, source: "wikidata", confidence: 0.7, method: "auto"
      });
      edge(b.follows?.value, "preceded_by");
      edge(b.followedBy?.value, "succeeded_by");
      edge(b.replaces?.value, "replaces");
      edge(b.replacedBy?.value, "replaced_by");
    }
    process.stdout.write(`  ${Math.min(i + 40, qids.length)}/${qids.length}\r`);
    await sleep(800);
  }

  const dedupe = (arr, key) => {
    const seen = new Set();
    return arr.filter(r => { const k = key(r); if (seen.has(k)) return false; seen.add(k); return true; });
  };

  const tables = {
    polity: [...polity.values()],
    polity_name: dedupe(polity_name, r => r.polity_qid + "|" + r.name.toLowerCase()),
    relation: dedupe(relation, r => [r.subject_qid, r.type, r.object_qid].join("|")),
    fact,
    reference: dedupe(reference, r => r.subject_qid + "|" + r.url)
  };

  for (const [name, data] of Object.entries(tables))
    await writeFile(new URL(`../data/db/${name}.json`, import.meta.url), JSON.stringify(data));

  const report = {
    generated: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    note: "v1: identity/span/type/capital/coords/succession/refs. Leaders & population with time qualifiers = next iteration."
  };
  await writeFile(new URL("../data/db/import-report.json", import.meta.url), JSON.stringify(report, null, 2));
  console.log("\nDone:", JSON.stringify(report.counts));
}

main().catch(e => { console.error(e); process.exit(1); });
