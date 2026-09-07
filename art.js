'use strict';
/* ============================================================
   TON PIXEL FORGE — gift-style art engine v2 (canvas 2D)
   Glossy premium-item rendering in the spirit of Telegram
   Gifts: Model colorway + Backdrop + Symbol pattern +
   Animation + Effect. Renders 512x512 frames.
   Exports: randomTraits, rarityOf, renderFrame(ctx,t,f), encodeGif
   ============================================================ */

const ART_SIZE = 512;
const FRAMES = 16;
const FRAME_DELAY = 90;

/* ---------- seeded rng ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------- color helpers ---------- */
function css(c, a) {
  if (a === undefined) return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
}
function mixc(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function shade(c, amt) {
  // amt >0 lighten toward white, <0 darken toward black
  if (amt >= 0) return mixc(c, [255, 255, 255], amt);
  return mixc(c, [0, 0, 0], -amt);
}

/* ---------- models (item colorways) ---------- */
const MODELS = {
  nebula:    { name: 'Nebula',      w: 1, base: [124, 77, 255], light: [196, 160, 255], dark: [58, 30, 120],  glow: [150, 90, 255],  accent: [255, 214, 112] },
  iceprince: { name: 'Ice Prince',  w: 1, base: [110, 190, 255], light: [220, 245, 255], dark: [40, 90, 170],  glow: [120, 200, 255], accent: [235, 250, 255] },
  bento:     { name: 'Bento',       w: 1, base: [225, 60, 60],  light: [255, 140, 120], dark: [130, 20, 30],  glow: [255, 90, 90],   accent: [255, 220, 180] },
  emerald:   { name: 'Emerald',     w: 2, base: [40, 190, 120], light: [150, 255, 200], dark: [10, 90, 60],   glow: [60, 230, 150],  accent: [255, 224, 130] },
  rosegold:  { name: 'Rose Gold',   w: 2, base: [240, 150, 160], light: [255, 220, 220], dark: [170, 70, 90],  glow: [255, 170, 180], accent: [255, 235, 210] },
  obsidian:  { name: 'Obsidian',    w: 2, base: [70, 70, 85],   light: [180, 180, 200], dark: [20, 20, 28],   glow: [140, 140, 170], accent: [230, 230, 245] },
  solar:     { name: 'Solar',       w: 3, base: [255, 170, 40], light: [255, 230, 150], dark: [180, 80, 10],  glow: [255, 190, 80],  accent: [255, 250, 220] },
  aurora:    { name: 'Aurora',      w: 3, base: [80, 225, 200], light: [180, 255, 240], dark: [20, 110, 110], glow: [100, 240, 220], accent: [200, 160, 255] }
};

/* ---------- backdrops ---------- */
const BACKDROPS = {
  black:     { name: 'Black',         w: 1, top: [24, 24, 28],    bot: [8, 8, 10] },
  midnight:  { name: 'Midnight Blue', w: 1, top: [24, 42, 92],    bot: [6, 10, 30] },
  aurorasky: { name: 'Aurora',        w: 2, top: [30, 80, 90],    bot: [12, 20, 46] },
  sunset:    { name: 'Sunset',        w: 2, top: [120, 50, 90],   bot: [30, 12, 40] },
  emerald:   { name: 'Emerald Deep',  w: 2, top: [16, 90, 70],    bot: [4, 24, 22] },
  velvet:    { name: 'Rose Velvet',   w: 3, top: [110, 40, 70],   bot: [30, 8, 20] },
  cosmic:    { name: 'Cosmic Purple', w: 3, top: [70, 40, 120],   bot: [16, 8, 36] },
  silvermist:{ name: 'Silver Mist',   w: 3, top: [120, 130, 150], bot: [40, 46, 60] }
};

/* ---------- symbols (scattered icon pattern) ---------- */
const SYMBOLS = {
  lightning: { name: 'Lightning', w: 1 },
  star:      { name: 'Star',      w: 1 },
  heart:     { name: 'Heart',     w: 1 },
  clover:    { name: 'Clover',    w: 2 },
  diamond:   { name: 'Diamond',   w: 2 },
  moon:      { name: 'Moon',      w: 2 },
  spark:     { name: 'Spark',     w: 3 },
  paisley:   { name: 'Paisley',   w: 3 }
};

/* ---------- items ---------- */
const ITEMS = {
  gem:    { name: 'Gem',     w: 1 },
  crown:  { name: 'Crown',   w: 2 },
  locket: { name: 'Locket',  w: 2 },
  badge:  { name: 'Badge',   w: 2 },
  potion: { name: 'Potion',  w: 3 },
  rocket: { name: 'Rocket',  w: 3 },
  ring:   { name: 'Ring',    w: 4 },
  orb:    { name: 'Orb',     w: 4 },
  egg:    { name: 'Egg',     w: 4 },
  cloverpin: { name: 'Clover Pin', w: 5 }
};

/* ---------- animations / effects ---------- */
const ANIMS = {
  float:   { name: 'Float',   w: 1 },
  pulse:   { name: 'Pulse',   w: 1 },
  shimmer: { name: 'Shimmer', w: 2 },
  orbit:   { name: 'Orbit',   w: 3 }
};
const EFFECTS = {
  none:     { name: 'Clean',     w: 1 },
  sparkles: { name: 'Sparkles',  w: 1 },
  glowring: { name: 'Glow Ring', w: 2 },
  rays:     { name: 'Light Rays', w: 3 }
};

const ADJECTIVES = ['Cosmic', 'Royal', 'Astral', 'Lucky', 'Prism', 'Velvet', 'Chrome', 'Lunar', 'Solar', 'Mystic', 'Golden', 'Crystal'];

/* ---------- traits ---------- */
function pickRand(map, rnd) {
  // weight-aware pick: lower w = more common
  const keys = Object.keys(map);
  const total = keys.reduce(function (s, k) { return s + (5 - map[k].w + 1); }, 0);
  let r = rnd() * total;
  for (let i = 0; i < keys.length; i++) {
    r -= (5 - map[keys[i]].w + 1);
    if (r <= 0) return keys[i];
  }
  return keys[keys.length - 1];
}
function randomTraits(locked, seed) {
  const rnd = mulberry32(seed == null ? (Math.random() * 2 ** 31) | 0 : seed);
  const t = {};
  const maps = [['item', ITEMS], ['backdrop', BACKDROPS], ['model', MODELS], ['symbol', SYMBOLS], ['anim', ANIMS], ['effect', EFFECTS]];
  for (let i = 0; i < maps.length; i++) {
    const key = maps[i][0], map = maps[i][1];
    t[key] = locked[key] || pickRand(map, rnd);
  }
  return t;
}
function traitName(t) {
  const rnd = mulberry32(hashStr(t.item + t.model));
  return MODELS[t.model].name + ' ' + ITEMS[t.item].name;
}
function rarityScore(t) {
  return ITEMS[t.item].w + BACKDROPS[t.backdrop].w + MODELS[t.model].w + SYMBOLS[t.symbol].w + ANIMS[t.anim].w + EFFECTS[t.effect].w;
}
function rarityOf(t) {
  const s = rarityScore(t);
  if (s >= 17) return { tier: 'Legendary', color: '#ffd700' };
  if (s >= 12) return { tier: 'Epic', color: '#b44dff' };
  if (s >= 8)  return { tier: 'Rare', color: '#4da3ff' };
  return { tier: 'Common', color: '#9aa0b5' };
}

/* ============================================================
   RENDERING
   ============================================================ */
const S = ART_SIZE;

function radial(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  return g;
}
function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  return g;
}

/* ---------- backdrop ---------- */
function drawBackdrop(ctx, t, f, rnd) {
  const B = BACKDROPS[t.backdrop];
  const g = linear(ctx, 0, 0, 0, S, [[0, css(BACKDROPS[t.backdrop].top)], [1, css(BACKDROPS[t.backdrop].bot)]]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // soft radial vignette glow center
  const cg = radial(ctx, S / 2, S * 0.42, 40, S * 0.75, [
    [0, css(MODELS[t.model].glow, 0.16)],
    [1, css(MODELS[t.model].glow, 0)]
  ]);
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, S, S);

  // vignette darken corners
  const vg = radial(ctx, S / 2, S / 2, S * 0.42, S * 0.78, [
    [0, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.42)']
  ]);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, S, S);
}

/* ---------- scattered symbol pattern ---------- */
function drawSymbolIcon(ctx, kind, x, y, s, color, alpha, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot || 0);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, s * 0.14);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (kind === 'lightning') {
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, -s * 0.5);
    ctx.lineTo(s * 0.22, -s * 0.5);
    ctx.lineTo(0, -s * 0.05);
    ctx.lineTo(s * 0.3, -s * 0.05);
    ctx.lineTo(-s * 0.22, s * 0.5);
    ctx.lineTo(-s * 0.02, s * 0.02);
    ctx.lineTo(-s * 0.26, s * 0.02);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      const a2 = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5);
      ctx.lineTo(Math.cos(a2) * s * 0.21, Math.sin(a2) * s * 0.21);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'heart') {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.32);
    ctx.bezierCurveTo(-s * 0.55, -s * 0.08, -s * 0.28, -s * 0.45, 0, -s * 0.14);
    ctx.bezierCurveTo(s * 0.28, -s * 0.45, s * 0.55, -s * 0.08, 0, s * 0.32);
    ctx.fill();
  } else if (kind === 'clover') {
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 - Math.PI / 4;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * s * 0.22, Math.sin(a) * s * 0.22, s * 0.2, s * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.42);
    ctx.lineTo(s * 0.34, -s * 0.05);
    ctx.lineTo(0, s * 0.42);
    ctx.lineTo(-s * 0.34, -s * 0.05);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'moon') {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(s * 0.2, -s * 0.08, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  } else if (kind === 'spark') {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a) * s * 0.12, Math.sin(a) * s * 0.12, Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45);
      ctx.quadraticCurveTo(Math.cos(a) * s * 0.12, Math.sin(a) * s * 0.12, 0, 0);
    }
    ctx.fill();
  } else if (kind === 'paisley') {
    ctx.beginPath();
    ctx.moveTo(s * 0.3, -s * 0.25);
    ctx.bezierCurveTo(s * 0.45, s * 0.1, s * 0.1, s * 0.42, -s * 0.2, s * 0.3);
    ctx.bezierCurveTo(-s * 0.42, s * 0.18, -s * 0.35, -s * 0.2, -s * 0.05, -s * 0.3);
    ctx.bezierCurveTo(s * 0.1, -s * 0.36, s * 0.22, -s * 0.36, s * 0.3, -s * 0.25);
    ctx.fill();
  }
  ctx.restore();
}

function drawSymbolPattern(ctx, t, f) {
  const seed = hashStr('sym' + t.symbol + t.backdrop);
  const rnd = mulberry32(seed);
  const sym = SYMBOLS[t.symbol];
  const ph = (f / FRAMES) * Math.PI * 2;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const x = 40 + rnd() * (S - 80);
    const y = 40 + rnd() * (S - 80);
    const s = 16 + rnd() * 22;
    const rot = (rnd() - 0.5) * 0.9;
    const tw = 0.5 + 0.5 * Math.sin(ph * 1.5 + i * 1.31);
    const alpha = 0.05 + 0.1 * tw;
    const col = i % 4 === 0 ? css(MODELS[t.model].light, alpha) : css([255, 255, 255], alpha * 0.8);
    drawSymbolIcon(ctx, t.symbol, x, y, s, col, 1, rot);
  }
}

/* ---------- glossy helpers ---------- */
function glossyTop(ctx, cx, cy, rx, ry, alpha) {
  // specular ellipse highlight
  const g = radial(ctx, cx - rx * 0.25, cy - ry * 0.35, 2, rx * 0.9, [
    [0, 'rgba(255,255,255,' + (alpha || 0.55) + ')'],
    [0.6, 'rgba(255,255,255,' + ((alpha || 0.55) * 0.25) + ')'],
    [1, 'rgba(255,255,255,0)']
  ]);
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ctx.translate(-cx, -cy);
  ctx.beginPath();
  ctx.arc(cx, cy, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function dropGlow(ctx, cx, cy, r, color, alpha) {
  const g = radial(ctx, cx, cy, r * 0.2, r, [
    [0, css(color, alpha)],
    [1, css(color, 0)]
  ]);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/* ---------- item renderers (each ~256px tall, centered ~ (256, 268)) ---------- */
const CX = S / 2, CY = S * 0.52;

function drawGem(ctx, M, t, f) {
  const w = 150, h = 170, y0 = CY - 40;
  // glow
  dropGlow(ctx, CX, y0, 190, M.glow, 0.34);
  // body: hexagonal brilliant
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(CX, y0 - h / 2);
  ctx.lineTo(CX + w / 2, y0 - h * 0.18);
  ctx.lineTo(CX + w * 0.36, y0 + h / 2);
  ctx.lineTo(CX - w * 0.36, y0 + h / 2);
  ctx.lineTo(CX - w / 2, y0 - h * 0.18);
  ctx.closePath();
  const g = linear(ctx, CX - w / 2, y0 - h / 2, CX + w / 2, y0 + h / 2, [
    [0, css(M.light)], [0.45, css(M.base)], [1, css(M.dark)]
  ]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // facets
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CX - w / 2, y0 - h * 0.18); ctx.lineTo(CX + w / 2, y0 - h * 0.18);
  ctx.moveTo(CX, y0 - h / 2); ctx.lineTo(CX, y0 + h / 2);
  ctx.moveTo(CX - w * 0.25, y0 - h * 0.18); ctx.lineTo(CX - w * 0.18, y0 + h / 2);
  ctx.moveTo(CX + w * 0.25, y0 - h * 0.18); ctx.lineTo(CX + w * 0.36, y0 + h / 2);
  ctx.stroke();
  // inner shine triangle
  const sg = linear(ctx, CX - 40, y0 - 80, CX + 40, y0 + 40, [
    [0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']
  ]);
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(CX, y0 - h / 2 + 8);
  ctx.lineTo(CX + w * 0.3, y0 - h * 0.15);
  ctx.lineTo(CX - w * 0.1, y0 + h * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // outline
  ctx.strokeStyle = css(shade(M.dark, -0.3), 0.9);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(CX, y0 - h / 2);
  ctx.lineTo(CX + w / 2, y0 - h * 0.18);
  ctx.lineTo(CX + w * 0.36, y0 + h / 2);
  ctx.lineTo(CX - w * 0.36, y0 + h / 2);
  ctx.lineTo(CX - w / 2, y0 - h * 0.18);
  ctx.closePath();
  ctx.stroke();
  glossyTop(ctx, CX - 18, y0 - 52, 44, 26, 0.6);
  // sparkle glints
  const tw = Math.sin((f / FRAMES) * Math.PI * 2);
  if (tw > 0.3) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * tw) + ')';
    star4(ctx, CX + 34, y0 - 44, 12 + 6 * tw);
  }
}

function star4(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.28, Math.sin(a + Math.PI / 4) * r * 0.28);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCrown(ctx, M, t, f) {
  dropGlow(ctx, CX, CY - 20, 180, M.glow, 0.3);
  const w = 200, h = 130, y0 = CY - 24;
  // ribbon tails under band
  ctx.fillStyle = css(shade(M.dark, -0.15));
  ctx.beginPath();
  ctx.moveTo(CX - 60, y0 + 30);
  ctx.lineTo(CX - 78, y0 + 78);
  ctx.lineTo(CX - 38, y0 + 62);
  ctx.lineTo(CX - 20, y0 + 84);
  ctx.lineTo(CX - 8, y0 + 34);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(CX + 60, y0 + 30);
  ctx.lineTo(CX + 78, y0 + 78);
  ctx.lineTo(CX + 38, y0 + 62);
  ctx.lineTo(CX + 20, y0 + 84);
  ctx.lineTo(CX + 8, y0 + 84 - 84 + 30);
  ctx.closePath();
  ctx.fill();
  // band
  ctx.fillStyle = linear(ctx, CX - w / 2, y0, CX + w / 2, y0 + 30, [[0, css(M.light)], [1, css(M.dark)]]);
  roundRectPath(ctx, CX - w / 2, y0, w, 34, 8);
  ctx.fill();
  ctx.strokeStyle = css(shade(M.dark, -0.3));
  ctx.lineWidth = 4;
  roundRectPath(ctx, CX - w / 2, y0, w, 34, 8);
  ctx.stroke();
  // three points with valleys (classic crown silhouette)
  ctx.beginPath();
  ctx.moveTo(CX - w / 2 + 4, y0 + 2);
  ctx.lineTo(CX - w / 2 + 4, y0 - h * 0.72);            // left point
  ctx.quadraticCurveTo(CX - w * 0.28, y0 - h * 0.28, CX - w * 0.16, y0 - h * 0.34);
  ctx.lineTo(CX, y0 - h);                                // center point
  ctx.quadraticCurveTo(CX + w * 0.16, y0 - h * 0.34, CX + w * 0.16, y0 - h * 0.34);
  ctx.lineTo(CX + w / 2 - 4, y0 - h * 0.72);             // right point
  ctx.lineTo(CX + w / 2 - 4, y0 + 4);
  ctx.closePath();
  const g = linear(ctx, CX, y0 - h, CX, y0 + 10, [[0, css(M.light)], [0.6, css(M.base)], [1, css(M.dark)]]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = css(shade(M.dark, -0.25));
  ctx.lineWidth = 4;
  ctx.stroke();
  // pearls on tips
  const tips = [[CX - w / 2 + 4, y0 - h * 0.72 - 8], [CX, y0 - h - 10], [CX + w / 2 - 4, y0 - h * 0.72 - 8]];
  for (let i = 0; i < tips.length; i++) {
    ctx.beginPath();
    ctx.arc(tips[i][0], tips[i][1], 11, 0, Math.PI * 2);
    ctx.fillStyle = css(M.accent);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tips[i][0] - 3, tips[i][1] - 4, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }
  // center gem on band
  ctx.beginPath();
  ctx.arc(CX, y0 + 17, 10, 0, Math.PI * 2);
  ctx.fillStyle = css(M.accent);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  glossyTop(ctx, CX - 4, y0 - 46, 60, 22, 0.4);
  const tw = Math.sin((f / FRAMES) * Math.PI * 2 * 1.3);
  if (tw > 0.4) { ctx.fillStyle = 'rgba(255,255,255,' + (0.75 * tw) + ')'; star4(ctx, CX + 58, y0 - 70, 10); }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function roundRectPathAlias() {} // noop

function drawLocket(ctx, M, t, f) {
  dropGlow(ctx, CX, CY, 180, M.glow, 0.3);
  const r = 88, cy = CY + 6;
  // chain
  ctx.strokeStyle = css(M.accent, 0.9);
  ctx.lineWidth = 5;
  ctx.setLineDash([2, 9]);
  ctx.beginPath();
  ctx.moveTo(CX - 60, cy - r - 60);
  ctx.quadraticCurveTo(CX, cy - r - 96, CX + 60, cy - r - 58);
  ctx.stroke();
  ctx.setLineDash([]);
  // heart body
  ctx.beginPath();
  ctx.moveTo(CX, cy + r * 0.78);
  ctx.bezierCurveTo(CX - r * 1.25, cy - r * 0.1, CX - r * 0.62, cy - r * 1.05, CX, cy - r * 0.34);
  ctx.bezierCurveTo(CX + r * 0.62, cy - r * 1.05, CX + r * 1.25, cy - r * 0.1, CX, cy + r * 0.78);
  const g = radial(ctx, CX - 30, cy - 30, 10, r * 1.3, [
    [0, css(M.light)], [0.55, css(M.base)], [1, css(M.dark)]
  ]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = css(shade(M.dark, -0.3));
  ctx.lineWidth = 4;
  ctx.stroke();
  // keyhole
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.arc(CX, cy + 8, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(CX - 3.5, cy + 8, 7, 16);
  glossyTop(ctx, CX - 24, cy - 40, 40, 24, 0.55);
  const tw = Math.sin((f / FRAMES) * Math.PI * 2);
  if (tw > 0.35) { ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * tw) + ')'; star4(ctx, CX + 40, cy - 52, 11); }
}

function drawBadge(ctx, M, t, f) {
  dropGlow(ctx, CX, CY, 180, M.glow, 0.3);
  const r = 92, cy = CY - 10;
  // ribbon tails
  ctx.fillStyle = css(shade(M.dark, -0.15));
  ctx.beginPath();
  ctx.moveTo(CX - 30, cy + r * 0.5);
  ctx.lineTo(CX - 58, cy + r * 1.05);
  ctx.lineTo(CX - 20, cy + r * 0.92);
  ctx.lineTo(CX + 2, cy + r * 1.12);
  ctx.lineTo(CX + 30, cy + r * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = css(shade(M.dark, -0.3));
  ctx.lineWidth = 3;
  ctx.stroke();
  // outer ring
  ctx.beginPath();
  ctx.arc(CX, cy, r, 0, Math.PI * 2);
  const g = linear(ctx, CX - r, cy - r, CX + r, cy + r, [[0, css(M.light)], [0.5, css(M.base)], [1, css(M.dark)]]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = css(shade(M.dark, -0.3));
  ctx.stroke();
  // inner ring
  ctx.beginPath();
  ctx.arc(CX, cy, r * 0.74, 0, Math.PI * 2);
  ctx.strokeStyle = css(M.accent, 0.85);
  ctx.lineWidth = 4;
  ctx.stroke();
  // center star emblem
  ctx.fillStyle = css(M.accent);
  ctx.save();
  ctx.translate(CX, cy);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    const a2 = a + Math.PI / 5;
    ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40);
    ctx.lineTo(Math.cos(a2) * 17, Math.sin(a2) * 17);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
  glossyTop(ctx, CX - 26, cy - 44, 56, 30, 0.42);
  const tw = Math.sin((f / FRAMES) * Math.PI * 2);
  if (tw > 0.4) { ctx.fillStyle = 'rgba(255,255,255,' + (0.65 * tw) + ')'; star4(ctx, CX + 58, cy - 58, 10); }
}

function drawPotion(ctx, M, t, f) {
  dropGlow(ctx, CX, CY + 10, 170, M.glow, 0.32);
  const cx = CX, top = CY - 118, bw = 128, bh = 190;
  // cork
  ctx.fillStyle = '#b98a4e';
  roundRectPath(ctx, cx - 24, top - 6, 48, 34, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(cx - 24, top + 16, 48, 5);
  // bottle neck
  ctx.fillStyle = 'rgba(220,235,255,0.25)';
  roundRectPath(ctx, cx - 20, top + 24, 40, 46, 6);
  ctx.fill();
  // bottle body
  ctx.beginPath();
  ctx.moveTo(cx - 20, top + 40);
  ctx.bezierCurveTo(cx - bw / 2, top + 70, cx - bw / 2, top + 110, cx - bw / 2, top + bh - 30);
  ctx.quadraticCurveTo(cx - bw / 2, top + bh, cx - bw / 2 + 26, top + bh);
  ctx.lineTo(cx + bw / 2 - 26, top + bh);
  ctx.quadraticCurveTo(cx + bw / 2, top + bh, cx + bw / 2, top + bh - 30);
  ctx.bezierCurveTo(cx + bw / 2, top + 110, cx + 20, top + 70, cx + 20, top + 46);
  ctx.closePath();
  const glass = linear(ctx, cx - bw / 2, top, cx + bw / 2, top + bh, [
    [0, 'rgba(235,245,255,0.34)'], [0.5, 'rgba(210,230,250,0.22)'], [1, 'rgba(190,215,240,0.34)']
  ]);
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  // liquid (clipped)
  ctx.save();
  ctx.clip();
  const lvl = top + 96 + Math.sin((f / FRAMES) * Math.PI * 2) * 3;
  const lg = linear(ctx, cx, lvl, cx, top + bh, [[0, css(M.light)], [0.5, css(M.base)], [1, css(M.dark)]]);
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2, lvl);
  ctx.quadraticCurveTo(cx, lvl + 10 + Math.sin((f / FRAMES) * Math.PI * 2) * 6, cx + bw / 2, lvl);
  ctx.lineTo(cx + bw / 2, top + bh);
  ctx.lineTo(cx - bw / 2, top + bh);
  ctx.closePath();
  ctx.fill();
  // bubbles
  const rnd = mulberry32(hashStr('pot' + t.model));
  for (let i = 0; i < 7; i++) {
    const bx = cx - 40 + rnd() * 80;
    const by0 = top + bh - 20 - rnd() * 60;
    const by = by0 - ((f * (2 + rnd() * 2)) % 70);
    const br = 3 + rnd() * 5;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
  }
  ctx.restore();
  // bottle outline
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 20, top + 46);
  ctx.bezierCurveTo(cx - bw / 2, top + 70, cx - bw / 2, top + 110, cx - bw / 2, top + bh - 30);
  ctx.quadraticCurveTo(cx - bw / 2, top + bh, cx - bw / 2 + 26, top + bh);
  ctx.lineTo(cx + bw / 2 - 26, top + bh);
  ctx.quadraticCurveTo(cx + bw / 2, top + bh, cx + bw / 2, top + bh - 30);
  ctx.bezierCurveTo(cx + bw / 2, top + 110, cx + 20, top + 70, cx + 20, top + 46);
  ctx.stroke();
  glossyTop(ctx, cx - 26, top + 120, 30, 52, 0.4);
}

function drawRocket(ctx, M, t, f) {
  dropGlow(ctx, CX, CY - 10, 180, M.glow, 0.3);
  const cx = CX, cy = CY - 6;
  // flame (behind)
  const fl = 40 + Math.sin((f / FRAMES) * Math.PI * 2 * 2) * 14;
  const fg = linear(ctx, cx, cy + 78, cx, cy + 78 + fl, [
    [0, 'rgba(255,220,120,0.95)'], [0.5, 'rgba(255,120,60,0.8)'], [1, 'rgba(255,60,40,0)']
  ]);
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy + 74);
  ctx.quadraticCurveTo(cx, cy + 78 + fl * 1.4, cx + 16, cy + 74);
  ctx.closePath();
  ctx.fill();
  // fins
  ctx.fillStyle = css(shade(M.dark, -0.1));
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy + 40);
  ctx.lineTo(cx - 62, cy + 84);
  ctx.lineTo(cx - 30, cy + 74);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 30, cy + 40);
  ctx.lineTo(cx + 62, cy + 84);
  ctx.lineTo(cx + 30, cy + 74);
  ctx.closePath();
  ctx.fill();
  // body
  ctx.beginPath();
  ctx.moveTo(cx, cy - 108);
  ctx.bezierCurveTo(cx + 40, cy - 60, cx + 34, cy + 30, cx + 30, cy + 76);
  ctx.lineTo(cx - 30, cy + 76);
  ctx.bezierCurveTo(cx - 34, cy + 30, cx - 40, cy - 60, cx, cy - 108);
  const g = linear(ctx, cx - 34, cy - 90, cx + 34, cy + 70, [
    [0, css(M.light)], [0.5, css(M.base)], [1, css(M.dark)]
  ]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = css(shade(M.dark, -0.3));
  ctx.lineWidth = 4;
  ctx.stroke();
  // nose cone accent
  ctx.beginPath();
  ctx.moveTo(cx, cy - 108);
  ctx.bezierCurveTo(cx + 16, cy - 84, cx + 22, cy - 66, cx + 24, cy - 66);
  ctx.lineTo(cx - 22, cy - 66);
  ctx.bezierCurveTo(cx - 22, cy - 84, cx - 16, cy - 84, cx, cy - 108);
  ctx.fillStyle = css(M.accent);
  ctx.fill();
  // window
  ctx.beginPath();
  ctx.arc(cx, cy - 18, 22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30,50,90,0.9)';
  ctx.fill();
  ctx.strokeStyle = css(M.accent);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - 7, cy - 24, 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
  glossyTop(ctx, cx - 14, cy - 60, 22, 34, 0.4);
}

function drawRing(ctx, M, t, f) {
  dropGlow(ctx, CX, CY, 180, M.glow, 0.32);
  const cx = CX, cy = CY + 26, r = 74;
  // band (torus approx)
  ctx.lineWidth = 26;
  ctx.strokeStyle = linear(ctx, cx - r, cy - r, cx + r, cy + r, [[0, css(M.light)], [0.5, css(M.base)], [1, css(M.dark)]]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0.15 * Math.PI, 0.95 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 1.12 * Math.PI, 1.88 * Math.PI);
  ctx.stroke();
  // prongs + diamond
  const dy = cy - r - 6;
  ctx.strokeStyle = css(M.accent);
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx - 26, dy + 26); ctx.lineTo(cx - 14, dy - 8);
  ctx.moveTo(cx + 26, dy + 26); ctx.lineTo(cx + 14, dy - 8);
  ctx.stroke();
  // diamond
  ctx.beginPath();
  ctx.moveTo(cx, dy - 52);
  ctx.lineTo(cx + 30, dy - 16);
  ctx.lineTo(cx, dy + 22);
  ctx.lineTo(cx - 30, dy - 16);
  ctx.closePath();
  const dg = linear(ctx, cx - 30, dy - 52, cx + 30, dy + 22, [
    [0, 'rgba(255,255,255,0.95)'], [0.5, css([190, 230, 255], 0.9)], [1, css([120, 180, 240], 0.95)]
  ]);
  ctx.fillStyle = dg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,110,170,0.8)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // facet lines
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 30, dy - 16); ctx.lineTo(cx + 30, dy - 16);
  ctx.moveTo(cx, dy - 52); ctx.lineTo(cx, dy + 22);
  ctx.stroke();
  const tw = Math.sin((f / FRAMES) * Math.PI * 2);
  if (tw > 0.3) { ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * tw) + ')'; star4(ctx, cx + 22, dy - 40, 13); }
}

function drawOrb(ctx, M, t, f) {
  dropGlow(ctx, CX, CY, 190, M.glow, 0.36);
  const cx = CX, cy = CY - 6, r = 84;
  // stand
  ctx.fillStyle = css(shade(M.dark, -0.2));
  ctx.beginPath();
  ctx.moveTo(cx - 40, cy + r + 34);
  ctx.quadraticCurveTo(cx, cy + r + 6, cx + 40, cy + r + 34);
  ctx.lineTo(cx + 26, cy + r + 52);
  ctx.lineTo(cx - 26, cy + r + 34);
  ctx.closePath();
  ctx.fill();
  // sphere with swirl
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = radial(ctx, cx - r * 0.3, cy - r * 0.35, r * 0.1, r * 1.05, [
    [0, css(M.light)], [0.6, css(M.base)], [1, css(M.dark)]
  ]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // swirl
  ctx.strokeStyle = css(M.accent, 0.75);
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 3; a += 0.12) {
    const rr = 8 + a * 11;
    const ang = a + (f / FRAMES) * Math.PI * 2;
    const x = cx + Math.cos(ang) * rr * 0.62;
    const y = cy + Math.sin(ang) * rr * 0.62;
    if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  // glass rim + highlight
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  glossyTop(ctx, cx - 24, cy - 40, 44, 26, 0.55);
  const tw = Math.sin((f / FRAMES) * Math.PI * 2 * 1.2);
  if (tw > 0.4) { ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * tw) + ')'; star4(ctx, cx + 52, cy - 50, 11); }
}

function drawEgg(ctx, M, t, f) {
  dropGlow(ctx, CX, CY, 180, M.glow, 0.3);
  const cx = CX, cy = CY + 10, rw = 86, rh = 112;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
  const g = linear(ctx, cx - rw, cy - rh, cx + rw, cy + rh, [
    [0, css(M.light)], [0.5, css(M.base)], [1, css(M.dark)]
  ]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // decorative bands
  ctx.strokeStyle = css(M.accent, 0.9);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 30, rw * 0.98, 16, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 34, rw * 0.9, 14, 0, 0, Math.PI * 2);
  ctx.stroke();
  // center emblem
  ctx.fillStyle = css(M.accent);
  drawSymbolIcon(ctx, t.symbol, cx, cy + 2, 44, css(M.accent), 1, 0);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
  ctx.strokeStyle = css(shade(M.dark, -0.3));
  ctx.lineWidth = 4;
  ctx.stroke();
  glossyTop(ctx, cx - 26, cy - 52, 40, 26, 0.5);
  const tw = Math.sin((f / FRAMES) * Math.PI * 2);
  if (tw > 0.4) { ctx.fillStyle = 'rgba(255,255,255,' + (0.65 * tw) + ')'; star4(ctx, cx + 56, cy - 60, 10); }
}

function drawCloverPin(ctx, M, t, f) {
  dropGlow(ctx, CX, CY, 180, M.glow, 0.3);
  const cx = CX, cy = CY + 8, r = 78;
  // pin disc
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = radial(ctx, cx - r * 0.3, cy - r * 0.3, r * 0.15, r * 1.1, [
    [0, css(M.light)], [0.6, css(M.base)], [1, css(M.dark)]
  ]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = css(shade(M.dark, -0.3));
  ctx.lineWidth = 5;
  ctx.stroke();
  // clover
  ctx.fillStyle = css(M.accent);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 - Math.PI / 4;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * r * 0.4, cy + Math.sin(a) * r * 0.4, r * 0.34, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // stem
  ctx.strokeStyle = css(shade(M.accent, -0.25));
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy + 6);
  ctx.quadraticCurveTo(cx + 14, cy + 40, cx + 4, cy + 62);
  ctx.stroke();
  glossyTop(ctx, cx - 26, cy - 46, 46, 26, 0.45);
  const tw = Math.sin((f / FRAMES) * Math.PI * 2);
  if (tw > 0.35) { ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * tw) + ')'; star4(ctx, cx + 54, cy - 54, 11); }
}

const ITEM_DRAWERS = {
  gem: drawGem, crown: drawCrown, locket: drawLocket, badge: drawBadge,
  potion: drawPotion, rocket: drawRocket, ring: drawRing, orb: drawOrb,
  egg: drawEgg, cloverpin: drawCloverPin
};

/* ---------- effects ---------- */
function drawEffect(ctx, t, f, rnd) {
  const ph = (f / FRAMES) * Math.PI * 2;
  if (t.effect === 'sparkles') {
    for (let i = 0; i < 9; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 120 + rnd() * 110;
      const x = CX + Math.cos(ang) * rad;
      const y = CY + Math.sin(ang) * rad * 0.85;
      const tw = Math.sin(ph * 1.4 + i * 1.7);
      if (tw < 0.2) continue;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.5 * tw) + ')';
      star4(ctx, x, y, 5 + 5 * tw);
    }
  } else if (t.effect === 'glowring') {
    ctx.save();
    ctx.strokeStyle = css(MODELS[t.model].glow, 0.5);
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 18]);
    ctx.lineDashOffset = -ph * 60;
    ctx.beginPath();
    ctx.ellipse(CX, CY + 10, 168, 150, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (t.effect === 'rays') {
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(ph * 0.25);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      const g = linear(ctx, 0, 0, 0, -250, [
        [0, css(MODELS[t.model].glow, 0.22)], [1, css(MODELS[t.model].glow, 0)]
      ]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(0, -250);
      ctx.lineTo(14, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------- full frame ---------- */
function renderFrame(ctx, t, f) {
  const seed = hashStr(t.item + '|' + t.model + '|' + t.backdrop + '|' + t.symbol + '|' + t.anim + '|' + t.effect);
  const rnd = mulberry32(seed ^ 0x9E3779B9);
  const M = MODELS[t.model];
  const ph = (f / FRAMES) * Math.PI * 2;

  ctx.save();
  drawBackdrop(ctx, t, f, rnd);

  // symbol pattern behind item
  drawSymbolPattern(ctx, t, f);

  // animation transform
  ctx.save();
  let dy = 0, sc = 1, rot = 0;
  if (t.anim === 'float') dy = Math.sin(ph) * 14;
  if (t.anim === 'pulse') sc = 1 + 0.045 * Math.sin(ph);
  if (t.anim === 'shimmer') { sc = 1 + 0.02 * Math.sin(ph * 2); }
  if (t.anim === 'orbit') { dy = Math.sin(ph) * 8; }
  ctx.translate(CX, dy);
  if (t.anim === 'orbit') ctx.rotate(Math.sin(ph) * 0.06);
  ctx.scale(sc, sc);
  ctx.translate(-CX, 0);

  // shimmer: hue-ish brightness pulse via overlay after draw
  ITEM_DRAWERS[t.item](ctx, M, t, f);

  if (t.anim === 'shimmer') {
    ctx.globalCompositeOperation = 'source-atop';
    const sg = linear(ctx, CX - 200, 0, CX + 200, S, [
      [0, 'rgba(255,255,255,0)'],
      [0.5 + 0.4 * Math.sin(ph), 'rgba(255,255,255,0.22)'],
      [1, 'rgba(255,255,255,0)']
    ]);
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  drawEffect(ctx, t, f, rnd);
  ctx.restore();
}

/* ---------- gif encoding (browser) ---------- */
const GIFENC_URL = 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js';
let _gifenc = null;
async function getGifenc() {
  if (typeof window !== 'undefined' && window.gifenc) return window.gifenc;
  if (!_gifenc) _gifenc = await import(GIFENC_URL);
  return _gifenc;
}

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  // node-canvas (testing)
  const { createCanvas } = require('canvas');
  return createCanvas(w, h);
}

async function encodeGif(t) {
  const { GIFEncoder, quantize, applyPalette } = await getGifenc();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) {
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d');
    renderFrame(ctx, t, f);
    frames.push(ctx.getImageData(0, 0, S, S).data);
  }
  // palette from frames 0 and 8
  const palData = new Uint8Array(S * S * 4 * 2);
  palData.set(frames[0], 0);
  palData.set(frames[8], S * S * 4);
  const palette = quantize(palData, 255, { format: 'rgb565' });
  const gif = GIFEncoder();
  for (let f = 0; f < FRAMES; f++) {
    const index = applyPalette(frames[f], palette, 'rgb565');
    gif.writeFrame(index, S, S, { palette: f === 0 ? palette : undefined, delay: FRAME_DELAY });
  }
  gif.finish();
  return gif.bytes();
}

/* exports: Node (module) and browser (window.art) */
const ART_EXPORTS = {
  S, FRAMES, FRAME_DELAY, ITEMS, MODELS, BACKDROPS, SYMBOLS, ANIMS, EFFECTS,
  randomTraits, traitName, rarityOf, rarityScore, renderFrame, encodeGif,
  mulberry32, hashStr
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ART_EXPORTS;
}
if (typeof window !== 'undefined') {
  window.art = ART_EXPORTS;
}