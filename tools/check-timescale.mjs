#!/usr/bin/env node
// Guard for the timeline's semi-log year scale (src/data.js). The user wants
// year 0 about a third of the way along the slider; a linear scale puts it at
// ~60%. Run:  node tools/check-timescale.mjs   (exits 1 on any failure)

import { SLIDER_MIN, SLIDER_MAX, yearToPos, posToYear } from "../src/data.js";

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

check(yearToPos(SLIDER_MIN) === 0, `yearToPos(${SLIDER_MIN}) = ${yearToPos(SLIDER_MIN)}, want 0`);
check(yearToPos(SLIDER_MAX) === 1, `yearToPos(${SLIDER_MAX}) = ${yearToPos(SLIDER_MAX)}, want 1`);
check(posToYear(0) === SLIDER_MIN, `posToYear(0) = ${posToYear(0)}, want ${SLIDER_MIN}`);
check(posToYear(1) === SLIDER_MAX, `posToYear(1) = ${posToYear(1)}, want ${SLIDER_MAX}`);

const p0 = yearToPos(0);
check(p0 >= 0.30 && p0 <= 0.36, `yearToPos(0) = ${p0}, want 0.30..0.36 (year 0 a third along)`);

let prev = -Infinity, badMono = 0, badTrip = 0;
for (let y = SLIDER_MIN; y <= SLIDER_MAX; y++) {
  const p = yearToPos(y);
  if (!(p > prev)) badMono++;
  if (posToYear(p) !== y) badTrip++;
  prev = p;
}
check(badMono === 0, `yearToPos not strictly increasing at ${badMono} years`);
check(badTrip === 0, `posToYear(yearToPos(y)) !== y for ${badTrip} years`);

let prevY = -Infinity, badInv = 0;
for (let i = 0; i <= 10000; i++) {
  const y = posToYear(i / 10000);
  if (!Number.isInteger(y) || Object.is(y, -0) || y < prevY) badInv++;
  prevY = y;
}
check(badInv === 0, `posToYear not integer/non-decreasing at ${badInv} positions`);

const fmt = v => v.toFixed(4);
console.log(`range ${SLIDER_MIN}..${SLIDER_MAX}; yearToPos(0) = ${fmt(p0)}; ` +
  `posToYear at 0, 1/3, 1/2, 2/3, 1 = ${[0, 1 / 3, 1 / 2, 2 / 3, 1].map(posToYear).join(", ")}`);
if (fails.length) {
  console.error("FAIL\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("OK: endpoints exact, strictly monotonic, round-trip stable, year 0 at a third");
