// 3D globe via globe.gl (Three.js). Satellite imagery + border polygons
// + time-keyed event points + city labels.

import { featureName } from "./data.js";
import { installTouchPick } from "./touchPick.js";

// UMD build loaded by index.html from vendor/.
const Globe = window.Globe;

const HILITE_A = "rgba(93, 169, 255, 0.85)";
const HILITE_B = "rgba(255, 138, 93, 0.85)";
const STROKE = "#8fe9ff";          // crisp cyan border, high contrast on satellite
const STROKE_SEL = "#ffffff";      // selected country border
const SEL_FILL = "rgba(143, 233, 255, 0.30)"; // selected country tint
// Idle auto-spin until the first touch: slow enough to read the map while it turns.
const IDLE_SPIN_SPEED = 0.12;

// globe.gl's hover tooltip follows the pointer; under a finger it sticks at the last
// touch point. Touch-only screens get no tooltip text (the cards are the touch affordance).
const NO_HOVER = matchMedia("(hover: none)").matches;
const tip = fn => NO_HOVER ? null : fn;

// NASA Blue Marble colour + topography (public domain, from three-globe's examples), resized to 2048 px / 1024 px.

export function createGlobe(el, { onCountryClick, onEventClick, onTerritoryClick, onCityClick, onReady }) {
  let lastPointClick = -1, lastPress = 0;

  let readyNow;
  const ready = new Promise(r => { readyNow = r; });   // a fly-to before this would be lost
  const world = Globe()(el)
    .backgroundColor("#06101c")
    .globeImageUrl("assets/earth-blue-marble-2048-v1.webp")
    .bumpImageUrl("assets/earth-topology-1024-v1.png")
    .showAtmosphere(true)
    .atmosphereColor("#5da9ff")
    .atmosphereAltitude(0.16)
    .onGlobeReady(() => { readyNow(); onReady?.(); })
    .polygonsTransitionDuration(0)
    .polygonSideColor(() => "rgba(0,0,0,0)")
    // One HTML layer: city labels plus map pins, one array tagged by kind.
    .htmlElement(d => d.kind === "pin" ? pinEl(d) : cityEl(d))
    .htmlAltitude(d => d.kind === "pin" ? 0.035 : 0)
    .pointLat(d => d.lat).pointLng(d => d.lng)
    .pointColor(d => d._color)
    .pointAltitude(0.006)
    .pointRadius(d => 0.10 + 0.16 * (d._alpha ?? 1))
    .pointResolution(6)
    .pointLabel(tip(d => `${d.title} · ${yr(d.startYear)}`))
    .onPointClick(d => { if (touch.isTouch()) return; lastPointClick = Date.now(); onEventClick(d); });

  world.globeMaterial().shininess = 5;

  // City labels are DOM nodes (CSS2DRenderer), one per name, reused across refreshes.
  // globe.gl hides those behind the globe (display: none).
  const canvas = world.renderer().domElement;
  const cityEls = new Map();
  function cityEl(d) {
    let e = cityEls.get(d.name);
    if (!e) {
      cityEls.set(d.name, e = document.createElement("div"));
      e.className = "city-label";
      e.dataset.name = d.name;
      // Touch-only screens: let presses through to the canvas so a drag that starts on a
      // label turns the globe natively (Safari drops the forwarded press below); taps are
      // matched to cities by touchPick. Inline so it beats .city-label's pointer-events.
      if (NO_HOVER) e.style.pointerEvents = "none";
      // Hand the press to the orbit controls so a drag starting on a label still turns the globe;
      // a release within a few px of the press is a click.
      e.addEventListener("pointerdown", ev => {
        ev.stopPropagation();
        canvas.dispatchEvent(new PointerEvent("pointerdown", ev));
        addEventListener("pointerup", up => {
          if (Math.hypot(up.clientX - ev.clientX, up.clientY - ev.clientY) > 5) return;
          lastPointClick = Date.now();
          onCityClick?.(e.__d);
        }, { once: true });
      });
      e.addEventListener("wheel", ev => { ev.preventDefault(); canvas.dispatchEvent(new WheelEvent("wheel", ev)); }, { passive: false });
    }
    e.__d = d;
    return e;
  }

  // Map pins (the selected polity). Never hit targets: taps, clicks and drags
  // go through to the globe, so touchPick and globe.gl see them as before.
  const pinEls = new Map();
  function pinEl(d) {
    let e = pinEls.get(d.key);
    if (!e) {
      pinEls.set(d.key, e = document.createElement("div"));
      e.innerHTML = `<span class="pin-label"></span><span class="pin-stem"></span><span class="pin-dot"></span>`;
    }
    e.className = "map-pin pin-" + d.style + (d.side && d.side !== "up" ? " pin-" + d.side : "");
    e.querySelector(".pin-label").textContent = d.label;
    e.style.setProperty("--pin-c", d.color || "");
    return e;
  }
  let htmlCities = [];
  const htmlPins = new Map();       // style → pins
  const pushHtml = () => world.htmlElementsData([...htmlCities, ...[...htmlPins.values()].flat()]);

  const controls = world.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = IDLE_SPIN_SPEED;
  el.addEventListener("pointerdown", () => { controls.autoRotate = false; }, { once: true });
  el.addEventListener("pointerdown", () => { lastPress = Date.now(); });
  controls.addEventListener("change", sizeCities);

  // Stop burning GPU when the tab is in the background.
  document.addEventListener("visibilitychange", () =>
    document.hidden ? world.pauseAnimation() : world.resumeAnimation());

  // globe.gl does not stop a camera tween when another starts, so two at once
  // fight and the longer one lands last. A fly-to asked for mid-flight waits for
  // the current one to end; only the latest such request runs.
  let flying = false, nextFlight = null;
  function fly(p) {
    if (flying) { nextFlight = p; return; }
    flying = true;
    world.pointOfView({ lat: p.lat, lng: p.lng, altitude: p.altitude }, p.ms);
    setTimeout(() => {
      flying = false;
      const q = nextFlight; nextFlight = null;
      if (q) fly(q);
    }, p.ms + 30);
  }

  let highlightMap = new Map();
  let selectedKey = null;

  // Paths layer (outlines only) — used for territory mode. Much lighter
  // than tessellating filled polygon meshes.
  world
    .pathsData([])
    .pathPoints(d => d.points)
    .pathPointLat(p => p[0])
    .pathPointLng(p => p[1])
    .pathPointAlt(p => p[2] ?? 0.001)
    .pathColor(d => d.color || STROKE)
    .pathStroke(d => d.stroke ?? 1.2)   // ≥1 px gives a usable hover hit-box; 0.6 was effectively unreachable
    // Sea routes are dashed; while in use the dashes move in the direction of travel.
    .pathDashLength(d => d.dashed ? 0.035 : 1)
    .pathDashGap(d => d.dashed ? 0.02 : 0)
    .pathDashAnimateTime(d => d.animate ? 14000 : 0)
    .pathLabel(tip(d => d.name ? `<b>${d.name}</b>` : ""))
    .onPathHover(p => { el.style.cursor = p ? "pointer" : "grab"; })
    // Only territory outlines resolve to a polity card; trade routes are display-only.
    .onPathClick(d => { if (touch.isTouch()) return; if (d?.kind === "territory" && d.name) onTerritoryClick?.(d.name); })
    .pathTransitionDuration(0);

  world
    .polygonCapColor(f => {
      const k = norm(featureName(f));
      if (k === selectedKey) return SEL_FILL;
      const s = highlightMap.get(k);
      if (s === "A") return HILITE_A;
      if (s === "B") return HILITE_B;
      if (s === "G") return "rgba(93, 255, 138, 0.60)";  // quiz: correct
      if (s === "R") return "rgba(255, 93, 93, 0.60)";   // quiz: wrong / reveal
      return "rgba(0,0,0,0)"; // fully transparent — satellite imagery stays crisp
    })
    .polygonStrokeColor(f => (norm(featureName(f)) === selectedKey ? STROKE_SEL : STROKE))
    .polygonAltitude(f => {
      const k = norm(featureName(f));
      if (k === selectedKey) return 0.03;
      return highlightMap.has(k) ? 0.014 : 0.006;
    })
    .polygonLabel(tip(f => `<b>${featureName(f)}</b>`))
    .onPolygonHover(f => { el.style.cursor = f ? "pointer" : "grab"; })
    .onPolygonClick(f => {
      if (touch.isTouch()) return;             // taps are resolved by touchPick below
      if (lastPointClick >= lastPress) return; // this press already opened an event point or city
      if (f) clickPolygon(f);
    });

  function clickPolygon(f) {
    onCountryClick(f);                       // selectCurated etc. run their setHighlights (which clears selectedKey)
    selectedKey = norm(featureName(f));      // then re-mark the clicked one
    refresh();
  }

  // Mobile: globe.gl's click acts on a stale hover raycast under a finger, so touch
  // taps get their own hit test at the finger (src/touchPick.js).
  const touch = installTouchPick(world, el, {
    onPoint: onEventClick,
    onPath: d => { if (d.name) onTerritoryClick?.(d.name); },
    onPolygon: clickPolygon,
    onCity: d => { lastPointClick = Date.now(); onCityClick?.(d); },
    cities: () => cityEls.values()
  });

  const refresh = () => world.polygonsData(world.polygonsData());

  function resize() { world.width(el.clientWidth).height(el.clientHeight); sizeCities(); }
  // Labels scale with zoom like the old 3D text (capped in CSS); zoomed out, only the dots show.
  let citySize = 0;
  function sizeCities() {
    const s = Math.round(el.clientHeight / 45 / world.pointOfView().altitude) / 2;
    if (s === citySize) return;
    citySize = s;
    el.style.setProperty("--city-size", s + "px");
    el.classList.toggle("cities-far", s < 7);
  }
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
            paths.push({ kind: "territory", name: f.properties?.NAME || "",
              points: ring.map(([lng, lat]) => [lat, lng]) });
      }
      // Reset selection visuals so polygons come back clean on territory exit.
      highlightMap = new Map();
      selectedKey = null;
      currentFeatures = []; world.polygonsData([]);
      world.pathsData(paths);
      if (htmlPins.delete("route")) pushHtml();   // trade route labels go with their lines
    },
    clearTerritoryOutlines() { world.pathsData([]); if (htmlPins.delete("route")) pushHtml(); },
    // Trade routes ride the same paths layer as territory outlines, but the
    // two are never on together (territory is its own mode), so sharing is safe.
    // `highlight` (ids from a link) draws those routes thicker, with a name label;
    // a highlighted route not in use in `year` is grey, its label giving its dates.
    // While some are highlighted, the others are dimmed. An open end (a last
    // waypoint with `open: true`) fades out instead of ending on a place.
    setTradeRoutes(routes, { highlight = new Set(), year = null } = {}) {
      const list = routes || [];
      const inUse = r => year == null || ((r.from == null || year >= r.from) && (r.to == null || year <= r.to));
      const paths = list.map(r => {
        const hl = highlight.has(r.id), on = inUse(r);
        const base = !on ? "#9aa3ad" : r.color || STROKE;
        const alpha = !on ? 0.7 : highlight.size && !hl ? 0.4 : 1;
        const c = rgba(base, alpha);
        const open = r.waypoints?.at(-1)?.open;
        return {
          kind: "trade",
          name: `${r.name} · ${yr(r.from)} – ${yr(r.to)}`,
          color: open ? [...Array(8).fill(c), rgba(base, 0)] : c,
          stroke: hl ? 3 : 1.6,
          dashed: r.mode === "sea",
          animate: r.mode === "sea" && on,
          // Above highlighted borders (0.014), so a link's route is not hidden under its polity.
          points: r.points.map(([lng, lat]) => [lat, lng, 0.016])
        };
      });
      world.pathsData(paths);
      htmlPins.set("route", list.filter(r => highlight.has(r.id)).map((r, i) => {
        const { lat, lng } = midway(r.points);
        const on = inUse(r);
        return { kind: "pin", style: on ? "route" : "route pin-route-off", key: "route" + i, side: "right", lat, lng,
          color: on ? r.color : null, label: on ? r.name : `${r.name} · in use ${yr(r.from)} – ${yr(r.to)}` };
      }));
      pushHtml();
    },
    // Features in the current border set whose name matches any of `names`
    // (dash/diacritic/punctuation-insensitive).
    featuresForNames(names) {
      const set = new Set((names || []).map(norm));
      return currentFeatures.filter(f => set.has(norm(featureName(f))));
    },
    setCities: c => { htmlCities = c || []; pushHtml(); },
    // The red pin at the selected polity (a link may select two): { label, lat, lng, off },
    // a list, or null; `off` greys it (the polity does not exist in this year).
    setSelectionPin(p) {
      const list = (Array.isArray(p) ? p : p ? [p] : []).filter(q => q.lat != null);
      htmlPins.set("sel", list.map((q, i) => ({ kind: "pin", style: q.off ? "sel pin-off" : "sel", key: "sel" + i, label: q.label, lat: q.lat, lng: q.lng })));
      pushHtml();
    },
    // Pins from the link the visitor opened: [{ label, lat, lng }]. Kept in memory only.
    // Pins close together (Elath and Ezion-Geber) get their labels on different sides.
    setLinkPins(list) {
      const pins = list || [];
      htmlPins.set("link", pins.map((q, i) => ({ kind: "pin", style: "link", key: "link" + i, label: q.label || "", lat: q.lat, lng: q.lng,
        side: ["up", "down", "right", "left"][pins.slice(0, i).filter(o => Math.hypot(o.lat - q.lat, (o.lng - q.lng) * Math.cos(q.lat * Math.PI / 180)) < 1.5).length % 4] })));
      pushHtml();
    },
    allFeatures: () => currentFeatures,
    setEvents: e => world.pointsData(e || []),
    setHighlights(highlights) {
      highlightMap = new Map();
      (highlights || []).forEach(h => h.names.forEach(n => highlightMap.set(norm(n), h.side)));
      selectedKey = null;             // selection event will re-set this AFTER if a polygon was clicked
      world.polygonsData(world.polygonsData());
    },
    // A fly-to means "look here", so the idle spin stops instead of carrying the view away.
    flyTo(lat, lng, altitude = 0.75, ms = 1400) {
      controls.autoRotate = false;
      ready.then(() => fly({ lat, lng, altitude, ms }));
    },
    altitude: () => world.pointOfView().altitude
  };
}

// The point halfway along a [lng, lat] line by length (flat, cos-lat scaled).
function midway(points) {
  const seg = points.slice(1).map((p, i) => Math.hypot(p[1] - points[i][1],
    (p[0] - points[i][0]) * Math.cos(p[1] * Math.PI / 180)));
  let left = seg.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] && seg[i] > 0) {
      const t = left / seg[i], a = points[i], b = points[i + 1];
      return { lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t };
    }
    left -= seg[i];
  }
  const [lng, lat] = points[points.length - 1];
  return { lat, lng };
}
// "#3fd0c9" → "rgba(63, 208, 201, a)"; anything else passes through.
function rgba(c, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
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
