#!/usr/bin/env node
// Guard for the link view v2 parser (docs/link-format.md, src/linkView.js):
// strict ids and ranges, caps, plain-text labels, a bad item dropped on its own.
//   node tools/check-link-format.mjs

import { parseLink, spanLabel, frameFor } from "../src/linkView.js";

let failed = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failed++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); }
};

eq("no fragment", parseLink(""), null);
eq("not v2", parseLink("#v=1&year=5"), null);
eq("plain anchor", parseLink("#about"), null);

const solomon = parseLink("#v=2&year=-950&span=-970,-931&qid=Q3185305,Q41642" +
  "&pins=@33.27,35.20~Tyre;@29.56,34.95~Elath;@29.48,34.98~Ezion-Geber&route=levant-red-sea,tyre-jerusalem");
eq("solomon", solomon, {
  year: -950, span: [-970, -931], qids: ["Q3185305", "Q41642"],
  pins: [
    { id: null, lat: 33.27, lng: 35.2, label: "Tyre" },
    { id: null, lat: 29.56, lng: 34.95, label: "Elath" },
    { id: null, lat: 29.48, lng: 34.98, label: "Ezion-Geber" }],
  routes: ["levant-red-sea", "tyre-jerusalem"], scene: null, at: null });

eq("ids", parseLink("#v=2&pins=pleiades:678378@33.27,35.20~Tyrus;atlas:jerusalem@31.78,35.22;foo:1@1,1;pleiades:@1,1;pleiades:a/b@1,1").pins, [
  { id: "pleiades:678378", lat: 33.27, lng: 35.2, label: "Tyrus" },
  { id: "atlas:jerusalem", lat: 31.78, lng: 35.22, label: null }]);

const many = Array.from({ length: 20 }, (_, i) => `@${i},${i}~p${i}`).join(";");
eq("8 pins max", parseLink("#v=2&pins=" + many).pins.length, 8);
eq("2 qids max, bad dropped", parseLink("#v=2&qid=Q1,X2,Q0,Q3,Q4").qids, ["Q1", "Q3"]);
eq("3 routes max, bad dropped", parseLink("#v=2&route=a,B!,b,c,d").routes, ["a", "b", "c"]);

eq("ranges", parseLink("#v=2&year=99999&span=-5000,9000&pins=@91,0~x;@0,181~y;@1e3,0;@0,0,0;@-89.9,179.9~ok&at=10,20,99").year, 2025);
const r = parseLink("#v=2&year=99999&span=-5000,9000&pins=@91,0~x;@0,181~y;@1e3,0;@0,0,0;@-89.9,179.9~ok&at=10,20,99");
eq("span clamped", r.span, [-3000, 2025]);
eq("pins out of range dropped", r.pins, [{ id: null, lat: -89.9, lng: 179.9, label: "ok" }]);
eq("bad at dropped", r.at, null);
eq("span a > b dropped", parseLink("#v=2&span=-900,-950").span, null);
eq("year not an integer", parseLink("#v=2&year=-950.5").year, null);
eq("at", parseLink("#v=2&at=31.5,35,1.2").at, { lat: 31.5, lng: 35, altitude: 1.2 });

const markup = parseLink("#v=2&pins=@1,2~%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E;@3,4~" + "x".repeat(60) + ";@5,6~a%3Bb%40c%7Ed;@7,8~%E0%A4%A;@9,9~line%0Abreak");
eq("markup kept as text", markup.pins[0].label, "<img src=x onerror=alert(1)>");
eq("label capped at 40", markup.pins[1].label.length, 40);
eq("encoded separators", markup.pins[2].label, "a;b@c~d");
eq("bad encoding: label dropped, pin kept", markup.pins[3], { id: null, lat: 7, lng: 8, label: null });
eq("control characters", markup.pins[4].label, "line break");
eq("unknown keys ignored, first value wins", parseLink("#v=2&year=100&year=200&foo=bar").year, 100);

eq("span label BCE", spanLabel([-970, -931]), "c. 970–931 BCE");
eq("span label across 0", spanLabel([-30, 14]), "c. 30 BCE – 14 CE");
const f = frameFor([{ lat: 33.27, lng: 35.2 }, { lat: 29.5, lng: 34.97 }], 1);
eq("frame centre", [+f.lat.toFixed(2), +f.lng.toFixed(2)], [31.39, 35.09]);
const w = frameFor([{ lat: 0, lng: 179 }, { lat: 0, lng: -179 }], 1);
eq("frame across the antimeridian", Math.abs(w.lng) > 179 && w.altitude < 0.5, true);

if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log("OK: link format parser — ids, ranges, caps, labels, framing");
