// The committed slice of the polity registry (data/db/polity.json, Wikidata CC0)
// plus its border-name resolution. Loaded lazily, only when something needs it
// without the database: a `sel=` link while Supabase is unreachable, or a link's `qid`.
// Rows come back shaped like db.js polity rows, with `_slice` set and `_names`
// holding the historical-basemaps spellings that resolve to the polity.

import { loadJSON, loadOptionalJSON } from "./data.js";

let sliceP = null;
function load() {
  return sliceP ??= Promise.all([
    loadJSON("data/db/polity.json"),
    loadOptionalJSON("data/db/name_resolution.json", [])
  ]).then(([rows, resolution]) => {
    const names = new Map();
    for (const r of resolution) {
      if (!names.has(r.polity_qid)) names.set(r.polity_qid, []);
      names.get(r.polity_qid).push(r.source_string);
    }
    return rows.map(r => ({ ...r, id: null, _slice: true, _names: names.get(r.wikidata_qid) || [] }));
  }).catch(e => { sliceP = null; throw e; });
}

const covers = (r, year) =>
  (r.start_year == null || r.start_year <= year) && (r.end_year == null || r.end_year >= year);

// Of several rows, the one whose years cover `year`, else the first.
export const rowForYear = (rows, year) => rows.find(r => covers(r, year)) || rows[0] || null;

export async function sliceByName(name, year) {
  const k = String(name).toLowerCase();
  return rowForYear((await load()).filter(r => r.canonical_name.toLowerCase() === k), year);
}

export async function sliceByQid(qid, year) {
  return rowForYear((await load()).filter(r => r.wikidata_qid === qid), year);
}
