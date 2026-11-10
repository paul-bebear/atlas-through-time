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
    .htmlAltitude(d => d.kind === "pin" ? 0.035 : 0)
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
  const pushHtml = () => {
    placeRouteNames();
    // A route's stop already shown as a link pin or a city keeps that one label.
    const near = (a, b) => Math.abs(a.lat - b.lat) < 0.12 && Math.abs(a.lng - b.lng) < 0.12;
    const marks = [...(htmlPins.get("link") || []), ...htmlCities];
    const shown = [...htmlPins.values()].flat().filter(d => d.style !== "wpt" || !marks.some(m => near(m, d)));
    world.htmlElementsData([...htmlCities, ...shown]);
    declutterSoon();
  };

  // A highlighted route's name sits on its line where it is farthest from the
  // other pins and the cities (not on Damascus or Jerusalem), within its middle.
  function placeRouteNames() {
    const names = (htmlPins.get("route") || []).filter(d => d.along);
    if (!names.length) return;
    const others = [...(htmlPins.get("sel") || []), ...(htmlPins.get("link") || []), ...htmlCities];
    for (const d of names) {
      let best = null, bestD = -1;
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const p = midway(d.route.points, t);
        const k = Math.cos(p.lat * Math.PI / 180);
        const dist = Math.min(9, ...others.map(o => Math.hypot(o.lat - p.lat, (o.lng - p.lng) * k)));
        if (dist > bestD + 0.05) { best = p; bestD = dist; }
      }
      d.lat = best.lat; d.lng = best.lng;
    }
  }

  // Label de-collision. Labels are placed greedily by importance (the selected
  // polities, the link's pins, route names, a route's open end, its stops, city
  // names). Each keeps its own side if that is free, else tries the others. The
  // first four kinds always show: with no free side they move further out along
  // a short leader line (stacking beside a neighbour), and only if nothing is free
  // do they keep their own side. Stops and city names give way: they hide.
  // Reads all positions first, then writes; at most ~10 times a second.
  const RANK = { sel: 0, link: 1, route: 2, "route-end": 3, wpt: 4 };
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
    const items = [], dots = [];
    for (const e of pinEls.values()) {
      const d = e.__d;
      if (!d || !e.isConnected || e.style.display === "none" || !e.getClientRects().length) continue;
      const a = e.getBoundingClientRect(), lab = e.querySelector(".pin-label");
      if (a.right < box.left || a.left > box.right || a.bottom < box.top || a.top > box.bottom) continue;
      const style = d.style.split(" ")[0];
      const r = style === "wpt" ? 3 : style === "route" ? 0 : 6;
      if (r) dots.push({ l: a.left - r, r: a.left + r, t: a.top - r, b: a.top + r, e });
      if (lab && d.label) items.push({ e, x: a.left, y: a.top, w: lab.offsetWidth, h: lab.offsetHeight, rank: RANK[style] ?? 5,
        side: d.side || "up", style });
    }
    if (!el.classList.contains("cities-far")) {
      const fs = Math.max(9, Math.min(13, parseFloat(getComputedStyle(el).getPropertyValue("--city-size")) || 11));
      measure.font = `${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      for (const e of cityEls.values()) {
        if (!e.isConnected || !e.getClientRects().length) continue;
        const a = e.getBoundingClientRect(), k = e.dataset.name + "|" + fs;
        if (!textW.has(k)) textW.set(k, measure.measureText(e.dataset.name).width);
        items.push({ e, city: true, rank: 6, rect: { l: a.right + 3, r: a.right + 3 + textW.get(k), t: a.top + a.height / 2 - fs / 2, b: a.top + a.height / 2 + fs / 2 } });
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
    // The page's own panels (card, timeline, chip…) count as taken: a label
    // goes to a side that is not under one, or hides.
    const placed = panels().map(r => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })), out = [];
    // A label that would run off the screen counts as blocked too.
    const vw = { l: Math.max(box.left, 0) + 2, r: Math.min(box.right, innerWidth) - 2,
      t: Math.max(box.top, 0) + 2, b: Math.min(box.bottom, innerHeight) - 2 };
    items.sort((a, b) => a.rank - b.rank);
    // Further out for a label that must show: its sides pushed out step by step
    // (up, down, sideways, and diagonally), nearest to the anchor first.
    const moved = it => {
      const out = [];
      for (let k = 1; k <= 6; k++) {
        const dy = k * (it.h + 4), dx = k * 24;
        for (const s of ["up", "down", "right", "left"]) {
          const r = rects(s)(it);
          if (s === "up" || s === "down") for (const h of [0, -dx, dx]) {
            const v = s === "up" ? -dy : dy;
            out.push({ l: r.l + h, r: r.r + h, t: r.t + v, b: r.b + v });
          }
          else for (const v of [0, -dy, dy]) {
            const h = s === "right" ? dx : -dx;
            out.push({ l: r.l + h, r: r.r + h, t: r.t + v, b: r.b + v });
          }
        }
      }
      const reach = r => Math.hypot(Math.max(r.l - it.x, 0, it.x - r.r), Math.max(r.t - it.y, 0, it.y - r.b));
      return out.sort((a, b) => reach(a) - reach(b));
    };
    for (const it of items) {
      const free = q => q.l >= vw.l && q.r <= vw.r && q.t >= vw.t && q.b <= vw.b
        && !placed.some(p => hit(p, q)) && !dots.some(d => d.e !== it.e && hit(d, q));
      if (it.city) { const ok = free(it.rect); if (ok) placed.push(it.rect); out.push([it, ok ? "" : "hide"]); continue; }
      const sides = [it.side, ...["up", "right", "down", "left"].filter(s => s !== it.side)];
      const side = sides.find(s => free(rects(s)(it)));
      if (side) { placed.push(rects(side)(it)); out.push([it, side === it.side ? "" : side]); continue; }
      if (it.rank > 3) { out.push([it, "hide"]); continue; }
      const r = moved(it).find(free);
      if (!r) { placed.push(rects(it.side)(it)); out.push([it, ""]); continue; }
      placed.push(r);
      out.push([it, "free", r]);
    }
    for (const [it, v, r] of out) {
      if (it.city) { it.e.classList.toggle("dc-hide", v === "hide"); continue; }
      if ((it.e.dataset.dc || "") !== v) it.e.dataset.dc = v;
      if (v !== "free") continue;
      // The label's corner relative to the anchor, and a leader from the anchor
      // to the label's nearest point.
      const dx = r.l - it.x, dy = r.t - it.y;
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
    // Territory outlines resolve to a polity card; a highlighted trade route opens its own card.
    .onPathClick(d => {
      if (touch.isTouch() || lastPointClick >= lastPress) return;
      if (d?.kind === "territory" && d.name) onTerritoryClick?.(d.name);
      else if (d?.kind === "trade" && d.hl) onRouteClick?.(d.route);
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
    onPath: d => { if (d.name) onTerritoryClick?.(d.name); },
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
    // `highlight` (ids from a link) draws those routes thicker, with a name label;
    // a highlighted route not in use in `year` is grey, its label giving its dates.
    // While some are highlighted, the others are dimmed. An open end (a last
    // waypoint with `open: true`) fades out instead of ending on a place.
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
          else labels.push({ kind: "pin", style: "wpt", key: `wpt${i}-${j}`, side: "right", lat: w.lat, lng: w.lng, route: r, color, label: w.name });
        });
      });
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
    altitude: () => world.pointOfView().altitude
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
