// Game state machine, player physics, entities, camera.
import { clamp, lerp } from './util.js';
import { T, SPIKE, LEVEL_BOTTOM, Level } from './level.js';
import * as R from './render.js';

const GRAVITY = 2300;
const MAX_FALL = 1150;
const PL = {
  w: 30, h: 42, accel: 2600, airAccel: 1800, friction: 3000, maxSpeed: 290,
  jumpVel: -720, djumpVel: -660, coyote: 0.09, buffer: 0.12,
};
export const MAX_HEARTS = 3;

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

class Player {
  constructor(cx, bottom) {
    this.w = PL.w; this.h = PL.h;
    this.x = cx - this.w / 2; this.y = bottom - this.h;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.coyoteT = 0; this.bufferT = 0;
    this.canDouble = true; this.jumpCut = true; this.jumping = false;
    this.sx = 1; this.sy = 1; this.spin = 0; this.runPhase = 0;
    this.invuln = 0;
    this.dead = false;
    this.standingOn = null;
    this.trail = [];
  }
  get cx() { return this.x + this.w / 2; }
  get bottom() { return this.y + this.h; }
}

export class Game {
  constructor(input, sound, ui) {
    this.input = input; this.sound = sound; this.ui = ui;
    this.VW = 800; this.VH = 450;
    this.time = 0;
    this.best = +(localStorage.getItem('hd_best') || 0);
    this.state = 'title';
    this.newGame();
  }

  setView(VW, VH) { this.VW = VW; this.VH = VH; }

  newGame() {
    const seed = (Math.random() * 1e9) | 0;
    this.level = new Level(seed);
    this.player = new Player(3 * T + T / 2, 10 * T);
    this.coins = []; this.enemies = []; this.platforms = []; this.items = []; this.flags = [];
    this.particles = []; this.texts = [];
    this.hearts = MAX_HEARTS; this.coinCount = 0; this.kills = 0;
    this.maxX = this.player.x; this.distance = 0; this.score = 0;
    this.checkpoint = { x: this.player.cx, y: 10 * T };
    this.cam = { x: 0, y: LEVEL_BOTTOM + 64 - this.VH };
    this.shake = 0; this.fade = 0; this.stateT = 0; this.respawned = false;
    this.sync();
    this.ui.hearts(this.hearts);
    this.ui.coins(0);
    this.ui.score(0);
  }

  start() {
    if (this.state !== 'title' && this.state !== 'gameover') return;
    if (this.state === 'gameover') this.newGame();
    this.state = 'playing';
    this.input.reset();
    this.sound.play('start');
    this.sound.startMusic();
  }
  pause() { if (this.state === 'playing') { this.state = 'paused'; this.ui.show('pause'); } }
  resume() { if (this.state === 'paused') { this.state = 'playing'; this.input.reset(); this.ui.show(null); } }
  togglePause() { this.state === 'paused' ? this.resume() : this.pause(); }

  // Pull generated spawns from the level into live entities.
  sync() {
    const lv = this.level;
    lv.ensure(Math.ceil((this.cam.x + this.VW) / T) + 40);
    for (const s of lv.spawns) {
      switch (s.type) {
        case 'coin': this.coins.push({ x: s.x, y: s.y, w: 22, h: 22 }); break;
        case 'walker': this.enemies.push({ type: 'walker', x: s.x - 20, y: s.y - 30, w: 40, h: 30, vx: 60 * s.dir, vy: 0, dir: s.dir, grounded: false, anim: Math.random() * 6, dead: false }); break;
        case 'bat': this.enemies.push({ type: 'bat', x0: s.x, y0: s.y, x: s.x, y: s.y, w: 30, h: 22, ax: s.ax, ay: s.ay, period: s.period, phase: s.phase, dead: false }); break;
        case 'mover': this.platforms.push({ x: s.x0, y: s.y, w: s.w, h: s.h, x0: s.x0, x1: s.x1, period: s.period, phase: s.phase, dx: 0, dy: 0 }); break;
        case 'heart': this.items.push({ type: 'heart', x: s.x - 14, y: s.y - 13, w: 28, h: 26 }); break;
        case 'checkpoint': this.flags.push({ x: s.x, y: s.y, active: false }); break;
      }
    }
    lv.spawns.length = 0;
    // cull far-behind entities
    const lim = this.cam.x - 700;
    const keep = (e) => e.x + (e.w || 0) > lim;
    this.coins = this.coins.filter(keep);
    this.enemies = this.enemies.filter(keep);
    this.platforms = this.platforms.filter((p) => p.x1 + p.w > lim);
    this.items = this.items.filter(keep);
    this.flags = this.flags.filter((f) => f.x + 60 > lim);
  }

  // ---- collision ----------------------------------------------------------
  moveX(b, dx) {
    if (dx === 0) return false;
    b.x += dx;
    const dir = dx > 0 ? 1 : -1;
    let hit = false;
    const y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.01) / T);
    const col = dir > 0 ? Math.floor((b.x + b.w - 0.01) / T) : Math.floor(b.x / T);
    for (let cy = y0; cy <= y1; cy++) {
      if (this.level.isSolid(col, cy)) {
        hit = true;
        b.x = dir > 0 ? col * T - b.w : (col + 1) * T;
        break;
      }
    }
    for (const p of this.platforms) {
      if (overlaps(b, p)) { hit = true; b.x = dir > 0 ? p.x - b.w : p.x + p.w; }
    }
    return hit;
  }

  moveY(b, dy) {
    if (dy === 0) return null;
    b.y += dy;
    const dir = dy > 0 ? 1 : -1;
    let res = null;
    const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.01) / T);
    const row = dir > 0 ? Math.floor((b.y + b.h - 0.01) / T) : Math.floor(b.y / T);
    for (let cx = x0; cx <= x1; cx++) {
      if (this.level.isSolid(cx, row)) {
        res = dir > 0 ? 'floor' : 'ceiling';
        b.y = dir > 0 ? row * T - b.h : (row + 1) * T;
        break;
      }
    }
    for (const p of this.platforms) {
      if (overlaps(b, p)) {
        if (dir > 0) { res = 'floor'; b.y = p.y - b.h; b.standingOn = p; }
        else { res = 'ceiling'; b.y = p.y + p.h; }
      }
    }
    return res;
  }

  // ---- update -------------------------------------------------------------
  step(dt) {
    this.time += dt;
    if (this.state === 'paused' || this.state === 'gameover') return;
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 18);
    if (this.state === 'title') { this.cam.x += dt * 20; this.sync(); return; }
    this.stateT += dt;

    if (this.state === 'respawn') {
      const t = this.stateT;
      this.fade = t < 0.45 ? t / 0.45 : Math.max(0, 1 - (t - 0.45) / 0.45);
      if (t >= 0.45 && !this.respawned) { this.respawned = true; this.doRespawn(); }
      if (t >= 0.9) { this.fade = 0; this.state = 'playing'; this.input.reset(); }
      return;
    }

    if (this.state === 'dying') {
      const p = this.player;
      p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.spin += dt * 9;
      if (this.stateT > 1.5) this.gameOver();
      return;
    }

    // playing
    for (const p of this.platforms) {
      const w = (Math.PI * 2) / p.period;
      const nx = lerp(p.x0, p.x1, 0.5 + 0.5 * Math.sin(this.time * w + p.phase));
      p.dx = nx - p.x; p.dy = 0; p.x = nx;
    }
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.interactions(dt);
    this.updateCamera(dt);
    this.sync();

    this.distance = Math.max(this.distance, (this.player.x - 3 * T) / T);
    this.score = Math.floor(this.distance) + this.coinCount * 10 + this.kills * 25;
    this.ui.score(this.score);
  }

  updatePlayer(dt) {
    const p = this.player, inp = this.input;
    const dir = inp.dir;
    p.invuln = Math.max(0, p.invuln - dt);

    if (p.grounded) p.coyoteT = PL.coyote; else p.coyoteT -= dt;
    if (inp.consumeJump()) p.bufferT = PL.buffer; else p.bufferT -= dt;

    // horizontal
    const accel = p.grounded ? PL.accel : PL.airAccel;
    if (dir !== 0) {
      p.facing = dir;
      if (Math.sign(p.vx) !== dir || Math.abs(p.vx) < PL.maxSpeed) {
        p.vx += dir * accel * dt;
        if (Math.abs(p.vx) > PL.maxSpeed && Math.sign(p.vx) === dir) p.vx = dir * PL.maxSpeed;
      } else {
        // over max speed (knockback): ease back toward max
        p.vx = lerp(p.vx, dir * PL.maxSpeed, Math.min(1, dt * 4));
      }
    } else {
      const f = (p.grounded ? PL.friction : PL.friction * 0.25) * dt;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
    }

    // jump
    if (p.bufferT > 0) {
      if (p.coyoteT > 0) {
        p.vy = PL.jumpVel; p.grounded = false; p.coyoteT = 0; p.bufferT = 0;
        p.canDouble = true; p.jumpCut = false; p.jumping = true; p.standingOn = null;
        p.sx = 0.75; p.sy = 1.3;
        this.sound.play('jump');
        this.burst(p.cx, p.bottom, 6, '#e8e4d8', 90, 0.35, 5, 600, -1);
      } else if (p.canDouble && !p.grounded) {
        p.vy = PL.djumpVel; p.canDouble = false; p.bufferT = 0; p.jumpCut = false; p.jumping = true;
        p.spin = -Math.PI * 2;
        p.sx = 0.8; p.sy = 1.25;
        this.sound.play('djump');
        this.burst(p.cx, p.bottom, 10, '#ffd166', 140, 0.4, 5, 200, 0);
      }
    }
    if (!inp.jumpHeld && p.vy < 0 && !p.jumpCut) { p.vy *= 0.45; p.jumpCut = true; }

    // gravity (lighter near apex for a floatier feel)
    const g = Math.abs(p.vy) < 90 && !p.grounded ? GRAVITY * 0.6 : GRAVITY;
    p.vy = Math.min(p.vy + g * dt, MAX_FALL);

    // carry by platform
    if (p.standingOn) { p.x += p.standingOn.dx; p.y += p.standingOn.dy; }
    p.standingOn = null;

    const wasGrounded = p.grounded;
    if (this.moveX(p, p.vx * dt)) p.vx = 0;
    const res = this.moveY(p, p.vy * dt);
    p.grounded = false;
    if (res === 'floor') {
      if (!wasGrounded) {
        const hard = p.vy > 500;
        p.sx = hard ? 1.35 : 1.15; p.sy = hard ? 0.65 : 0.85;
        if (hard) this.sound.play('land');
        this.burst(p.cx, p.bottom, hard ? 8 : 4, '#e8e4d8', 70, 0.3, 4, 500, -1);
      }
      p.grounded = true; p.vy = 0; p.canDouble = true; p.jumping = false;
    } else if (res === 'ceiling') {
      p.vy = 0;
    }

    // soft left wall at camera edge
    if (p.x < this.cam.x) { p.x = this.cam.x; if (p.vx < 0) p.vx = 0; }

    // animation state
    p.sx += (1 - p.sx) * Math.min(1, dt * 10);
    p.sy += (1 - p.sy) * Math.min(1, dt * 10);
    if (p.spin < 0) p.spin = Math.min(0, p.spin + dt * 14);
    if (p.grounded && Math.abs(p.vx) > 20) {
      p.runPhase += dt * 16 * (Math.abs(p.vx) / PL.maxSpeed);
      if (Math.random() < dt * 8) this.burst(p.cx - p.facing * 10, p.bottom, 1, 'rgba(230,226,216,0.8)', 30, 0.3, 4, 300, -1);
    }
    p.trail.unshift({ x: p.cx - p.facing * 10, y: p.y + 14 });
    if (p.trail.length > 9) p.trail.length = 9;

    if (p.y > LEVEL_BOTTOM + 160) this.loseLife('fall');
  }

  updateEnemies(dt) {
    const lv = this.level;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.type === 'walker') {
        e.anim += dt;
        e.vy = Math.min(e.vy + GRAVITY * dt, MAX_FALL);
        if (this.moveX(e, e.vx * dt)) { e.dir = -e.dir; e.vx = 60 * e.dir; }
        const r = this.moveY(e, e.vy * dt);
        e.grounded = r === 'floor';
        if (e.grounded) {
          e.vy = 0;
          const aheadX = e.dir > 0 ? e.x + e.w + 2 : e.x - 2;
          if (!lv.solidAt(aheadX, e.y + e.h + 2)) { e.dir = -e.dir; e.vx = 60 * e.dir; }
        }
        if (e.y > LEVEL_BOTTOM + 100) e.dead = true;
      } else if (e.type === 'bat') {
        const w = (Math.PI * 2) / e.period;
        e.x = e.x0 + Math.sin(this.time * w + e.phase) * e.ax;
        e.y = e.y0 + Math.sin(this.time * w * 2 + e.phase) * e.ay;
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  interactions(dt) {
    const p = this.player;
    const prect = { x: p.x + 4, y: p.y + 4, w: p.w - 8, h: p.h - 6 };

    // coins
    for (const c of this.coins) {
      const cr = { x: c.x - 11, y: c.y - 11, w: 22, h: 22 };
      if (overlaps(prect, cr)) {
        c.taken = true;
        this.coinCount++;
        this.ui.coins(this.coinCount);
        this.sound.play('coin');
        this.burst(c.x, c.y, 8, '#ffd24a', 120, 0.4, 5, 300, 0);
        this.texts.push({ x: c.x, y: c.y - 16, text: '+10', life: 0.7, vy: -70, color: '#ffe68a' });
      }
    }
    if (this.coins.some((c) => c.taken)) this.coins = this.coins.filter((c) => !c.taken);

    // hearts
    for (const it of this.items) {
      if (overlaps(prect, it)) {
        it.taken = true;
        this.hearts = Math.min(MAX_HEARTS, this.hearts + 1);
        this.ui.hearts(this.hearts);
        this.sound.play('heart');
        this.burst(it.x + 14, it.y + 13, 16, '#ff5a7a', 160, 0.6, 6, 200, 0);
        this.texts.push({ x: it.x + 14, y: it.y - 10, text: '♥', life: 0.9, vy: -60, color: '#ff8aa0' });
      }
    }
    if (this.items.some((i) => i.taken)) this.items = this.items.filter((i) => !i.taken);

    // checkpoints
    for (const f of this.flags) {
      if (!f.active && overlaps(prect, { x: f.x - 22, y: f.y - 104, w: 44, h: 104 })) {
        f.active = true;
        this.checkpoint = { x: f.x, y: f.y };
        this.sound.play('checkpoint');
        for (let i = 0; i < 24; i++) this.burst(f.x, f.y - 90, 1, ['#4cd964', '#ffd166', '#5ac8fa', '#ff6b9d'][i % 4], 220, 1.1, 6, 500, 0, 'rect');
        this.texts.push({ x: f.x, y: f.y - 120, text: 'CHECKPOINT', life: 1.2, vy: -40, color: '#9dffb0' });
      }
    }

    // enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      const er = { x: e.x + 4, y: e.y + 4, w: e.w - 8, h: e.h - 6 };
      if (!overlaps(prect, er)) continue;
      const falling = p.vy > 0 || (e.type === 'bat' && p.vy > -50);
      if (falling && p.bottom - p.vy * dt - 6 <= e.y + e.h * 0.5) {
        e.dead = true; e.pop = 0;
        this.kills++;
        p.vy = -500; p.canDouble = true; p.jumpCut = true;
        p.sx = 0.8; p.sy = 1.25;
        this.shake = 0.5;
        this.sound.play('stomp');
        this.burst(e.x + e.w / 2, e.y + e.h / 2, 14, e.type === 'bat' ? '#5a4580' : '#a983ff', 200, 0.7, 7, 700, 0);
        this.texts.push({ x: e.x + e.w / 2, y: e.y - 10, text: '+25', life: 0.8, vy: -70, color: '#d7c6ff' });
      } else {
        this.hurt(e.x + e.w / 2);
      }
    }

    // spikes
    if (p.invuln <= 0) {
      const sr = { x: p.x + 6, y: p.y + 6, w: p.w - 12, h: p.h - 6 };
      const x0 = Math.floor(sr.x / T), x1 = Math.floor((sr.x + sr.w) / T);
      const y0 = Math.floor(sr.y / T), y1 = Math.floor((sr.y + sr.h) / T);
      outer: for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          if (this.level.get(cx, cy) === SPIKE) {
            const tile = { x: cx * T + 4, y: cy * T + T * 0.4, w: T - 8, h: T * 0.6 };
            if (overlaps(sr, tile)) { this.hurt(cx * T + T / 2); break outer; }
          }
        }
      }
    }
  }

  hurt(fromX) {
    const p = this.player;
    if (p.invuln > 0 || this.state !== 'playing') return;
    this.hearts--;
    this.ui.hearts(this.hearts);
    this.shake = 1;
    this.burst(p.cx, p.y + p.h / 2, 12, '#ff5d5d', 180, 0.6, 6, 500, 0);
    if (this.hearts <= 0) { this.die(); return; }
    p.invuln = 1.6;
    p.vx = (p.cx < fromX ? -1 : 1) * 320;
    p.vy = -430;
    p.grounded = false;
    p.jumpCut = true;
    this.sound.play('hurt');
  }

  loseLife(reason) {
    if (this.state !== 'playing') return;
    this.hearts--;
    this.ui.hearts(this.hearts);
    if (this.hearts <= 0) { this.die(); return; }
    this.sound.play('fall');
    this.state = 'respawn'; this.stateT = 0; this.respawned = false;
    void reason;
  }

  doRespawn() {
    const p = this.player;
    p.x = this.checkpoint.x - p.w / 2; p.y = this.checkpoint.y - p.h;
    p.vx = 0; p.vy = 0; p.invuln = 1.5; p.grounded = true; p.trail.length = 0; p.standingOn = null;
    p.sx = 1; p.sy = 1; p.spin = 0;
    this.cam.x = Math.max(0, this.checkpoint.x - this.VW * 0.3);
    this.cam.y = this.targetCamY();
  }

  die() {
    const p = this.player;
    p.dead = true;
    p.vy = -650; p.vx = -p.facing * 60;
    this.state = 'dying'; this.stateT = 0;
    this.shake = 1.2;
    this.sound.play('gameover');
    this.sound.stopMusic();
  }

  gameOver() {
    this.state = 'gameover';
    const isBest = this.score > this.best;
    if (isBest) { this.best = this.score; localStorage.setItem('hd_best', String(this.best)); }
    this.ui.gameOver({ score: this.score, distance: Math.floor(this.distance), coins: this.coinCount, kills: this.kills, best: this.best, isBest });
  }

  targetCamY() {
    const p = this.player;
    const minY = -this.VH * 0.5, maxY = LEVEL_BOTTOM + 80 - this.VH;
    const ty = p.y + p.h / 2 - this.VH * 0.55;
    return clamp(ty, Math.min(minY, maxY), maxY);
  }

  updateCamera(dt) {
    const p = this.player;
    const tx = p.x - this.VW * 0.3;
    const kx = 1 - Math.exp(-dt * 6);
    this.cam.x = Math.max(this.cam.x, lerp(this.cam.x, tx, kx));
    const ky = 1 - Math.exp(-dt * 5);
    this.cam.y = lerp(this.cam.y, this.targetCamY(), ky);
  }

  // ---- particles ----------------------------------------------------------
  burst(x, y, n, color, speed, life, size, gravity, biasY, shape) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + (biasY || 0) * s * 0.6,
        life: life * (0.6 + Math.random() * 0.4), maxLife: life, color, size: size * (0.6 + Math.random() * 0.8),
        gravity: gravity || 0, shape,
      });
    }
  }

  updateParticles(dt) {
    for (const q of this.particles) {
      q.life -= dt;
      q.vy += q.gravity * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= 1 - dt * 2;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y += t.vy * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  // ---- render -------------------------------------------------------------
  render(ctx, dpr, scale) {
    const { VW, VH, cam } = this;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    const phase = ((this.distance / 500) % 1 + 1) % 1;
    R.drawBackground(ctx, cam, VW, VH, phase, this.time);

    const sh = this.shake * 7;
    const ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
    ctx.translate(-Math.round(cam.x) + ox, -Math.round(cam.y) + oy);

    R.drawVoid(ctx, cam, VW);
    R.drawTiles(ctx, this.level, cam, VW, VH);
    for (const f of this.flags) R.drawFlag(ctx, f, this.time);
    for (const p of this.platforms) R.drawPlatform(ctx, p);
    for (const c of this.coins) R.drawCoin(ctx, c, this.time);
    for (const it of this.items) R.drawHeart(ctx, it, this.time);
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.type === 'walker') R.drawWalker(ctx, e, this.time); else R.drawBat(ctx, e, this.time);
    }
    const p = this.player;
    const blink = p.invuln > 0 && Math.floor(this.time * 14) % 2 === 0;
    {
      ctx.globalAlpha = blink ? 0.35 : 1;
      R.drawPlayer(ctx, p, this.time);
      ctx.globalAlpha = 1;
    }
    R.drawParticles(ctx, this.particles);
    R.drawTexts(ctx, this.texts);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(8,6,16,${this.fade})`;
      ctx.fillRect(0, 0, VW, VH);
    }
  }
}
