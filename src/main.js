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
import { polityDetail, threadMembers, resolvedNames, territoryForYear, territoryAll } from "./db.js";
import { createStory } from "./story.js";
import { initPanel } from "./panel.js";

const DEFAULT_CONTEXT = "Explore history — click a country, war or formation";

const state = { year: 1900, wars: [], lastSig: null, territory: null, territorySig: null };

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

const activeWarsFor = y => state.wars.filter(w => y >= w.start && y <= w.end);
const belligerent = (war, name) =>
  Object.values(war.sides).flat().some(s => s.toLowerCase() === name.toLowerCase());

function buildLegend() {
  document.getElementById("legend").innerHTML = Object.values(CATEGORIES)
    .map(c => `<div class="lg"><span class="dot" style="background:${c.color}"></span>${c.label}</div>`)
    .join("");
}

async function boot() {
  const [wars, formations, countries, cities, seedEvents, genEvents] = await Promise.all([
    loadJSON("data/wars.json"),
    loadJSON("data/formations.json"),
    loadJSON("data/countries.json"),
    loadJSON("data/cities.json"),
    loadJSON("data/events.json"),
    loadOptionalJSON("data/events.generated.json", [])
  ]);
  state.wars = wars;

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
  // Exit CC0 territory mode (USA growth etc). Returns true if it was on, so
  // callers can force a normal-border refresh.
  const exitTerritory = () => {
    if (!state.territory) return false;
    state.territory = null; state.lastSig = null; state.territorySig = null;
    globe.clearTerritoryOutlines();
    return true;
  };
  const clearSelection = () => {
    selection = null;
    globe.setHighlights([]);          // also drops selectedKey via setHighlights
    if (exitTerritory()) timeline.setYear(timeline.currentYear());
  };

  const globe = createGlobe(document.getElementById("globe"), {
    onCountryClick: f => pickFeature(f),
    onEventClick: ev => { clearSelection(); card.openEvent(ev); }
  });
  globe.setCities(cities);


  const timeline = createTimeline({
    onChange: async (year) => {
      state.year = year;
      eraEl.textContent = `${yearLabel(year)} · ${eraFor(year)}`;

      // Territory mode (CC0 OHM data layer, e.g. USA growth) replaces the
      // world borders with lightweight outline paths for that year. Skip
      // the events layer here — it's free latency we don't need in the
      // focused demo, and rerenders cost per tick.
      if (state.territory) {
        try {
          const fc = await territoryForYear(state.territory.source, year);
          if (state.year !== year || !state.territory) return;
          const sig = fc.features.length + "|" +
            fc.features.map(f => f.properties.NAME).sort().join(",");
          if (sig !== state.territorySig) {
            state.territorySig = sig;
            globe.setTerritoryOutlines(fc.features);
          }
          timeline.setStatus(`${state.territory.label} · ${fc.features.length} polities`);
        } catch (e) { timeline.setStatus(e.message); }
        if (selection) selection.render(year);
        return;
      }

      // Event layer updates every single year (skipped in territory mode).
      const vis = events.forYear(year);
      globe.setEvents(vis);

      // Re-tessellate polygons only when the snapshot actually changes,
      // so scrubbing within one period stays cheap.
      try {
        const { features, source } = await bordersForYear(year);
        if (state.year !== year || state.territory) return; // a newer scrub OR territory mode superseded this one
        const sig = bordersSig(source, features);
        if (sig !== state.lastSig) {
          state.lastSig = sig;
          globe.setBorders({ features });
        }
        timeline.setStatus(`borders ${source} · ${vis.length} events`);
      } catch (e) {
        timeline.setStatus(e.message);
      }
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
    const names = [entry.name, ...(entry.aliases || [])];
    const isUSA = names.some(n => {
      const x = n.toLowerCase();
      return x.includes("united states") || x === "usa" || x === "us";
    });

    const feats = globe.featuresForNames(names);
    const ll = entry.lat != null ? { lat: entry.lat, lng: entry.lng }
      : feats[0] ? featureCentroid(feats[0]) : null;
    if (!isUSA) globe.setHighlights([{ names, side: "A" }]);
    selection = {
      names,
      render: y => card.openEntry(entry, y,
        activeWarsFor(y).filter(w => names.some(n => belligerent(w, n))))
    };

    if (isUSA) {
      // CC0 territory mode — watch the USA grow 1776 → today.
      state.territory = { source: "ohm-usa", label: "🇺🇸 USA territorial growth" };
      state.lastSig = null;
      state.territorySig = null;
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
    globe.setHighlights([{ names, side: "A" }]);
    scopeSlider(names, p.start_year, p.end_year ?? p.start_year ?? 2025, p.canonical_name);
    let detail = null;
    try { detail = await polityDetail(p.id); } catch { /* basic */ }
    if (mine !== dbSelectionSeq) return;       // newer pick won the race
    selection = { names, render: y => card.openDbPolity(p, detail, y) };
    if (wasT) timeline.setYear(timeline.currentYear());
    else selection.render(timeline.currentYear());
  }

  pickFeature = f => {
    const wasT = exitTerritory();
    const name = featureName(f);
    const entry = card.resolve(name);
    if (entry) { selectCurated(entry); return; }
    if (wasT) timeline.setYear(timeline.currentYear());
    setContext(name);
    const c = featureCentroid(f);
    if (c) globe.flyTo(c.lat, c.lng, 0.9);
    globe.setHighlights([{ names: [name], side: "A" }]);
    scopeSlider([name], null, null, name);
    selection = {
      names: [name],
      render: y => card.openCountry(f, y, activeWarsFor(y).filter(w => belligerent(w, name)))
    };
    selection.render(timeline.currentYear());
  };
  // --------------------------------------------------------------------

  createWarsPanel({
    wars,
    onSelectWar: w => {
      clearSelection();
      globe.setHighlights(warHighlights(w));
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
      globe.setHighlights(formationHighlights(f));
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
      globe.setHighlights([{ names, side: "A" }]);
      setContext("📖 " + country.name);
      timeline.setSpan(beats[0].year, beats[beats.length - 1].year, country.name);
      timeline.setMarkers(beats.map(b => ({ year: b.year, label: b.label })));
      card.openEntry(country, bt.year,
        activeWarsFor(bt.year).filter(w => names.some(n => belligerent(w, n))));
    },
    onExit: () => {
      clearSelection();
      globe.setHighlights([]);
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
      globe.setHighlights([{ names, side: "A" }]);
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

  // Eagerly warm the USA territory cache in the background — by the time
  // the user searches "United States", the bulk data is already loaded.
  territoryAll("ohm-usa").catch(() => { /* non-fatal */ });
}

boot().catch(err => {
  document.getElementById("status").textContent = "Init failed: " + err.message;
  console.error(err);
});
