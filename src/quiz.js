// Map Quiz mode. Four games over one country pool, filterable by region:
//   • locate     — a country lights up; type its name
//   • flags      — see a flag; name the country
//   • population — a country lights up; pick its population bracket
//   • marathon   — free-type as many countries as you can; each fills in
// Correct → green, wrong → red + reveal; answered countries stay coloured.
// Best scores persist per game+region in localStorage.
//
// `hl` must match the border-layer NAME so the right polygon colours in;
// `accept` are the answers we take; lat/lng drive the fly-to; `iso` is the
// flagcdn code; `pop` is the 2024 population in millions.
const POOL = [
  { hl: "United States", accept: ["united states", "usa", "us", "america"], lat: 39, lng: -98, iso: "us", pop: 335, region: "Americas" },
  { hl: "Canada", accept: ["canada"], lat: 56, lng: -106, iso: "ca", pop: 40, region: "Americas" },
  { hl: "Mexico", accept: ["mexico"], lat: 23, lng: -102, iso: "mx", pop: 128, region: "Americas" },
  { hl: "Brazil", accept: ["brazil"], lat: -10, lng: -52, iso: "br", pop: 216, region: "Americas" },
  { hl: "Argentina", accept: ["argentina"], lat: -38, lng: -63, iso: "ar", pop: 46, region: "Americas" },
  { hl: "Chile", accept: ["chile"], lat: -35, lng: -71, iso: "cl", pop: 20, region: "Americas" },
  { hl: "Peru", accept: ["peru"], lat: -9, lng: -75, iso: "pe", pop: 34, region: "Americas" },
  { hl: "Colombia", accept: ["colombia"], lat: 4, lng: -73, iso: "co", pop: 52, region: "Americas" },
  { hl: "Venezuela", accept: ["venezuela"], lat: 7, lng: -66, iso: "ve", pop: 28, region: "Americas" },
  { hl: "Cuba", accept: ["cuba"], lat: 22, lng: -79, iso: "cu", pop: 11, region: "Americas" },
  { hl: "United Kingdom", accept: ["united kingdom", "uk", "britain", "great britain"], lat: 54, lng: -2, iso: "gb", pop: 68, region: "Europe" },
  { hl: "Ireland", accept: ["ireland"], lat: 53, lng: -8, iso: "ie", pop: 5, region: "Europe" },
  { hl: "France", accept: ["france"], lat: 47, lng: 2, iso: "fr", pop: 68, region: "Europe" },
  { hl: "Spain", accept: ["spain"], lat: 40, lng: -4, iso: "es", pop: 48, region: "Europe" },
  { hl: "Portugal", accept: ["portugal"], lat: 39.5, lng: -8, iso: "pt", pop: 10, region: "Europe" },
  { hl: "Germany", accept: ["germany"], lat: 51, lng: 10, iso: "de", pop: 84, region: "Europe" },
  { hl: "Italy", accept: ["italy"], lat: 42.5, lng: 12.5, iso: "it", pop: 59, region: "Europe" },
  { hl: "Netherlands", accept: ["netherlands", "holland"], lat: 52.2, lng: 5.3, iso: "nl", pop: 18, region: "Europe" },
  { hl: "Belgium", accept: ["belgium"], lat: 50.6, lng: 4.5, iso: "be", pop: 12, region: "Europe" },
  { hl: "Switzerland", accept: ["switzerland"], lat: 46.8, lng: 8.2, iso: "ch", pop: 9, region: "Europe" },
  { hl: "Austria", accept: ["austria"], lat: 47.6, lng: 14, iso: "at", pop: 9, region: "Europe" },
  { hl: "Poland", accept: ["poland"], lat: 52, lng: 19, iso: "pl", pop: 38, region: "Europe" },
  { hl: "Ukraine", accept: ["ukraine"], lat: 49, lng: 32, iso: "ua", pop: 38, region: "Europe" },
  { hl: "Sweden", accept: ["sweden"], lat: 62, lng: 15, iso: "se", pop: 10, region: "Europe" },
  { hl: "Norway", accept: ["norway"], lat: 62, lng: 10, iso: "no", pop: 5.5, region: "Europe" },
  { hl: "Finland", accept: ["finland"], lat: 64, lng: 26, iso: "fi", pop: 5.5, region: "Europe" },
  { hl: "Denmark", accept: ["denmark"], lat: 56, lng: 9.5, iso: "dk", pop: 6, region: "Europe" },
  { hl: "Iceland", accept: ["iceland"], lat: 65, lng: -18, iso: "is", pop: 0.4, region: "Europe" },
  { hl: "Greece", accept: ["greece"], lat: 39, lng: 22, iso: "gr", pop: 10, region: "Europe" },
  { hl: "Romania", accept: ["romania"], lat: 46, lng: 25, iso: "ro", pop: 19, region: "Europe" },
  { hl: "Hungary", accept: ["hungary"], lat: 47, lng: 19.5, iso: "hu", pop: 10, region: "Europe" },
  { hl: "Czech Republic", accept: ["czech republic", "czechia", "czech"], lat: 49.8, lng: 15.5, iso: "cz", pop: 11, region: "Europe" },
  { hl: "Serbia", accept: ["serbia"], lat: 44, lng: 21, iso: "rs", pop: 7, region: "Europe" },
  { hl: "Croatia", accept: ["croatia"], lat: 45.1, lng: 15.5, iso: "hr", pop: 4, region: "Europe" },
  { hl: "Bulgaria", accept: ["bulgaria"], lat: 42.7, lng: 25, iso: "bg", pop: 6.5, region: "Europe" },
  { hl: "Russia", accept: ["russia"], lat: 61, lng: 90, iso: "ru", pop: 144, region: "Europe" },
  { hl: "Turkey", accept: ["turkey", "turkiye", "türkiye"], lat: 39, lng: 35, iso: "tr", pop: 85, region: "Asia" },
  { hl: "Egypt", accept: ["egypt"], lat: 27, lng: 30, iso: "eg", pop: 111, region: "Africa" },
  { hl: "Morocco", accept: ["morocco"], lat: 32, lng: -6, iso: "ma", pop: 37, region: "Africa" },
  { hl: "Algeria", accept: ["algeria"], lat: 28, lng: 3, iso: "dz", pop: 45, region: "Africa" },
  { hl: "Tunisia", accept: ["tunisia"], lat: 34, lng: 9, iso: "tn", pop: 12, region: "Africa" },
  { hl: "Libya", accept: ["libya"], lat: 27, lng: 17, iso: "ly", pop: 7, region: "Africa" },
  { hl: "Nigeria", accept: ["nigeria"], lat: 9, lng: 8, iso: "ng", pop: 223, region: "Africa" },
  { hl: "Ethiopia", accept: ["ethiopia"], lat: 9, lng: 39, iso: "et", pop: 126, region: "Africa" },
  { hl: "Kenya", accept: ["kenya"], lat: 0, lng: 38, iso: "ke", pop: 55, region: "Africa" },
  { hl: "Ghana", accept: ["ghana"], lat: 8, lng: -1, iso: "gh", pop: 34, region: "Africa" },
  { hl: "South Africa", accept: ["south africa"], lat: -30, lng: 25, iso: "za", pop: 60, region: "Africa" },
  { hl: "Tanzania, United Republic of", accept: ["tanzania"], lat: -6, lng: 35, iso: "tz", pop: 67, region: "Africa" },
  { hl: "Saudi Arabia", accept: ["saudi arabia", "saudi"], lat: 24, lng: 45, iso: "sa", pop: 37, region: "Asia" },
  { hl: "Iran", accept: ["iran"], lat: 32, lng: 53, iso: "ir", pop: 89, region: "Asia" },
  { hl: "Iraq", accept: ["iraq"], lat: 33, lng: 44, iso: "iq", pop: 45, region: "Asia" },
  { hl: "Israel", accept: ["israel"], lat: 31.5, lng: 35, iso: "il", pop: 9.7, region: "Asia" },
  { hl: "Syria", accept: ["syria"], lat: 35, lng: 38, iso: "sy", pop: 22, region: "Asia" },
  { hl: "Jordan", accept: ["jordan"], lat: 31, lng: 36, iso: "jo", pop: 11, region: "Asia" },
  { hl: "Afghanistan", accept: ["afghanistan"], lat: 34, lng: 66, iso: "af", pop: 42, region: "Asia" },
  { hl: "Pakistan", accept: ["pakistan"], lat: 30, lng: 70, iso: "pk", pop: 240, region: "Asia" },
  { hl: "India", accept: ["india"], lat: 22, lng: 79, iso: "in", pop: 1428, region: "Asia" },
  { hl: "Bangladesh", accept: ["bangladesh"], lat: 24, lng: 90, iso: "bd", pop: 173, region: "Asia" },
  { hl: "Nepal", accept: ["nepal"], lat: 28, lng: 84, iso: "np", pop: 30, region: "Asia" },
  { hl: "Sri Lanka", accept: ["sri lanka"], lat: 7.5, lng: 81, iso: "lk", pop: 22, region: "Asia" },
  { hl: "China", accept: ["china"], lat: 35, lng: 103, iso: "cn", pop: 1425, region: "Asia" },
  { hl: "Mongolia", accept: ["mongolia"], lat: 46, lng: 105, iso: "mn", pop: 3.4, region: "Asia" },
  { hl: "Kazakhstan", accept: ["kazakhstan"], lat: 48, lng: 68, iso: "kz", pop: 20, region: "Asia" },
  { hl: "Japan", accept: ["japan"], lat: 36, lng: 138, iso: "jp", pop: 124, region: "Asia" },
  { hl: "Korea, Republic of", accept: ["south korea", "korea"], lat: 36.5, lng: 128, iso: "kr", pop: 52, region: "Asia" },
  { hl: "Korea, Democratic People's Republic of", accept: ["north korea", "dprk"], lat: 40, lng: 127, iso: "kp", pop: 26, region: "Asia" },
  { hl: "Thailand", accept: ["thailand"], lat: 15, lng: 101, iso: "th", pop: 72, region: "Asia" },
  { hl: "Vietnam", accept: ["vietnam"], lat: 16, lng: 108, iso: "vn", pop: 98, region: "Asia" },
  { hl: "Cambodia", accept: ["cambodia"], lat: 12.5, lng: 105, iso: "kh", pop: 17, region: "Asia" },
  { hl: "Burma", accept: ["myanmar", "burma"], lat: 21, lng: 96, iso: "mm", pop: 54, region: "Asia" },
  { hl: "Malaysia", accept: ["malaysia"], lat: 4, lng: 102, iso: "my", pop: 34, region: "Asia" },
  { hl: "Indonesia", accept: ["indonesia"], lat: -2, lng: 118, iso: "id", pop: 277, region: "Asia" },
  { hl: "Philippines", accept: ["philippines"], lat: 13, lng: 122, iso: "ph", pop: 117, region: "Asia" },
  { hl: "Australia", accept: ["australia"], lat: -25, lng: 134, iso: "au", pop: 26, region: "Oceania" },
  { hl: "New Zealand", accept: ["new zealand"], lat: -42, lng: 173, iso: "nz", pop: 5.2, region: "Oceania" },
  { hl: "Papua New Guinea", accept: ["papua new guinea", "png"], lat: -6, lng: 145, iso: "pg", pop: 10, region: "Oceania" },
  { hl: "Fiji", accept: ["fiji"], lat: -17.8, lng: 178, iso: "fj", pop: 0.9, region: "Oceania" }
];

const REGIONS = ["All", "Europe", "Asia", "Africa", "Americas", "Oceania"];
const FLAG = "https://flagcdn.com/w320/";

// Population brackets (millions). bracketOf returns the index into LABELS.
const BRACKETS = [10, 50, 150];
const BRACKET_LABELS = ["Under 10M", "10–50M", "50–150M", "Over 150M"];
const bracketOf = pop => {
  let i = 0;
  while (i < BRACKETS.length && pop >= BRACKETS[i]) i++;
  return i;
};
const popText = pop => pop >= 1 ? `${pop} million` : `${Math.round(pop * 1000)},000`;

const norm = s => String(s || "")
  .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Levenshtein ≤ threshold — forgives a typo or two on longer names.
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]; dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[a.length] <= max;
}

const matches = (input, accept) => {
  const q = norm(input);
  if (!q) return false;
  return accept.some(a => {
    const t = norm(a);
    if (q === t) return true;
    const tol = t.length >= 8 ? 2 : t.length >= 5 ? 1 : 0;
    return tol > 0 && within(q, t, tol);
  });
};

const cap = s => s.replace(/\b\w/g, m => m.toUpperCase());
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const MAX_ROUNDS = 10;

const GAMES = {
  locate:     { label: "📍 Name the country", blurb: "A country lights up — name it" },
  flags:      { label: "🏳️ Guess the flag",   blurb: "See a flag — name the country" },
  population: { label: "👥 Population",        blurb: "Pick the right size bracket" },
  marathon:   { label: "⚡ Name them all",     blurb: "How many can you list? Fills in the map" }
};

// Best scores persist per game+region. localStorage may be unavailable
// (private mode / blocked cookies) — degrade silently rather than throw.
const bestKey = (game, region) => `att-quiz-best:${game}:${region}`;
const getBest = (game, region) => {
  try { return Number(localStorage.getItem(bestKey(game, region))) || 0; }
  catch { return 0; }
};
const setBest = (game, region, v) => {
  try { localStorage.setItem(bestKey(game, region), String(v)); } catch { /* ignore */ }
};

export function createQuiz({ globe, flyTo, onExit }) {
  const panel = document.getElementById("quizPanel");
  let game = "locate", region = "All";
  let queue = [], idx = 0, score = 0, streak = 0, best = 0, answered = false;
  const results = new Map();          // hl → "G" | "R"
  // marathon
  let remaining = [], found = [], seconds = 0, timer = null;

  const pool = () => region === "All" ? POOL : POOL.filter(c => c.region === region);
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

  const highlights = () => {
    const hs = [...results].map(([names, side]) => ({ names: [names], side }));
    // Flags never pre-reveal the country; locate/population light it up.
    if (game !== "marathon" && !answered && game !== "flags" && queue[idx])
      hs.push({ names: [queue[idx].hl], side: "A" });
    return hs;
  };

  const headHTML = (label, right) => `
    <div class="qz-head">
      <span class="qz-round">${label}</span>
      ${right ? `<span class="qz-score">${right}</span>` : ""}
      <button class="qz-exit" title="Exit quiz">✕</button>
    </div>`;

  function start() {
    stopTimer();
    queue = []; results.clear(); found = [];
    panel.hidden = false;
    globe.setHighlights([]);
    renderMenu();
  }

  function renderMenu() {
    panel.innerHTML = headHTML("🎯 Map Quiz")
      + `<div class="qz-regions">`
      + REGIONS.map(r => `<button class="qz-region${r === region ? " on" : ""}" data-r="${r}">${r}</button>`).join("")
      + `</div><div class="qz-menu">`
      + Object.entries(GAMES).map(([k, g]) => {
          const b = getBest(k, region);
          const n = pool().length;
          const target = k === "marathon" ? n : Math.min(MAX_ROUNDS, n);
          return `<button class="qz-game" data-game="${k}">
            <span class="qz-game-top">${g.label}${b ? `<span class="qz-best">Best ${b}/${target}</span>` : ""}</span>
            <small>${g.blurb}</small></button>`;
        }).join("")
      + `</div>`;
    panel.querySelector(".qz-exit").onclick = exit;
    panel.querySelectorAll(".qz-region").forEach(b => b.onclick = () => { region = b.dataset.r; renderMenu(); });
    panel.querySelectorAll(".qz-game").forEach(b => b.onclick = () => play(b.dataset.game));
  }

  function play(type) {
    game = type;
    results.clear();
    globe.setHighlights([]);
    score = 0; streak = 0; best = 0; idx = 0;
    if (type === "marathon") return startMarathon();
    queue = shuffle(pool()).slice(0, Math.min(MAX_ROUNDS, pool().length));
    showRound();
  }

  const rounds = () => queue.length;

  function showRound() {
    answered = false;
    const c = queue[idx];
    globe.setHighlights(highlights());
    if (game !== "flags") flyTo(c.lat, c.lng, 1.4);
    const label = `Round ${idx + 1}/${rounds()}`;
    const right = `Score ${score} · 🔥 ${streak}`;
    if (game === "population") {
      panel.innerHTML = headHTML(label, right)
        + `<div class="qz-q">Population of <b>${cap(c.accept[0])}</b>?</div>`
        + `<div class="qz-choices">`
        + BRACKET_LABELS.map((t, i) => `<button class="qz-choice" data-b="${i}">${t}</button>`).join("")
        + `</div><div class="qz-feedback"></div>`;
      panel.querySelectorAll(".qz-choice").forEach(b =>
        b.onclick = () => { if (!answered) pickBracket(+b.dataset.b); });
    } else {
      const flag = game === "flags"
        ? `<div class="qz-flagwrap"><img class="qz-flag" src="${FLAG}${c.iso}.png" alt=""></div>` : "";
      const q = game === "flags" ? "Which country's flag is this?" : "Which country is highlighted?";
      panel.innerHTML = headHTML(label, right)
        + flag
        + `<div class="qz-q">${q}</div>`
        + `<form class="qz-form">
             <input class="qz-input" type="text" placeholder="Type a country…" autocomplete="off" autofocus>
             <button class="qz-submit" type="submit">Guess</button>
           </form><div class="qz-feedback"></div>`;
      panel.querySelector(".qz-form").onsubmit = e => { e.preventDefault(); answered ? next() : submitText(); };
      panel.querySelector(".qz-input").focus();
    }
    panel.querySelector(".qz-exit").onclick = exit;
  }

  function resolve(ok, revealHTML) {
    const c = queue[idx];
    answered = true;
    results.set(c.hl, ok ? "G" : "R");
    if (ok) { score++; streak++; best = Math.max(best, streak); } else { streak = 0; }
    const sc = panel.querySelector(".qz-score");
    if (sc) sc.textContent = `Score ${score} · 🔥 ${streak}`;   // live, don't wait for next round
    globe.setHighlights(highlights());
    if (game === "flags") flyTo(c.lat, c.lng, 1.4);   // reveal where it is
    const fb = panel.querySelector(".qz-feedback");
    fb.className = "qz-feedback " + (ok ? "ok" : "bad");
    fb.innerHTML = (ok ? "✓ Correct!" : "✗ " + revealHTML)
      + ` <button class="qz-next">${idx + 1 < rounds() ? "Next →" : "See results →"}</button>`;
    const nb = fb.querySelector(".qz-next");
    nb.onclick = next; nb.focus();
  }

  function submitText() {
    const c = queue[idx];
    const ok = matches(panel.querySelector(".qz-input").value, c.accept);
    panel.querySelector(".qz-input").disabled = true;
    panel.querySelector(".qz-submit").disabled = true;
    resolve(ok, `It was <b>${cap(c.accept[0])}</b>`);
  }

  function pickBracket(b) {
    const c = queue[idx];
    const ok = b === bracketOf(c.pop);
    panel.querySelectorAll(".qz-choice").forEach((el, i) => {
      el.disabled = true;
      if (i === bracketOf(c.pop)) el.classList.add("right");
      else if (i === b) el.classList.add("wrong");
    });
    resolve(ok, `${cap(c.accept[0])} has <b>${popText(c.pop)}</b>`);
  }

  function next() {
    if (idx + 1 >= rounds()) return finish();
    idx++; showRound();
  }

  // --- Marathon ---------------------------------------------------------
  function startMarathon() {
    remaining = pool().slice();
    found = [];
    seconds = 0;
    renderMarathon();
    stopTimer();
    timer = setInterval(() => {
      seconds++;
      const t = panel.querySelector(".qz-timer");
      if (t) t.textContent = "⏱ " + mmss(seconds);
      else stopTimer();                 // panel replaced — stop ticking
    }, 1000);
  }

  function renderMarathon(flash) {
    const total = pool().length;
    panel.innerHTML = headHTML(`⚡ Name them all${region === "All" ? "" : " — " + region}`,
      `<span class="qz-timer">⏱ ${mmss(seconds)}</span>`)
      + `<div class="qz-q">Found <b>${found.length}</b> / ${total}</div>
         <form class="qz-form">
           <input class="qz-input" type="text" placeholder="Type any country…" autocomplete="off" autofocus>
           <button class="qz-submit" type="submit">Enter</button>
         </form>
         <div class="qz-feedback ${flash ? flash.cls : ""}">${flash ? flash.msg : ""}</div>
         <div class="qz-found">${found.map(f => `<span class="qz-chip">${cap(f)}</span>`).join("")}</div>
         <div class="qz-form"><button class="qz-done marathon-finish">Finish</button></div>`;
    panel.querySelector(".qz-exit").onclick = exit;
    panel.querySelector(".marathon-finish").onclick = finishMarathon;
    const form = panel.querySelector(".qz-form");
    form.onsubmit = e => { e.preventDefault(); submitMarathon(); };
    panel.querySelector(".qz-input").focus();
  }

  function submitMarathon() {
    const val = panel.querySelector(".qz-input").value;
    if (!norm(val)) return;
    const hitIdx = remaining.findIndex(c => matches(val, c.accept));
    if (hitIdx >= 0) {
      const c = remaining.splice(hitIdx, 1)[0];
      found.push(c.accept[0]);
      results.set(c.hl, "G");
      globe.setHighlights(highlights());
      flyTo(c.lat, c.lng, 1.6);
      if (!remaining.length) return finishMarathon();
      renderMarathon({ cls: "ok", msg: `✓ ${cap(c.accept[0])}` });
    } else {
      const already = pool().find(c => matches(val, c.accept));
      renderMarathon(already
        ? { cls: "", msg: `Already got ${cap(already.accept[0])}` }
        : { cls: "bad", msg: `✗ Not on the list` });
    }
  }

  function finishMarathon() {
    stopTimer();
    const total = pool().length;
    for (const c of remaining) results.set(c.hl, "R");    // reveal the misses
    globe.setHighlights(highlights());
    const prev = getBest("marathon", region);
    const isBest = found.length > prev;
    if (isBest) setBest("marathon", region, found.length);
    const missed = remaining.map(c => cap(c.accept[0]));
    panel.innerHTML = headHTML("Marathon complete")
      + `<div class="qz-final">
           <div class="qz-final-score">${found.length} / ${total}</div>
           <div class="qz-grade">${isBest ? "🏅 New best!" : `best ${prev}`} · ${mmss(seconds)}</div>
         </div>`
      + (missed.length ? `<div class="qz-missed"><b>Missed (${missed.length}):</b> ${missed.join(", ")}</div>` : "")
      + `<div class="qz-form"><button class="qz-again">Play again</button><button class="qz-done">Done</button></div>`;
    panel.querySelector(".qz-exit").onclick = exit;
    panel.querySelector(".qz-again").onclick = start;
    panel.querySelector(".qz-done").onclick = exit;
  }

  function finish() {
    const total = rounds();
    const pct = Math.round((score / total) * 100);
    const grade = pct >= 90 ? "🏆 Cartographer" : pct >= 70 ? "🌍 Globetrotter"
      : pct >= 40 ? "🧭 Getting there" : "🌱 Keep exploring";
    const prev = getBest(game, region);
    const isBest = score > prev;
    if (isBest) setBest(game, region, score);
    panel.innerHTML = headHTML("Quiz complete")
      + `<div class="qz-final">
           <div class="qz-final-score">${score} / ${total}</div>
           <div class="qz-grade">${grade} · ${isBest ? "🏅 New best!" : `best ${prev}`} · streak ${best}</div>
         </div>
         <div class="qz-form">
           <button class="qz-again">Play again</button>
           <button class="qz-done">Done</button>
         </div>`;
    panel.querySelector(".qz-exit").onclick = exit;
    panel.querySelector(".qz-again").onclick = start;   // back to game menu
    panel.querySelector(".qz-done").onclick = exit;
  }

  function exit() {
    stopTimer();
    panel.hidden = true;
    panel.innerHTML = "";
    results.clear();
    globe.setHighlights([]);
    if (onExit) onExit();
  }

  return { start, exit };
}
