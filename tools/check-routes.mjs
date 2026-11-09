#!/usr/bin/env node
// Guard for the route registry, data/trade-routes.json (fields: docs/routes.md).
// Run:  node tools/check-routes.mjs [--active YEAR id ...]   (exits 1 on any failure)
// --active checks that the named routes are in use at YEAR.

import { readFile } from "node:fs/promises";
import { SLIDER_MIN, SLIDER_MAX } from "../src/data.js";

const FILE = new URL("../data/trade-routes.json", import.meta.url);
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PLACE = /^(pleiades|geonames|wikidata|atlas):[A-Za-z0-9._-]{1,24}$/;   // docs/link-format.md id rule
const MODES = ["sea", "land", "river"];
const CERTAINTY = ["attested", "schematic", "legendary"];
const KINDS = ["trade", "pilgrimage", "military", "migration", "exploration", "postal"];
const ON_LINE_KM = 25;

const fails = [];
const fail = (r, msg) => fails.push(`${r}: ${msg}`);
const isNum = v => typeof v === "number" && Number.isFinite(v);
const okLat = v => isNum(v) && v >= -90 && v <= 90;
const okLng = v => isNum(v) && v >= -180 && v <= 180;
const str = v => typeof v === "string" && v.trim() !== "";

const rad = d => d * Math.PI / 180;
function km([lng1, lat1], [lng2, lat2]) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
function kmToLine(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const n = Math.max(1, Math.ceil(km(pts[i], pts[i + 1])));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      best = Math.min(best, km(p, [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])]));
    }
  }
  return pts.length === 1 ? km(p, pts[0]) : best;
}

function checkPlace(r, where, o) {
  if (o.place !== undefined && !(typeof o.place === "string" && PLACE.test(o.place)))
    fail(r, `${where}: place "${o.place}" is not src:id (pleiades|geonames|wikidata|atlas)`);
}

let routes;
try { routes = JSON.parse(await readFile(FILE, "utf8")); }
catch (e) { console.error(`FAIL: data/trade-routes.json does not parse: ${e.message}`); process.exit(1); }
if (!Array.isArray(routes)) { console.error("FAIL: top level must be an array"); process.exit(1); }

const seen = new Set();
routes.forEach((rt, i) => {
  const r = rt.id || `#${i}`;
  if (!(typeof rt.id === "string" && ID.test(rt.id))) fail(r, "id missing or not kebab-case");
  if (seen.has(rt.id)) fail(r, "duplicate id");
  seen.add(rt.id);
  for (const k of ["name", "summary", "color"]) if (!str(rt[k])) fail(r, `${k} missing`);
  for (const k of ["from", "to"]) {
    if (!Number.isInteger(rt[k])) fail(r, `${k} must be an integer year (negative = BCE)`);
    else if (rt[k] < SLIDER_MIN || rt[k] > SLIDER_MAX) fail(r, `${k} ${rt[k]} outside ${SLIDER_MIN}..${SLIDER_MAX}`);
  }
  if (rt.from > rt.to) fail(r, "from > to");
  if (!Array.isArray(rt.points) || rt.points.length < 2) fail(r, "points needs at least 2 [lng, lat] pairs");
  else rt.points.forEach((p, j) => {
    if (!(Array.isArray(p) && p.length === 2 && okLng(p[0]) && okLat(p[1]))) fail(r, `points[${j}] ${JSON.stringify(p)} is not an in-range [lng, lat]`);
  });

  if (rt.kind !== undefined && !KINDS.includes(rt.kind)) fail(r, `kind "${rt.kind}" not in ${KINDS.join(", ")} (add it to docs/routes.md and here)`);
  if (rt.mode !== undefined && !MODES.includes(rt.mode)) fail(r, `mode "${rt.mode}" not in ${MODES.join(", ")}`);
  if (rt.certainty !== undefined && !CERTAINTY.includes(rt.certainty)) fail(r, `certainty "${rt.certainty}" not in ${CERTAINTY.join(", ")}`);
  if (rt.goods !== undefined && !(Array.isArray(rt.goods) && rt.goods.every(str))) fail(r, "goods must be a list of strings");

  if (rt.waypoints !== undefined) {
    if (!Array.isArray(rt.waypoints) || !rt.waypoints.length) fail(r, "waypoints must be a non-empty list");
    else rt.waypoints.forEach((w, j) => {
      const at = `waypoints[${j}] ${w.name || ""}`;
      if (!str(w.name)) fail(r, `${at}: name missing`);
      if (!okLat(w.lat) || !okLng(w.lng)) { fail(r, `${at}: lat/lng missing or out of range`); return; }
      checkPlace(r, at, w);
      if (w.open && j !== rt.waypoints.length - 1) fail(r, `${at}: an open end must be the last waypoint`);
      if (w.open) {
        const last = rt.points?.at(-1);
        if (last && (last[0] !== w.lng || last[1] !== w.lat)) fail(r, `${at}: an open end must equal the last point`);
      }
      if (Array.isArray(rt.points) && rt.points.length >= 2) {
        const d = kmToLine([w.lng, w.lat], rt.points);
        if (d > ON_LINE_KM) fail(r, `${at}: ${d.toFixed(1)} km from the line (max ${ON_LINE_KM})`);
      }
      if (w.candidates !== undefined) {
        if (!Array.isArray(w.candidates) || w.candidates.length < 2) fail(r, `${at}: candidates must list at least 2 options`);
        else w.candidates.forEach((c, k) => {
          const cat = `${at} candidates[${k}]`;
          if (!str(c.name)) fail(r, `${cat}: name missing`);
          const hasLat = c.lat !== undefined, hasLng = c.lng !== undefined;
          if (hasLat !== hasLng || (hasLat && (!okLat(c.lat) || !okLng(c.lng)))) fail(r, `${cat}: lat/lng must both be given and in range, or both left out`);
          checkPlace(r, cat, c);
        });
      }
    });
  }

  if (rt.sources !== undefined) {
    if (!Array.isArray(rt.sources) || !rt.sources.length) fail(r, "sources must be a non-empty list");
    else rt.sources.forEach((s, j) => {
      const at = `sources[${j}]`;
      if (!str(s.title)) fail(r, `${at}: title missing`);
      if (!str(s.use)) fail(r, `${at}: use missing (say what the source was used for)`);
      if (s.url !== undefined && !/^https:\/\/\S+$/.test(s.url)) fail(r, `${at}: url must be https`);
      if (s.book) {
        if (!["bite", "atlas"].includes(s.text)) fail(r, `${at}: a book source must say text: "bite" or "atlas"`);
        if (s.text === "bite" && typeof s.unchanged !== "boolean") fail(r, `${at}: text "bite" must say unchanged: true or false`);
        if (s.copyright !== undefined && !["public-domain", "in-copyright"].includes(s.copyright)) fail(r, `${at}: copyright must be "public-domain" or "in-copyright"`);
        if (s.author !== undefined && !str(s.author)) fail(r, `${at}: author must be a string`);
        if (s.field !== undefined && !str(rt[s.field])) fail(r, `${at}: field "${s.field}" is not a text field of this route`);
      } else if (["text", "unchanged", "copyright", "field"].some(k => s[k] !== undefined)) {
        fail(r, `${at}: text/unchanged/copyright/field belong only on a book source (book: true)`);
      }
    });
  }
});

const argv = process.argv.slice(2);
if (argv[0] === "--active") {
  const year = Number(argv[1]);
  if (!Number.isInteger(year)) fails.push(`--active needs an integer year, got ${argv[1]}`);
  for (const id of argv.slice(2)) {
    const rt = routes.find(x => x.id === id);
    if (!rt) fails.push(`${id}: no such route`);
    else if (!(year >= rt.from && year <= rt.to)) fails.push(`${id}: ${rt.from}..${rt.to} is not active at ${year}`);
  }
}

console.log(`${routes.length} routes; ids: ${routes.map(r => r.id).join(", ")}`);
if (fails.length) {
  console.error("FAIL\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("OK: parses, unique kebab-case ids, years and coordinates in range, optional fields valid, waypoints on their lines" +
  (argv[0] === "--active" ? `, ${argv.slice(2).join(" and ")} active at ${argv[1]}` : ""));
