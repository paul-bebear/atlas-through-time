// Left-drawer panel: mode radio + layer checkboxes.
// Phase 1 per Architecture.md — the UI mutates state.mode / state.layers.*.enabled
// but no renderer reads those yet, so toggling is intentionally inert.
// onModeChange / onLayerToggle hooks are provided for Phase 2 wiring.

const MODES = [
  { id: "discovery",      label: "Discovery" },
  { id: "us-territorial", label: "US Territorial Growth", disabled: true },
  { id: "map-quiz",       label: "Map Quiz",              disabled: true },
  { id: "empire-story",   label: "Empire Story",          disabled: true },
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
      <p class="lp-note">Phase 1 — controls are wired but not yet observed by the globe. Phase 2 will hook them up.</p>
    `;
    root.querySelectorAll('input[name="lp-mode"]').forEach(el => {
      el.onchange = () => {
        state.mode = el.value;
        if (onModeChange) onModeChange(state.mode);
      };
    });
    root.querySelectorAll('input[name="lp-layer"]').forEach(el => {
      el.onchange = () => {
        const id = el.value;
        if (state.layers[id]) state.layers[id].enabled = el.checked;
        if (onLayerToggle) onLayerToggle(id, el.checked);
      };
    });
  }

  render();
  return { refresh: render };
}
