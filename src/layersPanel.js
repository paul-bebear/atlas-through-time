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
  if (!root) return { refresh: () => {} };

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

  render();
  return { refresh: render };
}
