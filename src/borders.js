// Border source. Uses the historical-basemaps snapshots — clean, light
// geometry that renders and click-tests reliably on the globe.
//
// ⚠️ LICENSING: historical-basemaps is GPL-3.0 → DISPLAY-ONLY. Fetched
// client-side purely to draw the globe. NEVER load it into the Supabase
// `territory` table, return it from the API, export it, or commit it.
// Borders become a data product only after a permissive replacement (see
// the Obsidian vault "Borders Replacement - research").
//
// CShapes 2.0 (1886+) was trialled for finer colonial-era borders but its
// full-resolution / antimeridian-spanning polygons broke globe rendering and
// click picking. It's shelved until it can be pre-processed properly
// (split at the antimeridian, validated rings). The harvested files remain
// in data/ for that future pass; nothing fetches them at runtime.

import { loadBorders, nearestPeriod, yearLabel } from "./data.js";

export async function bordersForYear(year) {
  const snap = nearestPeriod(year);
  const g = await loadBorders(snap);
  return { features: g.features || [], source: `≈ ${yearLabel(snap)}` };
}
