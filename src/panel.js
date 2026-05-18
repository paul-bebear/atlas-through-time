// Slide-out menu drawer: open/close + collapsible accordion sections.
// Uses event delegation so clicks on the header text OR the chevron work,
// and so it can't be left unbound by an earlier missing element.

export function initPanel() {
  const drawer = document.getElementById("drawer");
  if (!drawer) return {};

  const open = () => drawer.classList.remove("closed");
  const shut = () => drawer.classList.add("closed");

  const mb = document.getElementById("menuBtn");
  if (mb) mb.onclick = open;
  const dc = document.getElementById("drawerClose");
  if (dc) dc.onclick = shut;

  drawer.addEventListener("click", e => {
    const h = e.target.closest(".acc-h");
    if (h && drawer.contains(h)) h.parentElement.classList.toggle("open");
  });

  window.addEventListener("keydown", e => { if (e.key === "Escape") shut(); });

  return { open, shut };
}
