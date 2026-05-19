// Guided country story. Assembles a country's narrative beats from its
// eras + the wars it fought + the nation-formation stages that involve it,
// then lets you step ◀ ▶ through them. Each beat drives the globe/timeline
// via onBeat(beat, country, beats).

export function createStory({ wars, formations, onBeat, onExit }) {
  const bar = document.getElementById("storyBar");
  let country = null, beats = [], idx = 0;
  let title = "", stepCb = null;

  const aliasSet = e =>
    new Set([e.name, ...(e.aliases || [])].map(s => s.toLowerCase()));

  const matchWar = (w, al) =>
    Object.values(w.sides).flat().some(s => al.has(s.toLowerCase()));
  const matchFormation = (f, al) =>
    al.has(f.name.toLowerCase()) || (f.highlight || []).some(h => al.has(h.toLowerCase()));

  function build(e) {
    const al = aliasSet(e);
    const b = [];
    (e.eras || []).forEach(er =>
      b.push({ year: er.from, kind: "Era", label: `${er.government}${er.leader ? " · " + er.leader : ""}` }));
    formations.filter(f => matchFormation(f, al)).forEach(f =>
      (f.stages || []).forEach(s =>
        b.push({ year: s.year, kind: "Formation", label: `${f.name}: ${s.label}` })));
    wars.filter(w => matchWar(w, al)).forEach(w =>
      b.push({ year: w.start, kind: "War", label: w.name }));
    b.sort((x, y) => x.year - y.year);
    return b.filter((x, i) => i === 0 || x.year !== b[i - 1].year || x.label !== b[i - 1].label);
  }

  const timelineEl = document.getElementById("timeline");

  function show() {
    const bt = beats[idx];
    bar.hidden = false;
    // Sit just above the timeline regardless of its (wrapping) height.
    if (timelineEl) bar.style.bottom = (timelineEl.offsetHeight + 34) + "px";
    bar.innerHTML = `
      <button class="sb-prev" ${idx <= 0 ? "disabled" : ""}>◀</button>
      <div class="sb-main">
        <div class="sb-title">${title}<span class="sb-count">${idx + 1} / ${beats.length}</span></div>
        <div class="sb-label"><span class="sb-kind">${bt.kind}</span>${yr(bt.year)} · ${bt.label}</div>
      </div>
      <button class="sb-next" ${idx >= beats.length - 1 ? "disabled" : ""}>▶</button>
      <button class="sb-exit" title="Exit story">✕</button>`;
    bar.querySelector(".sb-prev").onclick = () => step(-1);
    bar.querySelector(".sb-next").onclick = () => step(1);
    bar.querySelector(".sb-exit").onclick = exit;
    stepCb(bt, idx, beats);
  }

  function step(d) {
    idx = Math.max(0, Math.min(beats.length - 1, idx + d));
    show();
  }

  function start(e) {
    country = e;
    beats = build(e);
    if (!beats.length) {
      const y = e.eras?.[0]?.from ?? 2000;
      beats = [{ year: y, kind: "Profile", label: e.name }];
    }
    title = `📖 ${e.name}`;
    stepCb = (bt) => onBeat(bt, e, beats);
    idx = 0;
    show();
  }

  // Generic player for externally-built beats (e.g. a DB continuity thread).
  // cb(beat, idx, beats) is called on every step.
  function startCustom(t, bs, cb, startIndex = 0) {
    if (!bs || !bs.length) return;
    country = null;
    title = t;
    beats = bs;
    stepCb = cb;
    idx = Math.max(0, Math.min(bs.length - 1, startIndex));
    show();
  }

  function exit() {
    bar.hidden = true;
    country = null;
    if (onExit) onExit();
  }

  return { start, startCustom, exit };
}

function yr(y) { return y < 0 ? Math.abs(y) + " BCE" : y + " CE"; }
