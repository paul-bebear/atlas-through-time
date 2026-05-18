// Country search box. Ranks the curated catalog by name/alias match;
// keyboard navigable. onPick(entry) fires when a country is chosen.

export function createSearch({ catalog, onPick }) {
  const input = document.getElementById("searchInput");
  const res = document.getElementById("searchResults");
  let hits = [], sel = -1;

  const clear = () => { res.innerHTML = ""; hits = []; sel = -1; };

  function rank(q) {
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
      .map(x => x.c);
  }

  function render() {
    res.innerHTML = hits
      .map((h, i) => `<div class="sr${i === sel ? " on" : ""}" data-i="${i}">${h.entry.name}</div>`)
      .join("");
    res.querySelectorAll(".sr").forEach(el => {
      // mousedown (not click) so it fires before the input blur clears the list
      el.onmousedown = e => { e.preventDefault(); pick(+el.dataset.i); };
    });
  }

  function pick(i) {
    const h = hits[i];
    if (!h) return;
    input.value = h.entry.name;
    clear();
    input.blur();
    onPick(h.entry);
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (!q) return clear();
    hits = rank(q); sel = -1; render();
  });

  input.addEventListener("keydown", e => {
    if (!hits.length) return;
    if (e.key === "ArrowDown") { sel = Math.min(hits.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter") { pick(sel < 0 ? 0 : sel); }
    else if (e.key === "Escape") { clear(); input.blur(); }
  });

  document.addEventListener("click", e => { if (!e.target.closest("#search")) clear(); });
}
