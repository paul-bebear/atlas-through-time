// Border source. Uses the historical-basemaps snapshots — clean, light
// geometry that renders and click-tests reliably on the globe.
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
