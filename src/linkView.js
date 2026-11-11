// Link view v2 (docs/link-format.md): the view a link carries in its fragment,
//   #v=2&year=-950&span=-970,-931&qid=Q3185305,Q41642&pins=@33.27,35.20~Tyre&route=levant-red-sea
// Parsing is strict and local: every item is checked on its own and a bad one
// is dropped without breaking the rest; unknown keys are ignored. Nothing here
// touches the network or storage. Link pins are visitor input, never stored.

import { SLIDER_MIN, SLIDER_MAX } from "./data.js";

export const MAX_QIDS = 2, MAX_PINS = 8, MAX_ROUTES = 3, MAX_LABEL = 40;
const ID = /^[a-z]+:[A-Za-z0-9._-]{1,24}$/;
const SOURCES = new Set(["pleiades", "geonames", "wikidata", "atlas"]);
const QID = /^Q[1-9][0-9]{0,9}$/;
const ROUTE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const INT = /^-?[0-9]{1,6}$/;
const NUM = /^-?[0-9]{1,3}(\.[0-9]{1,7})?$/;

const clampYear = y => Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, y));
const int = s => INT.test(s) ? parseInt(s, 10) : null;
const num = (s, lo, hi) => { if (!NUM.test(s)) return null; const v = +s; return v >= lo && v <= hi ? v : null; };
const dec = s => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return null; } };
const list = (raw, sep) => raw.split(sep).map(dec).filter(Boolean);

// A separator may be written literally or percent-encoded (a URL library
// writes `,` as %2C). Each value decides for itself: a literal separator wins,
// and only a value with none of the literal kind reads the encoded one as the
// separator. So every link that was read before is read the same way, and an
// encoded separator next to literal ones stays text. Encoding is undone once;
// %252C is not a separator.
const ENC = { ",": /%2C/i, "@": /%40/i, "~": /%7E/i };
const sepOf = (raw, ch) => raw.includes(ch) || !ENC[ch].test(raw) ? ch : ENC[ch];
// The first separator, literal if there is one, else encoded: [before, after] or null.
function cut(raw, ch) {
  const i = raw.indexOf(ch);
  if (i >= 0) return [raw.slice(0, i), raw.slice(i + 1)];
  const m = raw.search(ENC[ch]);
  return m < 0 ? null : [raw.slice(0, m), raw.slice(m + 3)];
}
// An encoded ; ends a pin only where a new pin starts after it
// (`[src:id]@lat,lng`, any of its separators encoded or not), so a single
// pin's label keeps an encoded ; as text ("a%3Bb", "a%3B@b").
const PIN_SEP = /%3B(?=(?:[a-z]+(?::|%3A)[A-Za-z0-9._-]{1,24})?(?:@|%40)-?[0-9]{1,3}(?:\.[0-9]{1,7})?(?:,|%2C)-?[0-9])/i;

// Plain text, no control characters, at most MAX_LABEL characters.
function label(raw) {
  const s = dec(raw);
  if (s == null) return null;
  const t = [...s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim()];
  return t.length ? t.slice(0, MAX_LABEL).join("") : null;
}

// `[src:id]@lat,lng[~label]`, split on the raw text so an encoded ; @ ~ in a label survives.
// The first @ and the first ~ after it cut the pin (literal first, else encoded);
// the coordinates are only numbers, so their comma may be literal or %2C.
function pin(raw) {
  const head = cut(raw, "@");
  if (!head) return null;
  const [idRaw, rest] = head;
  const tail = cut(rest, "~");
  const coords = tail ? tail[0] : rest;
  const [latS, lngS, extra] = coords.split(sepOf(coords, ","));
  const lat = num(latS ?? "", -90, 90), lng = num(lngS ?? "", -180, 180);
  if (lat == null || lng == null || extra !== undefined) return null;
  let id = null;
  if (idRaw) {
    id = dec(idRaw);
    if (!id || !ID.test(id) || !SOURCES.has(id.split(":")[0])) return null;
  }
  return { id, lat, lng, label: tail ? label(tail[1]) : null };
}

// Returns null when the fragment is not a v2 link view.
export function parseLink(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw) return null;
  const kv = new Map();
  for (const part of raw.split("&")) {
    const eq = part.indexOf("=");
    if (eq > 0 && !kv.has(part.slice(0, eq))) kv.set(part.slice(0, eq), part.slice(eq + 1));
  }
  if (kv.get("v") !== "2") return null;
  const view = { year: null, span: null, qids: [], pins: [], routes: [], scene: null, at: null };

  const y = int(dec(kv.get("year") ?? "") ?? "");
  if (y != null) view.year = clampYear(y);

  const sp = (dec(kv.get("span") ?? "") ?? "").split(",");
  if (sp.length === 2) {
    const a = int(sp[0]), b = int(sp[1]);
    if (a != null && b != null && a <= b) view.span = [clampYear(a), clampYear(b)];
  }

  const ids = raw => list(raw, sepOf(raw, ","));
  if (kv.has("qid")) view.qids = [...new Set(ids(kv.get("qid")).filter(q => QID.test(q)))].slice(0, MAX_QIDS);
  if (kv.has("pins")) {
    const p = kv.get("pins");
    view.pins = p.split(p.includes(";") ? ";" : PIN_SEP).map(pin).filter(Boolean).slice(0, MAX_PINS);
  }
  if (kv.has("route")) view.routes = [...new Set(ids(kv.get("route")).filter(r => ROUTE.test(r)))].slice(0, MAX_ROUTES);

  const scene = dec(kv.get("scene") ?? "");
  if (scene && ROUTE.test(scene)) view.scene = scene;   // A5: parsed, not used yet

  const at = (dec(kv.get("at") ?? "") ?? "").split(",");
  if (at.length === 3) {
    const lat = num(at[0], -90, 90), lng = num(at[1], -180, 180), alt = num(at[2], 0.05, 10);
    if (lat != null && lng != null && alt != null) view.at = { lat, lng, altitude: alt };
  }
  return view;
}

// Whether a link asked for something to show: a `pins`, `qid` or `route` key with a
// value. `shown` counts what Atlas could put on screen from it (pins drawn, routes it
// knows, polities found); when the link asked and nothing came of it, the page says
// so instead of showing nothing (docs/link-format.md, "What Atlas does with a link").
export function linkUnread(hash, { pins = 0, routes = 0, polities = 0 } = {}) {
  const raw = String(hash || "").replace(/^#/, "");
  const kv = new Map();
  for (const part of raw.split("&")) {
    const eq = part.indexOf("=");
    if (eq > 0 && !kv.has(part.slice(0, eq))) kv.set(part.slice(0, eq), part.slice(eq + 1));
  }
  if (kv.get("v") !== "2") return false;
  const asked = ["pins", "qid", "route"].some(k => (kv.get(k) || "").length > 0);
  return asked && !pins && !routes && !polities;
}

// The camera for a set of points: the centre of their bounding box, high
// enough that the box plus padding fits the narrower screen side (globe.gl's
// camera has a 50° vertical field of view). Longitudes are unwrapped around
// the first point so a box across the antimeridian stays small.
export function frameFor(points, aspect = 1, pad = 1.6) {
  if (!points.length) return null;
  const lng0 = points[0].lng;
  const lngs = points.map(p => lng0 + ((p.lng - lng0 + 540) % 360) - 180);
  const lats = points.map(p => p.lat);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng = ((Math.min(...lngs) + Math.max(...lngs)) / 2 + 540) % 360 - 180;
  const dLat = Math.max(...lats) - Math.min(...lats);
  const dLng = (Math.max(...lngs) - Math.min(...lngs)) * Math.cos(lat * Math.PI / 180);
  const half = Math.max(3, Math.hypot(dLat, dLng) / 2 * pad) * Math.PI / 180;
  const altitude = half / (Math.tan(25 * Math.PI / 180) * Math.min(1, aspect));
  return { lat, lng, altitude: Math.max(0.3, Math.min(3, altitude)) };
}

// "c. 970–931 BCE", "c. 30 BCE – 14 CE": Atlas writes the span's label itself.
export function spanLabel([a, b]) {
  const era = y => y < 0 ? "BCE" : "CE";
  if (a === b) return `c. ${Math.abs(a)} ${era(a)}`;
  if (era(a) === era(b)) return `c. ${Math.abs(a)}–${Math.abs(b)} ${era(a)}`;
  return `c. ${Math.abs(a)} BCE – ${b} CE`;
}
