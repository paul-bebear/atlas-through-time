// Event layer: one unified, time-keyed store. Everything is shown or hidden
// purely as a function of the current year. Point-in-time events fade in/out
// over a short window; ranged events (wars, empires) stay solid for their span.
//
// To keep the globe readable, the visible set is capped: ranged + curated
// events always show; the densest auto-harvested battles fill the remainder.

import { catColor } from "./data.js";

const WINDOW = 12;  // years a point-event stays visible (fading) around its date
const CAP = 240;    // max simultaneously rendered events

export function createEvents(allEvents) {
  const events = allEvents
    .filter(e => typeof e.lat === "number" && typeof e.lng === "number"
                 && Number.isFinite(e.startYear))
    .map((e, i) => ({
      id: e.id || `ev${i}`,
      title: e.title,
      lat: e.lat,
      lng: e.lng,
      startYear: e.startYear,
      endYear: Number.isFinite(e.endYear) ? e.endYear : null,
      category: e.category || "empire",
      wikiTitle: e.wikiTitle || e.title,
      curated: !String(e.id || "").startsWith("wd-")
    }));

  function forYear(year) {
    const ranged = [];
    const pts = [];
    for (const e of events) {
      if (e.endYear != null) {
        if (year >= e.startYear && year <= e.endYear)
          ranged.push({ ...e, _alpha: 1, _color: catColor(e.category, 0.85) });
      } else {
        const d = Math.abs(year - e.startYear);
        if (d <= WINDOW) pts.push({ e, a: 1 - d / WINDOW });
      }
    }
    pts.sort((x, y) => y.a - x.a);

    const curated = [], harvested = [];
    for (const { e, a } of pts) {
      const o = { ...e, _alpha: a, _color: catColor(e.category, 0.3 + 0.6 * a) };
      (e.curated ? curated : harvested).push(o);
    }

    const out = [...ranged, ...curated];
    for (const o of harvested) {
      if (out.length >= CAP) break;
      out.push(o);
    }
    return out;
  }

  function randomEvent() {
    return events[Math.floor(Math.random() * events.length)];
  }

  return { forYear, randomEvent, all: () => events, count: events.length };
}
