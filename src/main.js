// App bootstrap: wires globe, timeline, events, wars panel, and info card.
// Single time variable drives everything: borders snap to nearest snapshot,
// events fade in/out by year proximity.

import {
  loadJSON, loadOptionalJSON, eraFor, yearLabel, featureName, CATEGORIES
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
  },
  selection: null,
  modeState: null,
  lastSig: null,
};
let warsData = [];               // wars dataset (was state.wars before Phase 1)

const bordersSig = (source, features) => source + "|" + features.length;
const eraEl = document.getElementById("era");
const contextEl = document.getElementById("context");

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

function featureCentroid(feature) {
  let best = null, bestA = -1;
  for (const poly of polysOf(feature.geometry)) {
    const r = poly[0];
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of r) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
    const area = (c - a) * (d - b);
    if (area > bestA) { bestA = area; best = [(a + c) / 2, (b + d) / 2]; }
  }
  return best ? { lng: best[0], lat: best[1] } : null;
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
  // Snapshot the URL params before anything can replaceState over them.
  const bootParams = new URLSearchParams(location.search);
  const [wars, formations, countries, cities, seedEvents, genEvents] = await Promise.all([
    loadJSON("data/wars.json"),
    loadJSON("data/formations.json"),
    loadJSON("data/countries.json"),
    loadJSON("data/cities.json"),
    loadJSON("data/events.json"),
    loadOptionalJSON("data/events.generated.json", [])
  ]);
  warsData = wars;

  const events = createEvents([...seedEvents, ...genEvents]);
  const card = createInfoCard({ countries });
  buildLegend();
  initPanel();

  // Country selection is unified: clicking a polygon or picking from search
  // produce the SAME scoped state — name on the slider, major-event marks,
  // and a period card that re-renders live as you move through time.
  let selection = null;            // { names, render(year) }
  let dbSelectionSeq = 0;          // bail stale selectDbPolity awaits
  let pickFeature = () => {};
  let pickTerritory = () => {};    // us-territorial path click (late-bound like pickFeature)
  let pickCity = () => {};         // city label click (late-bound)
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
    layersPanel?.refresh();
    return true;
  };
  // Shareable view: the URL always mirrors {year, mode, selection} so any
  // moment on the globe can be sent as a link. Debounced — scrubbing
  // shouldn't write history on every tick.
  let selLabel = null;
  let urlTimer = null;
  const syncURL = () => {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      const q = new URLSearchParams();
      q.set("year", String(state.year));
      if (state.mode !== "discovery") q.set("mode", state.mode);
      if (selLabel) q.set("sel", selLabel);
      history.replaceState(null, "", "?" + q.toString());
    }, 300);
  };

  const clearSelection = () => {
    selection = null;
    selLabel = null;
    syncURL();
    setSelection([]);                 // clears selection tint; layer tints re-apply
    if (exitTerritory()) timeline.setYear(timeline.currentYear());
  };

  const globe = createGlobe(document.getElementById("globe"), {
    onCountryClick: f => pickFeature(f),
    onEventClick: ev => { clearSelection(); card.openEvent(ev); },
    onTerritoryClick: name => pickTerritory(name),
    onCityClick: d => pickCity(d)
  });

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
    if (!state.layers.cities.enabled) return;
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

  const timeline = createTimeline({
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
        if (selection) selection.render(year);
        return;
      }

      refreshCities(year);

      // Events layer (gated). Disabled → render empty so existing points clear.
      const vis = state.layers.events.enabled ? events.forYear(year) : [];
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
          }
          state.layers.borders.count = features.length;
          layersPanel?.updateCounts();
          timeline.setStatus(`borders ${source} · ${vis.length} events`);
        } else {
          if (state.lastSig !== "off") {
            state.lastSig = "off";
            globe.setBorders({ features: [] });
          }
          timeline.setStatus(`borders off · ${vis.length} events`);
        }
      } catch (e) {
        timeline.setStatus(e.message);
      }
      // Wars layer changes with the year — recompute only when it's on
      // (selection tint is static across years, so no per-tick cost when off).
      if (state.layers.wars.enabled) applyHighlights();
      // Selected country: re-render its card for the year being viewed.
      if (selection) selection.render(year);
    },
    onSurprise: () => {
      clearSelection();
      const ev = events.randomEvent();
      if (!ev) return;
      timeline.setYear(ev.startYear);
      globe.flyTo(ev.lat, ev.lng);
      setTimeout(() => card.openEvent(ev), 700);
    }
  });

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

    const feats = globe.featuresForNames(names);
    const ll = entry.lat != null ? { lat: entry.lat, lng: entry.lng }
      : feats[0] ? featureCentroid(feats[0]) : null;
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
      globe.flyTo(39, -98, 1.6);
      timeline.clearOverlays();
      timeline.setSpan(1776, 2025, "USA territorial growth");
      timeline.setMarkers(
        [1776, 1783, 1803, 1819, 1845, 1848, 1853, 1867, 1898, 1912, 1959]
          .map(y => ({ year: y, label: "US expansion" })));
      timeline.setYear(Math.max(1776, Math.min(2025, timeline.currentYear())));
    } else {
      setContext(entry.name);
      if (ll) globe.flyTo(ll.lat, ll.lng, 1.0);
      const eras = entry.eras || [];
      const from = eras.length ? Math.min(...eras.map(e => e.from)) : null;
      const to = eras.length ? Math.max(...eras.map(e => (e.to >= 9999 ? 2025 : e.to))) : 2025;
      scopeSlider(names, from, to, entry.name);
      // Drive one onChange so borders refresh (incl. leaving territory mode)
      // and the card renders for the current year.
      timeline.setYear(timeline.currentYear());
    }
  }

  async function selectDbPolity(p) {
    const mine = ++dbSelectionSeq;
    const wasT = exitTerritory();
    let resolved = [];
    try { resolved = await resolvedNames(p.id); } catch { /* optional */ }
    if (mine !== dbSelectionSeq) return;       // a newer pick already started
    const names = [...new Set([
      p.canonical_name,
      ...((p.polity_name || []).map(n => n.name)),
      ...resolved
    ].filter(Boolean))];
    setContext("🗄 " + p.canonical_name);
    const feats = globe.featuresForNames(names);
    const ll = (p.lat != null) ? { lat: p.lat, lng: p.lng }
      : feats[0] ? featureCentroid(feats[0]) : null;
    if (ll) globe.flyTo(ll.lat, ll.lng, 1.0);
    setSelection([{ names, side: "A" }]);
    scopeSlider(names, p.start_year, p.end_year ?? p.start_year ?? 2025, p.canonical_name);
    let detail = null;
    try { detail = await polityDetail(p.id); } catch { /* basic */ }
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
    card.openCity(d.name, d.city || d, state.year, host ? featureName(host) : null);
  };

  pickFeature = f => {
    if (state.mode === "map-quiz") return;
    const wasT = exitTerritory();
    const name = featureName(f);
    const entry = card.resolve(name);
    if (entry) { selectCurated(entry); return; }
    if (wasT) timeline.setYear(timeline.currentYear());
    setContext(name);
    const c = featureCentroid(f);
    if (c) globe.flyTo(c.lat, c.lng, 0.9);
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

  async function playThread(th, atPolityId) {
    selLabel = null;                 // thread playback isn't URL-restorable yet
    document.getElementById("storyPicker").hidden = true;
    // Playing a thread IS Empire Story mode — reflect it on the mode radio
    // whether we got here from the picker or the search bar.
    if (state.mode !== "empire-story") { state.mode = "empire-story"; state.modeState = null; layersPanel?.refresh(); }
    const members = await threadMembers(th.id);
    const beats = members
      .filter(m => m.polity)
      .map(m => ({
        year: repYear(m.polity),
        kind: m.role,
        label: m.polity.canonical_name,
        polity: m.polity
      }))
      .sort((a, b) => a.year - b.year || (a.polity.start_year ?? 0) - (b.polity.start_year ?? 0));
    const startIndex = atPolityId
      ? Math.max(0, beats.findIndex(b => b.polity.id === atPolityId)) : 0;
    const detailCache = new Map();
    const nameCache = new Map();
    let beatSeq = 0;                            // bail stale beat async work
    story.startCustom("🧵 " + th.display_name, beats, async bt => {
      const mine = ++beatSeq;
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
      const feats = globe.featuresForNames(names);
      const ll = mp.lat != null ? { lat: mp.lat, lng: mp.lng }
        : feats[0] ? featureCentroid(feats[0]) : null;
      if (ll) globe.flyTo(ll.lat, ll.lng, 1.2);
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
      else timeline.setYear(timeline.currentYear());   // borders + events re-render via onChange
    },
  });
  layersPanel.updateCounts();

  // Permalink restore — ?year=1503&sel=France, or ?mode=us-territorial.
  // Selection first (it may move the year), then the shared year wins.
  const qMode = bootParams.get("mode");
  const qSel = bootParams.get("sel");
  const qYear = parseInt(bootParams.get("year"), 10);
  if (qMode === "us-territorial") {
    const e = card.resolve("United States");
    if (e) selectCurated(e);
  } else if (qMode === "empire-story") {
    enterEmpireStory();
  } else if (qSel) {
    const e = card.resolve(qSel);
    if (e) selectCurated(e);
    else searchPolities(qSel, 5).then(hits => {
      const p = hits.find(h => h.canonical_name.toLowerCase() === qSel.toLowerCase()) || hits[0];
      if (p) selectDbPolity(p);
    }).catch(() => { /* bad sel param — ignore */ });
  }
  if (Number.isFinite(qYear)) timeline.setYear(qYear);

  // Eagerly warm the USA territory cache in the background — by the time
  // the user searches "United States", the bulk data is already loaded.
  territoryAll("ohm-usa").catch(() => { /* non-fatal */ });
}

boot().catch(err => {
  document.getElementById("status").textContent = "Init failed: " + err.message;
  console.error(err);
});
