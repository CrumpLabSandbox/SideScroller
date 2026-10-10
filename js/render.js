// All drawing. World-space functions assume ctx is already translated by the camera.
import { T, ROWS, SOLID, SPIKE, LEVEL_BOTTOM } from './level.js';
import { hash2, hexToRgb, mixRgb, rgbStr, roundRect, clamp, lerp } from './util.js';

const PALETTES = [
  { top: '#3f8fdc', bot: '#aee0ff', far: '#7aa6d6', near: '#4e7fb3', hill: '#3f9a52', cloud: '#ffffff', stars: 0, sun: 1 },
  { top: '#3a2d7d', bot: '#ff9a5c', far: '#7a5296', far2: '#5a3f7c', near: '#4b3470', hill: '#2f6e40', cloud: '#ffd2b4', stars: 0.25, sun: 0.6 },
  { top: '#050a1f', bot: '#1c2752', far: '#161e3f', near: '#0f152d', hill: '#0f2418', cloud: '#2a3660', stars: 1, sun: 0 },
  { top: '#4a3f8f', bot: '#ffc9a0', far: '#6d5c9d', near: '#4c457a', hill: '#2f6e40', cloud: '#ffe3cb', stars: 0.3, sun: 0.4 },
].map((p) => ({
  top: hexToRgb(p.top), bot: hexToRgb(p.bot), far: hexToRgb(p.far), near: hexToRgb(p.near),
  hill: hexToRgb(p.hill), cloud: hexToRgb(p.cloud), stars: p.stars, sun: p.sun,
}));

function palette(phase) {
  const f = phase * 4;
  const i = Math.floor(f) % 4, j = (i + 1) % 4;
  let t = f - Math.floor(f);
  t = t * t * (3 - 2 * t);
  const a = PALETTES[i], b = PALETTES[j];
  return {
    top: mixRgb(a.top, b.top, t), bot: mixRgb(a.bot, b.bot, t), far: mixRgb(a.far, b.far, t),
    near: mixRgb(a.near, b.near, t), hill: mixRgb(a.hill, b.hill, t), cloud: mixRgb(a.cloud, b.cloud, t),
    stars: lerp(a.stars, b.stars, t), sun: lerp(a.sun, b.sun, t),
  };
}

function ridge(x, s) {
  return Math.sin(x * 0.0041 * s) * 42 + Math.sin(x * 0.0113 * s + 1.3) * 22 + Math.sin(x * 0.029 * s + 0.7) * 9;
}

// Screen-space background. cam/VW/VH in world units (ctx scaled so 1 unit = 1 world px).
export function drawBackground(ctx, cam, VW, VH, phase, time) {
  const p = palette(phase);
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, rgbStr(p.top));
  g.addColorStop(1, rgbStr(p.bot));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);

  const defaultCamY = LEVEL_BOTTOM + 64 - VH;
  const horizon = VH * 0.66 - (cam.y - defaultCamY) * 0.25;

  // stars
  if (p.stars > 0.02) {
    ctx.fillStyle = `rgba(255,255,255,${p.stars})`;
    for (let i = 0; i < 90; i++) {
      const hx = hash2(i, 1), hy = hash2(i, 2);
      const x = ((hx * VW * 1.6 - cam.x * 0.04) % (VW * 1.6) + VW * 1.6) % (VW * 1.6) - VW * 0.3;
      const y = hy * horizon * 0.85;
      const tw = 0.5 + 0.5 * Math.sin(time * (1 + hash2(i, 3) * 2) + i);
      const r = 0.8 + hash2(i, 4) * 1.4;
      ctx.globalAlpha = p.stars * (0.4 + 0.6 * tw);
      ctx.fillRect(x, y, r, r);
    }
    ctx.globalAlpha = 1;
  }

  // sun / moon
  const sunX = VW * 0.78, sunY = horizon * 0.35;
  if (p.sun > 0.02) {
    const sg = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 120);
    sg.addColorStop(0, `rgba(255,240,180,${0.9 * p.sun})`);
    sg.addColorStop(0.3, `rgba(255,220,140,${0.35 * p.sun})`);
    sg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
    ctx.fillStyle = `rgba(255,245,200,${p.sun})`;
    ctx.beginPath(); ctx.arc(sunX, sunY, 28, 0, Math.PI * 2); ctx.fill();
  }
  if (p.stars > 0.5) {
    const a = (p.stars - 0.5) * 2;
    const mx = VW * 0.25, my = horizon * 0.3;
    ctx.fillStyle = `rgba(235,240,255,${a})`;
    ctx.beginPath(); ctx.arc(mx, my, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgbStr(p.top, a);
    ctx.beginPath(); ctx.arc(mx + 10, my - 6, 20, 0, Math.PI * 2); ctx.fill();
  }

  // clouds
  for (let i = 0; i < 9; i++) {
    const h1 = hash2(i, 11), h2 = hash2(i, 12), h3 = hash2(i, 13);
    const span = VW + 500;
    const x = ((h1 * span + time * (6 + h3 * 10) - cam.x * (0.12 + h2 * 0.12)) % span + span) % span - 250;
    const y = 30 + h2 * horizon * 0.5;
    const s = 0.7 + h3 * 0.9;
    ctx.fillStyle = rgbStr(p.cloud, 0.85);
    ctx.beginPath();
    ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
    ctx.arc(x + 30 * s, y - 10 * s, 32 * s, 0, Math.PI * 2);
    ctx.arc(x + 64 * s, y, 24 * s, 0, Math.PI * 2);
    ctx.arc(x + 32 * s, y + 10 * s, 26 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // mountains (two layers) and hills
  const layers = [
    { f: 0.15, base: horizon - 20, amp: 1.6, s: 1.0, col: p.far, off: 0 },
    { f: 0.3, base: horizon + 30, amp: 1.1, s: 1.7, col: p.near, off: 400 },
    { f: 0.55, base: horizon + 95, amp: 0.5, s: 2.6, col: p.hill, off: 900 },
  ];
  for (const L of layers) {
    ctx.fillStyle = rgbStr(L.col);
    ctx.beginPath();
    ctx.moveTo(0, VH);
    for (let sx = 0; sx <= VW + 16; sx += 16) {
      const wx = sx + cam.x * L.f + L.off;
      ctx.lineTo(sx, L.base - Math.max(0, ridge(wx, L.s) * L.amp + 40 * L.amp));
    }
    ctx.lineTo(VW + 16, VH);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawVoid(ctx, cam, VW) {
  const g = ctx.createLinearGradient(0, LEVEL_BOTTOM, 0, LEVEL_BOTTOM + 260);
  g.addColorStop(0, 'rgba(10,8,20,0)');
  g.addColorStop(1, 'rgba(10,8,20,1)');
  ctx.fillStyle = g;
  ctx.fillRect(cam.x - 100, LEVEL_BOTTOM - 1, VW + 200, 1400);
}

const DIRT = [118, 78, 50];
const DIRT_DARK = [84, 56, 38];
const GRASS = [86, 184, 86];
const GRASS_DARK = [56, 140, 66];

export function drawTiles(ctx, level, cam, VW, VH) {
  const c0 = Math.floor(cam.x / T) - 1, c1 = Math.ceil((cam.x + VW) / T) + 1;
  const r0 = Math.max(0, Math.floor(cam.y / T) - 1), r1 = Math.min(ROWS - 1, Math.ceil((cam.y + VH) / T) + 1);
  for (let cx = c0; cx <= c1; cx++) {
    for (let cy = r0; cy <= r1; cy++) {
      const t = level.get(cx, cy);
      if (!t) continue;
      const x = cx * T, y = cy * T;
      if (t === SOLID) {
        const above = !level.isSolid(cx, cy - 1);
        const deep = !above && !level.isSolid(cx, cy - 2) ? 0 : (above ? 0 : 1);
        const v = (hash2(cx, cy) - 0.5) * 16;
        const base = deep ? DIRT_DARK : DIRT;
        ctx.fillStyle = `rgb(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v | 0})`;
        ctx.fillRect(x, y, T, T);
        // pebbles
        if (hash2(cx, cy + 100) < 0.35) {
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          const px = x + 8 + hash2(cx, cy + 200) * 28, py = y + 12 + hash2(cx, cy + 300) * 24;
          ctx.beginPath(); ctx.ellipse(px, py, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
        }
        if (!level.isSolid(cx - 1, cy)) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, y, 3, T); }
        if (!level.isSolid(cx + 1, cy)) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x + T - 3, y, 3, T); }
        if (!level.isSolid(cx, cy + 1)) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + T - 4, T, 4); }
        if (above) {
          const gv = (hash2(cx, 7) - 0.5) * 20;
          ctx.fillStyle = `rgb(${GRASS[0] + gv | 0},${GRASS[1] + gv | 0},${GRASS[2] + gv | 0})`;
          roundRect(ctx, x - 1, y - 3, T + 2, 15, 5);
          ctx.fill();
          ctx.fillStyle = rgbStr(GRASS_DARK);
          ctx.fillRect(x, y + 10, T, 3);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(x + 2, y - 2, T - 4, 2);
          // blades
          ctx.strokeStyle = rgbStr(GRASS_DARK);
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            const h = hash2(cx * 3 + k, 9);
            if (h < 0.55) continue;
            const bx = x + 6 + h * 36;
            ctx.moveTo(bx, y - 2);
            ctx.lineTo(bx + (h - 0.5) * 8, y - 9 - h * 5);
          }
          ctx.stroke();
        }
      } else if (t === SPIKE) {
        ctx.fillStyle = '#2b2f3a';
        ctx.fillRect(x, y + T - 6, T, 6);
        for (let k = 0; k < 2; k++) {
          const sx = x + k * (T / 2);
          ctx.fillStyle = '#d9dee8';
          ctx.beginPath();
          ctx.moveTo(sx + 2, y + T - 5);
          ctx.lineTo(sx + T / 4, y + T * 0.3);
          ctx.lineTo(sx + T / 2 - 2, y + T - 5);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#8e97a8';
          ctx.beginPath();
          ctx.moveTo(sx + T / 4, y + T * 0.3);
          ctx.lineTo(sx + T / 2 - 2, y + T - 5);
          ctx.lineTo(sx + T / 4 + 2, y + T - 5);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
}

export function drawPlatform(ctx, p) {
  ctx.fillStyle = '#9a5f33';
  roundRect(ctx, p.x, p.y, p.w, p.h, 6);
  ctx.fill();
  ctx.fillStyle = '#c98a4f';
  roundRect(ctx, p.x + 2, p.y + 2, p.w - 4, 6, 3);
  ctx.fill();
  ctx.fillStyle = '#5e3a1f';
  for (let i = 1; i < p.w / T; i++) ctx.fillRect(p.x + i * T - 1, p.y + 3, 2, p.h - 6);
  ctx.fillStyle = '#3c3f4a';
  ctx.beginPath();
  ctx.arc(p.x + 8, p.y + p.h / 2 + 2, 2.5, 0, Math.PI * 2);
  ctx.arc(p.x + p.w - 8, p.y + p.h / 2 + 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCoin(ctx, c, time) {
  const bob = Math.sin(time * 3 + c.x * 0.02) * 3;
  const sx = Math.abs(Math.cos(time * 4 + c.x * 0.03));
  const y = c.y + bob;
  ctx.fillStyle = '#d6931a';
  ctx.beginPath(); ctx.ellipse(c.x, y, 11 * sx + 1.5, 12.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath(); ctx.ellipse(c.x, y, 10 * sx, 11, 0, 0, Math.PI * 2); ctx.fill();
  if (sx > 0.35) {
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath(); ctx.ellipse(c.x - 3 * sx, y - 4, 3 * sx, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d6931a';
    ctx.fillRect(c.x - 1.5 * sx, y - 5, 3 * sx, 10);
  }
}

export function drawHeartShape(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.2, y + s * 0.1, x - s * 0.9, y - s * 0.9, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.9, y - s * 0.9, x + s * 1.2, y + s * 0.1, x, y + s * 0.9);
  ctx.closePath();
}

export function drawHeart(ctx, h, time) {
  const y = h.y + h.h / 2 + Math.sin(time * 3) * 3;
  const x = h.x + h.w / 2;
  ctx.fillStyle = 'rgba(255,90,110,0.25)';
  ctx.beginPath(); ctx.arc(x, y, 22 + Math.sin(time * 5) * 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8364f';
  drawHeartShape(ctx, x, y, 13);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(x - 5, y - 4, 3, 2, -0.6, 0, Math.PI * 2); ctx.fill();
}

export function drawFlag(ctx, f, time) {
  const x = f.x, base = f.y;
  ctx.fillStyle = '#3b3f4b';
  ctx.fillRect(x - 10, base - 4, 20, 4);
  ctx.fillStyle = '#c9ced9';
  ctx.fillRect(x - 2, base - 100, 4, 96);
  ctx.beginPath(); ctx.arc(x, base - 102, 4, 0, Math.PI * 2); ctx.fill();
  const w = Math.sin(time * 6 + x) * 3;
  ctx.fillStyle = f.active ? '#4cd964' : '#8a8f9c';
  ctx.beginPath();
  ctx.moveTo(x + 2, base - 98);
  ctx.quadraticCurveTo(x + 20, base - 92 + w, x + 36, base - 84 - w);
  ctx.lineTo(x + 2, base - 68);
  ctx.closePath();
  ctx.fill();
  if (f.active) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(x + 16, base - 84, 4, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawWalker(ctx, e, time) {
  const cx = e.x + e.w / 2, by = e.y + e.h;
  const sq = e.dead ? 1 : 1 + Math.sin(e.anim * 10) * 0.06;
  ctx.save();
  ctx.translate(cx, by);
  ctx.scale(e.dir > 0 ? 1 : -1, 1);
  ctx.scale(1 / sq, sq);
  // feet
  ctx.fillStyle = '#4b2d8a';
  const f = Math.sin(e.anim * 10) * 5;
  ctx.beginPath(); ctx.ellipse(-10 + f, -3, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(10 - f, -3, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
  // body
  ctx.fillStyle = '#8c5cff';
  ctx.beginPath(); ctx.ellipse(0, -e.h / 2 - 1, e.w / 2, e.h / 2 - 1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a983ff';
  ctx.beginPath(); ctx.ellipse(-4, -e.h / 2 - 7, e.w / 4, e.h / 5, -0.3, 0, Math.PI * 2); ctx.fill();
  // eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(6, -e.h / 2 - 2, 6, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(16, -e.h / 2 - 3, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b1430';
  ctx.beginPath(); ctx.arc(8, -e.h / 2 - 2, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(17.5, -e.h / 2 - 3, 2.4, 0, Math.PI * 2); ctx.fill();
  // angry brows
  ctx.strokeStyle = '#1b1430';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(1, -e.h / 2 - 10); ctx.lineTo(11, -e.h / 2 - 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, -e.h / 2 - 10); ctx.lineTo(21, -e.h / 2 - 7); ctx.stroke();
  ctx.restore();
}

export function drawBat(ctx, b, time) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const flap = Math.sin(time * 16 + b.phase) * 0.7;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#2d2148';
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    ctx.rotate(-flap * 0.6);
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(18, -14 - flap * 8, 30, -4 - flap * 8);
    ctx.quadraticCurveTo(24, 2, 22, 6);
    ctx.quadraticCurveTo(16, 2, 12, 8);
    ctx.quadraticCurveTo(8, 4, 4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#3d2c63';
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3d2c63';
  ctx.beginPath(); ctx.moveTo(-7, -6); ctx.lineTo(-4, -13); ctx.lineTo(-1, -6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(7, -6); ctx.lineTo(4, -13); ctx.lineTo(1, -6); ctx.fill();
  ctx.fillStyle = '#ff5a5a';
  ctx.beginPath(); ctx.arc(-3.5, -1, 2, 0, Math.PI * 2); ctx.arc(3.5, -1, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawPlayer(ctx, p, time) {
  // scarf trail
  if (p.trail.length > 2) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = p.trail.length - 1; i > 0; i--) {
      const a = p.trail[i], b = p.trail[i - 1];
      ctx.lineWidth = 2 + (i / p.trail.length) * 6;
      ctx.globalAlpha = 0.3 + 0.7 * (i / p.trail.length);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const cx = p.x + p.w / 2, by = p.y + p.h;
  ctx.save();
  ctx.translate(cx, by);
  ctx.rotate(p.spin * p.facing);
  ctx.scale(p.facing * p.sx, p.sy);
  const h = p.h, w = p.w;
  // legs
  ctx.fillStyle = '#c93a3a';
  if (p.grounded && Math.abs(p.vx) > 20) {
    const s = Math.sin(p.runPhase);
    ctx.beginPath(); ctx.ellipse(-6 + s * 7, -3, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6 - s * 7, -3, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  } else if (p.grounded) {
    ctx.beginPath(); ctx.ellipse(-7, -3, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, -3, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(-6, -6, 6, 4.5, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, -8, 6, 4.5, -0.4, 0, Math.PI * 2); ctx.fill();
  }
  // body
  ctx.fillStyle = '#ff5d5d';
  roundRect(ctx, -w / 2, -h, w, h - 4, 11);
  ctx.fill();
  ctx.fillStyle = '#ff8c8c';
  roundRect(ctx, -w / 2 + 5, -h + 18, w - 10, h - 28, 8);
  ctx.fill();
  // hood highlight
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  roundRect(ctx, -w / 2 + 3, -h + 3, w - 6, 8, 4);
  ctx.fill();
  // eyes
  const look = Math.max(-1, Math.min(1, p.vy / 600));
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(3, -h + 15, 5.5, 6.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(11, -h + 15, 4.5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#23182b';
  ctx.beginPath(); ctx.arc(4.5, -h + 15 + look * 2.5, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(12, -h + 15 + look * 2.5, 2.2, 0, Math.PI * 2); ctx.fill();
  // blush
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath(); ctx.ellipse(8, -h + 24, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawParticles(ctx, parts) {
  for (const q of parts) {
    const a = Math.max(0, q.life / q.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = q.color;
    const s = q.size * (0.5 + 0.5 * a);
    if (q.shape === 'rect') ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    else { ctx.beginPath(); ctx.arc(q.x, q.y, s / 2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

export function drawTexts(ctx, texts) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px system-ui, sans-serif';
  for (const t of texts) {
    const a = clamp(t.life / 0.3, 0, 1);
    ctx.globalAlpha = a;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color || '#fff';
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

export function drawTouchHints(ctx, zones, W, H, active) {
  if (!active) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = H - 70;
  const draw = (x, label, on) => {
    ctx.fillStyle = on ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(label, x, y + 1);
  };
  draw(W * 0.15, '◀', zones.left);
  draw(W * 0.425, '▶', zones.right);
  draw(W * 0.8, '▲', zones.jump);
}
