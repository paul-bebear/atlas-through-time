// Country search. Curated catalog ranks instantly; the full Supabase
// polity registry (907+) is queried (debounced) and appended, so any
// historical polity is findable — not just the 30 curated ones.
// onPick(hit) where hit = {kind:'curated', entry} | {kind:'db', polity}.

import { searchPolities, dbEnabled } from "./db.js";

export function createSearch({ catalog, onPick }) {
  const input = document.getElementById("searchInput");
  const res = document.getElementById("searchResults");
  let hits = [], sel = -1, seq = 0, timer = null;

  const clear = () => { res.innerHTML = ""; hits = []; sel = -1; };

  function rankCurated(q) {
    q = q.toLowerCase();
    return catalog
      .map(c => {
        const name = c.entry.name.toLowerCase();
        let score = -1;
        if (name === q) score = 0;
        else if (name.startsWith(q)) score = 1;
        else if (name.includes(q)) score = 2;
        else if ((c.entry.aliases || []).some(a => a.includes(q))) score = 3;
        return { c, score };
      })
      .filter(x => x.score >= 0)
      .sort((a, b) => a.score - b.score || a.c.entry.name.localeCompare(b.c.entry.name))
      .slice(0, 8)
      .map(x => ({ kind: "curated", label: x.c.entry.name, entry: x.c.entry }));
  }

  function render() {
    res.innerHTML = hits.map((h, i) =>
      `<div class="sr${i === sel ? " on" : ""}" data-i="${i}">${h.label}` +
      (h.kind === "db" ? `<small>${spanText(h.polity)}</small>` : "") +
      `</div>`).join("");
    res.querySelectorAll(".sr").forEach(el => {
      el.onmousedown = e => { e.preventDefault(); pick(+el.dataset.i); };
    });
  }

  function pick(i) {
    const h = hits[i];
    if (!h) return;
    input.value = h.label;
    clear();
    input.blur();
    onPick(h);
  }

  function update() {
    const q = input.value.trim();
    if (!q) return clear();
    const curated = rankCurated(q);
    hits = curated; sel = -1; render();
    if (!dbEnabled()) return;
    const mine = ++seq;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const pols = await searchPolities(q);
        if (mine !== seq) return; // superseded
        const curatedNames = new Set(curated.map(h => h.label.toLowerCase()));
        const dbHits = pols
          .filter(p => !curatedNames.has(p.canonical_name.toLowerCase()))
          .slice(0, 10)
          .map(p => ({ kind: "db", label: p.canonical_name, polity: p }));
        hits = [...curated, ...dbHits];
        render();
      } catch { /* DB optional; keep curated */ }
    }, 220);
  }

  input.addEventListener("input", update);
  input.addEventListener("keydown", e => {
    if (!hits.length) return;
    if (e.key === "ArrowDown") { sel = Math.min(hits.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter") { pick(sel < 0 ? 0 : sel); }
    else if (e.key === "Escape") { clear(); input.blur(); }
  });
  document.addEventListener("click", e => { if (!e.target.closest("#search")) clear(); });
}

function spanText(p) {
  const y = v => v == null ? "" : (v < 0 ? Math.abs(v) + " BCE" : v + " CE");
  if (p.start_year == null && p.end_year == null) return "";
  return `  ${y(p.start_year)}${p.end_year != null ? " – " + y(p.end_year) : "+"}`;
}
