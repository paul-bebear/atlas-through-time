// Nation-formation panel: watch a country coalesce, stepping through stages.
// Mirrors the wars panel but with a stage stepper for "click through".

import { yearLabel } from "./data.js";

const ERAS = [
  ["Antiquity", y => y < 500],
  ["Middle Ages", y => y >= 500 && y < 1500],
  ["Early modern", y => y >= 1500 && y < 1800],
  ["Modern", y => y >= 1800]
];

export function createFormationsPanel({ formations, onSelect, onJumpYear }) {
  const listEl = document.getElementById("formationsList");
  const detailEl = document.getElementById("formationDetail");
  let activeId = null;
  let current = null;
  let stageIdx = 0;

  function renderList() {
    listEl.innerHTML = "";
    for (const [label, test] of ERAS) {
      const group = formations.filter(f => test(f.start)).sort((a, b) => a.start - b.start);
      if (!group.length) continue;
      const h = document.createElement("div");
      h.className = "era-group";
      h.textContent = label;
      listEl.appendChild(h);
      for (const f of group) {
        const item = document.createElement("div");
        item.className = "war-item" + (f.id === activeId ? " active" : "");
        item.innerHTML = `<div class="wn">${f.name}</div>
          <div class="wy">${yearLabel(f.start)} – ${yearLabel(f.end)}</div>`;
        item.onclick = () => select(f);
        listEl.appendChild(item);
      }
    }
  }

  function select(f) {
    activeId = f.id;
    current = f;
    stageIdx = 0;
    renderList();
    onSelect(f);
    goStage(0);
  }

  function goStage(i) {
    if (!current) return;
    stageIdx = Math.max(0, Math.min(current.stages.length - 1, i));
    onJumpYear(current.stages[stageIdx].year);
    renderDetail();
  }

  function renderDetail() {
    const f = current;
    const steps = f.stages.map((s, i) =>
      `<div class="stage${i === stageIdx ? " on" : ""}" data-i="${i}">
        <span class="sy">${yearLabel(s.year)}</span><span class="sl">${s.label}</span>
      </div>`).join("");

    detailEl.hidden = false;
    detailEl.innerHTML = `
      <h3>${f.name}</h3>
      <div class="meta">${yearLabel(f.start)} – ${yearLabel(f.end)}</div>
      <p>${f.summary}</p>
      <div class="stage-nav">
        <button id="stPrev" title="Previous stage">◀</button>
        <div class="stage-count">Stage ${stageIdx + 1} / ${f.stages.length}</div>
        <button id="stNext" title="Next stage">▶</button>
      </div>
      <div class="stages-list">${steps}</div>`;

    detailEl.querySelector("#stPrev").onclick = () => goStage(stageIdx - 1);
    detailEl.querySelector("#stNext").onclick = () => goStage(stageIdx + 1);
    detailEl.querySelectorAll(".stage").forEach(el => {
      el.onclick = () => goStage(+el.dataset.i);
    });
  }

  renderList();
  return {};
}

// One highlight group (side "A") for the forming nation and its components.
export function formationHighlights(f) {
  return f ? [{ names: f.highlight || [], side: "A" }] : [];
}
