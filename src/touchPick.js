// Touch taps on the globe, resolved by our own hit test at the finger.
// globe.gl clicks whatever its render loop last raycast under the pointer
// (`hoverObj`). A finger has no hover before it lands, so on iOS a tap acted
// on a stale target (the previous tap's country, or Chile over open ocean).
// Here a tap (short, barely moving, one finger) is hit-tested where it
// lifted: city dots and names first, then event dots within a finger-sized
// radius, then territory outlines, then border polygons.
// Mouse and pen input keep globe.gl's own click path, except for the labels
// of a link's pins and the routes (`labels`), which no layer of
// globe.gl hit-tests: a click or tap on one goes to onLabel for any input.

const TAP_SLOP = 10;        // px the finger may wander and still count as a tap
const TAP_MS = 700;         // longer presses are not taps
const POINT_RADIUS = 12;    // px around an event dot that counts as hitting it
const CITY_RADIUS = 16;     // px around a city dot while names show; the name counts too
const DOT_RADIUS = 6;       // zoomed out (names hidden): only a tap on the dot itself

const LABEL_PAD = 6;        // px around a tappable label or pin dot that still counts
const ROUTE_RADIUS = 12;    // px from a trade route's line that counts as a tap on it

export function installTouchPick(world, el, { onPoint, onPolygon, onPath, onCity, cities, labels = () => [], onLabel, onRoute }) {
  let lastType = "mouse";
  let down = null;

  el.addEventListener("pointerdown", e => {
    if (!e.isTrusted) return;           // city labels forward a synthetic press to the canvas
    lastType = e.pointerType;
    // A second finger (pinch) or a press on a city label is never a globe tap.
    down = e.isPrimary && !e.target.closest?.(".city-label")
      ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, touch: e.pointerType === "touch" } : null;
  }, { capture: true });
  el.addEventListener("pointercancel", () => { down = null; }, { capture: true });

  el.addEventListener("pointerup", e => {
    const d = down;
    down = null;
    if (!d || e.pointerId !== d.id) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP || e.timeStamp - d.t > TAP_MS) return;
    const label = labelAt(e.clientX, e.clientY, d.touch ? LABEL_PAD : 2);
    if (label) return onLabel?.(label);
    if (!d.touch) return;
    const r = el.getBoundingClientRect();
    pick(e.clientX - r.left, e.clientY - r.top);
  }, { capture: true });

  // A pin's label or dot under the pointer (client coordinates), topmost first.
  function labelAt(x, y, pad) {
    let best = null, bestZ = -Infinity;
    for (const pin of labels()) {
      if (!pin.getClientRects().length || pin.style.display === "none") continue;
      for (const part of pin.querySelectorAll(".pin-label, .pin-dot")) {
        const r = part.getBoundingClientRect();
        if (!r.width || getComputedStyle(part).visibility === "hidden") continue;
        if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) continue;
        const z = +getComputedStyle(pin).zIndex || 0;
        if (z >= bestZ) { best = pin.__d; bestZ = z; }
      }
    }
    return best;
  }

  function pick(x, y) {
    const city = cityAt(x, y);
    if (city) return onCity(city.__d);
    const pt = nearestPoint(x, y);
    if (pt) return onPoint(pt);
    const route = routeAt(x, y);
    if (route) return onRoute?.(route);
    const ll = world.toGlobeCoords(x, y);
    if (!ll) return;                    // off the globe
    const path = world.pathsData().find(p => p.kind === "territory" && p.name &&
      inRing(ll.lat, ll.lng, p.points, ([lat, lng]) => [lng, lat]));
    if (path) return onPath(path);
    // Smallest containing feature wins: a subject polity drawn inside its overlord.
    let best = null, bestArea = Infinity;
    for (const f of world.polygonsData()) {
      const a = containsArea(f, ll.lng, ll.lat);
      if (a < bestArea) { best = f; bestArea = a; }
    }
    if (best) onPolygon(best);          // ocean: nothing is selected
  }

  // A trade route whose line passes within ROUTE_RADIUS of the finger.
  function routeAt(x, y) {
    const cam = world.camera().position;
    let best = null, bestD = ROUTE_RADIUS;
    for (const p of world.pathsData()) {
      if (p.kind !== "trade") continue;
      let prev = null;
      for (const [lat, lng, alt] of p.points) {
        const g = world.getCoords(lat, lng, alt);
        const s = g.x * cam.x + g.y * cam.y + g.z * cam.z > g.x * g.x + g.y * g.y + g.z * g.z
          ? world.getScreenCoords(lat, lng, alt) : null;   // null: far side of the globe
        if (s && prev) {
          const d = segDist(x, y, prev, s);
          if (d < bestD) { best = p.route; bestD = d; }
        }
        prev = s;
      }
    }
    return best;
  }

  // Nearest visible event dot to the finger, within POINT_RADIUS.
  function nearestPoint(x, y) {
    const cam = world.camera().position;
    let best = null, bestD = POINT_RADIUS;
    for (const d of world.pointsData()) {
      const p = world.getCoords(d.lat, d.lng, 0.006);
      // Far side of the globe: the surface point faces away from the camera.
      if (p.x * cam.x + p.y * cam.y + p.z * cam.z <= p.x * p.x + p.y * p.y + p.z * p.z) continue;
      const s = world.getScreenCoords(d.lat, d.lng, 0.006);
      const dist = Math.hypot(s.x - x, s.y - y);
      if (dist < bestD) { best = d; bestD = dist; }
    }
    return best;
  }

  // City labels ignore touches (src/globe.js) so a drag that starts on one
  // turns the globe; a tap on a dot or its name is matched here instead.
  // Zoomed out the dots are tiny and unnamed, so a country tap near one must
  // still reach the country.
  function cityAt(x, y) {
    const box = el.getBoundingClientRect();
    const far = el.classList.contains("cities-far");
    let best = null, bestD = far ? DOT_RADIUS : CITY_RADIUS;
    for (const c of cities()) {
      if (!c.getClientRects().length) continue;          // hidden: behind the globe or off screen
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2 - box.left, cy = r.top + r.height / 2 - box.top;
      let d = Math.hypot(x - cx, y - cy);
      if (!far && d >= bestD && x > cx && x < cx + r.width / 2 + 3 + nameWidth(c)) d = Math.abs(y - cy) * 1.5;
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  return { isTouch: () => lastType === "touch" };
}

function segDist(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l)) : 0;
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

const polysOf = g =>
  !g ? [] : g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];

// Bounding-box area of the outer ring containing (lng, lat), or Infinity.
function containsArea(f, lng, lat) {
  let area = Infinity;
  for (const poly of polysOf(f.geometry)) {
    const ring = poly[0];
    if (!inRing(lat, lng, ring, c => c)) continue;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of ring) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
    area = Math.min(area, (c - a) * (d - b));
  }
  return area;
}

// Even-odd point-in-ring; `xy` maps a ring vertex to [lng, lat].
function inRing(lat, lng, ring, xy) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = xy(ring[i]), [xj, yj] = xy(ring[j]);
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// Rendered width of a city label's name (its ::after), 0 when names are hidden.
const measure = document.createElement("canvas").getContext("2d");
function nameWidth(c) {
  const cs = getComputedStyle(c, "::after");
  if (cs.display === "none") return 0;
  measure.font = `${cs.fontSize} ${cs.fontFamily}`;
  return measure.measureText(c.dataset.name).width;
}

// Taps on the page's own controls (buttons, the panel's rows and its title, the
// boxes, links) act on the finger's lift. Safari otherwise waits to see whether a
// second tap follows, and two taps closer together than its reply to the first
// (touch-action: manipulation is applied, but the reply comes too late while the
// globe keeps the page busy) zoomed the page instead of stepping the year twice.
// Cancelling the lift ends Safari's double-tap there; the control is then clicked
// once, by us. A finger that moved (a scroll of the panel or a card) is not a tap.
// Controls with their own touch handling (search rows, the card's ×, the chip's
// Clear) cancel the lift first and are left to it; the globe has its own taps above.
const CONTROL = 'button, a[href], label, input[type="checkbox"], input[type="radio"], .modes-title, [role="button"]';
export function installControlTaps(root = document) {
  let start = null;
  const reset = () => { start = null; };
  root.addEventListener("touchstart", e => {
    const t = e.touches[0];
    const el = e.touches.length === 1 && !e.target.closest?.("#globe") ? e.target.closest?.(CONTROL) : null;
    start = el && !el.disabled ? { el, x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
  }, { passive: true });
  root.addEventListener("touchcancel", reset, { passive: true });
  root.addEventListener("touchend", e => {
    const s = start;
    start = null;
    if (!s || e.defaultPrevented || e.touches.length) return;
    const t = e.changedTouches[0];
    if (Math.hypot(t.clientX - s.x, t.clientY - s.y) > TAP_SLOP || e.timeStamp - s.t > TAP_MS) return;
    if (!s.el.isConnected || e.target.closest?.(CONTROL) !== s.el) return;
    e.preventDefault();
    // A tap elsewhere would have taken focus from a text field (and put the keyboard away).
    const f = document.activeElement;
    if (f && f !== s.el && f.matches?.('input:not([type]), input[type="text"], input[type="search"], textarea')) f.blur();
    s.el.click();
  }, { passive: false });
}
