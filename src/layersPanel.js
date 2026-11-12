// Left-drawer panel: the routes (layer toggle and the list of every route), mode radio, layer checkboxes.
// View-only: emits onModeChange / onLayerToggle callbacks. State mutation
// happens in main.js (so e.g. entering us-territorial via the radio routes
// through the same selectCurated() path as the search bar).
// Call refresh() whenever state.mode / state.layers change externally.

const MODES = [
  { id: "discovery",      label: "Discovery" },
  { id: "us-territorial", label: "US Territorial Growth" },
  { id: "map-quiz",       label: "Map Quiz" },
  { id: "empire-story",   label: "Empire Story" },
];

const LAYERS = [
  { id: "borders", label: "Borders" },
  { id: "cities",  label: "Cities" },
  { id: "events",  label: "Events" },
  { id: "wars",    label: "Wars" },
];

// "1000–586 BCE", "130 BCE – 1450 CE".
const years = (a, b) => {
  const era = y => y < 0 ? "BCE" : "CE";
  return era(a) === era(b) ? `${Math.abs(a)}–${Math.abs(b)} ${era(a)}` : `${Math.abs(a)} ${era(a)} – ${Math.abs(b)} ${era(b)}`;
};
const yr = y => y < 0 ? Math.abs(y) + " BCE" : y + " CE";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// `routes()`: the route registry; `onRoutePick(route)`: a route chosen from the list;
// `chosen()`: the id of the route whose card is open; `onListToggle(open)`: the list
// expanded or collapsed.
export function createLayersPanel({ state, onModeChange, onLayerToggle, routes = () => [], onRoutePick, chosen = () => null,
  onListToggle } = {}) {
  const root = document.getElementById("layersPanel");
  if (!root) return { refresh: () => {}, updateCounts: () => {} };

  // Collapse: title click folds the whole panel; phones start folded so the
  // panel doesn't eat half the viewport.
  const aside = root.closest("#modesPanel");
  // Narrow screens and phones in landscape (short + touch) fold the panel.
  const compact = () => window.innerWidth < 720 ||
    matchMedia("(pointer: coarse) and (max-height: 500px)").matches;
  const title = aside?.querySelector(".modes-title");
  if (title && !title.dataset.wired) {
    title.dataset.wired = "1";
    title.innerHTML += `<span class="modes-chev">▾</span>`;
    title.onclick = () => aside.classList.toggle("collapsed");
    if (compact()) aside.classList.add("collapsed");
  }

  // The list of every route, grouped by the timeline year. One node for the panel's
  // lifetime, put back after each re-render; its rows are rebuilt only when the
  // grouping changes, so a finger on a row never lands on a replaced one.
  const list = document.createElement("div");
  list.className = "lp-route-list";
  list.hidden = true;
  list.addEventListener("click", e => {
    const b = e.target.closest?.(".lr-item");
    const r = b && routes().find(x => x.id === b.dataset.id);
    if (!r) return;
    const focused = list.contains(document.activeElement);
    if (compact()) aside?.classList.add("collapsed");   // on a phone the open panel covers the globe
    onRoutePick?.(r);
    // The row keeps focus (keepFocus); where the panel folded away, the route's card takes it.
    if (focused && !root.contains(document.activeElement))
      document.querySelector("#infoCard:not([hidden]) .cc-close")?.focus({ preventScroll: true });
  });
  let listSig = null;
  // Keyboard focus survives a rebuild of the rows or the panel: a route chosen with the
  // keyboard (or a box ticked) keeps focus on the same control in its new node,
  // instead of dropping to the page.
  const focusKey = el => {
    if (!el || !root.contains(el)) return null;
    const row = el.closest?.(".lr-item");
    if (row) return `.lr-item[data-id="${CSS.escape(row.dataset.id)}"]`;
    if (el.matches("input[name][value]")) return `input[name="${CSS.escape(el.name)}"][value="${CSS.escape(el.value)}"]`;
    for (const c of ["lp-browse", "lp-clear"]) if (el.classList.contains(c)) return "." + c;
    return null;
  };
  const keepFocus = rebuild => {
    const key = focusKey(document.activeElement);
    rebuild();
    if (key && !root.contains(document.activeElement)) root.querySelector(key)?.focus({ preventScroll: true });
  };
  function updateRoutes() { keepFocus(rebuildRoutes); }
  function rebuildRoutes() {
    const all = routes() || [];
    const y = state.year;
    const on = r => (r.from == null || y >= r.from) && (r.to == null || y <= r.to);
    const by = (a, b) => (a.from ?? -1e9) - (b.from ?? -1e9);
    const now = all.filter(on).sort(by), other = all.filter(r => !on(r)).sort(by);
    const pick = chosen();
    const sig = now.map(r => r.id).join() + "|" + pick;
    const head = `In use in ${yr(y)}`;
    if (sig === listSig) { const h = list.querySelector(".lr-now"); if (h && h.textContent !== head) h.textContent = head; return; }
    listSig = sig;
    const item = r => `<button type="button" class="lr-item${r.id === pick ? " is-on" : ""}" data-id="${esc(r.id)}"${r.id === pick ? ` aria-current="true"` : ""}>
        <span class="lr-sw" style="--c:${esc(r.color || "#9aa3ad")}"></span><span class="lr-name">${esc(r.name)}</span>
        <span class="lr-years">${r.from != null && r.to != null ? years(r.from, r.to) : ""}</span></button>`;
    list.innerHTML = `<div class="lr-group lr-now">${head}</div>`
      + (now.length ? now.map(item).join("") : `<div class="lr-none">None</div>`)
      + (other.length ? `<div class="lr-group">Other periods</div>${other.map(item).join("")}` : "");
  }
  // Opens the panel on the list (the "See routes" of the globe's hint).
  function showRoutes() {
    aside?.classList.remove("collapsed");
    setOpen(true);
    (aside?.querySelector(".lp-browse") || list).scrollIntoView({ block: "nearest" });
  }
  let open = false;
  function setOpen(v) {
    open = v;
    list.hidden = !v;
    const b = root.querySelector(".lp-browse");
    if (b) b.setAttribute("aria-expanded", String(v));
    if (v) updateRoutes();
    onListToggle?.(v);
  }

  const countOf = id => {
    const c = state.layers[id]?.count;
    return c != null ? c : "";
  };

  let lastHtml = null;
  function render() {
    const modes = MODES.map(m => `
      <label class="lp-row${m.disabled ? " is-disabled" : ""}">
        <input type="radio" name="lp-mode" value="${m.id}"
          ${state.mode === m.id ? "checked" : ""}
          ${m.disabled ? "disabled" : ""}>
        <span>${m.label}</span>
      </label>`).join("");
    const layers = LAYERS.map(l => `
      <label class="lp-row${l.disabled ? " is-disabled" : ""}">
        <input type="checkbox" name="lp-layer" value="${l.id}"
          ${state.layers[l.id]?.enabled ? "checked" : ""}
          ${l.disabled ? "disabled" : ""}>
        <span>${l.label}</span>
        <span class="lp-count" data-count="${l.id}">${countOf(l.id)}</span>
      </label>`).join("");
    // Pins and route highlights from a link the visitor opened: shown only while
    // there are some, with one Clear for both.
    const lk = state.layers.pins || {};
    const clearBtn = `<button type="button" class="lp-clear">Clear</button>`;
    const pins = (lk.count ? `
      <div class="lp-row lp-pins">
        <label><input type="checkbox" name="lp-layer" value="pins" ${lk.enabled ? "checked" : ""}>
          <span>Pins</span></label>
        <span class="lp-count" data-count="pins">${countOf("pins")}</span>
        ${clearBtn}
      </div>` : "") + (lk.routes ? `
      <div class="lp-row lp-pins lp-routes">
        <span class="lp-routes-label">Routes highlighted</span>
        <span class="lp-count lp-rcount">${state.layers.trade?.enabled ? lk.routes : `${lk.routes} · layer off`}</span>
        ${lk.count ? "" : clearBtn}
      </div>` : "");
    const tr = state.layers.trade || {}, n = (routes() || []).length;
    const routesSec = n ? `
      <div class="lp-section lp-routes-sec">
        <div class="lp-heading">Routes</div>
        <label class="lp-row">
          <input type="checkbox" name="lp-layer" value="trade" ${tr.enabled ? "checked" : ""}>
          <span>Trade routes</span>
          <span class="lp-count" data-count="trade">${countOf("trade")}</span>
        </label>
        <button type="button" class="lp-row lp-browse" aria-expanded="${open}">
          <span>${n === 1 ? "Browse the route" : `Browse all ${n} routes`}</span><span class="lp-chev" aria-hidden="true">▸</span>
        </button>
        <div class="lp-route-slot"></div>
      </div>` : "";
    const html = `${pins ? `
      <div class="lp-section">
        <div class="lp-heading">From the link you opened</div>
        ${pins}
      </div>` : ""}${routesSec}
      <div class="lp-section">
        <div class="lp-heading">Mode</div>
        ${modes}
      </div>
      <div class="lp-section">
        <div class="lp-heading">Layers</div>
        ${layers}
      </div>
      <p class="lp-note">Layers stack; modes are exclusive. Trade routes are schematic corridors, shown for the years they were in use.</p>
    `;
    // Rebuilding the same markup would swap the controls under a finger that is
    // already on one (a Clear tap then lands on a detached node and is lost).
    if (html === lastHtml) return;
    lastHtml = html;
    keepFocus(() => build(html));
  }
  function build(html) {
    list.remove();
    root.innerHTML = html;
    root.querySelector(".lp-route-slot")?.replaceWith(list);
    const browse = root.querySelector(".lp-browse");
    if (browse) browse.onclick = () => setOpen(!open);
    root.querySelectorAll('input[name="lp-mode"]').forEach(el => {
      el.onchange = () => {
        // On phones the open panel would cover the mode's own UI.
        if (compact()) aside?.classList.add("collapsed");
        onModeChange?.(el.value);
      };
    });
    root.querySelectorAll('input[name="lp-layer"]').forEach(el => {
      el.onchange = () => onLayerToggle?.(el.value, el.checked);
    });
    const clear = root.querySelector(".lp-clear");
    if (clear) clear.onclick = () => api.onClearPins?.();
  }

  // Update only the count badges — called per scrub tick, so no full
  // re-render (that would rebuild inputs mid-interaction).
  function updateCounts() {
    root.querySelectorAll(".lp-count[data-count]").forEach(el => {
      const t = String(countOf(el.dataset.count));
      if (el.textContent !== t) el.textContent = t;
    });
  }

  // onClearPins is assigned by main.js once the link view is wired.
  // `listOpen()`: the route list is expanded in a panel that is itself open.
  const api = { refresh: render, updateCounts, updateRoutes: () => { if (open) updateRoutes(); }, showRoutes,
    listOpen: () => open && !aside?.classList.contains("collapsed"), onClearPins: null };
  render();
  return api;
}
