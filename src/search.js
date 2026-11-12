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

  // Also drops a database search still in flight, so its hits can't reopen the list.
  const clear = () => { res.innerHTML = ""; rows = []; sel = -1; expanded.clear(); clearTimeout(timer); seq++; };

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
    // Database hits land after the curated rows; swapping rows under a finger
    // that is already down makes iOS drop the tap, so wait for the lift.
    if (touch0) { renderLater = true; return; }
    res.innerHTML = rows.map((h, i) => {
      const on = i === sel ? " on" : "";
      if (h.kind === "thread") {
        const caret = h.memberCount
          ? `<span class="sr-exp" data-i="${i}">${expanded.has(h.thread.id) ? "▾" : "▸"}</span>`
          : "";
        return `<div class="sr sr-thread${on}" data-i="${i}">${caret}🧵 ${h.label}` +
          `<small>thread · ${h.memberCount} ${h.memberCount === 1 ? "stage" : "stages"}</small></div>`;
      }
      if (h.kind === "thread-member")
        return `<div class="sr sr-member${on}" data-i="${i}">↳ ${h.label}` +
          `<small>${h.role}${span(h.polity)}</small></div>`;
      if (h.kind === "db")
        return `<div class="sr${on}" data-i="${i}">${h.label}<small>${span(h.polity)}</small></div>`;
      return `<div class="sr${on}" data-i="${i}">${h.label}</div>`;
    }).join("");
  }

  // One set of handlers on the list itself (rows are re-rendered often).
  // A pick acts on click, not mousedown: picking removes the list, and the
  // release that followed a mousedown pick landed on the globe underneath,
  // which then opened whatever country it last hovered.
  res.addEventListener("mousedown", e => e.preventDefault());   // keep focus in the input
  res.addEventListener("click", e => activate(e.target));
  // Touch acts on the lift, and cancels the mouse events and click that would
  // follow, so nothing reaches what lies under the finger once the list is gone.
  let touch0 = null, renderLater = false;
  res.addEventListener("touchstart", e => {
    const t = e.touches[0];
    touch0 = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  res.addEventListener("touchcancel", () => { touch0 = null; flush(); });
  res.addEventListener("touchend", e => {
    const t = e.changedTouches[0], t0 = touch0;
    touch0 = null;
    if (t0 && Math.hypot(t.clientX - t0.x, t.clientY - t0.y) <= 10) {   // further is a scroll of the list
      e.preventDefault();
      activate(document.elementFromPoint(t.clientX, t.clientY));
    }
    flush();
  });
  const flush = () => { if (renderLater) { renderLater = false; if (rows.length) render(); } };

  function activate(el) {
    const exp = el?.closest(".sr-exp");
    if (exp) {
      const h = rows[+exp.dataset.i];
      expanded.has(h.thread.id) ? expanded.delete(h.thread.id) : expanded.add(h.thread.id);
      rows = buildRows(base.curated, base.threads, base.db);
      return render();
    }
    const row = el?.closest(".sr");
    if (row) pick(+row.dataset.i);
  }

  let base = { curated: [], threads: [], db: [] };

  function pick(i) {
    const h = rows[i];
    if (!h) return;
    input.value = ""; clear(); input.blur();   // the card and the context pill name the pick
    if (h.kind === "thread") return onPick({ kind: "thread", thread: h.thread });
    if (h.kind === "thread-member") return onPick({ kind: "thread", thread: h.thread, atPolityId: h.polity.id });
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
  // The path, not target.closest: a click on ▸ re-renders the list, detaching its target.
  const box = document.getElementById("search");
  document.addEventListener("click", e => { if (!e.composedPath().includes(box)) clear(); });
}
