// App bootstrap: wires globe, timeline, events, wars panel, and info card.
// Single time variable drives everything: borders snap to nearest snapshot,
// events fade in/out by year proximity.

import {
  loadJSON, loadOptionalJSON, loadBorders, prefetchNeighbours, nearestPeriod, eraFor, yearLabel, featureName, CATEGORIES,
  SLIDER_MIN, SLIDER_MAX
} from "./data.js";
import { bordersForYear } from "./borders.js";
import { createGlobe } from "./globe.js";
import { createTimeline } from "./timeline.js";
import { createEvents } from "./events.js";
import { createWarsPanel, warHighlights } from "./wars.js";
import { createFormationsPanel, formationHighlights } from "./formations.js";
import { createInfoCard } from "./countryCard.js";
import { createSearch } from "./search.js";
import { polityDetail, threadMembers, resolvedNames, territoryForYear, territoryAll, searchPolities, allThreads } from "./db.js";
import { createStory } from "./story.js";
import { initPanel } from "./panel.js";
import { createLayersPanel } from "./layersPanel.js";
import { createQuiz } from "./quiz.js";
import { sliceByName, sliceByQid, rowForYear } from "./politySlice.js";
import { parseLink, frameFor, spanLabel } from "./linkView.js";

const DEFAULT_CONTEXT = "Explore history — click a country, war or formation";

// State shape per Architecture.md Phase 2.
//   mode        — exclusive intent ("discovery" | "us-territorial" | …)
//   modeState   — mode-scoped working data (for us-territorial: {source,label,sig})
//   layers.*    — stackable overlays; renderers gate on .enabled
//   lastSig     — borders-layer cache key (rendering optimization)
const state = {
  year: 1900,
  mode: "discovery",
  layers: {
    borders: { enabled: true, source: "historical-basemaps" },
    cities:  { enabled: true },
    events:  { enabled: true, count: 0 },
    wars:    { enabled: false },
    trade:   { enabled: false },
    pins:    { enabled: true, count: null },   // pins from a link the visitor opened
  },
  selection: null,
  modeState: null,
  lastSig: null,
};
let warsData = [];               // wars dataset (was state.wars before Phase 1)

const bordersSig = (source, features) => source + "|" + features.length;
const eraEl = document.getElementById("era");
const contextEl = document.getElementById("context");
const statusEl = document.getElementById("status");

function setContext(text, selected = true) {
  contextEl.textContent = text;
  contextEl.classList.toggle("sel", selected);
}

// Geometry helpers for country focus + "events in this country".
function ringHit(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) &&
        (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
const polysOf = g =>
  g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];

function featureContains(feature, lng, lat) {
  for (const poly of polysOf(feature.geometry)) if (ringHit(lng, lat, poly[0])) return true;
  return false;
}

// Centre of a set of border shapes: the area centroid of the largest outer ring,
// moved onto the ring along its parallel when the ring is C-shaped and the
// centroid falls outside it. Where a pin stands and the camera flies.
// Two place names are the same polity name (case, accents, dashes, punctuation aside).
const normName = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
const sameName = (a, b) => normName(a) === normName(b);

function shapesCentre(features) {
  let best = null, bestA = 0;
  for (const f of features || []) for (const poly of polysOf(f.geometry)) {
    const r = poly[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const k = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a += k; cx += (r[j][0] + r[i][0]) * k; cy += (r[j][1] + r[i][1]) * k;
    }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = { ring: r, lng: cx / (3 * a), lat: cy / (3 * a) }; }
  }
  if (!best) return null;
  const { ring, lat } = best;
  if (ringHit(best.lng, lat, ring)) return { lat, lng: best.lng };
  // Widest stretch of the parallel through the centroid that lies inside the ring.
  const xs = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat)) xs.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi));
  }
  xs.sort((p, q) => p - q);
  let lng = best.lng, w = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > w) { w = xs[i + 1] - xs[i]; lng = (xs[i] + xs[i + 1]) / 2; }
  return { lat, lng };
}

// The corners of a polity's main shapes (each outer ring at least a tenth the
// size of the largest, so far islands and enclaves do not stretch it).
function extentPoints(features) {
  const boxes = [];
  for (const f of features || []) for (const poly of polysOf(f.geometry)) {
    const r = poly[0], lng0 = r[0][0];
    const lngs = r.map(([x]) => lng0 + ((x - lng0 + 540) % 360) - 180), lats = r.map(([, y]) => y);
    const b = { w: Math.min(...lngs), e: Math.max(...lngs), s: Math.min(...lats), n: Math.max(...lats) };
    b.a = (b.e - b.w) * (b.n - b.s) * Math.cos((b.n + b.s) * Math.PI / 360);
    boxes.push(b);
  }
  const big = Math.max(0, ...boxes.map(b => b.a));
  return boxes.filter(b => b.a >= big / 10)
    .flatMap(b => [{ lat: b.s, lng: b.w }, { lat: b.n, lng: b.e }]);
}

const activeWarsFor = y => warsData.filter(w => y >= w.start && y <= w.end);
const belligerent = (war, name) =>
  Object.values(war.sides).flat().some(s => s.toLowerCase() === name.toLowerCase());

function buildLegend() {
  document.getElementById("legend").innerHTML = Object.values(CATEGORIES)
    .map(c => `<div class="lg"><span class="dot" style="background:${c.color}"></span>${c.label}</div>`)
    .join("");
}

async function boot() {
  // Snapshot the URL before anything can replaceState over it. A link view
  // (#v=2&…, docs/link-format.md) lives in the fragment and wins over the query.
  const link = parseLink(location.hash);
  const bootParams = new URLSearchParams(link ? "" : location.search);
  const qYear = link ? link.year : parseInt(bootParams.get("year"), 10);
  const bootYear = Number.isFinite(qYear) ? Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, qYear)) : 1900;
  // The globe needs none of the JSON below, so it starts before it lands.
  // The boot year's borders (the slowest fetch) go out first; the timeline's
  // first onChange picks up this same in-flight request.
  loadBorders(nearestPeriod(bootYear)).catch(() => {});
  const dataP = Promise.all([
    loadJSON("data/wars.json"),
    loadJSON("data/formations.json"),
    loadJSON("data/countries.json"),
    loadJSON("data/cities.json"),
    loadJSON("data/events.json"),
    loadOptionalJSON("data/events.generated.json", []),
    loadOptionalJSON("data/trade-routes.json", [])
  ]);
  // Assigned when dataP lands. Until then the globe and timeline run with
  // empty data layers, and anything that needs these no-ops.
  let events = null, card = null, cities = null, tradeRoutes = null;

  // Country selection is unified: clicking a polygon or picking from search
  // produce the SAME scoped state — name on the slider, major-event marks,
  // and a period card that re-renders live as you move through time.
  let selection = null;            // { names, render(year) }
  let dbSelectionSeq = 0;          // bail stale selectDbPolity awaits
  let pickFeature = () => {};
  let pickTerritory = () => {};    // us-territorial path click (late-bound like pickFeature)
  let pickCity = () => {};         // city label click (late-bound)
  let openRoute = () => {};        // route line or label click (late-bound)
  let openLinkPin = () => {};      // a link pin's click (late-bound)
  let layersPanel = null;          // assigned at the end of boot; onChange fires before that
  let quiz = null;                 // assigned at the end of boot
  // Exit us-territorial mode. Returns true if we were in it, so callers
  // can force a normal-border refresh.
  const exitTerritory = () => {
    if (state.mode !== "us-territorial") return false;
    state.mode = "discovery";
    state.modeState = null;
    state.lastSig = null;
    globe.clearTerritoryOutlines();
    tradeSig = null;                  // territory just wiped the shared paths layer
    layersPanel?.refresh();
    return true;
  };
  // Shareable view: the URL always mirrors {year, mode, selection} so any
  // moment on the globe can be sent as a link. Debounced — scrubbing
  // shouldn't write history on every tick.
  let selLabel = null;
  let storyThread = null, storyBeat = 0;   // active Empire Story, for permalinks
  let urlTimer = null;
  let linkPins = [];               // pins from the opened link: memory only, never stored or sent
  let linkRoutes = new Set();      // route ids the opened link highlights
  let linkOn = false;              // a link's view is on (pins, routes, era band, polities) until Clear
  let linkSel = null;              // { groups, points } of the link's polities, until Clear
  const syncURL = () => {
    if (!events) return;             // permalink restore hasn't run yet — keep ?sel=/?mode=
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      const q = new URLSearchParams();
      q.set("year", String(state.year));
      if (state.mode !== "discovery") q.set("mode", state.mode);
      // A running thread supersedes a plain selection — ?thread=&beat= restores
      // the exact stage of the walkthrough.
      if (storyThread) {
        q.set("thread", storyThread);
        if (storyBeat) q.set("beat", String(storyBeat));
      } else if (selLabel) q.set("sel", selLabel);
      // The link's fragment stays while its view is on, so it can be shared again; Clear drops it.
      history.replaceState(null, "", "?" + q.toString() + (linkOn ? location.hash : ""));
    }, 300);
  };

  const clearSelection = () => {
    selection = null;
    selLabel = null;
    storyThread = null; storyBeat = 0;
    syncURL();
    setSelPins([]);
    aim = null;
    setSelection([]);                 // clears selection tint; layer tints re-apply
    if (exitTerritory()) timeline.setYear(timeline.currentYear());
  };

  const globe = createGlobe(document.getElementById("globe"), {
    onCountryClick: f => pickFeature(f),
    onEventClick: ev => { clearSelection(); card?.openEvent(ev); },
    onTerritoryClick: name => pickTerritory(name),
    onCityClick: d => pickCity(d),
    onRouteClick: r => openRoute(r),
    onLinkPinClick: p => openLinkPin(p),
    panels: () => COVERS.map(id => document.getElementById(id))
      .filter(e => e && !e.hidden && e.getClientRects().length).map(e => e.getBoundingClientRect()),
    onReady: () => document.getElementById("globePlaceholder")?.classList.add("ready")
  });
  document.getElementById("status").textContent = "loading textures & borders…";

  // A selected polity gets a red pin with its name at its point (else the centre
  // of its highlighted shapes, so it shows even with no shape in this snapshot),
  // and the camera flies there.
  // `span` = [from, to]: in a year outside it the pin turns grey and its label
  // gives the dates, so a polity that no longer exists does not read as current.
  let selPins = [];
  const showSelPins = (y = state.year) => globe.setSelectionPin(selPins.map(p => {
    const off = y != null && ((p.from != null && y < p.from) || (p.to != null && y > p.to));
    return { lat: p.lat, lng: p.lng, off,
      label: off ? `${p.label} · ${p.from != null ? yearLabel(p.from) : "?"} – ${p.to != null ? yearLabel(p.to) : "present"}` : p.label };
  }));
  const setSelPins = list => { selPins = list; showSelPins(); };
  // `names`: the polity's shapes in the current borders. When its extent is
  // larger than the default view but fits the visible part at a sensible
  // altitude (China, Norway), the camera frames the extent, pin included;
  // otherwise (a small country, or one too big to fit) it frames the pin.
  const pinSelection = (label, ll, altitude = 1.0, span = null, fly = true, names = null) => {
    setSelPins(ll ? [{ label, lat: ll.lat, lng: ll.lng, from: span?.[0] ?? null, to: span?.[1] ?? null }] : []);
    if (!ll || !fly) return;
    const ext = names ? extentPoints(globe.featuresForNames(names)) : [];
    const f = ext.length && fitFor([...ext, ll], 0);
    if (f && f.altitude > altitude && f.raw <= 3.2) flyToFit([...ext, ll], altitude);
    else flyFramed(ll.lat, ll.lng, altitude);
  };

  // Phone layouts: the card covers part of the globe, so the camera aims to put
  // the target (and its pin label) in the middle of what stays visible — below
  // the card in portrait, beside it in landscape. It aims again whenever the card
  // appears or changes size (a photo landing, a later database answer), until
  // the visitor moves the globe. Desktop keeps the centre.
  const phoneLayout = () => innerWidth <= 480 || matchMedia("(pointer: coarse) and (max-height: 500px)").matches;
  const infoCardEl = document.getElementById("infoCard");
  // The part of the globe left visible: on phones, the largest rectangle that
  // nothing covers (the top row, search, the layers pill, the card, the link
  // chip, the story bar, the timeline), in portrait and in landscape alike.
  const COVERS = ["menuBtn", "topbar", "searchInput", "modesPanel", "infoCard", "linkChip", "storyBar", "timeline"];
  // `fit`: for framing a set of points (fitted as a circle, see frameFor) the
  // box whose shorter side is longest wins, not the largest one: a wide strip
  // under a peek card would shrink the view to its height.
  function visibleBox(fit = false) {
    const g = document.getElementById("globe").getBoundingClientRect();
    const whole = { l: g.left, r: g.right, t: g.top, b: g.bottom };
    if (!phoneLayout()) return { g, box: whole };
    const m = 6;
    const obs = COVERS.map(id => document.getElementById(id)).filter(e => e && !e.hidden && e.getClientRects().length)
      .map(e => e.getBoundingClientRect()).filter(r => r.width && r.height)
      .map(r => ({ l: r.left - m, r: r.right + m, t: r.top - m, b: r.bottom + m }));
    const xs = [...new Set([g.left, g.right, ...obs.flatMap(o => [o.l, o.r])])].filter(x => x >= g.left && x <= g.right).sort((a, b) => a - b);
    const ys = [...new Set([g.top, g.bottom, ...obs.flatMap(o => [o.t, o.b])])].filter(y => y >= g.top && y <= g.bottom).sort((a, b) => a - b);
    let box = null, best = 0;
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
      const w = xs[j] - xs[i];
      if (w < 80) continue;
      for (let k = 0; k < ys.length; k++) for (let n = k + 1; n < ys.length; n++) {
        const h = ys[n] - ys[k];
        const sc = fit ? Math.min(w, h) + w * h * 1e-6 : w * h;
        if (h < 80 || sc <= best) continue;
        const q = { l: xs[i], r: xs[j], t: ys[k], b: ys[n] };
        if (obs.some(o => o.l < q.r && q.l < o.r && o.t < q.b && q.t < o.b)) continue;
        box = q; best = sc;
      }
    }
    return { g, box: box || whole };
  }
  function aimFor(lat, lng, altitude, fit = false) {
    if (!phoneLayout()) return { lat, lng };
    const { g, box } = visibleBox(fit);
    // The pin's label stands ~35 px above its dot: aim the dot a little low,
    // never so high that the label goes under whatever is above the box.
    const px = (box.l + box.r) / 2;
    const py = Math.max(Math.min(box.t + 48, box.b - 12), Math.min(box.b - 12, (box.t + box.b) / 2 + 18));
    const s = Math.tan(25 * Math.PI / 180) / (g.height / 2);   // 50° vertical field of view
    const k = 1 + altitude;                                    // camera distance in globe radii
    // Angle on the globe between the view centre and a point drawn `d` px off centre.
    const arc = d => {
      const t = Math.abs(d) * s;
      const v = Math.min(1, t * k / Math.hypot(1, t));
      return Math.sign(d) * (Math.asin(v) - Math.atan(t)) * 180 / Math.PI;
    };
    const cos = Math.max(0.2, Math.cos(lat * Math.PI / 180));
    return {
      lat: Math.max(-85, Math.min(85, lat + arc(py - (g.top + g.height / 2)))),   // target low on screen: look north of it
      lng: lng - arc(px - (g.left + g.width / 2)) / cos                           // target left: look east of it
    };
  }
  let aim = null;                                  // the last framed target, while the card may still change
  function flyFramed(lat, lng, altitude, ms = 1400, fit = false) {
    aim = { lat, lng, altitude };
    const a = aimFor(lat, lng, altitude, fit);
    globe.flyTo(a.lat, a.lng, altitude, ms);
  }
  // A set of points (a link's pins, polities or routes) framed into the visible part.
  function fitFor(points, minAlt) {
    const { g, box } = visibleBox(true);
    const h = box.b - box.t, f = frameFor(points, (box.r - box.l) / h);
    const raw = f && f.altitude * g.height / h;     // before the cap: how high it would need to be
    return f && { lat: f.lat, lng: f.lng, altitude: Math.max(minAlt, Math.min(3, raw)), raw };
  }
  function flyToFit(points, minAlt = 0) {
    const f = fitFor(points, minAlt);
    if (!f) return false;
    flyFramed(f.lat, f.lng, f.altitude, 1400, true);
    aim.fit = { points, minAlt };
    return true;
  }
  // Aim again for what is visible now (a card that grew, a rotation, a resize).
  function reaim() {
    if (!aim) return;
    if (aim.fit) aim = { ...fitFor(aim.fit.points, aim.fit.minAlt), fit: aim.fit };
    const a = aimFor(aim.lat, aim.lng, aim.altitude, !!aim.fit);
    globe.flyTo(a.lat, a.lng, aim.altitude, 600);
  }
  new ResizeObserver(() => { if (phoneLayout() && !infoCardEl.hidden) reaim(); }).observe(infoCardEl);
  let reaimTimer = null;
  addEventListener("resize", () => { clearTimeout(reaimTimer); reaimTimer = setTimeout(reaim, 300); });
  // Once the visitor moves the globe, the camera is theirs.
  document.getElementById("globe").addEventListener("pointerdown", () => { aim = null; });

  // Cities through time: a city dot is permanent once founded (gone if the
  // city dies — Babylon, Carthage), and its LABEL is period-correct
  // (Byzantium → Constantinople → Istanbul). Re-pushed to the globe only
  // when the visible name-set actually changes.
  let citySig = null;
  const cityNameAt = (c, y) => {
    const p = (c.names || []).find(n => y >= (n.from ?? -1e9) && y <= (n.to ?? 1e9));
    return p ? p.name : c.name;
  };
  const refreshCities = y => {
    if (!cities || !state.layers.cities.enabled) return;
    const vis = cities
      .filter(c => (c.founded == null || y >= c.founded) && (c.until == null || y <= c.until))
      .map(c => ({ name: cityNameAt(c, y), lat: c.lat, lng: c.lng, city: c }));
    const sig = vis.map(v => v.name).join("|");
    if (sig === citySig) return;
    citySig = sig;
    globe.setCities(vis);
    state.layers.cities.count = vis.length;
    layersPanel?.updateCounts();
  };

  // Trade routes: Atlas-curated schematic corridors, shown for the years they
  // were actually in use. Shares the globe's paths layer with territory mode,
  // which is fine — the two modes are mutually exclusive.
  let tradeSig = null;
  const refreshTrade = y => {
    if (state.mode !== "discovery") return;      // territory owns the paths layer
    if (!tradeRoutes || !state.layers.trade.enabled) return;
    const inUse = r => (r.from == null || y >= r.from) && (r.to == null || y <= r.to);
    // Routes a link highlights stay drawn outside their years (greyed, with dates).
    const active = tradeRoutes.filter(r => inUse(r) || linkRoutes.has(r.id));
    const sig = active.map(r => r.id + (inUse(r) ? "" : "~")).join("|") + "#" + [...linkRoutes].join("|");
    if (sig === tradeSig) return;
    tradeSig = sig;
    globe.setTradeRoutes(active, { highlight: linkRoutes, year: y });
    state.layers.trade.count = active.length;
    layersPanel?.updateCounts();
  };

  // --- Composite globe highlights ---------------------------------------
  // The current selection and the Wars layer both want to tint countries.
  // They're merged here so they don't clobber each other — selection is
  // applied last so it always wins overlaps. (Empires-as-a-layer was dropped
  // in favour of the guided Empire Story mode; see playThread.)
  let selHighlights = [];            // what the current selection wants tinted

  const warLayerHighlights = year => {
    if (!state.layers.wars.enabled) return [];
    const out = [];
    for (const w of activeWarsFor(year)) {
      const sides = Object.values(w.sides);
      if (sides[0]?.length) out.push({ names: sides[0], side: "A" });
      if (sides[1]?.length) out.push({ names: sides[1], side: "B" });
    }
    return out;
  };

  const applyHighlights = () => {
    // Both discovery and empire-story draw on the world polygon layer;
    // us-territorial uses paths and map-quiz owns its own highlight map.
    if (state.mode === "us-territorial" || state.mode === "map-quiz") return;
    globe.setHighlights([...warLayerHighlights(state.year), ...selHighlights]);
    state.layers.wars.count = state.layers.wars.enabled ? activeWarsFor(state.year).length : null;
    layersPanel?.updateCounts();
  };
  const setSelection = groups => { selHighlights = groups || []; applyHighlights(); };

  // Resolves once the borders for the current year are on the globe (link polities need their shapes).
  let bordersYear = null, bordersWaiters = [];
  const whenBorders = () => bordersYear === state.year ? Promise.resolve()
    : new Promise(r => { bordersWaiters.push(r); setTimeout(r, 10000); });
  let usaPrefetched = false;       // idle-warm the USA territory once, after the first borders render
  let scrubbed = false;            // neighbour snapshots are warmed only once the timeline has moved, never at boot
  const timeline = createTimeline({
    initialYear: bootYear,
    onChange: async (year) => {
      state.year = year;
      syncURL();
      eraEl.textContent = `${yearLabel(year)} · ${eraFor(year)}`;

      // us-territorial mode replaces the world borders with lightweight outline
      // paths for the year. Events layer is intentionally skipped — it's free
      // latency we don't need in the focused demo, and rerenders cost per tick.
      if (state.mode === "us-territorial") {
        // One-time on entry: clear leftover event points from the last
        // normal render (they'd otherwise float, frozen, over the USA).
        if (!state.modeState.eventsCleared) {
          state.modeState.eventsCleared = true;
          globe.setEvents([]);
        }
        refreshCities(year);
        try {
          const fc = await territoryForYear(state.modeState.source, year);
          if (state.year !== year || state.mode !== "us-territorial") return;
          // Sig includes valid_from: the same state name recurs across time
          // slices with different geometry (Maine pre/post-1842), so names
          // alone would miss real border changes.
          const sig = fc.features.length + "|" +
            fc.features.map(f => f.properties.NAME + ":" + (f.valid_from ?? "")).sort().join(",");
          if (sig !== state.modeState.sig) {
            state.modeState.sig = sig;
            globe.setTerritoryOutlines(fc.features);
          }
          timeline.setStatus(`${state.modeState.label} · ${fc.features.length} polities`);
        } catch (e) { timeline.setStatus(e.message); }
        if (selection && !selection.dismissed) selection.render(year);
        return;
      }

      refreshCities(year);
      refreshTrade(year);

      // Events layer (gated). Disabled → render empty so existing points clear.
      const vis = events && state.layers.events.enabled ? events.forYear(year) : [];
      globe.setEvents(vis);
      state.layers.events.count = vis.length;
      layersPanel?.updateCounts();

      // Borders layer (gated). Disabled → push empty borders, mark cache "off"
      // so flipping back forces a fresh tessellate at the current year.
      try {
        if (state.layers.borders.enabled) {
          const { features, source } = await bordersForYear(year);
          if (state.year !== year || state.mode === "us-territorial") return;
          const sig = bordersSig(source, features);
          if (sig !== state.lastSig) {
            state.lastSig = sig;
            globe.setBorders({ features });
            if (!usaPrefetched && !navigator.connection?.saveData) {
              usaPrefetched = true;
              const warm = () => territoryAll("ohm-usa").catch(() => { /* non-fatal */ });
              window.requestIdleCallback ? requestIdleCallback(warm) : setTimeout(warm, 4000);
            }
          }
          state.layers.borders.count = features.length;
          layersPanel?.updateCounts();
          bordersYear = year;
          bordersWaiters.splice(0).forEach(r => r());
          // Borders come from fixed snapshots: say plainly when the map is not this year's.
          const snap = nearestPeriod(year);
          timeline.setStatus(`${snap === year ? "Borders" : "Borders shown: c."} ${yearLabel(snap)} · ${vis.length} events`);
          statusEl.classList.toggle("snapped", snap !== year);
          if (year !== bootYear) scrubbed = true;
          if (scrubbed) prefetchNeighbours(year);
        } else {
          if (state.lastSig !== "off") {
            state.lastSig = "off";
            globe.setBorders({ features: [] });
          }
          timeline.setStatus(`Borders off · ${vis.length} events`);
          statusEl.classList.remove("snapped");
        }
      } catch (e) {
        timeline.setStatus(e.message);
      }
      // Wars layer changes with the year — recompute only when it's on
      // (selection tint is static across years, so no per-tick cost when off).
      if (state.layers.wars.enabled) applyHighlights();
      // Selected country: re-render its card for the year being viewed,
      // unless the user closed it (see onDismiss).
      if (selection && !selection.dismissed) selection.render(year);
      if (selPins.length) showSelPins(year);    // grey when the year leaves the polity's lifetime
    },
    onSurprise: () => {
      clearSelection();
      const ev = events?.randomEvent();
      if (!ev) return;
      timeline.setYear(ev.startYear);
      globe.flyTo(ev.lat, ev.lng);
      setTimeout(() => card.openEvent(ev), 700);
    }
  });

  let wars, formations, countries, seedEvents, genEvents;
  [wars, formations, countries, cities, seedEvents, genEvents, tradeRoutes] = await dataP;
  warsData = wars;
  events = createEvents([...seedEvents, ...genEvents]);
  // A closed card stays closed while the year steps; the selection's tint and
  // slider span stay, and any new pick (a fresh selection) opens the card again.
  // Closing the card also takes the selection's pin away (and nothing brings the card back).
  card = createInfoCard({ countries, onDismiss: () => { if (selection) selection.dismissed = true; setSelPins([]); aim = null; } });
  buildLegend();
  initPanel();

  // --- Unified country selection ----------------------------------------
  // Major-event marks: curated events whose coordinates fall inside the
  // country's current border polygon(s). (DB-flagged events: future work.)
  const countryMarkers = names => {
    const feats = globe.featuresForNames(names);
    if (!feats.length) return [];
    const seen = new Set();
    return events.all()
      .filter(e => feats.some(f => featureContains(f, e.lng, e.lat)))
      .filter(e => { const k = e.startYear + "|" + e.title; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.startYear - b.startYear)
      .slice(0, 80)
      .map(e => ({ year: e.startYear, label: e.title }));
  };

  const scopeSlider = (names, from, to, label) => {
    timeline.clearOverlays();
    if (from != null) timeline.setSpan(from, to, label);
    timeline.setMarkers(countryMarkers(names));
  };

  function selectCurated(entry) {
    exitTerritory();
    selLabel = entry.name;
    const names = [entry.name, ...(entry.aliases || [])];
    const isUSA = names.some(n => {
      const x = n.toLowerCase();
      return x.includes("united states") || x === "usa" || x === "us";
    });

    const ll = entry.lat != null ? { lat: entry.lat, lng: entry.lng }
      : shapesCentre(globe.featuresForNames(names));
    if (!isUSA) setSelection([{ names, side: "A" }]);
    selection = {
      names,
      render: y => card.openEntry(entry, y,
        activeWarsFor(y).filter(w => names.some(n => belligerent(w, n))))
    };

    if (isUSA) {
      // us-territorial mode — watch the USA grow 1776 → today.
      state.mode = "us-territorial";
      state.modeState = { source: "ohm-usa", label: "🇺🇸 USA territorial growth", sig: null, eventsCleared: false };
      state.lastSig = null;
      layersPanel?.refresh();
      // setTerritoryOutlines (driven by the first onChange below) clears
      // both highlights AND the selected-key, so no need to do it here.
      setContext("🇺🇸 USA — territorial growth");
      setSelPins([]);
      // The mainland, in the part of the globe the card leaves visible on phones.
      flyFramed(39, -98, 1.6);
      timeline.clearOverlays();
      timeline.setSpan(1776, 2025, "USA territorial growth");
      timeline.setMarkers(
        [1776, 1783, 1803, 1819, 1845, 1848, 1853, 1867, 1898, 1912, 1959]
          .map(y => ({ year: y, label: "US expansion" })));
      timeline.setYear(Math.max(1776, Math.min(2025, timeline.currentYear())));
    } else {
      setContext(entry.name);
      const eras = entry.eras || [];
      const from = eras.length ? Math.min(...eras.map(e => e.from)) : null;
      const to = eras.length ? Math.max(...eras.map(e => (e.to >= 9999 ? 2025 : e.to))) : 2025;
      pinSelection(entry.name, ll, 1.0, eras.length ? [from, to >= 2025 ? null : to] : null, true, names);
      scopeSlider(names, from, to, entry.name);
      // Drive one onChange so borders refresh (incl. leaving territory mode)
      // and the card renders for the current year.
      timeline.setYear(timeline.currentYear());
    }
  }

  // `fly: false` when the same polity is already pinned and framed (the slice
  // answered first and the database row arrives later).
  async function selectDbPolity(p, { fly = true } = {}) {
    const mine = ++dbSelectionSeq;
    const wasT = exitTerritory();
    // Rows from the committed slice (database unreachable) carry their border names.
    let resolved = p._names || [];
    if (!p._slice) try { resolved = await resolvedNames(p.id); } catch { /* optional */ }
    if (mine !== dbSelectionSeq) return;       // a newer pick already started
    const names = [...new Set([
      p.canonical_name,
      ...((p.polity_name || []).map(n => n.name)),
      ...resolved
    ].filter(Boolean))];
    setContext("🗄 " + p.canonical_name);
    const ll = (p.lat != null) ? { lat: p.lat, lng: p.lng } : shapesCentre(globe.featuresForNames(names));
    pinSelection(p.canonical_name, ll, 1.0, [p.start_year, p.end_year], fly, names);
    setSelection([{ names, side: "A" }]);
    scopeSlider(names, p.start_year, p.end_year ?? p.start_year ?? 2025, p.canonical_name);
    let detail = null;
    if (!p._slice) try { detail = await polityDetail(p.id); } catch { /* basic */ }
    if (mine !== dbSelectionSeq) return;       // newer pick won the race
    selection = { names, render: y => card.openDbPolity(p, detail, y) };
    selLabel = p.canonical_name;
    syncURL();
    if (wasT) timeline.setYear(timeline.currentYear());
    else selection.render(timeline.currentYear());
  }

  // Click on a state/territory outline in us-territorial mode → open its
  // polity card WITHOUT leaving the mode (states exist as DB polities from
  // the OHM pilot load).
  let territoryClickSeq = 0;
  pickTerritory = async name => {
    if (!name) return;
    const mine = ++territoryClickSeq;
    setContext("🇺🇸 " + name);
    try {
      const hits = await searchPolities(name, 5);
      const p = hits.find(h => h.canonical_name.toLowerCase() === name.toLowerCase()) || hits[0];
      if (!p || mine !== territoryClickSeq) return;
      let detail = null;
      try { detail = await polityDetail(p.id); } catch { /* basic */ }
      if (mine !== territoryClickSeq) return;
      selection = { names: [name], render: y => card.openDbPolity(p, detail, y) };
      selection.render(timeline.currentYear());
    } catch { /* DB unreachable — context label is enough feedback */ }
  };

  // City label click → "in <year>, part of <polity>". The containment test
  // runs against the on-screen border polygons — a live display lookup over
  // the GPL layer, never persisted or served (licensing guardrail).
  pickCity = d => {
    if (state.mode === "map-quiz") return;
    const host = globe.allFeatures().find(f => featureContains(f, d.lng, d.lat));
    setContext("📍 " + d.name);       // else the header keeps naming the previous country
    // The city card replaces the polity's: the pin moves to the city, and a year
    // step must not bring the polity's card back over it.
    if (selection) selection.dismissed = true;
    const c = d.city || d;
    pinSelection(d.name, { lat: d.lat, lng: d.lng }, globe.altitude(), [c.founded ?? null, c.until ?? null]);
    card.openCity(d.name, d.city || d, state.year, host ? featureName(host) : null);
  };

  // A highlighted route's card. The link's pins, routes, era band and the
  // selection's tint stay; a year step re-renders the route's card, not the polity's.
  openRoute = r => {
    if (state.mode === "map-quiz" || !r) return;
    selection = { names: selection?.names || [], fromLink: selection?.fromLink, render: y => card.openRoute(r, y) };
    selection.render(state.year);
    // On a phone the card covers the top: bring the route into what is left.
    if (phoneLayout()) flyToFit(r.points.map(([lng, lat]) => ({ lat, lng })));
  };

  // A link's pin: its own card. Nothing the link brought is dropped.
  openLinkPin = p => {
    if (state.mode === "map-quiz" || !p) return;
    selection = { names: selection?.names || [], fromLink: selection?.fromLink, render: () => card.openLinkPin(p) };
    selection.render(state.year);
  };

  pickFeature = f => {
    if (state.mode === "map-quiz") return;
    const wasT = exitTerritory();
    const name = featureName(f);
    // A shape that is one of the link's polities under the map's own name
    // ("Kingdom of David and Solomon" for Q3185305): the registry card and name stay.
    const lp = linkSel?.groups.find(g => g.names.some(n => sameName(n, name)));
    if (lp) { reselectLink(lp, name); return; }
    const entry = card.resolve(name);
    if (entry) { selectCurated(entry); return; }
    if (wasT) timeline.setYear(timeline.currentYear());
    setContext(name);
    pinSelection(name, shapesCentre([f]), 0.9, null, true, [name]);
    setSelection([{ names: [name], side: "A" }]);
    scopeSlider([name], null, null, name);
    selection = {
      names: [name],
      render: y => card.openCountry(f, y, activeWarsFor(y).filter(w => belligerent(w, name)))
    };
    selLabel = name;
    syncURL();
    selection.render(timeline.currentYear());
  };
  // A polity by name (`sel=`): the first exact database hit, preferring the row
  // whose years cover the viewed year; the committed slice when the database
  // is unreachable or not configured.
  // If the database has not answered within a second (a cold start took 10 s),
  // the slice's row is shown meanwhile, so the pin and the fly-to do not wait;
  // the database row then fills in the card without moving the camera again.
  async function selectByName(name) {
    const year = timeline.currentYear();
    let early = null, done = false;
    const slow = setTimeout(async () => {
      try { early = await sliceByName(name, year); } catch { /* no slice */ }
      if (early && !done) selectDbPolity(early);
    }, 1000);
    let p = null;
    try {
      const hits = await searchPolities(name, 8);
      const exact = hits.filter(h => h.canonical_name.toLowerCase() === name.toLowerCase());
      p = rowForYear(exact, year) || hits[0] || null;
    } catch { /* database down — try the slice */ }
    done = true;
    clearTimeout(slow);
    if (p) selectDbPolity(p, { fly: !(early && early.wikidata_qid === p.wikidata_qid) });
    else if (!early) try { p = await sliceByName(name, year); if (p) selectDbPolity(p); } catch { /* no slice either */ }
  }
  // --------------------------------------------------------------------

  createWarsPanel({
    wars,
    onSelectWar: w => {
      clearSelection();
      setSelection(warHighlights(w));
      setContext("⚔ " + w.name);
      if (w.lat != null) globe.flyTo(w.lat, w.lng, 1.3);
      timeline.setSpan(w.start, w.end, w.name);
      timeline.setMarkers((w.snapshots || []).map(y => ({ year: y, label: w.name })));
    },
    onJumpYear: y => timeline.setYear(y)
  });

  createFormationsPanel({
    formations,
    onSelect: f => {
      clearSelection();
      setSelection(formationHighlights(f));
      setContext("⬡ " + f.name);
      if (f.lat != null) globe.flyTo(f.lat, f.lng, 1.3);
      timeline.setSpan(f.start, f.end, f.name);
      timeline.setMarkers(f.stages.map(s => ({ year: s.year, label: s.label })));
    },
    onJumpYear: y => timeline.setYear(y)
  });

  // Guided country story: search a country → fly there → step its narrative.
  const story = createStory({
    wars,
    formations,
    onBeat: (bt, country, beats) => {
      const names = [country.name, ...(country.aliases || [])];
      timeline.setYear(bt.year);
      setSelection([{ names, side: "A" }]);
      setContext("📖 " + country.name);
      const ll = country.lat != null ? { lat: country.lat, lng: country.lng } : shapesCentre(globe.featuresForNames(names));
      setSelPins(ll ? [{ label: country.name, ...ll, from: null, to: null }] : []);
      timeline.setSpan(beats[0].year, beats[beats.length - 1].year, country.name);
      timeline.setMarkers(beats.map(b => ({ year: b.year, label: b.label })));
      card.openEntry(country, bt.year,
        activeWarsFor(bt.year).filter(w => names.some(n => belligerent(w, n))));
    },
    onExit: () => {
      document.getElementById("storyPicker").hidden = true;
      if (state.mode === "empire-story") { state.mode = "discovery"; state.modeState = null; layersPanel?.refresh(); }
      clearSelection();
      timeline.clearOverlays();
      setContext(DEFAULT_CONTEXT, false);
    }
  });

    // Year to park the slider on for a polity: when it began if it has
    // ended; for still-extant states use a modern year (their Wikidata
    // inception is often an ancient conflation, e.g. France = 481).
  const repYear = p => p.end_year != null
    ? (p.start_year ?? (p.end_year - 200))   // unknown start (e.g. Roman Empire): park ~midpoint
    : (p.start_year != null && p.start_year > 1700 ? p.start_year : 2015);

  // Thread member roles read badly as story labels ("MEMBER"); curated stories
  // use words like Era/War, so map roles onto the same register.
  const ROLE_LABEL = { core: "Core", shared: "Shared", member: "Stage" };

  async function playThread(th, atPolityId, startBeat) {
    selLabel = null;                 // the thread, not a selection, owns the URL
    storyThread = th.slug || null;
    storyBeat = 0;
    document.getElementById("storyPicker").hidden = true;
    // Playing a thread IS Empire Story mode — reflect it on the mode radio
    // whether we got here from the picker or the search bar.
    if (state.mode !== "empire-story") { state.mode = "empire-story"; state.modeState = null; layersPanel?.refresh(); }
    const members = await threadMembers(th.id);
    const beats = members
      .filter(m => m.polity)
      .map(m => ({
        year: repYear(m.polity),
        kind: ROLE_LABEL[m.role] || "Stage",
        label: m.polity.canonical_name,
        polity: m.polity
      }))
      .sort((a, b) => a.year - b.year || (a.polity.start_year ?? 0) - (b.polity.start_year ?? 0));
    const startIndex = Number.isFinite(startBeat)
      ? Math.max(0, Math.min(beats.length - 1, startBeat))
      : atPolityId ? Math.max(0, beats.findIndex(b => b.polity.id === atPolityId)) : 0;
    const detailCache = new Map();
    const nameCache = new Map();
    let beatSeq = 0;                            // bail stale beat async work
    story.startCustom("🧵 " + th.display_name, beats, async (bt, beatIdx) => {
      const mine = ++beatSeq;
      storyBeat = beatIdx || 0;
      syncURL();
      const mp = bt.polity;
      if (!nameCache.has(mp.id)) {
        let resolved = [];
        try { resolved = await resolvedNames(mp.id); } catch { /* optional */ }
        if (mine !== beatSeq) return;           // user stepped on past us
        nameCache.set(mp.id, [...new Set([
          mp.canonical_name,
          ...((mp.polity_name || []).map(n => n.name)),
          th.display_name,            // border layer often uses the enduring name
          ...resolved                 // exact historical-basemaps spellings
        ].filter(Boolean))]);
      }
      const names = nameCache.get(mp.id);
      setContext("🧵 " + th.display_name + " — " + mp.canonical_name);
      const ll = mp.lat != null ? { lat: mp.lat, lng: mp.lng } : shapesCentre(globe.featuresForNames(names));
      pinSelection(mp.canonical_name, ll, 1.2);
      setSelection([{ names, side: "A" }]);
      timeline.clearOverlays();
      timeline.setSpan(beats[0].year, beats[beats.length - 1].year, th.display_name);
      timeline.setMarkers(beats.map(b => ({ year: b.year, label: b.label })));
      timeline.setYear(bt.year);
      if (!detailCache.has(mp.id)) {
        try { detailCache.set(mp.id, await polityDetail(mp.id)); }
        catch { detailCache.set(mp.id, null); }
      }
      if (mine !== beatSeq) return;             // newer beat already past us
      selection = { names, render: y => card.openDbPolity(mp, detailCache.get(mp.id), y) };
      selection.render(timeline.currentYear());
    }, startIndex);
  }

  createSearch({
    catalog: card.catalog,
    onPick: async hit => {
      story.exit?.();
      // Curated, thread, and single-polity picks share the selection model.
      if (hit.kind === "curated") { selectCurated(hit.entry); return; }
      if (hit.kind === "thread") { await playThread(hit.thread, hit.atPolityId); return; }
      await selectDbPolity(hit.polity);
    }
  });

  // --- Map Quiz mode ----------------------------------------------------
  // exitQuiz is the single teardown path (quiz ✕/Done call it via onExit;
  // switching modes calls quiz.exit() which routes here too). It restores the
  // layer visibility the quiz temporarily overrode.
  const exitQuiz = () => {
    if (state.mode !== "map-quiz") return;
    const prev = state.modeState?.prevLayers || { cities: true, events: true };
    state.layers.cities.enabled = prev.cities;
    state.layers.events.enabled = prev.events;
    state.mode = "discovery";
    state.modeState = null;
    document.body.classList.remove("quiz-active");
    globe.setHighlights([]);
    citySig = null;
    setContext(DEFAULT_CONTEXT, false);
    layersPanel?.refresh();
    timeline.setYear(timeline.currentYear());   // re-render borders/cities/events
  };
  quiz = createQuiz({
    globe,
    flyTo: (lat, lng, alt) => globe.flyTo(lat, lng, alt),
    onExit: exitQuiz,
    events: events.all()        // curated ones drive the chronology game
  });
  const enterQuiz = () => {
    if (state.mode === "map-quiz") return;
    story.exit?.();
    clearSelection();                    // also exits territory mode
    state.modeState = { prevLayers: {
      cities: state.layers.cities.enabled, events: state.layers.events.enabled } };
    state.layers.cities.enabled = false;
    state.layers.events.enabled = false;
    globe.setCities([]); globe.setEvents([]);
    state.mode = "map-quiz";
    document.body.classList.add("quiz-active");
    setContext("🎯 Map Quiz");
    timeline.clearOverlays();
    timeline.setYear(2025);              // present-day borders as the quiz basis
    layersPanel?.refresh();
    quiz.start();
  };

  // --- Empire Story mode ------------------------------------------------
  // Clicking the radio opens a thread picker; choosing an empire runs the
  // existing playThread walkthrough. (Threads are also reachable from search;
  // both paths land in this mode.)
  let threadsCache = null;
  async function showStoryPicker() {
    const picker = document.getElementById("storyPicker");
    picker.hidden = false;
    picker.innerHTML = `
      <div class="sp-head"><span class="sp-title">🧵 Empire Story</span>
        <button class="sp-exit" title="Exit">✕</button></div>
      <div class="sp-hint">Pick an empire to walk its story through time.</div>
      <div class="sp-list">Loading threads…</div>`;
    picker.querySelector(".sp-exit").onclick = () => story.exit();
    if (!threadsCache) { try { threadsCache = await allThreads(); } catch { threadsCache = []; } }
    const list = picker.querySelector(".sp-list");
    if (!list) return;                  // picker was closed while loading
    if (!threadsCache.length) {
      list.innerHTML = `<div class="sp-empty">Couldn't load empires — the database may be unavailable. Try the search bar instead.</div>`;
      return;
    }
    const byRegion = new Map();
    for (const t of threadsCache) {
      const r = t.region || "Other";
      if (!byRegion.has(r)) byRegion.set(r, []);
      byRegion.get(r).push(t);
    }
    list.innerHTML = [...byRegion].map(([region, ts]) =>
      `<div class="sp-region">${region}</div>` +
      ts.map(t => `<button class="sp-thread" data-id="${t.id}">${t.display_name}</button>`).join("")
    ).join("");
    list.querySelectorAll(".sp-thread").forEach(b => b.onclick = () => {
      const th = threadsCache.find(t => String(t.id) === b.dataset.id);
      if (th) playThread(th);           // hides the picker + enters the mode
    });
  }
  const enterEmpireStory = () => {
    if (state.mode === "empire-story") return;
    story.exit?.();                     // clear any search-started story first
    clearSelection();
    state.mode = "empire-story";
    state.modeState = null;
    setContext("🧵 Empire Story");
    layersPanel?.refresh();
    showStoryPicker();
  };

  // Modes & Layers panel — assigned AFTER selectCurated/clearSelection/globe/
  // timeline so the handlers can reference them directly. Declared up top as
  // `let` because onChange fires (and null-chains) before this line runs.
  layersPanel = createLayersPanel({
    state,
    onModeChange: mode => {
      if (mode === state.mode) return;
      if (state.mode === "map-quiz") quiz.exit();       // tear down quiz before any switch
      if (state.mode === "empire-story") story.exit();  // hides picker/story, resets to discovery
      if (mode === "map-quiz") { enterQuiz(); return; }
      if (mode === "empire-story") { enterEmpireStory(); return; }
      if (mode === "us-territorial") {
        const usaEntry = card.resolve("United States");
        if (usaEntry) selectCurated(usaEntry);
      } else if (mode === "discovery") {
        // Full reset — mirrors the story.onExit pattern so the timeline span,
        // markers, and top-bar context all return to default. (clearSelection
        // alone just removes the selection; the visual overlays would persist.)
        clearSelection();
        timeline.clearOverlays();
        setContext(DEFAULT_CONTEXT, false);
      }
    },
    onLayerToggle: (id, enabled) => {
      if (!state.layers[id]) return;
      state.layers[id].enabled = enabled;
      if (id === "cities") {
        citySig = null;
        if (enabled) refreshCities(state.year);
        else {
          globe.setCities([]);
          state.layers.cities.count = 0;
          layersPanel.updateCounts();
        }
      }
      else if (id === "wars") applyHighlights();      // belligerents, no border reload
      else if (id === "pins") { globe.setLinkPins(enabled ? linkPins : []); updateLinkChip(); }
      else if (id === "trade") {
        layersPanel.refresh(); updateLinkChip();     // the link's route count says whether they show
        tradeSig = null;
        if (enabled) refreshTrade(state.year);
        else {
          globe.setTradeRoutes([]);
          state.layers.trade.count = null;
          layersPanel.updateCounts();
        }
      }
      else timeline.setYear(timeline.currentYear());   // borders + events re-render via onChange
    },
  });
  layersPanel.updateCounts();

  // --- Link view v2 -----------------------------------------------------
  // Pins a link carries are a pointer someone sent, not Atlas facts: drawn in
  // their own style, counted with a Clear control, never stored or sent anywhere.
  const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Atlas's own name for a pin whose id it knows (atlas:<city>, period-correct), else the link's label.
  const pinLabel = p => {
    if (p.id?.startsWith("atlas:")) {
      const c = cities.find(c => [c.name, ...(c.names || []).map(n => n.name)].some(n => "atlas:" + slug(n) === p.id));
      if (c) return cityNameAt(c, state.year);
    }
    return p.label;
  };
  const showLinkPins = pins => {
    linkPins = pins;
    state.layers.pins.count = pins.length || null;
    globe.setLinkPins(state.layers.pins.enabled ? pins : []);
    layersPanel.refresh();
    updateLinkChip();
  };
  // Always on screen while the link's view is on, above the timeline (the card
  // can cover the layers pill on a phone): what the link added, and Clear.
  const chip = document.getElementById("linkChip");
  const timelineEl = document.getElementById("timeline");
  // Above the timeline's left end; in phone landscape (about 270 pt of height)
  // under the layers pill instead, so the strip above the timeline stays free.
  const modesEl = document.getElementById("modesPanel");
  const landscapePhone = matchMedia("(pointer: coarse) and (max-height: 500px) and (orientation: landscape)");
  let chipLong = "", chipShort = "";
  const placeChip = () => {
    if (chip.hidden) return;
    const side = landscapePhone.matches && modesEl.classList.contains("collapsed");
    chip.querySelector(".lc-text").textContent = side ? chipShort : chipLong;
    if (side) {
      const m = modesEl.getBoundingClientRect();
      Object.assign(chip.style, { left: m.left + "px", top: m.bottom + 6 + "px", bottom: "", maxWidth: Math.max(m.width, 190) + "px" });
    } else {
      // Above the timeline's left end, moved right past anything open in that
      // band (the expanded layers panel, the card, the story bar), never over it.
      const t = timelineEl.getBoundingClientRect();
      Object.assign(chip.style, { left: t.left + "px", top: "", bottom: innerHeight - t.top + 6 + "px", maxWidth: "" });
      const c = chip.getBoundingClientRect();
      const obs = ["modesPanel", "infoCard", "storyBar"].map(id => document.getElementById(id))
        .filter(e => e && !e.hidden && e.getClientRects().length).map(e => e.getBoundingClientRect())
        .filter(o => o.width && o.top < c.bottom && o.bottom > c.top).sort((a, b) => a.left - b.left);
      let left = t.left, right = t.right;
      for (const o of obs) {
        if (o.right <= left || o.left >= right) continue;
        if (o.left - left >= Math.min(c.width, 220)) { right = o.left - 8; break; }
        left = o.right + 8;
      }
      if (right - left >= 160) Object.assign(chip.style, { left: left + "px", maxWidth: right - left + "px" });
    }
  };
  function updateLinkChip() {
    chip.hidden = !linkOn;
    if (!linkOn) return;
    const n = (k, one, many) => k ? `${k} ${k === 1 ? one : many}` : "";
    const parts = [
      linkPins.length && (n(linkPins.length, "pin", "pins") + (state.layers.pins.enabled ? "" : " (hidden)")),
      linkRoutes.size && (n(linkRoutes.size, "route", "routes") + (state.layers.trade.enabled ? "" : " (layer off)"))
    ].filter(Boolean);
    chipLong = ["From the link you opened", ...parts].join(" · ");
    chipShort = parts.length ? "Link: " + parts.join(" · ") : "From a link";
    placeChip();
  }
  new ResizeObserver(placeChip).observe(timelineEl);
  new ResizeObserver(placeChip).observe(modesEl);
  new ResizeObserver(placeChip).observe(infoCardEl);
  addEventListener("resize", placeChip);
  // The button is never rebuilt; touch clears on touchend so a re-layout between
  // touchstart and click cannot swallow the tap.
  const chipClear = chip.querySelector(".lc-clear");
  chipClear.onclick = () => layersPanel.onClearPins();
  chipClear.addEventListener("touchend", e => { e.preventDefault(); layersPanel.onClearPins(); });
  const showLinkRoutes = ids => {
    linkRoutes = new Set(ids);
    state.layers.pins.routes = ids.length || null;
    if (ids.length && !state.layers.trade.enabled) state.layers.trade.enabled = true;
    tradeSig = null;
    refreshTrade(state.year);
    layersPanel.refresh();
    updateLinkChip();
  };
  // Clear takes away everything the link brought: its pins, route highlights,
  // era band and fragment, and its polities while they are still the selection.
  layersPanel.onClearPins = () => {
    if (!linkOn) return;
    linkOn = false;
    const ls = linkSel;
    linkSel = null;
    timeline.clearLinkSpan();
    showLinkPins([]);
    if (linkRoutes.size) showLinkRoutes([]);
    if (selection?.fromLink) {
      clearSelection();
      card.close();
      timeline.clearOverlays();
      setContext(DEFAULT_CONTEXT, false);
    } else if (ls?.quiet && ls.points.some(p => selPins.includes(p))) {
      // The link's polities arrived beside the visitor's own pick: drop just them.
      setSelPins(selPins.filter(p => !ls.points.includes(p)));
      setSelection(selection?.names?.length ? [{ names: selection.names, side: "A" }] : []);
    }
    history.replaceState(null, "", location.pathname + location.search);
    updateLinkChip();
    syncURL();
  };
  // Up to two polities from a link's qid: highlighted through their resolved
  // border names, each with the red selection pin; the card shows the first.
  // `quiet`: the visitor has already opened something else; the polities are
  // highlighted and pinned, but their card does not take over.
  function selectLinkPolities(rows, quiet = false) {
    exitTerritory();
    const groups = rows.map(p => ({ p, names: [...new Set([p.canonical_name, ...p._names])] }));
    const points = groups.map(({ p, names }) => {
      const ll = p.lat != null ? { lat: p.lat, lng: p.lng } : shapesCentre(globe.featuresForNames(names));
      return ll && { label: p.canonical_name, ...ll, from: p.start_year, to: p.end_year };
    }).filter(Boolean);
    linkSel = { groups, points, quiet };
    if (quiet) {
      setSelection([...(selection?.names?.length ? [{ names: selection.names, side: "A" }] : []),
        ...groups.map(x => ({ names: x.names, side: "A" }))]);
      selPins = [...selPins, ...points];
      showSelPins();
    } else reselectLink(groups[0]);
    return points;
  }
  // The link's polities as the selection again, with `g`'s registry card (and the
  // map's own name for it, when a tap on its shape brought it back).
  function reselectLink(g, alias = null) {
    const { groups, points } = linkSel;
    setSelection(groups.map(x => ({ names: x.names, side: "A" })));
    setSelPins(points);
    setContext("🗄 " + groups.map(x => x.p.canonical_name).join(" · "));
    scopeSlider(g.names, g.p.start_year, g.p.end_year ?? 2025, g.p.canonical_name);
    const shown = alias && !sameName(alias, g.p.canonical_name) ? alias : null;
    selection = { names: groups.flatMap(x => x.names), render: y => card.openDbPolity(g.p, null, y, { alias: shown }), fromLink: true };
    selLabel = g.p.canonical_name;
    syncURL();
    selection.render(timeline.currentYear());
  }

  async function applyLink(v) {
    linkOn = true;
    showLinkPins(v.pins.map(p => ({ id: p.id, lat: p.lat, lng: p.lng, label: pinLabel(p) })));
    if (v.span) timeline.setLinkSpan(v.span[0], v.span[1], spanLabel(v.span));
    // Camera: at= wins (exactly), else the pins' bounding box, else the polities,
    // else the routes, else leave it; on phones fitted to what the card leaves visible.
    // Routes: only ids Atlas knows; the trade layer turns on to show them.
    const routes = v.routes.map(id => tradeRoutes?.find(r => r.id === id)).filter(Boolean);
    if (routes.length) showLinkRoutes(routes.map(r => r.id));
    // Every point of a highlighted route counts, its open end included, so the
    // routes, their names and the open end's label are in view with the pins.
    const routePoints = routes.flatMap(r => r.points.map(([lng, lat]) => ({ lat, lng })));
    const base = [...v.pins, ...routePoints];
    // A tap or drag before the polities arrive (the registry slice and the
    // borders take a moment on a phone) wins: it is not undone below.
    const before = selection;
    let touched = false;
    document.getElementById("globe").addEventListener("pointerdown", () => { touched = true; }, { once: true });
    if (!v.at && base.length) flyToFit(base);
    else if (v.at) globe.flyTo(v.at.lat, v.at.lng, v.at.altitude);
    if (!v.qids.length) return;
    // The registry slice loads only now, and only because the link names polities.
    const rows = (await Promise.all(v.qids.map(q => sliceByQid(q, state.year).catch(() => null)))).filter(Boolean);
    if (!rows.length) return;
    await whenBorders();
    // On a phone the polity's card opens as a one-line peek: the reader came to
    // see the map; a tap on the card opens it.
    const quiet = selection !== before;
    if (phoneLayout() && !quiet) card.peek();
    const points = selectLinkPolities(rows, quiet);
    if (!v.at && !touched) flyToFit([...base, ...points], base.length ? 0 : 1);
  }

  // Permalink restore — ?year=1503&sel=France, or ?mode=us-territorial.
  // The shared year is already on the slider (initialYear); a selection may
  // still move it (the USA clamps to 1776+).
  if (link) applyLink(link);
  // A new link pasted into this tab only changes the fragment: start it fresh.
  addEventListener("hashchange", () => { if (parseLink(location.hash)) location.reload(); });
  const qMode = bootParams.get("mode");
  const qSel = bootParams.get("sel");
  const qThread = bootParams.get("thread");
  const qBeat = parseInt(bootParams.get("beat"), 10);
  if (qThread) {
    // Shared Empire Story: resolve the slug, then jump straight to that stage.
    allThreads().then(ts => {
      const th = ts.find(t => t.slug === qThread);
      if (th) playThread(th, null, Number.isFinite(qBeat) ? qBeat : 0);
      else enterEmpireStory();          // unknown slug — fall back to the picker
    }).catch(() => { /* DB down — leave the globe in discovery */ });
  } else if (qMode === "us-territorial") {
    const e = card.resolve("United States");
    if (e) selectCurated(e);
  } else if (qMode === "empire-story") {
    enterEmpireStory();
  } else if (qSel) {
    const e = card.resolve(qSel);
    if (e) selectCurated(e);
    else selectByName(qSel);
  }
  // Render the data layers for the current year (borders reuse the cached or
  // in-flight snapshot and the sig is unchanged, so no second tessellate). A
  // restored thread resolves later and drives its own year from the beat.
  timeline.setYear(timeline.currentYear());
}

boot().catch(err => {
  document.getElementById("status").textContent = "Init failed: " + err.message;
  console.error(err);
});
