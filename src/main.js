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
import { polityDetail } from "./db.js";
import { createStory } from "./story.js";
import { initPanel } from "./panel.js";

const DEFAULT_CONTEXT = "Explore history — click a country, war or formation";

const state = { year: 1900, wars: [], lastSig: null };

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

  const globe = createGlobe(document.getElementById("globe"), {
    onCountryClick: f => {
      const name = featureName(f);
      card.openCountry(f, state.year,
        activeWarsFor(state.year).filter(w => belligerent(w, name)));
      setContext(name);
      const c = featureCentroid(f);
      if (c) globe.flyTo(c.lat, c.lng, 0.85);
      // Key moments: events located inside this country, across all time.
      const moments = events.all()
        .filter(e => featureContains(f, e.lng, e.lat))
        .sort((a, b) => a.startYear - b.startYear)
        .slice(0, 80)
        .map(e => ({ year: e.startYear, label: e.title }));
      timeline.clearOverlays();
      timeline.setMarkers(moments);
    },
    onEventClick: ev => card.openEvent(ev)
  });
  globe.setCities(cities);


  const timeline = createTimeline({
    onChange: async (year) => {
      state.year = year;
      eraEl.textContent = `${yearLabel(year)} · ${eraFor(year)}`;

      // Event layer updates every single year.
      const vis = events.forYear(year);
      globe.setEvents(vis);

      // Re-tessellate polygons only when the snapshot actually changes,
      // so scrubbing within one period stays cheap.
      try {
        const { features, source } = await bordersForYear(year);
        if (state.year !== year) return; // a newer scrub superseded this one
        const sig = bordersSig(source, features);
        if (sig !== state.lastSig) {
          state.lastSig = sig;
          globe.setBorders({ features });
        }
        timeline.setStatus(`borders ${source} · ${vis.length} events`);
      } catch (e) {
        timeline.setStatus(e.message);
      }
    },
    onSurprise: () => {
      const ev = events.randomEvent();
      if (!ev) return;
      timeline.setYear(ev.startYear);
      globe.flyTo(ev.lat, ev.lng);
      setTimeout(() => card.openEvent(ev), 700);
    }
  });

  createWarsPanel({
    wars,
    onSelectWar: w => {
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
      globe.setHighlights([]);
      timeline.clearOverlays();
      setContext(DEFAULT_CONTEXT, false);
    }
  });

  createSearch({
    catalog: card.catalog,
    onPick: async hit => {
      if (hit.kind === "curated") {
        const entry = hit.entry;
        if (entry.lat != null) globe.flyTo(entry.lat, entry.lng, 1.2);
        story.start(entry);
        return;
      }
      // DB polity: fly there if it has coords, jump the timeline into its
      // span, show a live-from-database card.
      const p = hit.polity;
      story.exit?.();
      setContext("🗄 " + p.canonical_name);
      if (p.lat != null && p.lng != null) globe.flyTo(p.lat, p.lng, 1.2);
      if (p.start_year != null) {
        const mid = p.end_year != null
          ? Math.round((p.start_year + p.end_year) / 2) : p.start_year;
        timeline.setYear(mid);
      }
      timeline.setSpan(p.start_year, p.end_year ?? p.start_year, p.canonical_name);
      card.openDbPolity(p);
      try { card.openDbPolity(p, await polityDetail(p.id)); } catch { /* keep basic */ }
    }
  });
}

boot().catch(err => {
  document.getElementById("status").textContent = "Init failed: " + err.message;
  console.error(err);
});
