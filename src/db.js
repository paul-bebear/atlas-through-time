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
