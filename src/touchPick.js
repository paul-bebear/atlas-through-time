// Touch taps on the globe, resolved by our own hit test at the finger.
// globe.gl clicks whatever its render loop last raycast under the pointer
// (`hoverObj`). A finger has no hover before it lands, so on iOS a tap acted
// on a stale target (the previous tap's country, or Chile over open ocean).
// Here a tap (short, barely moving, one finger) is hit-tested where it
// lifted: event dots within a finger-sized radius first, then territory
// outlines, then border polygons.
// Mouse and pen input keep globe.gl's own click path.

const TAP_SLOP = 10;        // px the finger may wander and still count as a tap
const TAP_MS = 700;         // longer presses are not taps
const POINT_RADIUS = 12;    // px around an event dot that counts as hitting it

export function installTouchPick(world, el, { onPoint, onPolygon, onPath }) {
  let lastType = "mouse";
  let down = null;

  el.addEventListener("pointerdown", e => {
    if (!e.isTrusted) return;           // city labels forward a synthetic press to the canvas
    lastType = e.pointerType;
    // A second finger (pinch) or a press on a city label is never a globe tap.
    down = e.pointerType === "touch" && e.isPrimary && !e.target.closest?.(".city-label")
      ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
  }, { capture: true });
  el.addEventListener("pointercancel", () => { down = null; }, { capture: true });

  el.addEventListener("pointerup", e => {
    const d = down;
    down = null;
    if (!d || e.pointerId !== d.id) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP || e.timeStamp - d.t > TAP_MS) return;
    const r = el.getBoundingClientRect();
    pick(e.clientX - r.left, e.clientY - r.top);
  }, { capture: true });

  function pick(x, y) {
    const pt = nearestPoint(x, y);
    if (pt) return onPoint(pt);
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

  return { isTouch: () => lastType === "touch" };
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
