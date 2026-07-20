// Map Quiz mode (Phase 3). A random country lights up; you type its name.
// Correct → green, wrong → red + reveal. Answered countries stay coloured so
// the map fills in over the round. Typo-tolerant, alias-aware matching.
//
// `hl` must match the border-layer NAME so the right polygon colours in;
// `accept` are the answers we take; lat/lng drive the fly-to (independent of
// border-load timing).
const POOL = [
  { hl: "United States", accept: ["united states", "usa", "us", "america"], lat: 39, lng: -98 },
  { hl: "Canada", accept: ["canada"], lat: 56, lng: -106 },
  { hl: "Mexico", accept: ["mexico"], lat: 23, lng: -102 },
  { hl: "Brazil", accept: ["brazil"], lat: -10, lng: -52 },
  { hl: "Argentina", accept: ["argentina"], lat: -38, lng: -63 },
  { hl: "Chile", accept: ["chile"], lat: -35, lng: -71 },
  { hl: "Peru", accept: ["peru"], lat: -9, lng: -75 },
  { hl: "Colombia", accept: ["colombia"], lat: 4, lng: -73 },
  { hl: "Venezuela", accept: ["venezuela"], lat: 7, lng: -66 },
  { hl: "Cuba", accept: ["cuba"], lat: 22, lng: -79 },
  { hl: "United Kingdom", accept: ["united kingdom", "uk", "britain", "great britain"], lat: 54, lng: -2 },
  { hl: "Ireland", accept: ["ireland"], lat: 53, lng: -8 },
  { hl: "France", accept: ["france"], lat: 47, lng: 2 },
  { hl: "Spain", accept: ["spain"], lat: 40, lng: -4 },
  { hl: "Portugal", accept: ["portugal"], lat: 39.5, lng: -8 },
  { hl: "Germany", accept: ["germany"], lat: 51, lng: 10 },
  { hl: "Italy", accept: ["italy"], lat: 42.5, lng: 12.5 },
  { hl: "Netherlands", accept: ["netherlands", "holland"], lat: 52.2, lng: 5.3 },
  { hl: "Belgium", accept: ["belgium"], lat: 50.6, lng: 4.5 },
  { hl: "Switzerland", accept: ["switzerland"], lat: 46.8, lng: 8.2 },
  { hl: "Austria", accept: ["austria"], lat: 47.6, lng: 14 },
  { hl: "Poland", accept: ["poland"], lat: 52, lng: 19 },
  { hl: "Ukraine", accept: ["ukraine"], lat: 49, lng: 32 },
  { hl: "Sweden", accept: ["sweden"], lat: 62, lng: 15 },
  { hl: "Norway", accept: ["norway"], lat: 62, lng: 10 },
  { hl: "Finland", accept: ["finland"], lat: 64, lng: 26 },
  { hl: "Denmark", accept: ["denmark"], lat: 56, lng: 9.5 },
  { hl: "Iceland", accept: ["iceland"], lat: 65, lng: -18 },
  { hl: "Greece", accept: ["greece"], lat: 39, lng: 22 },
  { hl: "Romania", accept: ["romania"], lat: 46, lng: 25 },
  { hl: "Hungary", accept: ["hungary"], lat: 47, lng: 19.5 },
  { hl: "Czech Republic", accept: ["czech republic", "czechia", "czech"], lat: 49.8, lng: 15.5 },
  { hl: "Serbia", accept: ["serbia"], lat: 44, lng: 21 },
  { hl: "Croatia", accept: ["croatia"], lat: 45.1, lng: 15.5 },
  { hl: "Bulgaria", accept: ["bulgaria"], lat: 42.7, lng: 25 },
  { hl: "Russia", accept: ["russia"], lat: 61, lng: 90 },
  { hl: "Turkey", accept: ["turkey", "turkiye", "türkiye"], lat: 39, lng: 35 },
  { hl: "Egypt", accept: ["egypt"], lat: 27, lng: 30 },
  { hl: "Morocco", accept: ["morocco"], lat: 32, lng: -6 },
  { hl: "Algeria", accept: ["algeria"], lat: 28, lng: 3 },
  { hl: "Tunisia", accept: ["tunisia"], lat: 34, lng: 9 },
  { hl: "Libya", accept: ["libya"], lat: 27, lng: 17 },
  { hl: "Nigeria", accept: ["nigeria"], lat: 9, lng: 8 },
  { hl: "Ethiopia", accept: ["ethiopia"], lat: 9, lng: 39 },
  { hl: "Kenya", accept: ["kenya"], lat: 0, lng: 38 },
  { hl: "Ghana", accept: ["ghana"], lat: 8, lng: -1 },
  { hl: "South Africa", accept: ["south africa"], lat: -30, lng: 25 },
  { hl: "Tanzania, United Republic of", accept: ["tanzania"], lat: -6, lng: 35 },
  { hl: "Saudi Arabia", accept: ["saudi arabia", "saudi"], lat: 24, lng: 45 },
  { hl: "Iran", accept: ["iran"], lat: 32, lng: 53 },
  { hl: "Iraq", accept: ["iraq"], lat: 33, lng: 44 },
  { hl: "Israel", accept: ["israel"], lat: 31.5, lng: 35 },
  { hl: "Syria", accept: ["syria"], lat: 35, lng: 38 },
  { hl: "Jordan", accept: ["jordan"], lat: 31, lng: 36 },
  { hl: "Afghanistan", accept: ["afghanistan"], lat: 34, lng: 66 },
  { hl: "Pakistan", accept: ["pakistan"], lat: 30, lng: 70 },
  { hl: "India", accept: ["india"], lat: 22, lng: 79 },
  { hl: "Bangladesh", accept: ["bangladesh"], lat: 24, lng: 90 },
  { hl: "Nepal", accept: ["nepal"], lat: 28, lng: 84 },
  { hl: "Sri Lanka", accept: ["sri lanka"], lat: 7.5, lng: 81 },
  { hl: "China", accept: ["china"], lat: 35, lng: 103 },
  { hl: "Mongolia", accept: ["mongolia"], lat: 46, lng: 105 },
  { hl: "Kazakhstan", accept: ["kazakhstan"], lat: 48, lng: 68 },
  { hl: "Japan", accept: ["japan"], lat: 36, lng: 138 },
  { hl: "Korea, Republic of", accept: ["south korea", "korea"], lat: 36.5, lng: 128 },
  { hl: "Korea, Democratic People's Republic of", accept: ["north korea", "dprk"], lat: 40, lng: 127 },
  { hl: "Thailand", accept: ["thailand"], lat: 15, lng: 101 },
  { hl: "Vietnam", accept: ["vietnam"], lat: 16, lng: 108 },
  { hl: "Cambodia", accept: ["cambodia"], lat: 12.5, lng: 105 },
  { hl: "Burma", accept: ["myanmar", "burma"], lat: 21, lng: 96 },
  { hl: "Malaysia", accept: ["malaysia"], lat: 4, lng: 102 },
  { hl: "Indonesia", accept: ["indonesia"], lat: -2, lng: 118 },
  { hl: "Philippines", accept: ["philippines"], lat: 13, lng: 122 },
  { hl: "Australia", accept: ["australia"], lat: -25, lng: 134 },
  { hl: "New Zealand", accept: ["new zealand"], lat: -42, lng: 173 }
];

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

const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const ROUNDS = 10;

export function createQuiz({ globe, flyTo, onExit }) {
  const panel = document.getElementById("quizPanel");
  let queue = [], idx = 0, score = 0, streak = 0, best = 0, answered = false;
  const results = new Map();   // hl → "G" | "R"

  const highlights = () => {
    const hs = [...results].map(([names, side]) => ({ names: [names], side }));
    if (!answered && queue[idx]) hs.push({ names: [queue[idx].hl], side: "A" });
    return hs;
  };

  function start() {
    queue = shuffle(POOL).slice(0, ROUNDS);
    idx = 0; score = 0; streak = 0; best = 0; results.clear();
    panel.hidden = false;
    showRound();
  }

  function showRound() {
    answered = false;
    const c = queue[idx];
    globe.setHighlights(highlights());
    flyTo(c.lat, c.lng, 1.4);
    panel.innerHTML = `
      <div class="qz-head">
        <span class="qz-round">Round ${idx + 1}/${ROUNDS}</span>
        <span class="qz-score">Score ${score} · 🔥 ${streak}</span>
        <button class="qz-exit" title="Exit quiz">✕</button>
      </div>
      <div class="qz-q">Which country is highlighted?</div>
      <form class="qz-form">
        <input class="qz-input" type="text" placeholder="Type a country…" autocomplete="off" autofocus>
        <button class="qz-submit" type="submit">Guess</button>
      </form>
      <div class="qz-feedback"></div>`;
    panel.querySelector(".qz-exit").onclick = exit;
    panel.querySelector(".qz-form").onsubmit = e => { e.preventDefault(); answered ? next() : submit(); };
    panel.querySelector(".qz-input").focus();
  }

  function submit() {
    const c = queue[idx];
    const val = panel.querySelector(".qz-input").value;
    const ok = matches(val, c.accept);
    answered = true;
    results.set(c.hl, ok ? "G" : "R");
    if (ok) { score++; streak++; best = Math.max(best, streak); } else { streak = 0; }
    globe.setHighlights(highlights());
    const fb = panel.querySelector(".qz-feedback");
    fb.className = "qz-feedback " + (ok ? "ok" : "bad");
    fb.innerHTML = (ok ? "✓ Correct!" : `✗ It was <b>${c.accept[0].replace(/\b\w/g, m => m.toUpperCase())}</b>`) +
      ` <button class="qz-next">${idx + 1 < ROUNDS ? "Next →" : "See results →"}</button>`;
    panel.querySelector(".qz-input").disabled = true;
    panel.querySelector(".qz-submit").disabled = true;
    const nb = panel.querySelector(".qz-next");
    nb.onclick = next; nb.focus();
  }

  function next() {
    if (idx + 1 >= ROUNDS) return finish();
    idx++; showRound();
  }

  function finish() {
    const pct = Math.round((score / ROUNDS) * 100);
    const grade = pct >= 90 ? "🏆 Cartographer" : pct >= 70 ? "🌍 Globetrotter"
      : pct >= 40 ? "🧭 Getting there" : "🌱 Keep exploring";
    panel.innerHTML = `
      <div class="qz-head"><span class="qz-round">Quiz complete</span>
        <button class="qz-exit" title="Exit quiz">✕</button></div>
      <div class="qz-final">
        <div class="qz-final-score">${score} / ${ROUNDS}</div>
        <div class="qz-grade">${grade} · best streak ${best}</div>
      </div>
      <div class="qz-form">
        <button class="qz-again">Play again</button>
        <button class="qz-done">Done</button>
      </div>`;
    panel.querySelector(".qz-exit").onclick = exit;
    panel.querySelector(".qz-again").onclick = start;
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
