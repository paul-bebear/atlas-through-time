#!/usr/bin/env node
// Build a lean globe.gl for this app: the official 2.34.4 sources and the
// dependency tree it shipped with, with the parts the app never touches
// replaced by stubs that throw if anything reaches them.
//
//   cd tools/engine && npm ci && cd ../.. && node tools/build-engine.mjs
//
// Inputs are pinned in tools/engine/package-lock.json (resolved with
// `npm install --before=2024-12-16`, globe.gl 2.34.4's publish date, so
// three is r171 like the official UMD). Output is committed under vendor/,
// so the deploy itself stays zero-build.
//
// Kept: globe + atmosphere, polygons, paths (territory outlines, trade
// routes), points (events), HTML elements (city labels), orbit controls,
// tooltips. Stubbed: WebGPU renderer, h3 (hex bins / hexed polygons),
// heatmap helpers, trackball / fly controls, 3D text labels + their font.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";

const ENGINE = new URL("./engine/", import.meta.url);
const OUT = new URL("../vendor/globe.gl-2.34.4-atlas.1.min.js", import.meta.url);
const esbuild = createRequire(ENGINE)("esbuild");

const VERSION = JSON.parse(readFileSync(new URL("node_modules/globe.gl/package.json", ENGINE))).version;
if (VERSION !== "2.34.4") throw new Error(`expected globe.gl 2.34.4 in tools/engine, got ${VERSION} (run npm ci there)`);

// Each stub exports the names its importers use; calling one throws.
const fail = what => `function(){throw new Error("${what} is not included in the Atlas engine build (tools/build-engine.mjs)")}`;
const STUBS = {
  "three/webgpu": `export const WebGPURenderer = ${fail("WebGPURenderer")};`,
  "h3-js": ["latLngToCell", "cellToLatLng", "cellToBoundary", "polygonToCells"]
    .map(n => `export const ${n} = ${fail("h3-js " + n)};`).join("\n"),
  "d3-scale-chromatic": `export const interpolateTurbo = ${fail("d3-scale-chromatic")};`,
  "yaot": `export default ${fail("yaot (heatmaps)")};`,
  "three/examples/jsm/controls/TrackballControls.js": `export const TrackballControls = ${fail("TrackballControls")};`,
  "three/examples/jsm/controls/FlyControls.js": `export const FlyControls = ${fail("FlyControls")};`,
  "three/addons/geometries/TextGeometry.js": `export const TextGeometry = ${fail("TextGeometry (labels layer)")};`,
  // Constructed for the labels layer's default typeface even when no label is drawn.
  "three/addons/loaders/FontLoader.js": `export class Font { constructor(data) { this.data = data; } }`,
};

const stubs = {
  name: "atlas-stubs",
  setup(b) {
    const filter = new RegExp("^(" + Object.keys(STUBS).map(s => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|") + ")$");
    b.onResolve({ filter }, a => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, a => ({ contents: STUBS[a.path], loader: "js" }));
    // Drop the embedded Helvetiker glyph table (≈ 60 KB) that only the 3D labels layer reads.
    b.onLoad({ filter: /three-globe[\\/]dist[\\/]three-globe\.mjs$/ }, a => {
      const src = readFileSync(a.path, "utf8");
      const out = src.replace(/^var glyphs=.*$/m, "var defaultTypeFace = { glyphs: {} };");
      if (out === src) throw new Error("three-globe: glyph table not found, update tools/build-engine.mjs");
      return { contents: out, loader: "js" };
    });
  },
};

const r = await esbuild.build({
  stdin: { contents: `export { default } from "globe.gl";`, resolveDir: ENGINE.pathname },
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "Globe",
  footer: { js: "Globe=Globe.default;" },
  banner: { js: `// globe.gl ${VERSION} (MIT, https://github.com/vasturiano/globe.gl), Atlas Through Time build: unused layers stubbed, see tools/build-engine.mjs` },
  target: ["es2020", "safari14"],
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [stubs],
  write: false,
  metafile: true,
  logLevel: "warning",
});

const code = r.outputFiles[0].contents;
writeFileSync(OUT, code);
const br = brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
console.log(`${OUT.pathname.split("/").slice(-2).join("/")}: ${statSync(OUT).size} bytes raw, ${br} brotli`);
