// Data layer: historical border GeoJSON + curated JSON datasets.
// Border data comes from the open-source "historical-basemaps" project,
// served via the jsDelivr CDN and cached in-memory per period.

const CDN = "https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@master/geojson";

// Periods (years) available in the dataset. Negative = BCE.
export const PERIODS = [
  -123000, -10000, -8000, -5000, -4000, -3000, -2000, -1500, -1000, -700,
  -500, -400, -323, -300, -200, -100, -1, 100, 200, 300, 400, 500, 600,
  700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530,
  1600, 1650, 1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920,
  1930, 1938, 1945, 1960, 1994, 2000, 2010
];

export function yearLabel(y) {
  if (y <= -10000) return Math.abs(y).toLocaleString() + " BCE";
  return y < 0 ? Math.abs(y) + " BCE" : y + " CE";
}

// Loose era descriptions shown in the top bar.
export function eraFor(y) {
  if (y < -3000) return "Prehistory / early settlements";
  if (y < -800) return "Bronze Age civilisations";
  if (y < 476) return "Classical antiquity";
  if (y < 1000) return "Early Middle Ages";
  if (y < 1453) return "High & Late Middle Ages";
  if (y < 1789) return "Early modern period";
  if (y < 1914) return "Age of empires & revolutions";
  if (y < 1945) return "World Wars era";
  return "Modern world";
}

// Continuous slider bounds (years). Deep prehistory snapshots still load
// when you sit near them, but a 1-year slider over 125k years is unusable.
export const SLIDER_MIN = -3000;
export const SLIDER_MAX = 2025;

// Non-linear (log) time scale: the slider position is uniform, but years are
// mapped so deep antiquity is compressed and recent centuries get more room.
// Anchored so that year 1 sits ~30% along the track.
//
//   pos(year) = (A - ln(F - year)) / (A - B)     pos in [0,1]
//   year(pos) = F - exp(A - pos*(A - B))
//
// F is an offset (> SLIDER_MAX) solved so pos(ANCHOR_YEAR) = ANCHOR_POS.
const ANCHOR_YEAR = 1;
const ANCHOR_POS = 0.30;

const timeScale = (() => {
  const posFor = (F, year) => {
    const A = Math.log(F - SLIDER_MIN);
    const B = Math.log(F - SLIDER_MAX);
    return (A - Math.log(F - year)) / (A - B);
  };
  // pos(ANCHOR_YEAR) increases monotonically with F — bisect to hit ANCHOR_POS.
  let lo = SLIDER_MAX + 0.5, hi = 50000;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (posFor(mid, ANCHOR_YEAR) < ANCHOR_POS) lo = mid; else hi = mid;
  }
  const F = (lo + hi) / 2;
  const A = Math.log(F - SLIDER_MIN);
  const B = Math.log(F - SLIDER_MAX);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  return {
    yearToPos: year => clamp((A - Math.log(F - clamp(year, SLIDER_MIN, SLIDER_MAX))) / (A - B), 0, 1),
    posToYear: pos => clamp(Math.round(F - Math.exp(A - clamp(pos, 0, 1) * (A - B))), SLIDER_MIN, SLIDER_MAX)
  };
})();

export const yearToPos = timeScale.yearToPos;
export const posToYear = timeScale.posToYear;

// Snap an arbitrary year to the nearest available border snapshot (returns the year).
export function nearestPeriod(year) {
  let best = PERIODS[0], bestD = Infinity;
  for (const p of PERIODS) {
    const d = Math.abs(p - year);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// Shared category palette for the event layer.
export const CATEGORIES = {
  war:        { color: "#ff6b5d", label: "War / battle" },
  empire:     { color: "#ffd27a", label: "Empire / dynasty" },
  founding:   { color: "#5dffa0", label: "Founding / independence" },
  treaty:     { color: "#5da9ff", label: "Treaty / settlement" },
  exploration:{ color: "#c08bff", label: "Exploration" },
  upheaval:   { color: "#ff8ad0", label: "Revolution / collapse" }
};

export function catColor(cat, alpha = 1) {
  const hex = (CATEGORIES[cat] || { color: "#ffffff" }).color;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Optional dataset: resolves to [] instead of throwing if absent (e.g. the
// Wikidata-harvested file that may not have been generated yet).
export async function loadOptionalJSON(path, fallback = []) {
  try {
    const res = await fetch(path);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

const geoCache = new Map();

export async function loadBorders(year) {
  if (geoCache.has(year)) return geoCache.get(year);
  const tag = year < 0 ? "bc" + Math.abs(year) : String(year);
  const res = await fetch(`${CDN}/world_${tag}.geojson`);
  if (!res.ok) throw new Error(`No border data for ${yearLabel(year)} (HTTP ${res.status})`);
  const gj = await res.json();
  geoCache.set(year, gj);
  return gj;
}

export async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path} (HTTP ${res.status})`);
  return res.json();
}

// Best-effort display name for a historical polity feature.
export function featureName(f) {
  const p = f.properties || {};
  return p.NAME || p.name || p.cntry_name || p.CNTRY_NAME || p.SUBJECTO || p.ABBREVN || p.PARTOF || "Unknown";
}
