// Time slider. The slider track is uniform; years are mapped through a
// non-linear (log) scale so recent centuries get more room. The big year
// readout and the tick labels both read from the same scale, so the slider
// thumb, the label, and the ticks always agree.

import { SLIDER_MIN, SLIDER_MAX, yearLabel, yearToPos, posToYear } from "./data.js";

const STEPS = 4000; // slider resolution (fine near present, coarse in antiquity)

export function createTimeline({ onChange, onSurprise }) {
  const slider = document.getElementById("slider");
  const yearLabelEl = document.getElementById("yearLabel");
  const status = document.getElementById("status");
  const ticks = document.getElementById("ticks");
  const playBtn = document.getElementById("play");
  const stepGroup = document.getElementById("stepGroup");

  slider.min = 0;
  slider.max = STEPS;
  slider.step = 1;

  [-3000, -1000, -300, 1, 800, 1500, 1850, 2000].forEach(y => {
    const s = document.createElement("span");
    s.textContent = yearLabel(y);
    s.style.left = yearToPos(y) * 100 + "%";
    ticks.appendChild(s);
  });

  let year = 1900;
  let step = 5;
  let timer = null;

  function apply() {
    year = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, year));
    yearLabelEl.textContent = yearLabel(year);
    slider.value = Math.round(yearToPos(year) * STEPS);
    onChange(year);
  }

  const setStatus = t => { status.textContent = t; };
  const setYear = y => { year = y; apply(); };

  // Span + marker overlay on the track (war/formation period, key moments).
  const marksEl = document.getElementById("trackMarks");
  const clamp01 = v => Math.max(0, Math.min(1, v));

  function clearOverlays() { marksEl.innerHTML = ""; }

  function setSpan(start, end, label) {
    clearOverlays();
    if (start == null) return;
    const a = clamp01(yearToPos(start)), b = clamp01(yearToPos(end));
    const bar = document.createElement("div");
    bar.className = "tspan";
    bar.style.left = a * 100 + "%";
    bar.style.width = Math.max(0.6, (b - a) * 100) + "%";
    bar.title = `${label}: ${yearLabel(start)} – ${yearLabel(end)}`;
    bar.onclick = () => setYear(start);
    const tag = document.createElement("div");
    tag.className = "tspan-label";
    tag.style.left = ((a + b) / 2) * 100 + "%";
    tag.textContent = label;
    marksEl.append(bar, tag);
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

  slider.addEventListener("input", () => {
    year = posToYear(+slider.value / STEPS);
    yearLabelEl.textContent = yearLabel(year);
    onChange(year);
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
  return { setStatus, setYear, setSpan, setMarkers, clearOverlays, currentYear: () => year };
}
