#!/usr/bin/env node
// Derive the app's display copy of the USA territory pull.
//
// data/db/territory.usa.json stays the canonical OHM file (it keeps going
// into Supabase untouched). This keeps only the fields the app reads, rounds
// to 5 decimals (~1 m) and applies Douglas-Peucker at 0.005° (~500 m).
//
//   node tools/shrink-territory.mjs
//
// Output: data/db/territory.usa.app.json

import { readFileSync, writeFileSync } from "node:fs";
import { simplifyFC } from "../src/simplify.js";

const SRC = new URL("../data/db/territory.usa.json", import.meta.url);
const OUT = new URL("../data/db/territory.usa.app.json", import.meta.url);
const TOL = 0.005;

const raw = readFileSync(SRC, "utf8");
const round = c => typeof c[0] === "number"
  ? c.map(v => Math.round(v * 1e5) / 1e5)
  : c.map(round);

const features = JSON.parse(raw)
  .filter(r => r.geometry)
  .map(({ name, from_year, to_year, geometry }) => ({
    name, from_year, to_year,
    geometry: { type: geometry.type, coordinates: round(geometry.coordinates) }
  }));

const { before, after } = simplifyFC({ features }, TOL);
const out = JSON.stringify(features);
writeFileSync(OUT, out);

console.log(`rows      ${features.length}`);
console.log(`vertices  ${before} → ${after}`);
console.log(`bytes     ${Buffer.byteLength(raw)} → ${Buffer.byteLength(out)}`);
