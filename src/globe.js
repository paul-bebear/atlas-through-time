// 3D globe via globe.gl (Three.js). Satellite imagery + border polygons
// + time-keyed event points + city labels.

import { featureName } from "./data.js";
import { installTouchPick } from "./touchPick.js";

// UMD build loaded by index.html from vendor/.
const Globe = window.Globe;

const HILITE_A = "rgba(93, 169, 255, 0.85)";
const HILITE_B = "rgba(255, 138, 93, 0.85)";
const STROKE = "#8fe9ff";          // crisp cyan border, high contrast on satellite
const STROKE_SEL = "#ffffff";      // selected country border
const SEL_FILL = "rgba(143, 233, 255, 0.30)"; // selected country tint
// Idle auto-spin until the first touch: slow enough to read the map while it turns.
const IDLE_SPIN_SPEED = 0.12;

// globe.gl's hover tooltip follows the pointer; under a finger it sticks at the last
// touch point. Touch-only screens get no tooltip text (the cards are the touch affordance).
const NO_HOVER = matchMedia("(hover: none)").matches;
const tip = fn => NO_HOVER ? null : fn;

// NASA Blue Marble colour + topography (public domain, from three-globe's examples), resized to 2048 px / 1024 px.

export function createGlobe(el, { onCountryClick, onEventClick, onTerritoryClick, onCityClick, onRouteClick, onLinkPinClick, onReady, panels = () => [] }) {
  let lastPointClick = -1, lastPress = 0;

  let readyNow;
  const ready = new Promise(r => { readyNow = r; });   // a fly-to before this would be lost
  const world = Globe()(el)
    .backgroundColor("#06101c")
    .globeImageUrl("assets/earth-blue-marble-2048-v1.webp")
    .bumpImageUrl("assets/earth-topology-1024-v1.png")
    .showAtmosphere(true)
    .atmosphereColor("#5da9ff")
    .atmosphereAltitude(0.16)
    .onGlobeReady(() => { readyNow(); onReady?.(); })
    .polygonsTransitionDuration(0)
    .polygonSideColor(() => "rgba(0,0,0,0)")
    // One HTML layer: city labels plus map pins, one array tagged by kind.
    .htmlElement(d => d.kind === "pin" ? pinEl(d) : cityEl(d))
    // A route's name and stops sit at its line's height, so close up (a route framed
    // from 0.2 radii, seen at a slant) they stay on the line instead of drifting off it.
    .htmlAltitude(d => d.kind !== "pin" ? 0 : d.route ? 0.016 : 0.035)
    .pointLat(d => d.lat).pointLng(d => d.lng)
    .pointColor(d => d._color)
    .pointAltitude(0.006)
    .pointRadius(d => 0.10 + 0.16 * (d._alpha ?? 1))
    .pointResolution(6)
    .pointLabel(tip(d => `${d.title} · ${yr(d.startYear)}`))
    .onPointClick(d => { if (touch.isTouch()) return; lastPointClick = Date.now(); onEventClick(d); });

  world.globeMaterial().shininess = 5;

  // City labels are DOM nodes (CSS2DRenderer), one per name, reused across refreshes.
  // globe.gl hides those behind the globe (display: none).
  const canvas = world.renderer().domElement;
  const cityEls = new Map();
  function cityEl(d) {
    let e = cityEls.get(d.name);
    if (!e) {
      cityEls.set(d.name, e = document.createElement("div"));
      e.className = "city-label";
      e.dataset.name = d.name;
      // Touch-only screens: let presses through to the canvas so a drag that starts on a
      // label turns the globe natively (Safari drops the forwarded press below); taps are
      // matched to cities by touchPick. Inline so it beats .city-label's pointer-events.
      if (NO_HOVER) e.style.pointerEvents = "none";
      // Hand the press to the orbit controls so a drag starting on a label still turns the globe;
      // a release within a few px of the press is a click.
      e.addEventListener("pointerdown", ev => {
        ev.stopPropagation();
        canvas.dispatchEvent(new PointerEvent("pointerdown", ev));
        addEventListener("pointerup", up => {
          if (Math.hypot(up.clientX - ev.clientX, up.clientY - ev.clientY) > 5) return;
          lastPointClick = Date.now();
          onCityClick?.(e.__d);
        }, { once: true });
      });
      e.addEventListener("wheel", ev => { ev.preventDefault(); canvas.dispatchEvent(new WheelEvent("wheel", ev)); }, { passive: false });
    }
    e.__d = d;
    return e;
  }

  // Map pins (the selected polity). Never hit targets: taps, clicks and drags
  // go through to the globe, so touchPick and globe.gl see them as before.
  const pinEls = new Map();
  function pinEl(d) {
    let e = pinEls.get(d.key);
    if (!e) {
      pinEls.set(d.key, e = document.createElement("div"));
      e.innerHTML = `<span class="pin-leader"></span><span class="pin-label"></span><span class="pin-stem"></span><span class="pin-dot"></span>`;
    }
    e.className = "map-pin pin-" + d.style + (d.side && d.side !== "up" ? " pin-" + d.side : "");
    e.__d = d;
    e.querySelector(".pin-label").textContent = d.label;
    e.style.setProperty("--pin-c", d.color || "");
    return e;
  }
  let htmlCities = [];
  const htmlPins = new Map();       // style → pins
  const stopCities = new Map();     // city name → "end" | "mid": it names a highlighted route's stop
  const pushHtml = () => {
    placeRouteNames();
    // A route's stop already shown as a link pin keeps that one label, and so does
    // one that two highlighted routes share (Tyre): the first route's.
    // A stop on a city is named once too. In the middle of a route the city's
    // name stands in for it (see declutter). A route's first or last stop keeps
    // its own label, which may move out but never hides, over the city's dot.
    const near = (a, b) => Math.abs(a.lat - b.lat) < 0.12 && Math.abs(a.lng - b.lng) < 0.12;
    const links = htmlPins.get("link") || [], stops = [];
    stopCities.clear();
    const shown = [...htmlPins.values()].flat().filter(d => {
      if (d.style !== "wpt") return true;
      if (links.some(m => near(m, d)) || stops.some(s => s.label === d.label && near(s, d))) return false;
      const city = htmlCities.find(m => near(m, d));
      d.onCity = !!city && d.end;
      if (city) stopCities.set(city.name, d.end || stopCities.get(city.name) === "end" ? "end" : "mid");
      if (city && !d.end) return false;
      stops.push(d);
      return true;
    });
    world.htmlElementsData([...htmlCities, ...shown]);
    declutterSoon();
  };

  // A route's name sits on its line where it is farthest from the other pins and
  // the cities (not on Damascus or Jerusalem), within its middle. Names already
  // placed count too, but only nearby (within 2°), so routes that run side by side
  // (Tyre to Joppa and Tyre to Jerusalem) are named at different points.
  function placeRouteNames() {
    const names = (htmlPins.get("route") || []).filter(d => d.along);
    if (!names.length) return;
    const others = [...(htmlPins.get("sel") || []), ...(htmlPins.get("link") || []), ...htmlCities];
    const placed = [];
    for (const d of names) {
      let best = null, bestD = -1;
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const p = midway(d.route.points, t);
        const k = Math.cos(p.lat * Math.PI / 180);
        const far = o => Math.hypot(o.lat - p.lat, (o.lng - p.lng) * k);
        const dist = Math.min(9, ...others.map(far), ...placed.map(o => far(o) < 2 ? far(o) : 9));
        if (dist > bestD + 0.05) { best = p; bestD = dist; }
      }
      d.lat = best.lat; d.lng = best.lng;
      placed.push(best);
    }
  }

  // Label de-collision. Labels are placed greedily by importance (the selected
  // polities, the link's pins, highlighted route names, a route's open end, the
  // names of the other routes, its stops, city names). Each keeps its own side if
  // that is free, else tries the others. The first four kinds always show: with no
  // free side they move to the nearest free spot, joined to their point by a thin
  // neutral leader, and only if nothing is free within reach do they keep their own
  // side. The other routes' names may take a free spot a small step away while no
  // route is highlighted, and otherwise hide; stops and city names give way: they hide.
  // A route drawn shorter than SHORT px on screen gets a ring at its name's
  // anchor, so its name is plainly attached to something on the globe; the ring
  // goes with the name when the name hides.
  // Reads all positions first, then writes; at most ~10 times a second.
  const RANK = { sel: 0, link: 1, route: 2, "route-end": 3, wpt: 4 };
  const SHORT = 44;
  // The on-screen size (bounding box diagonal, px) of a route's near-side points.
  function screenSize(r) {
    const cam = world.camera().position;
    let l = Infinity, t = Infinity, rr = -Infinity, b = -Infinity;
    for (const [lng, lat] of r.points) {
      const g = world.getCoords(lat, lng, 0.016);
      if (g.x * cam.x + g.y * cam.y + g.z * cam.z <= g.x * g.x + g.y * g.y + g.z * g.z) continue;
      const s = world.getScreenCoords(lat, lng, 0.016);
      l = Math.min(l, s.x); rr = Math.max(rr, s.x); t = Math.min(t, s.y); b = Math.max(b, s.y);
    }
    return rr < l ? 0 : Math.hypot(rr - l, b - t);
  }
  const measure = document.createElement("canvas").getContext("2d");
  const textW = new Map();
  let dcTimer = null, dcLast = 0;
  function declutterSoon() {
    if (dcTimer) return;
    dcTimer = setTimeout(() => requestAnimationFrame(() => { dcTimer = null; dcLast = performance.now(); declutter(); }),
      Math.max(0, 100 - (performance.now() - dcLast)));
  }
  function declutter() {
    const box = el.getBoundingClientRect();
    const items = [], dots = [], cityDots = [];
    for (const e of pinEls.values()) {
      const d = e.__d;
      if (!d || !e.isConnected || e.style.display === "none" || !e.getClientRects().length) continue;
      const a = e.getBoundingClientRect(), lab = e.querySelector(".pin-label");
      if (a.right < box.left || a.left > box.right || a.bottom < box.top || a.top > box.bottom) continue;
      const style = d.style.split(" ")[0];
      e.classList.toggle("pin-on-city", !!d.onCity);
      const short = style === "route" && d.along && screenSize(d.route) < SHORT;
      e.classList.toggle("pin-short", short);
      // The ring is not an obstacle: the labels around it are laid out as without it.
      const r = style === "wpt" ? 3 : style === "route" ? 0 : 6;
      if (r) dots.push({ l: a.left - r, r: a.left + r, t: a.top - r, b: a.top + r, e });
      // A route's first and last stop are named like its open end: moved out, never hidden.
      if (lab && d.label) items.push({ e, x: a.left, y: a.top, w: lab.offsetWidth, h: lab.offsetHeight,
        rank: d.quiet ? (d.dim ? 4.5 : 3.5) : style === "wpt" && d.end ? RANK["route-end"] : RANK[style] ?? 5,
        mayMove: d.quiet && !d.dim, side: d.side || "up", style });
    }
    {
      // A city standing in for a stop in the middle of a highlighted route is named
      // as that stop would be: with its rank, and also when the other city names are
      // off (far out). A city at a route's end leaves its name to the stop's label.
      const far = el.classList.contains("cities-far");
      const fs = Math.max(9, Math.min(13, parseFloat(getComputedStyle(el).getPropertyValue("--city-size")) || 11));
      measure.font = `${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      for (const e of cityEls.values()) {
        const stop = stopCities.get(e.dataset.name);
        e.classList.toggle("city-stop", stop === "mid");
        e.classList.toggle("city-end", stop === "end");
        if (e.isConnected && e.getClientRects().length) {
          const c = e.getBoundingClientRect();
          if (c.width) cityDots.push({ l: c.left, r: c.right, t: c.top, b: c.bottom });
        }
        if ((far && stop !== "mid") || stop === "end" || !e.isConnected || !e.getClientRects().length) continue;
        const a = e.getBoundingClientRect(), k = e.dataset.name + "|" + fs;
        if (!textW.has(k)) textW.set(k, measure.measureText(e.dataset.name).width);
        const w = textW.get(k), t = a.top + a.height / 2 - fs / 2, b = t + fs;
        items.push({ e, city: true, rank: stop ? RANK.wpt : 6,
          rect: { l: a.right + 3, r: a.right + 3 + w, t, b }, left: stop ? { l: a.left - 3 - w, r: a.left - 3, t, b } : null });
      }
    }
    const rects = side => it => {
      const { x, y, w, h } = it, up = it.style === "link" ? 13 : 17;
      return side === "up" ? { l: x - w / 2, r: x + w / 2, t: y - up - h, b: y - up }
        : side === "down" ? { l: x - w / 2, r: x + w / 2, t: y + 13, b: y + 13 + h }
        : side === "right" ? { l: x + 8, r: x + 8 + w, t: y - h / 2, b: y + h / 2 }
        : { l: x - 8 - w, r: x - 8, t: y - h / 2, b: y + h / 2 };
    };
    const hit = (p, q) => p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;
    // Whether the segment a→b passes through rectangle q (Liang–Barsky clipping).
    const cross = ([ax, ay, bx, by], q) => {
      let t0 = 0, t1 = 1;
      const dx = bx - ax, dy = by - ay;
      for (const [p, v] of [[-dx, ax - q.l], [dx, q.r - ax], [-dy, ay - q.t], [dy, q.b - ay]]) {
        if (p === 0) { if (v < 0) return false; continue; }
        const r = v / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
      return t1 - t0 > 0.02;
    };
    const leaders = [];               // the leaders drawn so far: no label goes over one
    // The page's own panels (card, timeline, chip…) count as taken: a label
    // goes to a side that is not under one, or hides.
    const placed = panels().map(r => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })), out = [];
    // A label that would run off the screen counts as blocked too.
    const vw = { l: Math.max(box.left, 0) + 2, r: Math.min(box.right, innerWidth) - 2,
      t: Math.max(box.top, 0) + 2, b: Math.min(box.bottom, innerHeight) - 2 };
    items.sort((a, b) => a.rank - b.rank);
    // Moved out (a label that must show, with no free side): the free spot nearest
    // to its point, from every position on a fine grid around it, never on the point
    // itself. A label already moved out keeps its spot while that stays free and is
    // not much further than the nearest one, so a small drag does not make it jump.
    const reachOf = (it, r) => Math.hypot(Math.max(r.l - it.x, 0, it.x - r.r), Math.max(r.t - it.y, 0, it.y - r.b));
    // A moved label also keeps clear of every other point (stops, pins, city dots),
    // so it never sits beside another place's dot and reads as that place's name.
    const PAD = 9;
    const moved = (it, free0, maxR) => {
      const { x, y, w, h } = it, cand = [];
      const near = (d, q) => q.l < d.r + PAD && d.l - PAD < q.r && q.t < d.b + PAD && d.t - PAD < q.b;
      // Its leader (from the point to the label's nearest point) crosses no label either.
      // (its first few px, on the point itself, do not count).
      const leader = q => {
        const ex = Math.max(q.l, Math.min(x, q.r)), ey = Math.max(q.t, Math.min(y, q.b));
        const k = Math.min(1, 5 / (Math.hypot(ex - x, ey - y) || 1));
        return [x + (ex - x) * k, y + (ey - y) * k, ex, ey];
      };
      const loose = q => free0(q) && !dots.some(d => d.e !== it.e && near(d, q))
        && !cityDots.some(d => near(d, q) && Math.hypot((d.l + d.r) / 2 - x, (d.t + d.b) / 2 - y) > 4);
      // Better still, where there is room: no leader runs through a label.
      const free = q => loose(q) && !placed.some(p => cross(leader(q), p)) && !leaders.some(s => cross(s, q));
      for (let l = x - w - maxR; l <= x + maxR; l += 4) for (let t = y - h - maxR; t <= y + maxR; t += 3) {
        const q = { l, r: l + w, t, b: t + h }, d = reachOf(it, q);
        if (d >= 7 && d <= maxR) cand.push([d, q]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      // A spot with no leader through a label wins unless it is much further out.
      const tidy = cand.find(c => free(c[1])), any = cand.find(c => loose(c[1]));
      const best = tidy && (!any || tidy[0] <= any[0] + 14) ? tidy : any;
      const prev = it.e.__dcOff;
      if (prev && best) {
        const q = { l: x + prev.dx, r: x + prev.dx + w, t: y + prev.dy, b: y + prev.dy + h }, d = reachOf(it, q);
        if (d >= 7 && d <= best[0] + Math.min(14, best[0] * 0.5) && loose(q)) return q;
      }
      return best?.[1] ?? null;
    };
    // How far a label may move out: one that must show up to MOVE_MAX px; a quiet
    // route name (which need not show) only a small step, else it hides.
    const MOVE_MAX = 90, MOVE_QUIET = 16;
    for (const it of items) {
      const free = q => q.l >= vw.l && q.r <= vw.r && q.t >= vw.t && q.b <= vw.b
        && !placed.some(p => hit(p, q)) && !dots.some(d => d.e !== it.e && hit(d, q));
      if (it.city) {
        // A city naming a route's stop may take its left side when the right is taken.
        const q = [it.rect, it.left].find(q => q && free(q));
        if (q) placed.push(q);
        out.push([it, !q ? "hide" : q === it.rect ? "" : "left"]);
        continue;
      }
      const sides = [it.side, ...["up", "right", "down", "left"].filter(s => s !== it.side)];
      const side = sides.find(s => free(rects(s)(it)));
      if (side) { placed.push(rects(side)(it)); out.push([it, side === it.side ? "" : side]); continue; }
      if (it.rank > 3 && !it.mayMove) { out.push([it, "hide"]); continue; }
      const r = moved(it, free, it.mayMove ? MOVE_QUIET : MOVE_MAX);
      if (!r && it.mayMove) { out.push([it, "hide"]); continue; }
      if (!r) { placed.push(rects(it.side)(it)); out.push([it, ""]); continue; }
      placed.push(r);
      leaders.push([it.x, it.y, Math.max(r.l, Math.min(it.x, r.r)), Math.max(r.t, Math.min(it.y, r.b))]);
      out.push([it, "free", r]);
    }
    for (const [it, v, r] of out) {
      if (it.city) { it.e.classList.toggle("dc-hide", v === "hide"); it.e.classList.toggle("dc-left", v === "left"); continue; }
      if ((it.e.dataset.dc || "") !== v) it.e.dataset.dc = v;
      if (v !== "free") { it.e.__dcOff = null; continue; }
      // The label's corner relative to the anchor, and a leader from the anchor
      // to the label's nearest point: a thin neutral hairline with a small ring on
      // the point, unlike any route's line (main.css .pin-leader).
      const dx = r.l - it.x, dy = r.t - it.y;
      it.e.__dcOff = { dx, dy };
      const cx = Math.max(dx, Math.min(0, dx + it.w)), cy = Math.max(dy, Math.min(0, dy + it.h));
      it.e.style.setProperty("--dcx", dx.toFixed(1) + "px");
      it.e.style.setProperty("--dcy", dy.toFixed(1) + "px");
      it.e.style.setProperty("--ll", Math.hypot(cx, cy).toFixed(1) + "px");
      it.e.style.setProperty("--la", Math.atan2(cy, cx).toFixed(3) + "rad");
    }
  }
  const controls = world.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = IDLE_SPIN_SPEED;
  el.addEventListener("pointerdown", () => { controls.autoRotate = false; }, { once: true });
  el.addEventListener("pointerdown", () => { lastPress = Date.now(); });
  // globe.gl starts its pointer at (−2, −2) px, the top-left corner, and hovers whatever
  // lies there before the mouse has moved: on a zoomed-in globe that is a country, whose
  // name then sits over the title. Its tooltip stays hidden until a real pointer event.
  el.classList.add("no-pointer-yet");
  const pointerSeen = () => el.classList.remove("no-pointer-yet");
  el.addEventListener("pointermove", pointerSeen, { once: true });
  el.addEventListener("pointerdown", pointerSeen, { once: true });
  controls.addEventListener("change", sizeCities);
  controls.addEventListener("change", () => declutterSoon());

  // Stop burning GPU when the tab is in the background.
  document.addEventListener("visibilitychange", () =>
    document.hidden ? world.pauseAnimation() : world.resumeAnimation());

  // globe.gl does not stop a camera tween when another starts, so two at once
  // fight and the longer one lands last. A fly-to asked for mid-flight waits for
  // the current one to end; only the latest such request runs.
  let flying = false, nextFlight = null;
  function fly(p) {
    if (flying) { nextFlight = p; return; }
    flying = true;
    world.pointOfView({ lat: p.lat, lng: p.lng, altitude: p.altitude }, p.ms);
    setTimeout(() => {
      flying = false;
      const q = nextFlight; nextFlight = null;
      if (q) fly(q);
    }, p.ms + 30);
  }

  let highlightMap = new Map();
  let selectedKey = null;

  // Paths layer (outlines only) — used for territory mode. Much lighter
  // than tessellating filled polygon meshes.
  world
    .pathsData([])
    .pathPoints(d => d.points)
    .pathPointLat(p => p[0])
    .pathPointLng(p => p[1])
    .pathPointAlt(p => p[2] ?? 0.001)
    .pathColor(d => d.color || STROKE)
    .pathStroke(d => d.stroke ?? 1.2)   // ≥1 px gives a usable hover hit-box; 0.6 was effectively unreachable
    // Sea routes are dashed; while in use the dashes move in the direction of travel.
    // Dash sizes are fractions of each path's length; a route cut into pieces
    // (an open end fading out) carries its own so the dashes stay the same size.
    .pathDashLength(d => d.dashed ? d.dashLen ?? 0.035 : 1)
    .pathDashGap(d => d.dashed ? d.dashGap ?? 0.02 : 0)
    .pathDashAnimateTime(d => d.animate ? d.animMs ?? 14000 : 0)
    .pathLabel(tip(d => d.name ? `<b>${d.name}</b>` : ""))
    .onPathHover(p => { el.style.cursor = p ? "pointer" : "grab"; })
    // Territory outlines resolve to a polity card; a trade route opens its own card.
    .onPathClick(d => {
      if (touch.isTouch() || lastPointClick >= lastPress) return;
      if (d?.kind === "territory" && d.name) onTerritoryClick?.(d.name, d);
      else if (d?.kind === "trade") onRouteClick?.(d.route);
    })
    .pathTransitionDuration(0);

  world
    .polygonCapColor(f => {
      const k = norm(featureName(f));
      if (k === selectedKey) return SEL_FILL;
      const s = highlightMap.get(k);
      if (s === "A") return HILITE_A;
      if (s === "B") return HILITE_B;
      if (s === "G") return "rgba(93, 255, 138, 0.60)";  // quiz: correct
      if (s === "R") return "rgba(255, 93, 93, 0.60)";   // quiz: wrong / reveal
      return "rgba(0,0,0,0)"; // fully transparent — satellite imagery stays crisp
    })
    .polygonStrokeColor(f => (norm(featureName(f)) === selectedKey ? STROKE_SEL : STROKE))
    .polygonAltitude(f => {
      const k = norm(featureName(f));
      if (k === selectedKey) return 0.03;
      return highlightMap.has(k) ? 0.014 : 0.006;
    })
    .polygonLabel(tip(f => `<b>${featureName(f)}</b>`))
    .onPolygonHover(f => { el.style.cursor = f ? "pointer" : "grab"; })
    .onPolygonClick(f => {
      if (touch.isTouch()) return;             // taps are resolved by touchPick below
      if (lastPointClick >= lastPress) return; // this press already opened an event point or city
      if (f) clickPolygon(f);
    });

  function clickPolygon(f) {
    onCountryClick(f);                       // selectCurated etc. run their setHighlights (which clears selectedKey)
    selectedKey = norm(featureName(f));      // then re-mark the clicked one
    refresh();
  }

  // Mobile: globe.gl's click acts on a stale hover raycast under a finger, so touch
  // taps get their own hit test at the finger (src/touchPick.js).
  const touch = installTouchPick(world, el, {
    onPoint: onEventClick,
    onPath: d => { if (d.name) onTerritoryClick?.(d.name, d); },
    onPolygon: clickPolygon,
    onCity: d => { lastPointClick = Date.now(); onCityClick?.(d); },
    cities: () => cityEls.values(),
    // Route names, stops and open ends answer a click or tap with the route's card,
    // a link's pin with its own.
    labels: () => [...pinEls.values()].filter(e => e.isConnected && (e.__d?.route || e.__d?.pin)),
    onLabel: d => { lastPointClick = Date.now(); if (d.route) onRouteClick?.(d.route); else if (d.pin) onLinkPinClick?.(d.pin); },
    onRoute: r => { lastPointClick = Date.now(); onRouteClick?.(r); }
  });

  const refresh = () => world.polygonsData(world.polygonsData());

  function resize() { world.width(el.clientWidth).height(el.clientHeight); sizeCities(); declutterSoon(); }
  // Labels scale with zoom like the old 3D text (capped in CSS); zoomed out, only the dots show.
  let citySize = 0;
  function sizeCities() {
    const s = Math.round(el.clientHeight / 45 / world.pointOfView().altitude) / 2;
    if (s === citySize) return;
    citySize = s;
    el.style.setProperty("--city-size", s + "px");
    el.classList.toggle("cities-far", s < 7);
  }
  window.addEventListener("resize", resize);
  resize();

  let currentFeatures = [];
  return {
    world,
    setBorders: gj => { currentFeatures = gj.features || []; world.polygonsData(currentFeatures); },
    // Render a set of GeoJSON features as outline-only paths (the
    // territory layer). Far lighter than tessellating filled polygons.
    setTerritoryOutlines(features) {
      const paths = [];
      for (const f of (features || [])) {
        if (!f.geometry) continue;
        const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates]
          : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
        for (const poly of polys)
          for (const ring of poly)
            paths.push({ kind: "territory", name: f.properties?.NAME || "",
              points: ring.map(([lng, lat]) => [lat, lng]) });
      }
      // Reset selection visuals so polygons come back clean on territory exit.
      highlightMap = new Map();
      selectedKey = null;
      currentFeatures = []; world.polygonsData([]);
      world.pathsData(paths);
      if (htmlPins.delete("route")) pushHtml();   // trade route labels go with their lines
    },
    clearTerritoryOutlines() { world.pathsData([]); if (htmlPins.delete("route")) pushHtml(); },
    // Trade routes ride the same paths layer as territory outlines, but the
    // two are never on together (territory is its own mode), so sharing is safe.
    // Every route is named. `highlight` (ids from a link, and the route whose card
    // is open) draws those routes thicker, with their stops and ends named;
    // a highlighted route not in use in `year` is grey, its label giving its dates.
    // While some are highlighted, the others and their names are dimmed. An open end
    // (a last waypoint with `open: true`) fades out instead of ending on a place.
    setTradeRoutes(routes, { highlight = new Set(), year = null } = {}) {
      const list = routes || [];
      const inUse = r => year == null || ((r.from == null || year >= r.from) && (r.to == null || year <= r.to));
      const paths = list.flatMap(r => {
        const hl = highlight.has(r.id), on = inUse(r);
        const base = !on ? "#9aa3ad" : r.color || STROKE;
        const alpha = !on ? 0.7 : highlight.size && !hl ? 0.4 : 1;
        const open = r.waypoints?.at(-1)?.open;
        const L = length(r.points);
        const piece = (pts, a) => {
          const f = length(pts) / L || 1;
          return {
            kind: "trade", route: r, hl,
            name: `${r.name} · ${yr(r.from)} – ${yr(r.to)}`,
            color: rgba(base, a),
            stroke: hl ? 3 : 1.6,
            dashed: r.mode === "sea", dashLen: 0.035 / f, dashGap: 0.02 / f, animMs: 14000 * f,
            animate: r.mode === "sea" && on,
            // Above highlighted borders (0.014), so a link's route is not hidden under its polity.
            points: pts.map(([lng, lat]) => [lat, lng, 0.016])
          };
        };
        if (!open) return [piece(r.points, alpha)];
        // An open end is not a place: the last quarter fades out in steps.
        const [head, tail] = cut(r.points, 0.75);
        const steps = 6;
        return [piece(head, alpha), ...Array.from({ length: steps }, (_, i) =>
          piece(cut(cut(tail, (i + 1) / steps)[0], i / (i + 1))[1], alpha * (1 - (i + 1) / (steps + 1))))];
      });
      world.pathsData(paths);
      // Highlighted routes: their name beside the line, the names of their stops,
      // and an open end labelled as what it is ("towards Ophir (location unknown)").
      const labels = [];
      list.filter(r => highlight.has(r.id)).forEach((r, i) => {
        const on = inUse(r), color = on ? r.color : null;
        const { lat, lng } = midway(r.points);
        labels.push({ kind: "pin", style: on ? "route" : "route pin-route-off", key: "route" + i, side: "right", lat, lng, route: r, along: true,
          color, label: on ? r.name : `${r.name} · in use ${yr(r.from)} – ${yr(r.to)}` });
        (r.waypoints || []).forEach((w, j) => {
          if (w.open) labels.push({ kind: "pin", style: "route-end", key: `rend${i}`, side: "down", lat: w.lat, lng: w.lng, route: r, color, label: w.name });
          else labels.push({ kind: "pin", style: "wpt", key: `wpt${i}-${j}`, side: "right", lat: w.lat, lng: w.lng, route: r, color, label: w.name,
            end: j === 0 || j === r.waypoints.length - 1 });
        });
      });
      // The other routes: their name only, quieter, and dimmed while some are highlighted.
      for (const r of list) {
        if (highlight.has(r.id)) continue;
        const { lat, lng } = midway(r.points);
        labels.push({ kind: "pin", style: "route pin-route-quiet" + (highlight.size ? " pin-route-dim" : ""), key: "rq-" + r.id,
          side: "right", lat, lng, route: r, along: true, quiet: true, dim: highlight.size > 0, color: r.color, label: r.name });
      }
      htmlPins.set("route", labels);
      pushHtml();
    },
    // Features in the current border set whose name matches any of `names`
    // (dash/diacritic/punctuation-insensitive).
    featuresForNames(names) {
      const set = new Set((names || []).map(norm));
      return currentFeatures.filter(f => set.has(norm(featureName(f))));
    },
    setCities: c => { htmlCities = c || []; pushHtml(); },
    // The red pin at the selected polity (a link may select two): { label, lat, lng, off },
    // a list, or null; `off` greys it (the polity does not exist in this year).
    setSelectionPin(p) {
      const list = (Array.isArray(p) ? p : p ? [p] : []).filter(q => q.lat != null);
      htmlPins.set("sel", list.map((q, i) => ({ kind: "pin", style: q.off ? "sel pin-off" : "sel", key: "sel" + i, label: q.label, lat: q.lat, lng: q.lng })));
      pushHtml();
    },
    // Pins from the link the visitor opened: [{ label, lat, lng }]. Kept in memory only.
    // Pins close together (Elath and Ezion-Geber) get their labels on different sides.
    setLinkPins(list) {
      const pins = list || [];
      htmlPins.set("link", pins.map((q, i) => ({ kind: "pin", style: "link", key: "link" + i, label: q.label || "", lat: q.lat, lng: q.lng, pin: q,
        side: ["up", "down", "right", "left"][pins.slice(0, i).filter(o => Math.hypot(o.lat - q.lat, (o.lng - q.lng) * Math.cos(q.lat * Math.PI / 180)) < 1.5).length % 4] })));
      pushHtml();
    },
    allFeatures: () => currentFeatures,
    setEvents: e => world.pointsData(e || []),
    setHighlights(highlights) {
      highlightMap = new Map();
      (highlights || []).forEach(h => h.names.forEach(n => highlightMap.set(norm(n), h.side)));
      selectedKey = null;             // selection event will re-set this AFTER if a polygon was clicked
      world.polygonsData(world.polygonsData());
    },
    // A fly-to means "look here", so the idle spin stops instead of carrying the view away.
    flyTo(lat, lng, altitude = 0.75, ms = 1400) {
      controls.autoRotate = false;
      ready.then(() => fly({ lat, lng, altitude, ms }));
    },
    altitude: () => world.pointOfView().altitude,
    // How many of the drawn routes have a point on the near side of the globe, on screen.
    routesInView() {
      const cam = world.camera().position, box = el.getBoundingClientRect();
      const ids = new Set();
      for (const p of world.pathsData()) {
        if (p.kind !== "trade" || ids.has(p.route.id)) continue;
        for (const [lat, lng, alt] of p.points) {
          const g = world.getCoords(lat, lng, alt);
          if (g.x * cam.x + g.y * cam.y + g.z * cam.z <= g.x * g.x + g.y * g.y + g.z * g.z) continue;
          const s = world.getScreenCoords(lat, lng, alt);
          if (s.x >= 0 && s.y >= 0 && s.x <= box.width && s.y <= box.height) { ids.add(p.route.id); break; }
        }
      }
      return ids.size;
    },
    onCamera: fn => controls.addEventListener("change", fn),
    isFlying: () => flying || !!nextFlight
  };
}

const segLen = (a, b) => Math.hypot(b[1] - a[1], (b[0] - a[0]) * Math.cos(b[1] * Math.PI / 180));
const length = pts => pts.slice(1).reduce((s, p, i) => s + segLen(pts[i], p), 0);
// A [lng, lat] line cut at fraction `t` of its length: [before, after], sharing the cut point.
function cut(points, t) {
  let left = length(points) * t;
  for (let i = 0; i < points.length - 1; i++) {
    const s = segLen(points[i], points[i + 1]);
    if (left <= s && s > 0) {
      const a = points[i], b = points[i + 1], k = left / s;
      const m = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      return [[...points.slice(0, i + 1), m], [m, ...points.slice(i + 1)]];
    }
    left -= s;
  }
  return [points, [points.at(-1), points.at(-1)]];
}
// The point at fraction `t` (default halfway) along a [lng, lat] line by length (flat, cos-lat scaled).
function midway(points, t0 = 0.5) {
  const seg = points.slice(1).map((p, i) => Math.hypot(p[1] - points[i][1],
    (p[0] - points[i][0]) * Math.cos(p[1] * Math.PI / 180)));
  let left = seg.reduce((a, b) => a + b, 0) * t0;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] && seg[i] > 0) {
      const t = left / seg[i], a = points[i], b = points[i + 1];
      return { lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t };
    }
    left -= seg[i];
  }
  const [lng, lat] = points[points.length - 1];
  return { lat, lng };
}
// "#3fd0c9" → "rgba(63, 208, 201, a)"; anything else passes through.
function rgba(c, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function yr(y) { return y < 0 ? Math.abs(y) + " BCE" : y + " CE"; }

// Normalise a place name for matching: lowercase, strip diacritics,
// unify dashes, drop punctuation, collapse spaces.
function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
