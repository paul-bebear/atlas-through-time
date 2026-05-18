// Info card: shows either a clicked country or a clicked event.
// Event descriptions are fetched live from the Wikipedia REST API
// (no key, CORS-enabled): /api/rest_v1/page/summary/{title}

import { featureName } from "./data.js";

const WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/";

export function createInfoCard({ countries }) {
  const card = document.getElementById("infoCard");
  const close = () => { card.hidden = true; };

  // Build alias -> country entry index once.
  const byAlias = new Map();
  const data = (countries && countries.countries) || {};
  for (const [key, c] of Object.entries(data)) {
    const names = new Set([key, c.name, ...(c.aliases || [])].filter(Boolean));
    for (const n of names) byAlias.set(String(n).toLowerCase(), c);
  }

  const eraFor = (c, year) =>
    (c.eras || []).find(e => year >= e.from && year <= (e.to ?? 9999)) || null;

  function shell(title, sub, body) {
    card.hidden = false;
    card.innerHTML = `<span class="cc-close">×</span>
      <h2>${title}</h2><div class="cc-sub">${sub}</div>${body}`;
    card.querySelector(".cc-close").onclick = close;
  }

  function openCountry(feature, year, activeWars) {
    const name = featureName(feature);
    const c = byAlias.get(name.toLowerCase()) || null;
    const era = c ? eraFor(c, year) : null;
    const props = feature.properties || {};

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

    const title = c ? c.name : name;
    const eraTxt = era
      ? `${yr(era.from)} – ${era.to >= 9999 ? "present" : yr(era.to)}`
      : `as shown in ${yr(year)}`;

    shell(title, eraTxt,
      rows.map(([k, v]) => `<div class="cc-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")
      + wars
      + (era?.note ? `<div class="cc-note">${era.note}</div>` : "")
      + (c && !era ? `<div class="cc-note">No profile for ${yr(year)} yet — ${c.name} is curated for other periods.</div>` : "")
      + (!c ? `<div class="cc-note">No curated profile yet — showing raw map data. We'll deepen this.</div>` : ""));
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

  return { openCountry, openEvent, close };
}

function yr(y) { return y < 0 ? Math.abs(y) + " BCE" : y + " CE"; }
