// Info card: a clicked/searched country or a clicked event.
// Country profiles resolve by selected year (period-aware). Event
// descriptions are fetched live from the Wikipedia REST API.

import { featureName } from "./data.js";

const WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const FLAG = "https://flagcdn.com/w80/";

export function createInfoCard({ countries }) {
  const card = document.getElementById("infoCard");
  const close = () => { card.hidden = true; };

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

  const thumbCache = new Map();
  let openSeq = 0;

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

  function shell(titleHtml, sub, body) {
    card.hidden = false;
    card.innerHTML = `<span class="cc-close">×</span>
      <h2>${titleHtml}</h2><div class="cc-sub">${sub}</div>${body}`;
    card.querySelector(".cc-close").onclick = close;
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
    shell(`${name}${flag}`, eraTxt,
      `<div class="cc-imgwrap"></div>`
      + rows.map(([k, v]) => `<div class="cc-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")
      + wars
      + (era?.note ? `<div class="cc-note">${era.note}</div>` : "")
      + (c && !era ? `<div class="cc-note">No profile for ${yr(year)} yet — ${c.name} is curated for other periods.</div>` : "")
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
    shell(ev.title, `${yr(ev.startYear)}${ev.endYear ? " – " + yr(ev.endYear) : ""} · ${ev.category}`,
      `<div class="cc-loading">Fetching from Wikipedia…</div>`);
    try {
      const res = await fetch(WIKI + encodeURIComponent(ev.wikiTitle));
      if (!res.ok) throw new Error("not found");
      const d = await res.json();
      const thumb = d.thumbnail?.source ? `<img class="cc-thumb" src="${d.thumbnail.source}" alt="">` : "";
      const link = d.content_urls?.desktop?.page;
      shell(ev.title, `${yr(ev.startYear)}${ev.endYear ? " – " + yr(ev.endYear) : ""} · ${ev.category}`,
        thumb
        + `<div class="cc-extract">${d.extract || "No summary available."}</div>`
        + (link ? `<a class="cc-link" href="${link}" target="_blank" rel="noopener">Read on Wikipedia →</a>` : ""));
    } catch {
      shell(ev.title, `${yr(ev.startYear)} · ${ev.category}`,
        `<div class="cc-note">Couldn't fetch a description for this event.</div>`);
    }
  }

  // A polity straight from the Supabase registry (the long tail beyond the
  // curated 30). `detail` = { facts, refs } from db.polityDetail().
  function openDbPolity(p, detail) {
    const span = `${p.start_year != null ? yr(p.start_year) : "?"} – ${
      p.end_year != null ? yr(p.end_year) : "present"}`;
    const rows = [];
    if (p.type) rows.push(["Type", p.type]);
    for (const f of (detail?.facts || []))
      rows.push([cap(f.key), f.value + (f.perspective ? ` (${f.perspective})` : "")]);
    const wiki = (detail?.refs || []).find(r => r.kind === "wikipedia");
    shell(p.canonical_name, `${span} · from the Atlas registry`,
      rows.map(([k, v]) => `<div class="cc-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")
      + (wiki ? `<a class="cc-link" href="${wiki.url}" target="_blank" rel="noopener">Read on Wikipedia →</a>` : "")
      + `<div class="cc-note">Sourced from Wikidata. Curated profile (eras, leaders, facts) not added yet — this is the live database talking.</div>`);
  }

  return { openCountry, openEntry, openEvent, openDbPolity, close, catalog };
}

function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

function yr(y) { return y < 0 ? Math.abs(y) + " BCE" : y + " CE"; }
