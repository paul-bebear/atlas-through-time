// Time slider. The slider track is uniform; years are mapped through a
// non-linear (log) scale so recent centuries get more room. The big year
// readout and the tick labels both read from the same scale, so the slider
// thumb, the label, and the ticks always agree.

import { SLIDER_MIN, SLIDER_MAX, yearLabel, yearToPos, posToYear } from "./data.js";

const STEPS = 4000; // slider resolution (fine near present, coarse in antiquity)

export function createTimeline({ onChange, onSurprise, initialYear = 1900 }) {
  const slider = document.getElementById("slider");
  const yearLabelEl = document.getElementById("yearLabel");
  const status = document.getElementById("status");
  const ticks = document.getElementById("ticks");
  const playBtn = document.getElementById("play");
  const stepGroup = document.getElementById("stepGroup");

  slider.min = 0;
  slider.max = STEPS;
  slider.step = 1;

  // Ticks sit where the semi-log scale puts them (1 CE a third along). Phones
  // hide the minor ones (CSS) so the 10px labels never overprint at 375px.
  const MINOR_TICKS = new Set([-1000, 500, 1800]);
  [-3000, -1000, 1, 500, 1000, 1500, 1800, 2000].forEach(y => {
    const s = document.createElement("span");
    s.textContent = yearLabel(y);
    if (MINOR_TICKS.has(y)) s.className = "tick-minor";
    s.style.left = yearToPos(y) * 100 + "%";
    ticks.appendChild(s);
  });

  let year = initialYear;
  let step = 5;
  let timer = null;

  function apply() {
    year = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, year));
    yearLabelEl.textContent = yearLabel(year);
    slider.value = Math.round(yearToPos(year) * STEPS);
    slider.setAttribute("aria-valuetext", yearLabel(year));
    onChange(year);
  }

  const setStatus = t => { status.textContent = t; };
  const setYear = y => { year = y; apply(); };

  // Span + marker overlay on the track (war/formation period, key moments).
  const marksEl = document.getElementById("trackMarks");
  const clamp01 = v => Math.max(0, Math.min(1, v));

  // The link's era band (.tlink) is not an overlay: it stays until clearLinkSpan.
  function clearOverlays() {
    marksEl.querySelectorAll(":scope > :not(.tlink)").forEach(n => n.remove());
    marksEl.classList.remove("has-span");
  }
  // The selection's name has its own lane above the event marks, centred on its span
  // but kept inside the track (cut short with … only if longer than the track).
  function placeSpanLabel() {
    const tag = marksEl.querySelector(".tspan-label");
    if (!tag) return;
    const W = marksEl.clientWidth, w = tag.offsetWidth;
    tag.style.left = Math.max(0, Math.min(W - w, +tag.dataset.mid * W - w / 2)) + "px";
  }
  if ("ResizeObserver" in window) new ResizeObserver(placeSpanLabel).observe(marksEl);

  function setSpan(start, end, label) {
    clearOverlays();
    if (start == null) return;
    const a = clamp01(yearToPos(start)), b = clamp01(yearToPos(end));
    const bar = document.createElement("div");
    bar.className = "tspan";
    // Centred on the span, never narrower than a few px (a 40-year span in antiquity is a dot).
    bar.style.left = ((a + b) / 2) * 100 + "%";
    bar.style.width = `max(8px, ${(b - a) * 100}%)`;
    bar.title = `${label}: ${yearLabel(start)} – ${yearLabel(end)}`;
    bar.onclick = () => setYear(start);
    marksEl.append(bar);
    if (!label) return;
    const tag = document.createElement("div");
    tag.className = "tspan-label";
    tag.dataset.mid = (a + b) / 2;
    tag.textContent = label;
    marksEl.append(tag);
    marksEl.classList.add("has-span");
    placeSpanLabel();
  }

  // The era band a link carries ("c. 970–931 BCE"), in its own lane under the
  // selection's span: a selection never replaces it, only clearLinkSpan does.
  // At least 12 px wide; its label sits beside it, never on it.
  function setLinkSpan(start, end, label) {
    clearLinkSpan();
    if (start == null) return;
    const a = clamp01(yearToPos(start)), b = clamp01(yearToPos(end)), m = (a + b) / 2;
    const bar = document.createElement("div");
    bar.className = "tlink tlink-bar";
    bar.style.left = m * 100 + "%";
    bar.style.width = `max(12px, ${(b - a) * 100}%)`;
    bar.title = `${label}: ${yearLabel(start)} – ${yearLabel(end)} (from the link you opened)`;
    bar.onclick = () => setYear(start);
    const tag = document.createElement("div");
    tag.className = "tlink tlink-label" + (m > 0.7 ? " tlink-left" : "");
    tag.style.left = `calc(${m * 100}% ${m > 0.7 ? "-" : "+"} max(6px, ${(b - a) * 50}%) ${m > 0.7 ? "-" : "+"} 6px)`;
    tag.textContent = label;
    marksEl.append(bar, tag);
    marksEl.classList.add("has-link");
  }
  function clearLinkSpan() {
    marksEl.querySelectorAll(".tlink").forEach(n => n.remove());
    marksEl.classList.remove("has-link");
  }

  // years: array of { year, label } — clickable key-moment ticks.
  function setMarkers(items) {
    marksEl.querySelectorAll(".tmark").forEach(n => n.remove());
    for (const it of items || []) {
      const m = document.createElement("div");
      m.className = "tmark";
      m.style.left = clamp01(yearToPos(it.year)) * 100 + "%";
      m.title = `${it.label} · ${yearLabel(it.year)}`;
      m.onclick = () => setYear(it.year);
      marksEl.appendChild(m);
    }
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; playBtn.textContent = "▶"; }
  }

  // Dragging fires input continuously. Keep the year readout live on every
  // tick (cheap), but coalesce the heavy onChange (border fetch/tessellate)
  // so a fast scrub renders the destination, not every snapshot en route.
  let scrubTimer = null;
  slider.addEventListener("input", () => {
    year = posToYear(+slider.value / STEPS);
    yearLabelEl.textContent = yearLabel(year);
    slider.setAttribute("aria-valuetext", yearLabel(year));
    clearTimeout(scrubTimer);
    scrubTimer = setTimeout(() => onChange(year), 55);
  });

  document.getElementById("prev").onclick = () => { stop(); year -= step; apply(); };
  document.getElementById("next").onclick = () => { stop(); year += step; apply(); };

  playBtn.onclick = () => {
    if (timer) return stop();
    playBtn.textContent = "⏸";
    timer = setInterval(() => {
      if (year >= SLIDER_MAX) return stop();
      year += step; apply();
    }, 400);
  };

  stepGroup.querySelectorAll("button").forEach(b => {
    b.onclick = () => {
      step = +b.dataset.step;
      stepGroup.querySelectorAll("button").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
    };
  });

  document.getElementById("surprise").onclick = () => { stop(); onSurprise(); };

  apply();
  return { setStatus, setYear, setSpan, setLinkSpan, clearLinkSpan, setMarkers, clearOverlays, currentYear: () => year };
}
