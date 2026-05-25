// Country search. Results are grouped:
//   • curated catalog (the rich 30)
//   • continuity THREADS — the headline; click plays the whole thread,
//     the ▸ arrow expands its ordered stages (members) which you can
//     jump straight to
//   • other / overlapping polities not on any thread spine
//
// onPick(hit):
//   {kind:'curated', entry}
//   {kind:'thread', thread}                  → play whole thread
//   {kind:'thread', thread, atPolityId}      → play thread, jump to stage
//   {kind:'db', polity}                      → single polity

import { searchPolities, searchThreads, threadMembers, dbEnabled } from "./db.js";

const yrtxt = v => v == null ? "" : (v < 0 ? Math.abs(v) + " BCE" : v + " CE");
const span = p => (p.start_year == null && p.end_year == null) ? ""
  : `  ${yrtxt(p.start_year)}${p.end_year != null ? " – " + yrtxt(p.end_year) : "+"}`;

export function createSearch({ catalog, onPick }) {
  const input = document.getElementById("searchInput");
  const res = document.getElementById("searchResults");
  let rows = [], sel = -1, seq = 0, timer = null;
  const expanded = new Set();

  const clear = () => { res.innerHTML = ""; rows = []; sel = -1; expanded.clear(); };

  function rankCurated(q) {
    q = q.toLowerCase();
    return catalog
      .map(c => {
        const name = c.entry.name.toLowerCase();
        let s = -1;
        if (name === q) s = 0;
        else if (name.startsWith(q)) s = 1;
        else if (name.includes(q)) s = 2;
        else if ((c.entry.aliases || []).some(a => a.includes(q))) s = 3;
        return { c, s };
      })
      .filter(x => x.s >= 0)
      .sort((a, b) => a.s - b.s || a.c.entry.name.localeCompare(b.c.entry.name))
      .slice(0, 6)
      .map(x => ({ kind: "curated", label: x.c.entry.name, entry: x.c.entry }));
  }

  // Flatten groups into the rendered row list (member rows appear under an
  // expanded thread header).
  function buildRows(curated, threads, dbHits) {
    const out = [...curated];
    for (const t of threads) {
      out.push({ kind: "thread", label: t.display_name, thread: t,
        memberCount: t._members.length });
      if (expanded.has(t.id))
        for (const m of t._members)
          out.push({
            kind: "thread-member", thread: t, polity: m.polity,
            label: m.polity.canonical_name, role: m.role
          });
    }
    for (const p of dbHits) out.push({ kind: "db", label: p.canonical_name, polity: p });
    return out;
  }

  function render() {
    res.innerHTML = rows.map((h, i) => {
      const on = i === sel ? " on" : "";
      if (h.kind === "thread") {
        const caret = h.memberCount
          ? `<span class="sr-exp" data-i="${i}">${expanded.has(h.thread.id) ? "▾" : "▸"}</span>`
          : "";
        return `<div class="sr sr-thread${on}" data-i="${i}">${caret}🧵 ${h.label}` +
          `<small>thread · ${h.memberCount} stages</small></div>`;
      }
      if (h.kind === "thread-member")
        return `<div class="sr sr-member${on}" data-i="${i}">↳ ${h.label}` +
          `<small>${h.role}${span(h.polity)}</small></div>`;
      if (h.kind === "db")
        return `<div class="sr${on}" data-i="${i}">${h.label}<small>${span(h.polity)}</small></div>`;
      return `<div class="sr${on}" data-i="${i}">${h.label}</div>`;
    }).join("");

    res.querySelectorAll(".sr-exp").forEach(el => {
      el.onmousedown = e => {
        e.preventDefault(); e.stopPropagation();
        const h = rows[+el.dataset.i];
        expanded.has(h.thread.id) ? expanded.delete(h.thread.id) : expanded.add(h.thread.id);
        rows = buildRows(base.curated, base.threads, base.db);
        render();
      };
    });
    res.querySelectorAll(".sr").forEach(el => {
      el.onmousedown = e => {
        if (e.target.classList.contains("sr-exp")) return;
        e.preventDefault();
        pick(+el.dataset.i);
      };
    });
  }

  let base = { curated: [], threads: [], db: [] };

  function pick(i) {
    const h = rows[i];
    if (!h) return;
    if (h.kind === "thread") { input.value = h.label; clear(); input.blur(); onPick({ kind: "thread", thread: h.thread }); return; }
    if (h.kind === "thread-member") { input.value = h.label; clear(); input.blur(); onPick({ kind: "thread", thread: h.thread, atPolityId: h.polity.id }); return; }
    input.value = h.label; clear(); input.blur();
    onPick(h.kind === "curated" ? { kind: "curated", entry: h.entry } : { kind: "db", polity: h.polity });
  }

  async function update() {
    const q = input.value.trim();
    if (!q) return clear();
    const curated = rankCurated(q);
    base = { curated, threads: [], db: [] };
    rows = curated; sel = -1; render();
    if (!dbEnabled()) return;
    const mine = ++seq;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const [threads, pols] = await Promise.all([searchThreads(q), searchPolities(q)]);
        if (mine !== seq) return;
        // Fetch member spines for matched threads (small).
        await Promise.all(threads.map(async t => {
          t._members = (await threadMembers(t.id)).filter(m => m.polity);
        }));
        if (mine !== seq) return;        // a newer query started while we fetched member spines
        const inThread = new Set(threads.flatMap(t => t._members.map(m => m.polity.id)));
        const curatedNames = new Set(curated.map(h => h.label.toLowerCase()));
        const dbHits = pols
          .filter(p => !inThread.has(p.id) && !curatedNames.has(p.canonical_name.toLowerCase()))
          .slice(0, 10);
        base = { curated, threads, db: dbHits };
        rows = buildRows(curated, threads, dbHits);
        render();
      } catch { /* keep curated */ }
    }, 220);
  }

  input.addEventListener("input", update);
  input.addEventListener("keydown", e => {
    if (!rows.length) return;
    if (e.key === "ArrowDown") { sel = Math.min(rows.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter") { pick(sel < 0 ? 0 : sel); }
    else if (e.key === "Escape") { clear(); input.blur(); }
  });
  document.addEventListener("click", e => { if (!e.target.closest("#search")) clear(); });
}
