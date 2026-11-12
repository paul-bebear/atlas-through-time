// Info card: a clicked/searched country or a clicked event.
// Country profiles resolve by selected year (period-aware). Event
// descriptions are fetched live from the Wikipedia REST API.

import { featureName } from "./data.js";

const WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const FLAG = "https://flagcdn.com/w80/";

export function createInfoCard({ countries, onDismiss, onRoute }) {
  const card = document.getElementById("infoCard");
  // Bumped by every open and by close, so a Wikipedia fetch that lands late can't
  // overwrite a newer card or reopen a closed one (a tap on × "not working").
  let openSeq = 0;
  const close = () => { card.hidden = true; openSeq++; card.classList.remove("cc-peek"); peekTitle = null; showing(null); };
  // The route whose card is open (null for any other card, or none): main.js marks it on the globe.
  let shownRoute = null;
  const showing = r => { if (r !== shownRoute) { shownRoute = r; onRoute?.(r); } };

  const data = (countries && countries.countries) || {};
  const byAlias = new Map();
  for (const [key, c] of Object.entries(data)) {
    for (const n of new Set([key, c.name, ...(c.aliases || [])].filter(Boolean)))
      byAlias.set(String(n).toLowerCase(), c);
  }
  const catalog = Object.entries(data).map(([key, c]) => ({ key, entry: c }));
  const resolve = name => byAlias.get(String(name || "").toLowerCase()) || null;
  const eraFor = (c, year) =>
    (c.eras || []).find(e => year >= e.from && year <= (e.to ?? 9999)) || null;

  // [first, last] year of a curated entry's eras when `year` falls outside all of them.
  const outside = (c, year) => {
    const eras = c.eras || [];
    if (!eras.length) return null;
    const a = Math.min(...eras.map(e => e.from)), b = Math.max(...eras.map(e => e.to ?? 9999));
    return year < a || year > b ? [a, b] : null;
  };

  const thumbCache = new Map();

  async function fetchThumb(title) {
    if (thumbCache.has(title)) return thumbCache.get(title);
    let url = null;
    try {
      const r = await fetch(WIKI + encodeURIComponent(title));
      if (r.ok) url = (await r.json()).thumbnail?.source || null;
    } catch { /* ignore */ }
    thumbCache.set(title, url);
    return url;
  }

  // One × for the card's lifetime. A re-render (the Wikipedia summary landing) used
  // to replace it, so a finger already on it lifted off a detached node: no touchend
  // reached the page and iOS withheld the click, and × needed a second tap.
  // Touch closes on touchend; preventDefault stops the click that would otherwise
  // land on whatever was under the × once the card hides.
  const x = document.createElement("span");
  x.className = "cc-close";
  x.textContent = "×";
  // The user's own close, as opposed to the card giving way to another panel.
  const dismiss = () => { close(); onDismiss?.(); };
  x.onclick = dismiss;
  x.addEventListener("touchend", e => { e.preventDefault(); dismiss(); });

  // A peek: only the title and one line, so a phone opened from a link shows the
  // map first. It stays a peek while the same card re-renders (a year step) and
  // opens fully on a tap, or when a different card opens.
  let peekNext = false, peekTitle = null;
  const unpeek = () => { card.classList.remove("cc-peek"); peekTitle = null; };
  const peek = () => { peekNext = true; };
  card.addEventListener("click", e => {
    if (card.classList.contains("cc-peek") && !x.contains(e.target)) unpeek();
  });

  // A different card opens at its top; the same card drawn again (a year step) keeps its place.
  let shownTitle = null;
  function shell(titleHtml, sub, body, route = null) {
    const fresh = card.hidden || titleHtml !== shownTitle;
    card.hidden = false;
    shownTitle = titleHtml;
    if (peekNext) { peekNext = false; peekTitle = titleHtml; card.classList.add("cc-peek"); }
    else if (titleHtml !== peekTitle) unpeek();
    for (const n of [...card.childNodes]) if (n !== x) n.remove();
    if (x.parentNode !== card) card.prepend(x);
    card.insertAdjacentHTML("beforeend", `<h2>${titleHtml}</h2><div class="cc-sub">${sub}</div>${body}`);
    if (fresh) card.scrollTop = 0;
    showing(route);
  }

  // Core renderer shared by click + search/story paths.
  function renderCountry(c, fallbackName, year, activeWars, props = {}) {
    const era = c ? eraFor(c, year) : null;
    const rows = [];
    if (era) {
      if (era.government) rows.push(["Government", era.government]);
      if (era.capital) rows.push(["Capital", era.capital]);
      if (era.leader) rows.push(["Leader", era.leader]);
      if (era.population) rows.push(["Population", era.population]);
    } else if (props.SUBJECTO) {
      rows.push(["Part of / subject to", props.SUBJECTO]);
    }

    const wars = (activeWars || [])
      .map(w => `<div class="cc-row"><span class="k">Active war</span><span class="v">${w.name}</span></div>`)
      .join("");

    const name = c ? c.name : fallbackName;
    const flag = c?.iso ? `<img class="cc-flag" src="${FLAG}${c.iso}.png" alt="">` : "";
    const eraTxt = era
      ? `${yr(era.from)} – ${era.to >= 9999 ? "present" : yr(era.to)}`
      : `as shown in ${yr(year)}`;

    const facts = (c?.facts || []).slice(0, 4);
    const factsHtml = facts.length
      ? `<div class="cc-facts"><div class="cc-facts-h">✦ Did you know</div><ul>${
          facts.map(f => `<li>${f}</li>`).join("")}</ul></div>`
      : "";

    const myseq = ++openSeq;
    const out = c && !era && outside(c, year);
    shell(`${name}${flag}`, eraTxt,
      (out ? `<div class="cc-gone">${c.name} did not exist in ${yr(year)}. Atlas has it from ${yr(out[0])} to ${out[1] >= 9999 ? "the present" : yr(out[1])}.</div>` : "")
      + `<div class="cc-imgwrap"></div>`
      + rows.map(([k, v]) => `<div class="cc-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")
      + wars
      + (era?.note ? `<div class="cc-note">${era.note}</div>` : "")
      + (c && !era && !outside(c, year) ? `<div class="cc-note">No profile for ${yr(year)} yet — ${c.name} is curated for other periods.</div>` : "")
      + (!c ? `<div class="cc-note">No curated profile yet — showing raw map data. We'll deepen this.</div>` : "")
      + factsHtml);

    if (c) {
      fetchThumb(c.image || c.name).then(src => {
        if (!src || openSeq !== myseq) return;
        const wrap = card.querySelector(".cc-imgwrap");
        if (wrap) wrap.innerHTML = `<img class="cc-thumb" src="${src}" alt="">`;
      });
    }
  }

  function openCountry(feature, year, activeWars) {
    const name = featureName(feature);
    renderCountry(resolve(name), name, year, activeWars, feature.properties || {});
  }

  function openEntry(entry, year, activeWars) {
    renderCountry(entry, entry.name, year, activeWars, {});
  }

  async function openEvent(ev) {
    const myseq = ++openSeq;
    shell(ev.title, `${yr(ev.startYear)}${ev.endYear ? " – " + yr(ev.endYear) : ""} · ${ev.category}`,
      `<div class="cc-loading">Fetching from Wikipedia…</div>`);
    try {
      const res = await fetch(WIKI + encodeURIComponent(ev.wikiTitle));
      if (!res.ok) throw new Error("not found");
      const d = await res.json();
      if (openSeq !== myseq) return;
      const thumb = d.thumbnail?.source ? `<img class="cc-thumb" src="${d.thumbnail.source}" alt="">` : "";
      const link = d.content_urls?.desktop?.page;
      shell(ev.title, `${yr(ev.startYear)}${ev.endYear ? " – " + yr(ev.endYear) : ""} · ${ev.category}`,
        thumb
        + `<div class="cc-extract">${d.extract || "No summary available."}</div>`
        + (link ? `<a class="cc-link" href="${link}" target="_blank" rel="noopener">Read on Wikipedia →</a>` : ""));
    } catch {
      if (openSeq !== myseq) return;
      shell(ev.title, `${yr(ev.startYear)} · ${ev.category}`,
        `<div class="cc-note">Couldn't fetch a description for this event.</div>`);
    }
  }

  // A polity straight from the Supabase registry. Period-aware: shows the
  // ruler / population relevant to `year` (the viewed moment) rather than
  // dumping every fact. `detail` = { facts, refs } from db.polityDetail().
  // `alias`: the name the map's border data gives the same polity, when it differs.
  function openDbPolity(p, detail, year, { alias = null } = {}) {
    openSeq++;
    const span = `${p.start_year != null ? yr(p.start_year) : "?"} – ${
      p.end_year != null ? yr(p.end_year) : "present"}`;
    const facts = detail?.facts || [];
    const y = year ?? p.start_year ?? p.end_year;

    // Fact active at year: from <= y <= to (open ends allowed).
    const activeAt = key => facts
      .filter(f => f.key === key &&
        (f.from_year == null || y == null || f.from_year <= y) &&
        (f.to_year == null || y == null || f.to_year >= y));
    // Population: the reading closest to (but not after) y, else latest.
    const popRows = facts.filter(f => f.key === "population");
    const pop = popRows
      .filter(f => y == null || f.from_year == null || f.from_year <= y)
      .sort((a, b) => (b.from_year ?? -1e9) - (a.from_year ?? -1e9))[0]
      || popRows.sort((a, b) => (b.from_year ?? -1e9) - (a.from_year ?? -1e9))[0];

    const rows = [];
    if (p.type) rows.push(["Type", p.type]);
    const cap0 = activeAt("capital")[0] || facts.find(f => f.key === "capital");
    if (cap0) rows.push(["Capital", cap0.value]);
    for (const f of activeAt("head_of_state"))
      rows.push(["Head of state", `${f.value}${yspan(f)}`]);
    for (const f of activeAt("head_of_government"))
      rows.push(["Head of government", `${f.value}${yspan(f)}`]);
    if (pop) rows.push(["Population", pop.value + (pop.from_year ? ` (${yr(pop.from_year)})` : "")]);

    const wiki = (detail?.refs || []).find(r => r.kind === "wikipedia");
    const asOf = y != null ? ` · as of ${yr(y)}` : "";
    // Outside its lifetime the card says so first, rather than reading as current.
    const gone = y != null && ((p.start_year != null && y < p.start_year) || (p.end_year != null && y > p.end_year));
    shell(p.canonical_name, `${span} · from the Atlas registry${asOf}`,
      (gone ? `<div class="cc-gone">${p.canonical_name} did not exist in ${yr(y)}. It lasted ${span}.</div>` : "")
      + (alias ? `<div class="cc-small cc-alias">Shown on this map as “${esc(alias)}”.</div>` : "")
      + rows.map(([k, v]) => `<div class="cc-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")
      + (wiki ? `<a class="cc-link" href="${wiki.url}" target="_blank" rel="noopener">Read on Wikipedia →</a>` : "")
      + (p._slice
        ? `<div class="cc-note">From Atlas's committed registry (Wikidata-sourced). Rulers and population come from the live database, so they are not shown here.</div>`
        : `<div class="cc-note">Live from the Atlas database (Wikidata-sourced). Rulers/population shown for the viewed year.</div>`));
  }

  const yspan = f => {
    if (f.from_year == null && f.to_year == null) return "";
    return ` (${f.from_year != null ? yr(f.from_year) : "?"}–${f.to_year != null ? yr(f.to_year) : "…"})`;
  };

  // A city at a moment in time. `displayName` is the period-correct name
  // (Constantinople), `c` the city record (modern name, founding year),
  // `partOf` the polity whose border polygon contains it right now.
  async function openCity(displayName, c, year, partOf) {
    const myseq = ++openSeq;
    const modern = c.name !== displayName ? `today ${c.name} · ` : "";
    const sub = `${modern}city · ${yr(year)}`;
    const rows =
      `<div class="cc-row"><span class="k">In ${yr(year)}</span><span class="v">${
        partOf ? "part of " + partOf : "—"}</span></div>`
      + (c.founded != null ? `<div class="cc-row"><span class="k">Founded</span><span class="v">${yr(c.founded)}</span></div>` : "")
      + (c.until != null ? `<div class="cc-row"><span class="k">Fell</span><span class="v">${yr(c.until)}</span></div>` : "");
    shell(displayName, sub, rows + `<div class="cc-loading">Fetching from Wikipedia…</div>`);
    try {
      let r = await fetch(WIKI + encodeURIComponent(displayName));
      if (!r.ok && displayName !== c.name) r = await fetch(WIKI + encodeURIComponent(c.name));
      if (!r.ok) throw new Error("not found");
      const d = await r.json();
      if (openSeq !== myseq) return;
      const thumb = d.thumbnail?.source ? `<img class="cc-thumb" src="${d.thumbnail.source}" alt="">` : "";
      const link = d.content_urls?.desktop?.page;
      shell(displayName, sub,
        rows + thumb
        + `<div class="cc-extract">${d.extract || "No summary available."}</div>`
        + (link ? `<a class="cc-link" href="${link}" target="_blank" rel="noopener">Read on Wikipedia →</a>` : ""));
    } catch {
      if (openSeq !== myseq) return;
      shell(displayName, sub, rows);
    }
  }

  // A route from the registry (data/trade-routes.json, docs/routes.md): its own
  // short explanation, how sure it is, what travelled, its stops (every sourced
  // candidate for a disputed one) and its sources. All of it is set as text.
  function openRoute(r, year) {
    openSeq++;
    const span = `${yr(r.from)} – ${yr(r.to)}`;
    const off = year != null && ((r.from != null && year < r.from) || (r.to != null && year > r.to));
    const sub = [span, r.mode && `${r.mode} route`, r.kind].filter(Boolean).join(" · ");
    const rows = [];
    if (r.certainty) rows.push(["Certainty", r.certainty]);
    if (r.goods?.length) rows.push(["Goods", r.goods.join(", ")]);
    const stop = w => `<li><b>${esc(w.name)}</b>${w.note ? `<div class="cc-small">${esc(w.note)}</div>` : ""}${
      w.candidates?.length ? `<ul class="cc-cands">${w.candidates.map(c =>
        `<li>${esc(c.name)}${c.note ? ` <span class="cc-small">— ${esc(c.note)}</span>` : ""}</li>`).join("")}</ul>` : ""}</li>`;
    const source = s => {
      const t = s.book ? `${esc(s.title)}${s.author ? ", " + esc(s.author) : ""}` : esc(s.title);
      const title = /^https:\/\//.test(s.url || "") ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${t}</a>` : t;
      return `<li>${title}${s.licence ? ` <span class="cc-small">(${esc(s.licence)})</span>` : ""}${s.use ? `<div class="cc-small">${esc(s.use)}</div>` : ""}</li>`;
    };
    shell(esc(r.name), esc(sub),
      (off ? `<div class="cc-gone">${esc(r.name)} was not in use in ${yr(year)}. It was in use ${span}.</div>` : "")
      + rows.map(([k, v]) => `<div class="cc-row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join("")
      + (CERTAINTY[r.certainty] ? `<div class="cc-small">${CERTAINTY[r.certainty]}</div>` : "")
      + (r.summary ? `<div class="cc-extract">${esc(r.summary)}</div>` : "")
      + (r.waypoints?.length ? `<div class="cc-h">Stops</div><ul class="cc-list">${r.waypoints.map(stop).join("")}</ul>` : "")
      + (r.sources?.length ? `<div class="cc-h">Sources</div><ul class="cc-list">${r.sources.map(source).join("")}</ul>` : "")
      + `<div class="cc-note">An Atlas route (CC BY 4.0), drawn by hand from open sources.</div>`, r);
  }

  // A pin from the link the visitor opened: its own label, where it is, the
  // gazetteer id it carries, and plainly where it came from. Never stored.
  function openLinkPin(p) {
    openSeq++;
    const ll = `${Math.abs(p.lat).toFixed(2)}° ${p.lat < 0 ? "S" : "N"}, ${Math.abs(p.lng).toFixed(2)}° ${p.lng < 0 ? "W" : "E"}`;
    const [src, id] = (p.id || ":").split(":");
    const url = { pleiades: `https://pleiades.stoa.org/places/${id}`, wikidata: `https://www.wikidata.org/wiki/${id}`,
      geonames: `https://www.geonames.org/${id}` }[src];
    shell(esc(p.label || "Pin"), "From the link you opened",
      `<div class="cc-row"><span class="k">Position</span><span class="v">${ll}</span></div>`
      + (p.id ? `<div class="cc-row"><span class="k">Place id</span><span class="v">${url
        ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.id)}</a>` : esc(p.id)}</span></div>` : "")
      + `<div class="cc-note">This pin came from the link you opened: a pointer someone sent, with its own label, not an Atlas record. It is kept only on this page, never stored or sent, and Clear removes it.</div>`);
  }

  return { openCountry, openEntry, openEvent, openDbPolity, openCity, openRoute, openLinkPin, close, peek, catalog, resolve,
    route: () => shownRoute };
}

// docs/routes.md, `certainty`.
const CERTAINTY = {
  attested: "Its use in these years is supported by evidence from the time (inscriptions, documents, archaeology), and the line follows known stops.",
  schematic: "Its use is recorded in the sources, but none gives the exact line, so it is drawn approximately between real stops. The text and sources below say what kind of record it is.",
  legendary: "Known only from myth, legend or saga, not from any historical record. This says nothing about whether it happened."
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function yr(y) { return y < 0 ? Math.abs(y) + " BCE" : y + " CE"; }
