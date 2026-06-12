// Left-drawer panel: mode radio + layer checkboxes.
// View-only: emits onModeChange / onLayerToggle callbacks. State mutation
// happens in main.js (so e.g. entering us-territorial via the radio routes
// through the same selectCurated() path as the search bar).
// Call refresh() whenever state.mode / state.layers change externally.

const MODES = [
  { id: "discovery",      label: "Discovery" },
  { id: "us-territorial", label: "US Territorial Growth" },
  { id: "map-quiz",       label: "Map Quiz",      disabled: true },
  { id: "empire-story",   label: "Empire Story",  disabled: true },
];

const LAYERS = [
  { id: "borders", label: "Borders" },
  { id: "cities",  label: "Cities" },
  { id: "events",  label: "Events" },
  { id: "wars",    label: "Wars",         disabled: true },
  { id: "empires", label: "Empires",      disabled: true },
  { id: "trade",   label: "Trade routes", disabled: true },
];

export function createLayersPanel({ state, onModeChange, onLayerToggle } = {}) {
  const root = document.getElementById("layersPanel");
  if (!root) return { refresh: () => {}, updateCounts: () => {} };

  // Collapse: title click folds the whole panel; phones start folded so the
  // panel doesn't eat half the viewport.
  const aside = root.closest("#modesPanel");
  const title = aside?.querySelector(".modes-title");
  if (title && !title.dataset.wired) {
    title.dataset.wired = "1";
    title.innerHTML += `<span class="modes-chev">▾</span>`;
    title.onclick = () => aside.classList.toggle("collapsed");
    if (window.innerWidth < 720) aside.classList.add("collapsed");
  }

  const countOf = id => {
    const c = state.layers[id]?.count;
    return c != null ? c : "";
  };

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
    root.innerHTML = `
      <div class="lp-section">
        <div class="lp-heading">Mode</div>
        ${modes}
      </div>
      <div class="lp-section">
        <div class="lp-heading">Layers</div>
        ${layers}
      </div>
      <p class="lp-note">Borders · Cities · Events are live. Greyed-out modes & layers land in later phases.</p>
    `;
    root.querySelectorAll('input[name="lp-mode"]').forEach(el => {
      el.onchange = () => onModeChange?.(el.value);
    });
    root.querySelectorAll('input[name="lp-layer"]').forEach(el => {
      el.onchange = () => onLayerToggle?.(el.value, el.checked);
    });
  }

  // Update only the count badges — called per scrub tick, so no full
  // re-render (that would rebuild inputs mid-interaction).
  function updateCounts() {
    root.querySelectorAll(".lp-count").forEach(el => {
      el.textContent = countOf(el.dataset.count);
    });
  }

  render();
  return { refresh: render, updateCounts };
}
