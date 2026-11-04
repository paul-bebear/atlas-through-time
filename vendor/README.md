# vendor

- `globe.gl-2.34.4-atlas.1.min.js` — [globe.gl](https://github.com/vasturiano/globe.gl) 2.34.4 built for this app (sets `window.Globe`, same API as the official UMD).
- Licence: MIT — https://github.com/vasturiano/globe.gl/blob/master/LICENSE (three.js and the other bundled packages are MIT / ISC / BSD).
- Built by `tools/build-engine.mjs` (esbuild, minified IIFE, ES2020) from the official sources, with the dependency tree globe.gl 2.34.4 shipped with: `tools/engine/package-lock.json` was resolved with `npm install --before=2024-12-16` (globe.gl's publish date), so three is r171 and three-globe 2.37.0, like the official UMD.
- What differs from the official UMD (`https://unpkg.com/globe.gl@2.34.4/dist/globe.gl.min.js`): modules the app never reaches are replaced by stubs that throw if called — three's WebGPU renderer, h3-js (hex bins, hexed polygons), the heatmap helpers (`yaot`, `d3-scale-chromatic`), trackball / fly controls, 3D text labels and their embedded Helvetiker font. Polygons, paths, points, HTML elements, orbit controls and tooltips are untouched. If a new feature needs one of those layers, remove its stub in `tools/build-engine.mjs` and rebuild.
- Rebuild (the output is byte-identical for the same lockfile):

  ```
  cd tools/engine && npm ci && cd ../.. && node tools/build-engine.mjs
  ```

- Upgrade: bump the versions in `tools/engine/package.json`, re-resolve the lockfile, change the output filename (`globe.gl-X.Y.Z-atlas.N.min.js`; files under `vendor/` are served `immutable`), update the one `<script defer>` reference in `index.html`, delete the old file.
