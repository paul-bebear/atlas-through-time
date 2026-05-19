// 3D globe via globe.gl (Three.js). Satellite imagery + border polygons
// + time-keyed event points + city labels.

import Globe from "globe.gl";
import { featureName } from "./data.js";

const HILITE_A = "rgba(93, 169, 255, 0.85)";
const HILITE_B = "rgba(255, 138, 93, 0.85)";
const STROKE = "#8fe9ff";          // crisp cyan border, high contrast on satellite
const STROKE_SEL = "#ffffff";      // selected country border
const SEL_FILL = "rgba(143, 233, 255, 0.30)"; // selected country tint

// Free Earth textures shipped with three-globe (MIT). No API key.
const TEX = "https://unpkg.com/three-globe/example/img/";

export function createGlobe(el, { onCountryClick, onEventClick }) {
  let lastPointClick = 0;

  const world = Globe()(el)
    .backgroundColor("#06101c")
    .globeImageUrl(TEX + "earth-blue-marble.jpg")
    .bumpImageUrl(TEX + "earth-topology.png")
    .showAtmosphere(true)
    .atmosphereColor("#5da9ff")
    .atmosphereAltitude(0.16)
    .polygonsTransitionDuration(0)
    .polygonSideColor(() => "rgba(0,0,0,0)")
    .labelLat(d => d.lat).labelLng(d => d.lng).labelText(d => d.name)
    .labelSize(0.4).labelDotRadius(0.14)
    .labelColor(() => "rgba(255, 220, 150, 0.65)").labelResolution(2)
    .pointLat(d => d.lat).pointLng(d => d.lng)
    .pointColor(d => d._color)
    .pointAltitude(0.006)
    .pointRadius(d => 0.10 + 0.16 * (d._alpha ?? 1))
    .pointResolution(6)
    .pointLabel(d => `${d.title} · ${yr(d.startYear)}`)
    .onPointClick(d => { lastPointClick = Date.now(); onEventClick(d); });

  world.globeMaterial().shininess = 5;

  const controls = world.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.3;
  el.addEventListener("pointerdown", () => { controls.autoRotate = false; }, { once: true });

  let highlightMap = new Map();
  let selectedKey = null;

  // Paths layer (outlines only) — used for territory mode. Much lighter
  // than tessellating filled polygon meshes.
  world
    .pathsData([])
    .pathPoints(d => d.points)
    .pathPointLat(p => p[0])
    .pathPointLng(p => p[1])
    .pathColor(() => STROKE)
    .pathStroke(0.6)
    .pathTransitionDuration(0);

  world
    .polygonCapColor(f => {
      const k = norm(featureName(f));
      if (k === selectedKey) return SEL_FILL;
      const s = highlightMap.get(k);
      if (s === "A") return HILITE_A;
      if (s === "B") return HILITE_B;
      return "rgba(0,0,0,0)"; // fully transparent — satellite imagery stays crisp
    })
    .polygonStrokeColor(f => (norm(featureName(f)) === selectedKey ? STROKE_SEL : STROKE))
    .polygonAltitude(f => {
      const k = norm(featureName(f));
      if (k === selectedKey) return 0.03;
      return highlightMap.has(k) ? 0.014 : 0.006;
    })
    .polygonLabel(f => `<b>${featureName(f)}</b>`)
    .onPolygonHover(f => { el.style.cursor = f ? "pointer" : "grab"; })
    .onPolygonClick(f => {
      if (Date.now() - lastPointClick < 350) return; // an event point handled it
      if (f) { selectedKey = norm(featureName(f)); refresh(); onCountryClick(f); }
    });

  const refresh = () => world.polygonsData(world.polygonsData());

  function resize() { world.width(el.clientWidth).height(el.clientHeight); }
  window.addEventListener("resize", resize);
  resize();

  let currentFeatures = [];
  return {
    world,
    setBorders: gj => { currentFeatures = gj.features || []; world.polygonsData(currentFeatures); },
    // Render a set of GeoJSON features as outline-only paths (the
    // territory layer). Far lighter than tessellating filled polygons.
    setTerritoryOutlines(features) {
      const paths = [];
      for (const f of (features || [])) {
        if (!f.geometry) continue;
        const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates]
          : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
        for (const poly of polys)
          for (const ring of poly)
            paths.push({ name: f.properties?.NAME || "",
              points: ring.map(([lng, lat]) => [lat, lng]) });
      }
      currentFeatures = []; world.polygonsData([]);
      world.pathsData(paths);
    },
    clearTerritoryOutlines() { world.pathsData([]); },
    // Features in the current border set whose name matches any of `names`
    // (dash/diacritic/punctuation-insensitive).
    featuresForNames(names) {
      const set = new Set((names || []).map(norm));
      return currentFeatures.filter(f => set.has(norm(featureName(f))));
    },
    setCities: c => world.labelsData(c || []),
    setEvents: e => world.pointsData(e || []),
    setHighlights(highlights) {
      highlightMap = new Map();
      (highlights || []).forEach(h => h.names.forEach(n => highlightMap.set(norm(n), h.side)));
      world.polygonsData(world.polygonsData());
    },
    flyTo(lat, lng, altitude = 0.75, ms = 1400) { world.pointOfView({ lat, lng, altitude }, ms); }
  };
}

function yr(y) { return y < 0 ? Math.abs(y) + " BCE" : y + " CE"; }

// Normalise a place name for matching: lowercase, strip diacritics,
// unify dashes, drop punctuation, collapse spaces.
function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
