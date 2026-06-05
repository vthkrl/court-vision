// ── GIF config ────────────────────────────────────────────────────────────────
// Add your own GIF URLs below. Each tier picks one at random.
// Format: { url: 'https://...gif', caption: 'text shown under the gif' }

const SCORE_GIFS = {
  catastrophic: [  // score === 0
    { url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExenRrZG14MXVtZjhuYzRtYnE5b2EwcW44ZTl4ZG01MTBpMnliYnpqdCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/xTiTnDAP0RiCo9k85W/giphy.gif', caption: 'Stay away from hoops.' },
  ],
  rough: [         // 1–10
    { url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMHZ5dGR4cXc2NGNqMGpqbjNrbXZrMXBybjN1YXp5aDN1N3MyeHg3ciZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Y5P21ImvUsaZiiOOas/giphy.gif', caption: "That's... not great." },
  ],
  decent: [        // 11–20
    { url: 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExZzRzYXYyZXZwY2Nwa3VmNG5pajF6NXV1NnlwbG42cmZtcDd6c2h4byZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/0stGdyv1BvxLGusM4S/giphy.gif', caption: 'Not bad. Not bad.' },
  ],
  good: [          // 21–30
    { url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExenRrZG14MXVtZjhuYzRtYnE5b2EwcW44ZTl4ZG01MTBpMnliYnpqdCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/TTWSj55u7inpIED6fu/giphy.gif', caption: 'Light work. Go for more!' },
  ],
  great: [         // 31–40
    { url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM211NmVsMGYxOHl4a2IyNDhxdWV6OWhobnFucW1qdzNzYTFvc3dtcCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/GVMhZwYv8U5NK/giphy.gif', caption: '' },
  ],
  legendary: [     // 41+
    { url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3djb3ZqM2lqMHJ1dTh6NTkxY3M4Z3djeDJ3Y2VwcGd0NXc0aXUzayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/d1H22LHUXMfQlZz2B5/giphy.gif', caption: "We're gonna remember this one." },
  ],
};

function getTier(score) {
  if (score === 0)  return 'catastrophic';
  if (score <= 10)  return 'rough';
  if (score <= 20)  return 'decent';
  if (score <= 30)  return 'good';
  if (score <= 40)  return 'great';
  return 'legendary';
}

function pickGif(score) {
  const options = (SCORE_GIFS[getTier(score)] || []).filter(g => g.url);
  if (!options.length) return null;
  return options[Math.floor(Math.random() * options.length)];
}

// ── Stat config ───────────────────────────────────────────────────────────────

const STATS = [
  'PPG', 'RPG', 'APG', 'SPG', 'BPG',
  'PTS', 'REB', 'AST', 'STL', 'BLK',
  'FG3M', 'FG3_PCT',
  'ALL_NBA', 'ALL_DEFENSIVE', 'ALL_STAR',
];

const STAT_LABELS = {
  PPG:           'Career Points Per Game',
  RPG:           'Career Rebounds Per Game',
  APG:           'Career Assists Per Game',
  SPG:           'Career Steals Per Game',
  BPG:           'Career Blocks Per Game',
  PTS:           'Career Points',
  REB:           'Career Rebounds',
  AST:           'Career Assists',
  STL:           'Career Steals',
  BLK:           'Career Blocks',
  FG3M:          'Career 3-Pointers Made',
  FG3_PCT:       'Career 3-Point %',
  ALL_NBA:       'All-NBA Selections',
  ALL_DEFENSIVE: 'All-Defensive Selections',
  ALL_STAR:      'All-Star Appearances',
};

function formatVal(stat, val) {
  if (['PPG','RPG','APG','SPG','BPG'].includes(stat)) return val.toFixed(1);
  if (stat === 'FG3_PCT') return val.toFixed(1) + '%';
  if (['PTS','REB','AST','STL','BLK','FG3M'].includes(stat)) return val.toLocaleString();
  return String(val); // ALL_NBA, ALL_DEFENSIVE, ALL_STAR
}

// ── Player pool ───────────────────────────────────────────────────────────────

let PLAYER_POOL = [];
let PLAYER_MAP  = {};

async function loadPool() {
  const res = await fetch('/player_pool.json');
  PLAYER_POOL = await res.json();
  PLAYER_MAP  = Object.fromEntries(PLAYER_POOL.map(p => [p.id, p]));
}

function pickTwo(excludeIds = []) {
  const exclude = new Set(excludeIds);
  const pool    = PLAYER_POOL.filter(p => !exclude.has(p.id));
  const i       = Math.floor(Math.random() * pool.length);
  let j;
  do { j = Math.floor(Math.random() * pool.length); } while (j === i);
  return [pool[i], pool[j]];
}

const PRE74_EXCLUDED = new Set(['SPG', 'BPG', 'STL', 'BLK']);

function pre74(player) {
  return player && player.to_year > 0 && player.to_year < 1974;
}

function pickStat(excludeLast = null, left = null, right = null) {
  let choices = STATS;
  if (excludeLast) choices = choices.filter(s => s !== excludeLast);
  if (pre74(left) || pre74(right)) choices = choices.filter(s => !PRE74_EXCLUDED.has(s));
  // safety: if filtering removed everything, fall back to excluding only the last stat
  if (!choices.length) choices = excludeLast ? STATS.filter(s => s !== excludeLast) : STATS;
  return choices[Math.floor(Math.random() * choices.length)];
}

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  leftPlayer:  null,
  rightPlayer: null,
  stat:        null,
  score:       0,
  leftRounds:  1,
  busy:        false,
};

// On Cloudflare Pages this routes through functions/headshot/[id].js,
// which proxies the NBA CDN with proper Referer headers + 7-day edge caching.
// Locally (python -m http.server) this 404s gracefully — headshots just don't load.
const HEADSHOT = id => `/headshot/${id}`;

const ALL_STAT_LABELS = Object.values(STAT_LABELS);

// ── DOM refs ──────────────────────────────────────────────────────────────────

const SITE_URL = 'https://courtguessr.xyz';

const el = {
  score:        document.getElementById('score'),
  goGif:        document.getElementById('go-gif'),
  goCaption:    document.getElementById('go-caption'),
  shareConfirm: document.getElementById('share-confirm'),
  statLabel:    document.getElementById('stat-label'),
  leftImg:    document.getElementById('left-img'),
  leftName:   document.getElementById('left-name'),
  leftMeta:   document.getElementById('left-team'),
  leftVal:    document.getElementById('left-val'),
  rightImg:   document.getElementById('right-img'),
  rightName:  document.getElementById('right-name'),
  rightMeta:  document.getElementById('right-team'),
  rightVal:   document.getElementById('right-val'),
  btnLeft:    document.getElementById('btn-left'),
  btnRight:   document.getElementById('btn-right'),
  panelLeft:  document.getElementById('panel-left'),
  panelRight: document.getElementById('panel-right'),
  overlay:    document.getElementById('overlay'),
  finalScore: document.getElementById('final-score'),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function playerMeta(p) {
  if (p.is_active) return p.team ? `${p.team} \u2022 Active` : 'Active';
  if (p.from_year && p.to_year) return `Played from ${p.from_year}\u2013${p.to_year}`;
  return 'Retired';
}

function setButtons(enabled) {
  el.btnLeft.disabled  = !enabled;
  el.btnRight.disabled = !enabled;
}

function loadImg(imgEl, id) {
  imgEl.src = HEADSHOT(id);
  imgEl.onerror = () => { imgEl.src = ''; imgEl.onerror = null; };
}

// Preloads a headshot into the browser cache; resolves when done or after 800ms.
function preloadImg(id) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = HEADSHOT(id);
    setTimeout(resolve, 800);
  });
}

function renderLeft(player, statDisplay) {
  loadImg(el.leftImg, player.id);
  el.leftName.textContent = player.name;
  el.leftMeta.textContent = playerMeta(player);
  el.leftVal.textContent  = statDisplay;
  el.leftVal.classList.remove('hidden-val');
}

function renderRight(player) {
  loadImg(el.rightImg, player.id);
  el.rightName.textContent = player.name;
  el.rightMeta.textContent = playerMeta(player);
  el.rightVal.textContent  = '???';
  el.rightVal.classList.remove('revealed');
  el.rightVal.classList.add('hidden-val');
}

function clearFlash() {
  el.panelLeft.classList.remove('flash-correct', 'flash-wrong');
  el.panelRight.classList.remove('flash-correct', 'flash-wrong');
  el.panelLeft.style.boxShadow  = '';
  el.panelRight.style.boxShadow = '';
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Slot machine ──────────────────────────────────────────────────────────────

const TICK_DELAYS = [40, 45, 50, 55, 65, 80, 110, 160, 235, 330];

function animateStat(finalLabel) {
  return new Promise(resolve => {
    const others = ALL_STAT_LABELS.filter(l => l !== finalLabel);
    let tickIdx  = 0;

    function tick(remaining) {
      el.statLabel.classList.remove('slot-tick', 'slot-land');
      void el.statLabel.offsetWidth;

      if (remaining === 0) {
        el.statLabel.textContent = finalLabel;
        el.statLabel.classList.add('slot-land');
        resolve();
        return;
      }

      el.statLabel.textContent = others[Math.floor(Math.random() * others.length)];
      el.statLabel.classList.add('slot-tick');

      const d = TICK_DELAYS[Math.min(tickIdx++, TICK_DELAYS.length - 1)];
      setTimeout(() => tick(remaining - 1), d);
    }

    tick(TICK_DELAYS.length);
  });
}

// ── Game flow ─────────────────────────────────────────────────────────────────

async function startGame() {
  el.overlay.classList.add('hidden');
  el.shareConfirm.classList.add('hidden');
  state.score      = 0;
  state.leftRounds = 1;
  el.score.textContent = 0;
  setButtons(false);

  const [p1, p2] = pickTwo();
  const stat      = pickStat(null, p1, p2);
  const statLabel = STAT_LABELS[stat];

  state.leftPlayer  = p1;
  state.rightPlayer = p2;
  state.stat        = stat;

  el.statLabel.textContent = statLabel;
  el.statLabel.classList.remove('slot-tick', 'slot-land');
  renderLeft(p1, formatVal(stat, p1.stats[stat]));
  renderRight(p2);
  clearFlash();
  el.panelLeft.style.opacity  = '1';
  el.panelRight.style.opacity = '1';

  setButtons(true);
  state.busy = false;
}

async function submitGuess(side) {
  if (state.busy) return;
  state.busy = true;
  setButtons(false);

  const leftVal  = state.leftPlayer.stats[state.stat];
  const rightVal = state.rightPlayer.stats[state.stat];
  const correct  = (side === 'left'  && leftVal  >= rightVal)
                || (side === 'right' && rightVal >= leftVal);

  // Reveal right value
  el.rightVal.textContent = formatVal(state.stat, rightVal);
  el.rightVal.classList.remove('hidden-val', 'revealed');
  void el.rightVal.offsetWidth;
  el.rightVal.classList.add('revealed');

  if (correct) {
    await handleCorrect(leftVal, rightVal);
  } else {
    await handleWrong();
  }
}

async function handleCorrect(leftVal, rightVal) {
  el.panelLeft.classList.add('flash-correct');
  el.panelRight.classList.add('flash-correct');
  state.score++;
  el.score.textContent = state.score;

  // Let the green flash breathe before anything else moves
  await delay(900);

  // Fade panels out
  el.panelLeft.style.opacity  = '0';
  el.panelRight.style.opacity = '0';
  await delay(250); // matches CSS transition: opacity 0.25s

  // Pick next players while invisible, then preload their headshots
  const winner = (rightVal >= leftVal) ? state.rightPlayer : state.leftPlayer;
  let newLeft, newRight;

  if (state.leftRounds >= 3) {
    state.leftRounds = 1;
    [newLeft, newRight] = pickTwo([]);
  } else {
    newLeft  = winner;
    newRight = pickTwo([state.leftPlayer.id, state.rightPlayer.id])[0];
    state.leftRounds = (winner.id === state.leftPlayer.id)
      ? state.leftRounds + 1
      : 1;
  }

  // Preload both headshots while panels are still invisible (capped at 800ms)
  await Promise.all([preloadImg(newLeft.id), preloadImg(newRight.id)]);

  state.leftPlayer  = newLeft;
  state.rightPlayer = newRight;

  const nextStat = pickStat(state.stat, newLeft, newRight);
  state.stat     = nextStat;

  renderLeft(newLeft, formatVal(nextStat, newLeft.stats[nextStat]));
  renderRight(newRight);
  clearFlash();

  // Fade panels back in, then run the slot so nothing overlaps
  el.panelLeft.style.opacity  = '1';
  el.panelRight.style.opacity = '1';
  await delay(250); // wait for fade-in to settle

  await animateStat(STAT_LABELS[nextStat]);
  setButtons(true);
  state.busy = false;
}

async function handleWrong() {
  el.panelRight.classList.add('flash-wrong');
  await delay(1200);

  el.finalScore.textContent = state.score;

  const gif = pickGif(state.score);
  if (gif) {
    el.goGif.src              = gif.url;
    el.goGif.style.display    = 'block';
    el.goCaption.textContent  = gif.caption;
    el.goCaption.style.display = gif.caption ? 'block' : 'none';
    el.goGif.onerror = () => {
      el.goGif.style.display    = 'none';
      el.goCaption.style.display = 'none';
    };
  } else {
    el.goGif.style.display    = 'none';
    el.goCaption.style.display = 'none';
  }

  el.overlay.classList.remove('hidden');
  state.busy = false;
}

// ── Share ─────────────────────────────────────────────────────────────────────

function shareScore() {
  const score = state.score;
  const tier  = getTier(score);
  const emoji = { catastrophic: '💀', rough: '😬', decent: '🏀', good: '🔥', great: '💯', legendary: '🐐' }[tier] || '🏀';
  const text  = `${emoji} Courtguessr streak: ${score}\n${SITE_URL}`;

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;

  // Try Web Share API first (mobile), fall back to Twitter, then clipboard
  if (navigator.share) {
    navigator.share({ title: 'Courtguessr', text, url: SITE_URL }).catch(() => {});
    return;
  }

  // Open Twitter/X share sheet in a popup
  window.open(tweetUrl, '_blank', 'width=560,height=420,noopener');

  // Also copy to clipboard silently
  navigator.clipboard?.writeText(text).then(() => {
    el.shareConfirm.classList.remove('hidden');
    setTimeout(() => el.shareConfirm.classList.add('hidden'), 2500);
  }).catch(() => {});
}

// ── Disclaimer ────────────────────────────────────────────────────────────────

function dismissDisclaimer() {
  document.getElementById('disclaimer').classList.add('hidden');
  try { localStorage.setItem('cg_disclaimer_seen', '1'); } catch {}
}

// ── Init ──────────────────────────────────────────────────────────────────────

try {
  if (!localStorage.getItem('cg_disclaimer_seen')) {
    document.getElementById('disclaimer').classList.remove('hidden');
  }
} catch {}

loadPool().then(startGame);
