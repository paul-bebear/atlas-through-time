// Map Quiz mode (Phase 3). Three games share one country pool:
//   • locate     — a country lights up; type its name
//   • flags      — see a flag; name the country
//   • population — a country lights up; pick its population bracket
// Correct → green, wrong → red + reveal; answered countries stay coloured.
//
// `hl` must match the border-layer NAME so the right polygon colours in;
// `accept` are the answers we take; lat/lng drive the fly-to; `iso` is the
// flagcdn code; `pop` is the 2024 population in millions.
const POOL = [
  { hl: "United States", accept: ["united states", "usa", "us", "america"], lat: 39, lng: -98, iso: "us", pop: 335 },
  { hl: "Canada", accept: ["canada"], lat: 56, lng: -106, iso: "ca", pop: 40 },
  { hl: "Mexico", accept: ["mexico"], lat: 23, lng: -102, iso: "mx", pop: 128 },
  { hl: "Brazil", accept: ["brazil"], lat: -10, lng: -52, iso: "br", pop: 216 },
  { hl: "Argentina", accept: ["argentina"], lat: -38, lng: -63, iso: "ar", pop: 46 },
  { hl: "Chile", accept: ["chile"], lat: -35, lng: -71, iso: "cl", pop: 20 },
  { hl: "Peru", accept: ["peru"], lat: -9, lng: -75, iso: "pe", pop: 34 },
  { hl: "Colombia", accept: ["colombia"], lat: 4, lng: -73, iso: "co", pop: 52 },
  { hl: "Venezuela", accept: ["venezuela"], lat: 7, lng: -66, iso: "ve", pop: 28 },
  { hl: "Cuba", accept: ["cuba"], lat: 22, lng: -79, iso: "cu", pop: 11 },
  { hl: "United Kingdom", accept: ["united kingdom", "uk", "britain", "great britain"], lat: 54, lng: -2, iso: "gb", pop: 68 },
  { hl: "Ireland", accept: ["ireland"], lat: 53, lng: -8, iso: "ie", pop: 5 },
  { hl: "France", accept: ["france"], lat: 47, lng: 2, iso: "fr", pop: 68 },
  { hl: "Spain", accept: ["spain"], lat: 40, lng: -4, iso: "es", pop: 48 },
  { hl: "Portugal", accept: ["portugal"], lat: 39.5, lng: -8, iso: "pt", pop: 10 },
  { hl: "Germany", accept: ["germany"], lat: 51, lng: 10, iso: "de", pop: 84 },
  { hl: "Italy", accept: ["italy"], lat: 42.5, lng: 12.5, iso: "it", pop: 59 },
  { hl: "Netherlands", accept: ["netherlands", "holland"], lat: 52.2, lng: 5.3, iso: "nl", pop: 18 },
  { hl: "Belgium", accept: ["belgium"], lat: 50.6, lng: 4.5, iso: "be", pop: 12 },
  { hl: "Switzerland", accept: ["switzerland"], lat: 46.8, lng: 8.2, iso: "ch", pop: 9 },
  { hl: "Austria", accept: ["austria"], lat: 47.6, lng: 14, iso: "at", pop: 9 },
  { hl: "Poland", accept: ["poland"], lat: 52, lng: 19, iso: "pl", pop: 38 },
  { hl: "Ukraine", accept: ["ukraine"], lat: 49, lng: 32, iso: "ua", pop: 38 },
  { hl: "Sweden", accept: ["sweden"], lat: 62, lng: 15, iso: "se", pop: 10 },
  { hl: "Norway", accept: ["norway"], lat: 62, lng: 10, iso: "no", pop: 5.5 },
  { hl: "Finland", accept: ["finland"], lat: 64, lng: 26, iso: "fi", pop: 5.5 },
  { hl: "Denmark", accept: ["denmark"], lat: 56, lng: 9.5, iso: "dk", pop: 6 },
  { hl: "Iceland", accept: ["iceland"], lat: 65, lng: -18, iso: "is", pop: 0.4 },
  { hl: "Greece", accept: ["greece"], lat: 39, lng: 22, iso: "gr", pop: 10 },
  { hl: "Romania", accept: ["romania"], lat: 46, lng: 25, iso: "ro", pop: 19 },
  { hl: "Hungary", accept: ["hungary"], lat: 47, lng: 19.5, iso: "hu", pop: 10 },
  { hl: "Czech Republic", accept: ["czech republic", "czechia", "czech"], lat: 49.8, lng: 15.5, iso: "cz", pop: 11 },
  { hl: "Serbia", accept: ["serbia"], lat: 44, lng: 21, iso: "rs", pop: 7 },
  { hl: "Croatia", accept: ["croatia"], lat: 45.1, lng: 15.5, iso: "hr", pop: 4 },
  { hl: "Bulgaria", accept: ["bulgaria"], lat: 42.7, lng: 25, iso: "bg", pop: 6.5 },
  { hl: "Russia", accept: ["russia"], lat: 61, lng: 90, iso: "ru", pop: 144 },
  { hl: "Turkey", accept: ["turkey", "turkiye", "türkiye"], lat: 39, lng: 35, iso: "tr", pop: 85 },
  { hl: "Egypt", accept: ["egypt"], lat: 27, lng: 30, iso: "eg", pop: 111 },
  { hl: "Morocco", accept: ["morocco"], lat: 32, lng: -6, iso: "ma", pop: 37 },
  { hl: "Algeria", accept: ["algeria"], lat: 28, lng: 3, iso: "dz", pop: 45 },
  { hl: "Tunisia", accept: ["tunisia"], lat: 34, lng: 9, iso: "tn", pop: 12 },
  { hl: "Libya", accept: ["libya"], lat: 27, lng: 17, iso: "ly", pop: 7 },
  { hl: "Nigeria", accept: ["nigeria"], lat: 9, lng: 8, iso: "ng", pop: 223 },
  { hl: "Ethiopia", accept: ["ethiopia"], lat: 9, lng: 39, iso: "et", pop: 126 },
  { hl: "Kenya", accept: ["kenya"], lat: 0, lng: 38, iso: "ke", pop: 55 },
  { hl: "Ghana", accept: ["ghana"], lat: 8, lng: -1, iso: "gh", pop: 34 },
  { hl: "South Africa", accept: ["south africa"], lat: -30, lng: 25, iso: "za", pop: 60 },
  { hl: "Tanzania, United Republic of", accept: ["tanzania"], lat: -6, lng: 35, iso: "tz", pop: 67 },
  { hl: "Saudi Arabia", accept: ["saudi arabia", "saudi"], lat: 24, lng: 45, iso: "sa", pop: 37 },
  { hl: "Iran", accept: ["iran"], lat: 32, lng: 53, iso: "ir", pop: 89 },
  { hl: "Iraq", accept: ["iraq"], lat: 33, lng: 44, iso: "iq", pop: 45 },
  { hl: "Israel", accept: ["israel"], lat: 31.5, lng: 35, iso: "il", pop: 9.7 },
  { hl: "Syria", accept: ["syria"], lat: 35, lng: 38, iso: "sy", pop: 22 },
  { hl: "Jordan", accept: ["jordan"], lat: 31, lng: 36, iso: "jo", pop: 11 },
  { hl: "Afghanistan", accept: ["afghanistan"], lat: 34, lng: 66, iso: "af", pop: 42 },
  { hl: "Pakistan", accept: ["pakistan"], lat: 30, lng: 70, iso: "pk", pop: 240 },
  { hl: "India", accept: ["india"], lat: 22, lng: 79, iso: "in", pop: 1428 },
  { hl: "Bangladesh", accept: ["bangladesh"], lat: 24, lng: 90, iso: "bd", pop: 173 },
  { hl: "Nepal", accept: ["nepal"], lat: 28, lng: 84, iso: "np", pop: 30 },
  { hl: "Sri Lanka", accept: ["sri lanka"], lat: 7.5, lng: 81, iso: "lk", pop: 22 },
  { hl: "China", accept: ["china"], lat: 35, lng: 103, iso: "cn", pop: 1425 },
  { hl: "Mongolia", accept: ["mongolia"], lat: 46, lng: 105, iso: "mn", pop: 3.4 },
  { hl: "Kazakhstan", accept: ["kazakhstan"], lat: 48, lng: 68, iso: "kz", pop: 20 },
  { hl: "Japan", accept: ["japan"], lat: 36, lng: 138, iso: "jp", pop: 124 },
  { hl: "Korea, Republic of", accept: ["south korea", "korea"], lat: 36.5, lng: 128, iso: "kr", pop: 52 },
  { hl: "Korea, Democratic People's Republic of", accept: ["north korea", "dprk"], lat: 40, lng: 127, iso: "kp", pop: 26 },
  { hl: "Thailand", accept: ["thailand"], lat: 15, lng: 101, iso: "th", pop: 72 },
  { hl: "Vietnam", accept: ["vietnam"], lat: 16, lng: 108, iso: "vn", pop: 98 },
  { hl: "Cambodia", accept: ["cambodia"], lat: 12.5, lng: 105, iso: "kh", pop: 17 },
  { hl: "Burma", accept: ["myanmar", "burma"], lat: 21, lng: 96, iso: "mm", pop: 54 },
  { hl: "Malaysia", accept: ["malaysia"], lat: 4, lng: 102, iso: "my", pop: 34 },
  { hl: "Indonesia", accept: ["indonesia"], lat: -2, lng: 118, iso: "id", pop: 277 },
  { hl: "Philippines", accept: ["philippines"], lat: 13, lng: 122, iso: "ph", pop: 117 },
  { hl: "Australia", accept: ["australia"], lat: -25, lng: 134, iso: "au", pop: 26 },
  { hl: "New Zealand", accept: ["new zealand"], lat: -42, lng: 173, iso: "nz", pop: 5.2 }
];

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

const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const ROUNDS = 10;

const GAMES = {
  locate:     { label: "📍 Name the country", blurb: "A country lights up — name it" },
  flags:      { label: "🏳️ Guess the flag",   blurb: "See a flag — name the country" },
  population: { label: "👥 Population",        blurb: "Pick the right size bracket" }
};

export function createQuiz({ globe, flyTo, onExit }) {
  const panel = document.getElementById("quizPanel");
  let game = "locate", queue = [], idx = 0, score = 0, streak = 0, best = 0, answered = false;
  const results = new Map();   // hl → "G" | "R"

  const highlights = () => {
    const hs = [...results].map(([names, side]) => ({ names: [names], side }));
    // Flags never pre-reveal the country; locate/population light it up.
    if (!answered && game !== "flags" && queue[idx]) hs.push({ names: [queue[idx].hl], side: "A" });
    return hs;
  };

  const headHTML = label => `
    <div class="qz-head">
      <span class="qz-round">${label}</span>
      ${queue.length ? `<span class="qz-score">Score ${score} · 🔥 ${streak}</span>` : ""}
      <button class="qz-exit" title="Exit quiz">✕</button>
    </div>`;

  function start() {
    queue = []; results.clear();
    panel.hidden = false;
    globe.setHighlights([]);
    renderMenu();
  }

  function renderMenu() {
    panel.innerHTML = headHTML("🎯 Map Quiz")
      + `<div class="qz-menu">`
      + Object.entries(GAMES).map(([k, g]) =>
          `<button class="qz-game" data-game="${k}">${g.label}<small>${g.blurb}</small></button>`).join("")
      + `</div>`;
    panel.querySelector(".qz-exit").onclick = exit;
    panel.querySelectorAll(".qz-game").forEach(b => b.onclick = () => play(b.dataset.game));
  }

  function play(type) {
    game = type;
    queue = shuffle(POOL).slice(0, ROUNDS);
    idx = 0; score = 0; streak = 0; best = 0; results.clear();
    showRound();
  }

  function showRound() {
    answered = false;
    const c = queue[idx];
    globe.setHighlights(highlights());
    if (game !== "flags") flyTo(c.lat, c.lng, 1.4);
    const label = `Round ${idx + 1}/${ROUNDS}`;
    if (game === "population") {
      panel.innerHTML = headHTML(label)
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
      panel.innerHTML = headHTML(label)
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
      + ` <button class="qz-next">${idx + 1 < ROUNDS ? "Next →" : "See results →"}</button>`;
    const nb = fb.querySelector(".qz-next");
    nb.onclick = next; nb.focus();
  }

  function submitText() {
    const c = queue[idx];
    const ok = matches(panel.querySelector(".qz-input").value, c.accept);
    const inp = panel.querySelector(".qz-input"), sub = panel.querySelector(".qz-submit");
    inp.disabled = true; sub.disabled = true;
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
    if (idx + 1 >= ROUNDS) return finish();
    idx++; showRound();
  }

  function finish() {
    const pct = Math.round((score / ROUNDS) * 100);
    const grade = pct >= 90 ? "🏆 Cartographer" : pct >= 70 ? "🌍 Globetrotter"
      : pct >= 40 ? "🧭 Getting there" : "🌱 Keep exploring";
    panel.innerHTML = headHTML("Quiz complete")
      + `<div class="qz-final">
           <div class="qz-final-score">${score} / ${ROUNDS}</div>
           <div class="qz-grade">${grade} · best streak ${best}</div>
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
    panel.hidden = true;
    panel.innerHTML = "";
    results.clear();
    globe.setHighlights([]);
    if (onExit) onExit();
  }

  return { start, exit };
}
