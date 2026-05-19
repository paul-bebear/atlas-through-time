// Read-only Supabase (PostgREST) client for the `atlas` schema.
// Uses the public anon key; RLS read policies allow SELECT only.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./db-config.js";

export const dbEnabled = () =>
  !!SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== "REPLACE_WITH_ANON_KEY";

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Accept-Profile": "atlas"
};

async function get(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

const enc = encodeURIComponent;

// Search polities by canonical name OR any alias. Returns deduped polities.
export async function searchPolities(q, limit = 12) {
  if (!dbEnabled() || !q) return [];
  const [byName, byAlias] = await Promise.all([
    get(`polity?canonical_name=ilike.*${enc(q)}*&select=id,canonical_name,type,start_year,end_year,lat,lng,wikidata_qid&limit=${limit}`),
    get(`polity_name?name=ilike.*${enc(q)}*&select=polity:polity_id(id,canonical_name,type,start_year,end_year,lat,lng,wikidata_qid)&limit=${limit}`)
  ]);
  const seen = new Set();
  const out = [];
  for (const p of [...byName, ...byAlias.map(a => a.polity).filter(Boolean)]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

// Full detail for one polity: facts + references (polymorphic, queried explicitly).
export async function polityDetail(id) {
  const [facts, refs] = await Promise.all([
    get(`fact?subject_type=eq.polity&subject_id=eq.${id}&select=key,value,from_year,to_year,perspective,source,confidence`),
    get(`reference?subject_type=eq.polity&subject_id=eq.${id}&select=kind,url,title`)
  ]);
  return { facts, refs };
}

// CC0 territory polygons active in a year. Fetch the whole source set ONCE
// (it's static), then filter client-side — every subsequent year change is
// free (no network).
//
// Fast path: a regenerated-from-DB static JSON shipped with the site (served
// from the CDN edge — much faster than a Supabase REST roundtrip). The
// Supabase territory table remains the canonical source for the public API;
// this is just the app's fast-path cache. Falls back to Supabase if the
// static file is missing (e.g. while a fresh source is being added).
const STATIC_BY_SOURCE = { "ohm-usa": "data/db/territory.usa.json" };
const territoryAllCache = new Map();
const territoryAllInflight = new Map();

async function loadStatic(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`static ${r.status}`);
  const rows = await r.json();
  return rows.filter(r => r.geometry).map(r => ({
    type: "Feature",
    properties: { NAME: r.name || "" },
    valid_from: r.from_year, valid_to: r.to_year,
    geometry: r.geometry
  }));
}

async function loadFromDb(source) {
  if (!dbEnabled()) return [];
  const rows = await get(
    `territory?source=eq.${enc(source)}` +
    `&select=valid_from,valid_to,geometry,polity:polity_id(canonical_name)` +
    `&limit=5000`);
  return rows.filter(r => r.geometry).map(r => ({
    type: "Feature",
    properties: { NAME: r.polity?.canonical_name || "" },
    valid_from: r.valid_from, valid_to: r.valid_to,
    geometry: r.geometry
  }));
}

export async function territoryAll(source) {
  if (territoryAllCache.has(source)) return territoryAllCache.get(source);
  if (territoryAllInflight.has(source)) return territoryAllInflight.get(source);
  const p = (async () => {
    try {
      const url = STATIC_BY_SOURCE[source];
      if (url) return await loadStatic(url);
    } catch { /* fall through to DB */ }
    return await loadFromDb(source);
  })();
  territoryAllInflight.set(source, p);
  const features = await p;
  territoryAllCache.set(source, features);
  territoryAllInflight.delete(source);
  return features;
}
export async function territoryForYear(source, year) {
  const all = await territoryAll(source);
  return {
    type: "FeatureCollection",
    features: all.filter(f =>
      (f.valid_from == null || f.valid_from <= year) &&
      (f.valid_to == null || f.valid_to >= year))
  };
}

// historical-basemaps polygon name strings that resolve to this polity —
// exactly the spellings the border layer uses, so highlighting matches.
export async function resolvedNames(polityId) {
  if (!dbEnabled()) return [];
  const rows = await get(`name_resolution?polity_id=eq.${polityId}&select=source_string`);
  return rows.map(r => r.source_string);
}

// Threads whose name matches the query (the headline continuity result).
export async function searchThreads(q, limit = 6) {
  if (!dbEnabled() || !q) return [];
  return get(`thread?display_name=ilike.*${enc(q)}*&select=id,slug,display_name&limit=${limit}`);
}

// Continuity threads this polity belongs to (it may be SHARED across more
// than one — e.g. the Polish–Lithuanian Commonwealth ∈ Poland & Lithuania).
export async function threadsForPolity(polityId) {
  if (!dbEnabled()) return [];
  const rows = await get(
    `thread_polity?polity_id=eq.${polityId}&select=role,thread:thread_id(id,slug,display_name)`);
  return rows.map(r => ({ role: r.role, thread: r.thread })).filter(r => r.thread);
}

// Ordered members of a thread (the continuity spine), chronological.
// Embeds each polity's names so the globe can highlight by alias.
export async function threadMembers(threadId) {
  return get(`thread_polity?thread_id=eq.${threadId}` +
    `&select=role,from_year,to_year,polity:polity_id(id,canonical_name,type,start_year,end_year,lat,lng,wikidata_qid,polity_name(name))` +
    `&order=from_year`);
}
