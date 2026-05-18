// Info card: shows either a clicked country or a clicked event.
// Event descriptions are fetched live from the Wikipedia REST API
// (no key, CORS-enabled): /api/rest_v1/page/summary/{title}

import { featureName } from "./data.js";

const WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/";

export function createInfoCard({ countries }) {
  const card = document.getElementById("infoCard");
  const close = () => { card.hidden = true; };

  function shell(title, sub, body) {
    card.hidden = false;
    card.innerHTML = `<span class="cc-close">×</span>
      <h2>${title}</h2><div class="cc-sub">${sub}</div>${body}`;
    card.querySelector(".cc-close").onclick = close;
  }

  function openCountry(feature, year, activeWars) {
    const name = featureName(feature);
    const info = countries[name.toLowerCase()] || null;
    const props = feature.properties || {};
    const rows = [];
    if (info) {
      if (info.capital) rows.push(["Capital", info.capital]);
      if (info.population) rows.push(["Population", info.population]);
      if (info.leader) rows.push(["Leader", info.leader]);
    } else if (props.SUBJECTO) {
      rows.push(["Part of / subject to", props.SUBJECTO]);
    }
    const wars = (activeWars || [])
      .map(w => `<div class="cc-row"><span class="k">Active war</span><span class="v">${w.name}</span></div>`)
      .join("");
    shell(name, `As shown in ${yr(year)}`,
      rows.map(([k, v]) => `<div class="cc-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")
      + wars
      + (info?.note ? `<div class="cc-note">${info.note}</div>` : "")
      + (!info ? `<div class="cc-note">No curated profile yet — showing raw map data. We'll deepen this.</div>` : ""));
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
