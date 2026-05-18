// Wars panel: list conflicts, jump the timeline, highlight belligerents.

import { yearLabel } from "./data.js";

export function createWarsPanel({ wars, onSelectWar, onJumpYear }) {
  const listEl = document.getElementById("warsList");
  const detailEl = document.getElementById("warDetail");
  let activeId = null;

  const ERAS = [
    ["Antiquity", y => y < 500],
    ["Middle Ages", y => y >= 500 && y < 1500],
    ["Early modern", y => y >= 1500 && y < 1800],
    ["Modern", y => y >= 1800]
  ];

  function renderList() {
    listEl.innerHTML = "";
    for (const [label, test] of ERAS) {
      const group = wars.filter(w => test(w.start)).sort((a, b) => a.start - b.start);
      if (!group.length) continue;
      const h = document.createElement("div");
      h.className = "era-group";
      h.textContent = label;
      listEl.appendChild(h);
      for (const w of group) {
        const item = document.createElement("div");
        item.className = "war-item" + (w.id === activeId ? " active" : "");
        item.innerHTML = `<div class="wn">${w.name}</div>
          <div class="wy">${yearLabel(w.start)} – ${yearLabel(w.end)}</div>`;
        item.onclick = () => select(w);
        listEl.appendChild(item);
      }
    }
  }

  function select(w) {
    activeId = w.id;
    renderList();
    renderDetail(w);
    onSelectWar(w);
    // Jump to the first snapshot at/just before the war begins.
    const snaps = w.snapshots || [];
    onJumpYear(snaps[0] ?? w.start);
  }

  function renderDetail(w) {
    const sideTags = Object.entries(w.sides)
      .map(([label, names]) =>
        `<div><strong>${label}</strong><div class="sides">${
          names.map(n => `<span class="tag">${n}</span>`).join("")
        }</div></div>`)
      .join("");

    const jumps = (w.snapshots || [])
      .map(y => `<button data-y="${y}">${yearLabel(y)}</button>`).join("");

    detailEl.hidden = false;
    detailEl.innerHTML = `
      <h3>${w.name}</h3>
      <div class="meta">${yearLabel(w.start)} – ${yearLabel(w.end)}</div>
      ${sideTags}
      <p>${w.summary}</p>
      <div class="meta">Jump to a snapshot to watch the borders shift:</div>
      <div class="war-jump">${jumps}</div>
    `;
    detailEl.querySelectorAll("button[data-y]").forEach(b => {
      b.onclick = () => onJumpYear(+b.dataset.y);
    });
  }

  renderList();
  return {};
}

// Build globe highlight groups from a war definition.
export function warHighlights(w) {
  if (!w) return [];
  const entries = Object.values(w.sides);
  return [
    { names: entries[0] || [], side: "A" },
    { names: entries[1] || [], side: "B" }
  ];
}
