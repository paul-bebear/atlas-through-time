// Left-drawer panel: mode radio + layer checkboxes.
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
  { id: "trade",   label: "Trade routes" },
];

export function createLayersPanel({ state, onModeChange, onLayerToggle } = {}) {
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
    const html = `${pins ? `
      <div class="lp-section">
        <div class="lp-heading">From the link you opened</div>
        ${pins}
      </div>` : ""}
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
    root.innerHTML = html;
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
      el.textContent = countOf(el.dataset.count);
    });
  }

  // onClearPins is assigned by main.js once the link view is wired.
  const api = { refresh: render, updateCounts, onClearPins: null };
  render();
  return api;
}
