#!/usr/bin/env node
// Guard for the link view v2 parser (docs/link-format.md, src/linkView.js):
// strict ids and ranges, caps, plain-text labels, a bad item dropped on its own,
// separators literal or percent-encoded, and links read on main read the same.
//   node tools/check-link-format.mjs

import { parseLink, spanLabel, frameFor, linkUnread } from "../src/linkView.js";

// Regression: links read on main at 3f78295, before encoded separators were
// accepted, with the result that parser gave (generated from it, not edited).
const BEFORE = [
  ["#v=2&year=-950&span=-970,-931&qid=Q3185305,Q41642&pins=@33.27,35.20~Tyrus;@29.55,34.98~Ezion-geber;@29.56,34.95~Elath&route=tyre-jerusalem,levant-red-sea",
   "{\"year\":-950,\"span\":[-970,-931],\"qids\":[\"Q3185305\",\"Q41642\"],\"pins\":[{\"id\":null,\"lat\":33.27,\"lng\":35.2,\"label\":\"Tyrus\"},{\"id\":null,\"lat\":29.55,\"lng\":34.98,\"label\":\"Ezion-geber\"},{\"id\":null,\"lat\":29.56,\"lng\":34.95,\"label\":\"Elath\"}],\"routes\":[\"tyre-jerusalem\",\"levant-red-sea\"],\"scene\":null,\"at\":null}"],
  ["#v=2&year=-950&span=-970,-931&qid=Q3185305,Q41642&pins=@33.27,35.20~Tyre;@29.56,34.95~Elath;@29.48,34.98~Ezion-Geber&route=levant-red-sea,tyre-jerusalem",
   "{\"year\":-950,\"span\":[-970,-931],\"qids\":[\"Q3185305\",\"Q41642\"],\"pins\":[{\"id\":null,\"lat\":33.27,\"lng\":35.2,\"label\":\"Tyre\"},{\"id\":null,\"lat\":29.56,\"lng\":34.95,\"label\":\"Elath\"},{\"id\":null,\"lat\":29.48,\"lng\":34.98,\"label\":\"Ezion-Geber\"}],\"routes\":[\"levant-red-sea\",\"tyre-jerusalem\"],\"scene\":null,\"at\":null}"],
  ["#v=2&year=-950",
   "{\"year\":-950,\"span\":null,\"qids\":[],\"pins\":[],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&year=-44&at=41.89,12.49,1.5",
   "{\"year\":-44,\"span\":null,\"qids\":[],\"pins\":[],\"routes\":[],\"scene\":null,\"at\":{\"lat\":41.89,\"lng\":12.49,\"altitude\":1.5}}"],
  ["#v=2&span=-30,14&qid=Q2277",
   "{\"year\":null,\"span\":[-30,14],\"qids\":[\"Q2277\"],\"pins\":[],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&route=levant-red-sea",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[],\"routes\":[\"levant-red-sea\"],\"scene\":null,\"at\":null}"],
  ["#v=2&qid=Q41642",
   "{\"year\":null,\"span\":null,\"qids\":[\"Q41642\"],\"pins\":[],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=pleiades:678378@33.27,35.20~Tyrus;atlas:jerusalem@31.78,35.22;wikidata:Q3185305@31.77,35.23~Temple%20Mount",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":\"pleiades:678378\",\"lat\":33.27,\"lng\":35.2,\"label\":\"Tyrus\"},{\"id\":\"atlas:jerusalem\",\"lat\":31.78,\"lng\":35.22,\"label\":null},{\"id\":\"wikidata:Q3185305\",\"lat\":31.77,\"lng\":35.23,\"label\":\"Temple Mount\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=@31.78,35.22~Jerusalem%2C%20Old%20City",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":31.78,\"lng\":35.22,\"label\":\"Jerusalem, Old City\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=@5,6~a%3Bb%40c%7Ed",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":5,\"lng\":6,\"label\":\"a;b@c~d\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=@5,6~a%3Bb",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":5,\"lng\":6,\"label\":\"a;b\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=@5,6~a%2Cb",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":5,\"lng\":6,\"label\":\"a,b\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=@5,6~a%40b;@7,8~c%7Ed",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":5,\"lng\":6,\"label\":\"a@b\"},{\"id\":null,\"lat\":7,\"lng\":8,\"label\":\"c~d\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=@5,6~Ezion+Geber",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":5,\"lng\":6,\"label\":\"Ezion Geber\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=@5,6~a,b,c~d@e",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":5,\"lng\":6,\"label\":\"a,b,c~d@e\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=@-33.8688,151.2093~Sydney&year=1788",
   "{\"year\":1788,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":-33.8688,\"lng\":151.2093,\"label\":\"Sydney\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=@1,2~%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E;@3,4~xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx;@5,6~a%3Bb%40c%7Ed;@7,8~%E0%A4%A;@9,9~line%0Abreak",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":1,\"lng\":2,\"label\":\"<img src=x onerror=alert(1)>\"},{\"id\":null,\"lat\":3,\"lng\":4,\"label\":\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\"},{\"id\":null,\"lat\":5,\"lng\":6,\"label\":\"a;b@c~d\"},{\"id\":null,\"lat\":7,\"lng\":8,\"label\":null},{\"id\":null,\"lat\":9,\"lng\":9,\"label\":\"line break\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=pleiades:678378@33.27,35.20~Tyrus;atlas:jerusalem@31.78,35.22;foo:1@1,1;pleiades:@1,1;pleiades:a/b@1,1",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":\"pleiades:678378\",\"lat\":33.27,\"lng\":35.2,\"label\":\"Tyrus\"},{\"id\":\"atlas:jerusalem\",\"lat\":31.78,\"lng\":35.22,\"label\":null}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&qid=Q1,X2,Q0,Q3,Q4",
   "{\"year\":null,\"span\":null,\"qids\":[\"Q1\",\"Q3\"],\"pins\":[],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&route=a,B!,b,c,d",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[],\"routes\":[\"a\",\"b\",\"c\"],\"scene\":null,\"at\":null}"],
  ["#v=2&year=99999&span=-5000,9000&pins=@91,0~x;@0,181~y;@1e3,0;@0,0,0;@-89.9,179.9~ok&at=10,20,99",
   "{\"year\":2025,\"span\":[-3000,2025],\"qids\":[],\"pins\":[{\"id\":null,\"lat\":-89.9,\"lng\":179.9,\"label\":\"ok\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&span=-900,-950",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&year=-950.5",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&at=31.5,35,1.2",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[],\"routes\":[],\"scene\":null,\"at\":{\"lat\":31.5,\"lng\":35,\"altitude\":1.2}}"],
  ["#v=2&year=100&year=200&foo=bar",
   "{\"year\":100,\"span\":null,\"qids\":[],\"pins\":[],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&year=%2D950&span=-970%2C-931&at=31.5%2C35%2C1.2",
   "{\"year\":-950,\"span\":[-970,-931],\"qids\":[],\"pins\":[],\"routes\":[],\"scene\":null,\"at\":{\"lat\":31.5,\"lng\":35,\"altitude\":1.2}}"],
  ["#v=2&qid=Q1,Q1,Q2&route=a,a,b",
   "{\"year\":null,\"span\":null,\"qids\":[\"Q1\",\"Q2\"],\"pins\":[],\"routes\":[\"a\",\"b\"],\"scene\":null,\"at\":null}"],
  ["#v=2&scene=solomon-trade&year=-950",
   "{\"year\":-950,\"span\":null,\"qids\":[],\"pins\":[],\"routes\":[],\"scene\":\"solomon-trade\",\"at\":null}"],
  ["#v=2&pins=@1,2~;@3,4~%20%20;@5,6~",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":1,\"lng\":2,\"label\":null},{\"id\":null,\"lat\":3,\"lng\":4,\"label\":null},{\"id\":null,\"lat\":5,\"lng\":6,\"label\":null}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=;;@1,2;;",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":1,\"lng\":2,\"label\":null}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=@1,2~T%C3%BDros%20%E2%80%94%20%D7%A6%D7%95%D7%A8",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":null,\"lat\":1,\"lng\":2,\"label\":\"Týros — צור\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&qid=&route=&pins=",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=atlas:jerusalem@31.78,35.22~a~b~c",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":\"atlas:jerusalem\",\"lat\":31.78,\"lng\":35.22,\"label\":\"a~b~c\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
  ["#v=2&pins=pleiades%3A678378@33.27,35.20~Tyrus",
   "{\"year\":null,\"span\":null,\"qids\":[],\"pins\":[{\"id\":\"pleiades:678378\",\"lat\":33.27,\"lng\":35.2,\"label\":\"Tyrus\"}],\"routes\":[],\"scene\":null,\"at\":null}"],
];

let failed = 0, checks = 0;
const eq = (name, got, want) => {
  checks++;
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

// Encoded separators (%2C %3B %40 %7E): read as separators where a value has no
// literal one of that kind; literal ones win; encoding is undone once only.
const lit = "#v=2&year=-950&span=-970,-931&qid=Q3185305,Q41642" +
  "&pins=@33.27,35.20~Tyrus;@29.55,34.98~Ezion-geber;@29.56,34.95~Elath&route=tyre-jerusalem,levant-red-sea";
const want = parseLink(lit);
const encAll = s => s.replace(/,/g, "%2C").replace(/;/g, "%3B").replace(/@/g, "%40").replace(/~/g, "%7E");
const encOnly = (s, ch, code) => s.replace(/&[^&]*/g, part => part.split(ch).join(code));
eq("literal form", [want.pins.length, want.qids.length, want.routes.length], [3, 2, 2]);
eq("fully encoded", parseLink(encAll(lit)), want);
eq("fully encoded, lower-case hex", parseLink(encAll(lit).replace(/%(2C|3B|40|7E)/g, m => m.toLowerCase())), want);
eq("encodeURIComponent per value", parseLink(lit.replace(/=([^&]*)/g, (_, v) => "=" + encodeURIComponent(v))), want);
eq("only , encoded", parseLink(encOnly(lit, ",", "%2C")), want);
eq("only ; encoded", parseLink(encOnly(lit, ";", "%3B")), want);
eq("only @ encoded", parseLink(encOnly(lit, "@", "%40")), want);
eq("only ~ encoded", parseLink(encOnly(lit, "~", "%7E")), want);
eq("encoded id colon", parseLink("#v=2&pins=pleiades%3A678378%4033.27%2C35.20%7ETyrus%3Batlas%3Ajerusalem%4031.78%2C35.22").pins, [
  { id: "pleiades:678378", lat: 33.27, lng: 35.2, label: "Tyrus" },
  { id: "atlas:jerusalem", lat: 31.78, lng: 35.22, label: null }]);

// Labels: free text, decoded once; an encoded separator in a label stays text.
eq("label text, fully encoded link", parseLink("#v=2&pins=%401%2C2%7Ea%3Bb%2Cc%7Ed%40e%3B%403%2C4%7EOld%20City%2C%20north").pins, [
  { id: null, lat: 1, lng: 2, label: "a;b,c~d@e" },
  { id: null, lat: 3, lng: 4, label: "Old City, north" }]);
eq("label text, one pin", parseLink("#v=2&pins=@1,2~a%3Bb%3B%40c%3B@x").pins, [{ id: null, lat: 1, lng: 2, label: "a;b;@c;@x" }]);
eq("label text: ; then @ without coordinates", parseLink("#v=2&pins=@1,2~A%3B@33").pins, [{ id: null, lat: 1, lng: 2, label: "A;@33" }]);
eq("label ; followed by a pin: read as two pins", parseLink("#v=2&pins=@1,2~A%3B@3,4~B").pins, [
  { id: null, lat: 1, lng: 2, label: "A" }, { id: null, lat: 3, lng: 4, label: "B" }]);
eq("literal ; present: encoded ; is text", parseLink("#v=2&pins=@1,2~A%3B@3,4~B;@5,6").pins, [
  { id: null, lat: 1, lng: 2, label: "A;@3,4~B" }, { id: null, lat: 5, lng: 6, label: null }]);
eq("first ~ cuts, later %7E is text", parseLink("#v=2&pins=@1,2%7Ea%7Eb").pins, [{ id: null, lat: 1, lng: 2, label: "a~b" }]);
eq("first @ cuts, later %40 is text", parseLink("#v=2&pins=%401,2~a%40b").pins, [{ id: null, lat: 1, lng: 2, label: "a@b" }]);

// Mixed within one value: the literal kind counts, the encoded one is text.
eq("mixed qid: literal , wins", parseLink("#v=2&qid=Q1,Q2%2CQ3").qids, ["Q1"]);
eq("mixed route: literal , wins", parseLink("#v=2&route=a%2Cb,c").routes, ["c"]);
eq("mixed coordinates dropped", parseLink("#v=2&pins=@1,2%2C3~x;@4%2C5~y;@6,7%7Ex~z").pins, [
  { id: null, lat: 4, lng: 5, label: "y" }]);
eq("each value decides alone", parseLink("#v=2&qid=Q1%2CQ2&route=a,b&pins=@1,2~x%3B%403%2C4").qids, ["Q1", "Q2"]);

// Double encoding is not undone: its separators are not read.
eq("double-encoded qid dropped", parseLink("#v=2&qid=Q1%252CQ2").qids, []);
eq("double-encoded pins dropped", parseLink("#v=2&pins=%25401%252C2%257Ex%253B%25403%252C4").pins, []);
eq("double-encoded label shown once decoded", parseLink("#v=2&pins=@1,2~a%252Cb%2520c").pins[0].label, "a%2Cb%20c");
const dbl = parseLink(encAll(lit).replace(/%/g, "%25"));
eq("fully double-encoded: only the year", [dbl.year, dbl.span, dbl.qids, dbl.pins, dbl.routes], [-950, null, [], [], []]);

// Hostile or malformed, encoded: still dropped item by item, labels stay text, caps hold.
const hostile = parseLink("#v=2&pins=%401%2C2%7E%3Cscript%3Ealert(1)%3C%2Fscript%3E%3B%4091%2C0%7Ex%3B%400%2C181%3B%401e3%2C0%3B" +
  "foo%3A1%401%2C1%3Bpleiades%3A%401%2C1%3B%40%40%2C%2C%3B%401%2C2%2C3%3B%403%2C4%7E%E0%A4%A%3B%405%2C6%7E" + "y".repeat(60) +
  "&qid=Q1%2CX2%2CQ0%2CQ3%2CQ4&route=a%2CB!%2Cb%2Cc%2Cd&span=-900%2C-950&at=10%2C20%2C99");
eq("hostile encoded pins", hostile.pins, [
  { id: null, lat: 1, lng: 2, label: "<script>alert(1)</script>" },
  { id: null, lat: 3, lng: 4, label: null },
  { id: null, lat: 5, lng: 6, label: "y".repeat(40) }]);
eq("hostile encoded qids, routes, span, at", [hostile.qids, hostile.routes, hostile.span, hostile.at], [["Q1", "Q3"], ["a", "b", "c"], null, null]);
eq("8 pins max, encoded", parseLink("#v=2&pins=" + encAll(many)).pins.length, 8);
eq("stray % and empty pieces", parseLink("#v=2&pins=%;%3B;%40;@%2C;~%7E&qid=%2C%2C&route=%2C").pins, []);
eq("encoded & and = are not keys", parseLink("#v=2&year=-950%26qid%3DQ1").qids, []);
// Minus and decimal point written %2D and %2E (either case) in the numbers of pins, at, span.
eq("pin %2E", parseLink("#v=2&pins=@33%2E27,35%2E20~Tyrus").pins, [{ id: null, lat: 33.27, lng: 35.2, label: "Tyrus" }]);
eq("pin %2D and lower-case %2e", parseLink("#v=2&pins=@%2D33%2e8688,151.2093~Sydney").pins, [{ id: null, lat: -33.8688, lng: 151.2093, label: "Sydney" }]);
eq("pin lower-case %2d, fully encoded", parseLink("#v=2&pins=%40%2d33%2E87%2C%2D70%2e5%7Ex").pins, [{ id: null, lat: -33.87, lng: -70.5, label: "x" }]);
eq("encodeURIComponent plus %2D %2E", parseLink("#v=2&pins=" + encodeURIComponent("@-33.87,151.21~Sydney;@-34.93,138.6~Adelaide").replace(/-/g, "%2D").replace(/\./g, "%2E")).pins, [
  { id: null, lat: -33.87, lng: 151.21, label: "Sydney" }, { id: null, lat: -34.93, lng: 138.6, label: "Adelaide" }]);
eq("encoded ; before a pin with %2D starts a pin", parseLink("#v=2&pins=@1,2~A%3B@%2D3%2E5,4~B").pins, [
  { id: null, lat: 1, lng: 2, label: "A" }, { id: null, lat: -3.5, lng: 4, label: "B" }]);
eq("%2D %2E in a label stay as written, decoded once", parseLink("#v=2&pins=@1,2~a%2Db%2Ec").pins[0].label, "a-b.c");
eq("span and at with %2D %2E", (v => [v.span, v.at])(parseLink("#v=2&span=%2D970,%2d931&at=31%2E5,%2D35,1%2e2")), [[-970, -931], { lat: 31.5, lng: -35, altitude: 1.2 }]);
eq("nothing else loosened: other escapes in coordinates", parseLink("#v=2&pins=@%333,4;@3%2C4%2C5;@3%2E%2E5,4;@%2D%2D3,4;@3,4%20;@%252D3,4;@3%2F5,4").pins, []);
eq("year stays an integer", parseLink("#v=2&year=%2D950%2E5").year, null);
const before = BEFORE.filter(([h, w]) => JSON.stringify(parseLink(h)) !== w);
eq(`regression: ${BEFORE.length} links read as on main`, before.map(([h]) => h), []);

// A link that asked for pins, polities or routes, with nothing of them shown: say so.
const shownBy = h => { const v = parseLink(h); return { pins: v.pins.length, routes: v.routes.length, polities: v.qids.length }; };
const unread = h => linkUnread(h, shownBy(h));
eq("unread: every pin invalid", unread("#v=2&year=-950&pins=@91,0~x;foo:1@1,1"), true);
eq("unread: every item invalid", unread("#v=2&pins=@91,0&qid=X1&route=B!"), true);
eq("unread: double-encoded", unread("#v=2&qid=Q1%252CQ2"), true);
eq("unread: route id Atlas does not know", linkUnread("#v=2&route=no-such-route", { routes: 0 }), true);
eq("not unread: some items survived", unread("#v=2&pins=@91,0;@1,2~ok&route=B!"), false);
eq("not unread: only year", unread("#v=2&year=-950"), false);
eq("not unread: only at", unread("#v=2&at=31.5,35,1.2"), false);
eq("not unread: empty values", unread("#v=2&qid=&route=&pins="), false);
eq("not unread: the solomon link", unread(lit), false);
eq("not unread: not a link view", linkUnread("#about"), false);

eq("span label BCE", spanLabel([-970, -931]), "c. 970–931 BCE");
eq("span label across 0", spanLabel([-30, 14]), "c. 30 BCE – 14 CE");
const f = frameFor([{ lat: 33.27, lng: 35.2 }, { lat: 29.5, lng: 34.97 }], 1);
eq("frame centre", [+f.lat.toFixed(2), +f.lng.toFixed(2)], [31.39, 35.09]);
const w = frameFor([{ lat: 0, lng: 179 }, { lat: 0, lng: -179 }], 1);
eq("frame across the antimeridian", Math.abs(w.lng) > 179 && w.altitude < 0.5, true);

if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log(`OK: link format parser — ${checks} checks: ids, ranges, caps, labels, encoded separators, regression, framing`);
