// ─── SPRITE ────────────────────────────────────────────────────────────────
// Claude Code logo — faceted hex, 16×18 logical pixels
// 0=transparent 1=amber(top) 2=dark-outline 3=pale-highlight 4=amber(bottom) 6=eye-white 7=pupil

const SPRITE = [
  //          0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
  /* r 0  */ [0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0],  // flat top
  /* r 1  */ [0, 0, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 0, 0],  // highlight band
  /* r 2  */ [0, 2, 1, 1, 3, 3, 1, 1, 1, 1, 3, 3, 1, 1, 2, 0],
  /* r 3  */ [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  /* r 4  */ [2, 1, 1, 1, 6, 6, 1, 1, 1, 1, 6, 6, 1, 1, 1, 2],  // eyes
  /* r 5  */ [2, 1, 1, 1, 6, 7, 1, 1, 1, 1, 6, 7, 1, 1, 1, 2],  // pupils
  /* r 6  */ [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  /* r 7  */ [2, 1, 1, 1, 1, 7, 1, 1, 1, 1, 7, 1, 1, 1, 1, 2],  // smile corners
  /* r 8  */ [2, 1, 1, 1, 1, 1, 7, 7, 7, 7, 1, 1, 1, 1, 1, 2],  // smile
  /* r 9  */ [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],  // facet divide line
  /* r10  */ [2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2],  // lower facet
  /* r11  */ [2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2],
  /* r12  */ [0, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 0],
  /* r13  */ [0, 0, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 0, 0],
  /* r14  */ [0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0],  // flat bottom
  // legs
  /* r15  */ [0, 0, 0, 0, 0, 2, 1, 0, 0, 1, 2, 0, 0, 0, 0, 0],
  /* r16  */ [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  /* r17  */ [0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0],  // feet
];

// Jump pose — legs kicked out wide
const SPRITE_JUMP_LEGS = [
  /* r15j */ [0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0],
  /* r16j */ [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 0],
  /* r17j */ [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const COLORS = {
  1: '#F59E0B',  // amber top facet
  2: '#78350F',  // dark brown outline
  3: '#FDE68A',  // pale yellow highlight
  4: '#D97706',  // darker amber bottom facet
  6: '#FFFFFF',  // eye white
  7: '#1C1917',  // dark pupil / smile
};

const SCALE     = 4;
const CHAR_COLS = 16;
const CHAR_ROWS = 18;
const CHAR_W    = CHAR_COLS * SCALE;  // 64px
const CHAR_H    = CHAR_ROWS * SCALE;  // 72px
const MARGIN      = 40;    // right/top/bottom edge buffer
const LEFT_MARGIN = 220;   // keep clear of left-side desktop icons
const MAX_SPEED   = 130;   // px/s cap

// ─── STATE ─────────────────────────────────────────────────────────────────
let canvas, ctx;
let screenW, screenH;
let customChar = null;  // custom character image, if set

async function loadCustomChar() {
  const dataUrl = await window.electronAPI.getCharacterDataUrl();
  if (!dataUrl) { customChar = null; return; }
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => { customChar = img; resolve(); };
    img.onerror = () => { customChar = null; resolve(); };
    img.src = dataUrl;
  });
}
let quotes     = [];
let quoteQueue = [];
let lastGreetingKey = localStorage.getItem('lastGreetingKey') || '';
let lastQuoteTime   = 0;

let spamPrimed     = false;  // true after first click, waiting for second
let spamPrimedUntil = 0;    // timestamp when spam window expires
const particles = [];        // happy reaction particles

const HAPPY_MSGS = [
  "hehe!! :D",
  "again! again!",
  "weeee!! :D",
  "yay yay yay!",
  "more! more!",
  "i love this!",
];

const char = {
  x: 0, y: 0,
  vx: 35, vy: -28,
  scaleX: 1, scaleY: 1,
  facing: 1,
  timer: 0,
  squishTimer: 0,
  squishH: false,   // true = horizontal squish, false = vertical
};

// Wander: periodically pick a new drift target across the full screen
const wander = { tx: 0, ty: 0, timer: 999, delay: 0 };

const bubble = {
  text: '', lines: [],
  visible: false, alpha: 0, timer: 0, duration: 7,
  w: 0, h: 0,
};

// ─── INIT ───────────────────────────────────────────────────────────────────
async function init() {
  canvas = document.getElementById('canvas');
  ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  screenW = canvas.width;
  screenH = canvas.height;
  char.x = screenW / 2;
  char.y = screenH / 2;

  await loadCustomChar();
  quotes = await window.electronAPI.readQuotes();
  if (!quotes || !quotes.length) {
    quotes = [
      "You are capable of more than you know.",
      "One step at a time.",
      "Progress, not perfection.",
      "You've got this!",
      "Every day is a fresh start."
    ];
  }

  window.electronAPI.onCharacterUpdated(async () => { await loadCustomChar(); });
  window.electronAPI.onQuotesUpdated(updated => { quotes = updated; quoteQueue = []; });
  window.electronAPI.onScreenUnlocked(() => {
    lastGreetingKey = '';
    localStorage.removeItem('lastGreetingKey');
    getNextMessage().then(msg => showBubble(msg));
  });

  canvas.addEventListener('mousemove',  onMouseMove);
  canvas.addEventListener('mouseleave', () => window.electronAPI.setClickable(false));
  canvas.addEventListener('click',      onCanvasClick);

  const opening = await getOpeningMessage();
  showBubble(opening);
  lastQuoteTime = performance.now();

  let last = performance.now();
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  })(performance.now());
}

// ─── MOUSE ──────────────────────────────────────────────────────────────────
function charRect() {
  return {
    l: char.x - CHAR_W / 2,
    t: char.y - CHAR_H * char.scaleY,
    r: char.x + CHAR_W / 2,
    b: char.y,
  };
}

function onMouseMove(e) {
  const { l, t, r, b } = charRect();
  const pad = spamPrimed ? 50 : 8;
  window.electronAPI.setClickable(
    e.clientX >= l - pad && e.clientX <= r + pad &&
    e.clientY >= t - pad && e.clientY <= b + pad
  );
}

function onCanvasClick(e) {
  const { l, t, r, b } = charRect();
  const pad = spamPrimed ? 50 : 8;
  if (e.clientX < l - pad || e.clientX > r + pad || e.clientY < t - pad || e.clientY > b + pad) return;

  const now = performance.now();

  if (spamPrimed && now < spamPrimedUntil) {
    // Second click: happy reaction!
    spamPrimed = false;
    showBubble(HAPPY_MSGS[Math.floor(Math.random() * HAPPY_MSGS.length)]);
    spawnParticles();
    char.vx = (Math.random() - 0.5) * 700;
    char.vy = (Math.random() - 0.5) * 700;
    squish(Math.random() < 0.5);
  } else {
    // First click: gentle fling so character stays near cursor for the second click
    spamPrimed = true;
    spamPrimedUntil = now + 2000;
    const cx = char.x, cy = char.y - CHAR_H / 2;
    const dx = cx - e.clientX, dy = cy - e.clientY;
    const dist = Math.hypot(dx, dy) || 1;
    char.vx = (dx / dist) * 130;
    char.vy = (dy / dist) * 130;
    char.squishTimer = 0.25;
    char.squishH = Math.abs(dx) > Math.abs(dy);
    bubble.visible = false;
    getNextMessage().then(msg => showBubble(msg));
  }
}

// ─── UPDATE ─────────────────────────────────────────────────────────────────
function update(dt) {
  updateChar(dt);
  updateBubble(dt);
  updateParticles(dt);
  if (!bubble.visible && performance.now() - lastQuoteTime > 25_000) {
    lastQuoteTime = performance.now();
    getNextMessage().then(msg => showBubble(msg));
  }
}

function updateChar(dt) {
  char.timer += dt;

  // ── Kick: every few seconds launch in a random direction so it actually hits walls ──
  wander.timer += dt;
  if (wander.timer >= wander.delay) {
    wander.timer = 0;
    wander.delay = 2.5 + Math.random() * 3;
    const angle = Math.random() * Math.PI * 2;
    const spd   = 70 + Math.random() * 50;
    char.vx = Math.cos(angle) * spd;
    char.vy = Math.sin(angle) * spd;
  }

  // Re-kick if nearly stopped between scheduled kicks
  if (Math.hypot(char.vx, char.vy) < 15) {
    const angle = Math.random() * Math.PI * 2;
    char.vx = Math.cos(angle) * 80;
    char.vy = Math.sin(angle) * 80;
    wander.timer = 0;
    wander.delay = 2.5 + Math.random() * 2;
  }

  // Very light damping so bounces persist across the screen
  const damp = Math.pow(0.9985, dt * 60);
  char.vx *= damp;
  char.vy *= damp;

  // Speed cap
  const speed = Math.hypot(char.vx, char.vy);
  if (speed > MAX_SPEED) { char.vx = char.vx / speed * MAX_SPEED; char.vy = char.vy / speed * MAX_SPEED; }

  // Move
  char.x += char.vx * dt;
  char.y += char.vy * dt;

  // Wall bounce
  const minX = screenW / 2, maxX = screenW - MARGIN - CHAR_W / 2;
  const minY = MARGIN + CHAR_H,           maxY = screenH - MARGIN;
  if (char.x < minX) { char.x = minX; char.vx =  Math.abs(char.vx) * 0.85; squish(true); }
  if (char.x > maxX) { char.x = maxX; char.vx = -Math.abs(char.vx) * 0.85; squish(true); }
  if (char.y < minY) { char.y = minY; char.vy =  Math.abs(char.vy) * 0.85; squish(false); }
  if (char.y > maxY) { char.y = maxY; char.vy = -Math.abs(char.vy) * 0.85; squish(false); }

  // Facing direction
  if (Math.abs(char.vx) > 12) char.facing = char.vx > 0 ? 1 : -1;

  // ── Scale: float bob + squish-on-bounce ──
  if (char.squishTimer > 0) {
    char.squishTimer -= dt;
    const t = Math.max(char.squishTimer / 0.25, 0);
    if (char.squishH) { char.scaleX = 1 + 0.35 * t; char.scaleY = 1 - 0.25 * t; }
    else              { char.scaleX = 1 - 0.25 * t; char.scaleY = 1 + 0.35 * t; }
  } else {
    const bob = Math.sin(char.timer * 2.8) * 0.022;
    char.scaleX = 1 + bob;
    char.scaleY = 1 - bob;
  }
}

function squish(horizontal) {
  char.squishTimer = 0.25;
  char.squishH = horizontal;
}

// ─── PARTICLES ──────────────────────────────────────────────────────────────
function spawnParticles() {
  const symbols = ['★', '✦', '♥', '✨', '◆'];
  const colors  = ['#F59E0B', '#F97316', '#EF4444', '#EC4899', '#A855F7'];
  for (let i = 0; i < 9; i++) {
    particles.push({
      x:    char.x + (Math.random() - 0.5) * CHAR_W,
      y:    char.y - CHAR_H * 0.5 + (Math.random() - 0.5) * CHAR_H * 0.4,
      vx:   (Math.random() - 0.5) * 160,
      vy:   -100 - Math.random() * 80,
      sym:  symbols[Math.floor(Math.random() * symbols.length)],
      life: 1.0,
      size: 14 + Math.random() * 10,
      col:  colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x   += p.vx * dt;
    p.y   += p.vy * dt;
    p.vy  += 55 * dt;
    p.life -= dt * 1.1;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  if (!particles.length) return;
  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = p.col;
    ctx.font        = `${Math.round(p.size)}px serif`;
    ctx.fillText(p.sym, p.x, p.y);
  }
  ctx.restore();
}

// ─── BUBBLE ─────────────────────────────────────────────────────────────────
function showBubble(text) {
  if (!text || !text.trim()) return;
  bubble.text    = text.trim();
  bubble.visible = true;
  bubble.alpha   = 0;
  bubble.timer   = 0;
  ctx.font       = '13px "Courier New", Courier, monospace';
  bubble.lines   = wrapText(ctx, bubble.text, 210);
  bubble.w       = 238;
  bubble.h       = bubble.lines.length * 20 + 20;
  bubble.duration = Math.max(5, Math.min(13, bubble.lines.length * 2.4 + 2));
}

function updateBubble(dt) {
  if (!bubble.visible) return;
  bubble.timer += dt;
  const fi = 0.35, fo = 0.45, hold = bubble.duration - fi - fo;
  if      (bubble.timer < fi)         bubble.alpha = bubble.timer / fi;
  else if (bubble.timer < fi + hold)  bubble.alpha = 1;
  else if (bubble.timer < bubble.duration) bubble.alpha = 1 - (bubble.timer - fi - hold) / fo;
  else {
    bubble.visible = false;
    bubble.alpha = 0;
    lastQuoteTime = performance.now() - 20_000; // next quote in ~5s
  }
}

// ─── DRAW ───────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, screenW, screenH);
  drawCharacter();
  if (bubble.visible && bubble.alpha > 0) drawBubble();
  drawParticles();
}

function drawCharacter() {
  ctx.save();
  ctx.translate(char.x, char.y);
  ctx.scale(char.facing * char.scaleX, char.scaleY);
  ctx.translate(-CHAR_W / 2, -CHAR_H);

  if (customChar) {
    // Draw the user's custom image, scaled to character bounds
    const aspect = customChar.width / customChar.height;
    let dw = CHAR_W, dh = CHAR_H;
    if (aspect > 1) { dh = CHAR_W / aspect; }
    else            { dw = CHAR_H * aspect; }
    const dx = (CHAR_W - dw) / 2;
    const dy = (CHAR_H - dh) / 2;
    ctx.drawImage(customChar, dx, dy, dw, dh);
  } else {
    const jumping = (char.phase === 'jumping');
    const legRows = jumping ? SPRITE_JUMP_LEGS : null;
    for (let row = 0; row < CHAR_ROWS; row++) {
      const isLeg  = row >= 15;
      const rowDat = (isLeg && legRows) ? legRows[row - 15] : SPRITE[row];
      for (let col = 0; col < CHAR_COLS; col++) {
        const px = rowDat[col];
        if (!px) continue;
        ctx.fillStyle = COLORS[px];
        ctx.fillRect(col * SCALE, row * SCALE, SCALE, SCALE);
      }
    }
  }
  ctx.restore();
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function drawBubble() {
  const { lines, w: bw, h: bh } = bubble;
  const lineH = 20, padX = 14, padY = 10;

  const cL  = char.x - CHAR_W / 2;
  const cR  = char.x + CHAR_W / 2;
  const cT  = char.y - CHAR_H;
  const cB  = char.y;
  const cMY = char.y - CHAR_H / 2;
  const gap = 16;

  let bx, by, tail;

  if (cT - bh - gap >= 8) {
    // Enough room above — default position
    by   = cT - bh - gap;
    bx   = clamp(char.x - bw / 2, 8, screenW - bw - 8);
    tail = 'down';
  } else if (cR + gap + bw <= screenW - 8) {
    // Not enough above, try right side
    bx   = cR + gap;
    by   = clamp(cMY - bh / 2, 8, screenH - bh - 8);
    tail = 'left';
  } else if (cL - gap - bw >= LEFT_MARGIN + 8) {
    // Try left side (respecting left margin)
    bx   = cL - gap - bw;
    by   = clamp(cMY - bh / 2, 8, screenH - bh - 8);
    tail = 'right';
  } else {
    // Last resort: below
    by   = cB + gap;
    bx   = clamp(char.x - bw / 2, 8, screenW - bw - 8);
    tail = 'up';
  }

  ctx.save();
  ctx.globalAlpha = bubble.alpha;

  // Drop shadow
  ctx.shadowColor   = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur    = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle     = '#FFFBF0';
  roundRect(ctx, bx, by, bw, bh, 14);
  ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = '#C2410C';
  ctx.lineWidth   = 2.5;
  roundRect(ctx, bx, by, bw, bh, 14);
  ctx.stroke();

  // Tail geometry
  const hw = 10;
  let p1, p2, tip;

  if (tail === 'down') {
    const tx = clamp(char.x, bx + hw + 4, bx + bw - hw - 4);
    p1  = [tx - hw, by + bh];
    p2  = [tx + hw, by + bh];
    tip = [char.x,  cT + 8];
  } else if (tail === 'up') {
    const tx = clamp(char.x, bx + hw + 4, bx + bw - hw - 4);
    p1  = [tx - hw, by];
    p2  = [tx + hw, by];
    tip = [char.x,  cB - 8];
  } else if (tail === 'left') {
    const ty = clamp(cMY, by + hw + 4, by + bh - hw - 4);
    p1  = [bx,      ty - hw];
    p2  = [bx,      ty + hw];
    tip = [cR + 4,  cMY];
  } else {  // right
    const ty = clamp(cMY, by + hw + 4, by + bh - hw - 4);
    p1  = [bx + bw,  ty - hw];
    p2  = [bx + bw,  ty + hw];
    tip = [cL - 4,   cMY];
  }

  ctx.fillStyle = '#FFFBF0';
  ctx.beginPath();
  ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...tip);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#C2410C'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(...p1); ctx.lineTo(...tip);
  ctx.moveTo(...p2); ctx.lineTo(...tip);
  ctx.stroke();

  // Text
  ctx.fillStyle    = '#1C1917';
  ctx.font         = '13px "Courier New", Courier, monospace';
  ctx.textBaseline = 'top';
  ctx.shadowColor  = 'transparent';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bx + padX, by + padY + i * lineH);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

function wrapText(ctx, text, maxW) {
  const result = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { result.push(''); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) { result.push(line); line = word; }
      else line = test;
    }
    if (line) result.push(line);
  }
  return result;
}

// ─── MESSAGES ───────────────────────────────────────────────────────────────
function nextQuote() {
  if (!quoteQueue.length) quoteQueue = shuffle([...quotes]);
  return quoteQueue.pop() || "You're doing great!";
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function calText(dateStr) {
  try {
    const events = await window.electronAPI.getCalendarEvents(dateStr);
    if (!events || !events.length) return null;
    return events.slice(0, 3).join('\n');
  } catch { return null; }
}

function todayStr()    { return new Date().toDateString(); }
function todayISO()    { return new Date().toISOString().split('T')[0]; }
function tomorrowISO() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }

async function getOpeningMessage() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) {
    lastGreetingKey = `morning-${todayStr()}`;
    localStorage.setItem('lastGreetingKey', lastGreetingKey);
    const cal = await calText(todayISO());
    return `Good morning! :)\n${cal ? 'Today:\n' + cal : nextQuote()}`;
  }
  if (h >= 22 || h < 6) {
    lastGreetingKey = `night-${todayStr()}`;
    localStorage.setItem('lastGreetingKey', lastGreetingKey);
    const cal = await calText(tomorrowISO());
    return `Goodnight! :)\nTomorrow will be great!${cal ? '\nTomorrow:\n' + cal : ''}`;
  }
  if (h >= 18) return `Good evening! :)\n${nextQuote()}`;
  return nextQuote();
}

async function getNextMessage() {
  const h = new Date().getHours();
  const morningKey = `morning-${todayStr()}`;
  const nightKey   = `night-${todayStr()}`;

  if (h >= 6 && h < 12 && lastGreetingKey !== morningKey) {
    lastGreetingKey = morningKey;
    localStorage.setItem('lastGreetingKey', morningKey);
    const cal = await calText(todayISO());
    return `Good morning! :)\n${cal ? 'Today:\n' + cal : nextQuote()}`;
  }
  if ((h >= 22 || h < 6) && lastGreetingKey !== nightKey) {
    lastGreetingKey = nightKey;
    localStorage.setItem('lastGreetingKey', nightKey);
    const cal = await calText(tomorrowISO());
    return `Goodnight! :)\nTomorrow will be great!${cal ? '\nTomorrow:\n' + cal : ''}`;
  }
  return nextQuote();
}

window.addEventListener('DOMContentLoaded', init);
