// Tile grid + procedural chunk generator.
import { clamp, mulberry32, randInt } from './util.js';

export const T = 48;            // tile size in world px
export const ROWS = 14;         // world height in tiles
export const SOLID = 1;
export const SPIKE = 2;
export const LEVEL_BOTTOM = ROWS * T;

const MIN_ROW = 5;   // highest allowed ground surface row
const MAX_ROW = 11;  // lowest allowed ground surface row
const key = (cx, cy) => cx * 16 + cy;

export class Level {
  constructor(seed = 1) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.tiles = new Map();
    this.spawns = [];
    this.genCol = 0;
    this.groundRow = 10;
    this.chunkCount = 0;
    this.sinceCheckpoint = 0;
    this.sinceHeart = 4;
    this.lastType = '';
    this._buildStart();
  }

  get(cx, cy) {
    if (cx < 0) return SOLID;
    if (cy < 0 || cy >= ROWS) return 0;
    return this.tiles.get(key(cx, cy)) || 0;
  }
  isSolid(cx, cy) { return this.get(cx, cy) === SOLID; }
  solidAt(x, y) { return this.isSolid(Math.floor(x / T), Math.floor(y / T)); }
  set(cx, cy, v) { if (cy >= 0 && cy < ROWS) this.tiles.set(key(cx, cy), v); }

  fillGround(c0, c1, row) {
    for (let c = c0; c <= c1; c++) for (let r = row; r < ROWS; r++) this.set(c, r, SOLID);
  }
  spawn(obj) { this.spawns.push(obj); }
  coin(cx, cy) { this.spawn({ type: 'coin', x: cx * T + T / 2, y: cy * T + T / 2 }); }
  coinLine(c0, c1, row) { for (let c = c0; c <= c1; c++) this.coin(c, row); }
  coinArc(c0, c1, row, height) {
    const n = c1 - c0;
    for (let c = c0; c <= c1; c++) {
      const t = n ? (c - c0) / n : 0.5;
      this.coin(c, row - Math.round(Math.sin(t * Math.PI) * height));
    }
  }

  difficulty() { return Math.min(1, this.chunkCount / 45); }
  ensure(col) { while (this.genCol < col) this._genChunk(); }

  _buildStart() {
    this.fillGround(0, 13, 10);
    this.coinLine(7, 10, 8);
    this.genCol = 14;
  }

  _genChunk() {
    const d = this.difficulty();
    const r = this.rng;
    this.chunkCount++;
    this.sinceCheckpoint++;
    this.sinceHeart++;
    let type;
    if (this.sinceCheckpoint >= 8) {
      type = 'checkpoint';
    } else if (this.chunkCount <= 2) {
      type = this.chunkCount === 1 ? 'gap' : 'flat';
    } else {
      const pool = ['flat', 'gap', 'gap', 'platforms', 'spikes', 'stairs', 'walkers'];
      if (d > 0.15) pool.push('mover', 'platforms');
      if (d > 0.3) pool.push('bats', 'spikes', 'gap');
      if (d > 0.55) pool.push('mover', 'walkers', 'bats', 'platforms');
      do { type = pool[randInt(r, 0, pool.length - 1)]; } while (type === this.lastType && r() < 0.75);
    }
    this.lastType = type;
    this['_' + type](d);
  }

  _flat(d) {
    const r = this.rng, c = this.genCol;
    const len = randInt(r, 4, 8);
    this.fillGround(c, c + len - 1, this.groundRow);
    if (len >= 5 && r() < 0.65) {
      if (r() < 0.5) this.coinLine(c + 1, c + len - 2, this.groundRow - 2);
      else this.coinArc(c + 1, c + len - 2, this.groundRow - 2, 2);
    }
    this.genCol = c + len;
  }

  _gap(d) {
    const r = this.rng, c = this.genCol;
    const maxW = 2 + Math.floor(d * 3) + (r() < 0.3 ? 1 : 0);
    const w = randInt(r, 2, Math.min(6, Math.max(2, maxW)));
    let delta = randInt(r, -2, 1);
    if ((w >= 3 || this.chunkCount < 6) && delta < -1) delta = -1;
    if (w >= 6) delta = Math.max(delta, 0);
    const newRow = clamp(this.groundRow + delta, MIN_ROW, MAX_ROW);
    this.coinArc(c, c + w - 1, Math.min(this.groundRow, newRow) - 2, 2);
    this.groundRow = newRow;
    const land = randInt(r, 3, 6);
    this.fillGround(c + w, c + w + land - 1, this.groundRow);
    this.genCol = c + w + land;
  }

  _platforms(d) {
    const r = this.rng;
    const lead = randInt(r, 2, 3);
    let c = this.genCol + lead;
    let p = clamp(this.groundRow - randInt(r, 0, lead === 2 ? 2 : 1), 3, MAX_ROW);
    const n = randInt(r, 2, 3 + Math.floor(d * 2));
    let lastEnd = c;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const g = randInt(r, 2, 3);
        c = lastEnd + g;
        p = clamp(p + randInt(r, g === 2 ? -2 : -1, 1), 3, MAX_ROW);
      }
      const w = randInt(r, 2, 3);
      for (let k = 0; k < w; k++) this.set(c + k, p, SOLID);
      if (r() < 0.7) this.coinLine(c, c + w - 1, p - 2);
      if (d > 0.45 && w === 3 && r() < 0.35) this.spawn({ type: 'walker', x: (c + 1.5) * T, y: p * T, dir: 1 });
      lastEnd = c + w;
    }
    c = lastEnd + randInt(r, 2, 3);
    this.groundRow = clamp(p + randInt(r, 0, 2), MIN_ROW, MAX_ROW);
    const land = randInt(r, 3, 6);
    this.fillGround(c, c + land - 1, this.groundRow);
    this.genCol = c + land;
  }

  _spikes(d) {
    const r = this.rng, c = this.genCol;
    const len = randInt(r, 7, 10);
    this.fillGround(c, c + len - 1, this.groundRow);
    let x = c + 2;
    while (x <= c + len - 4) {
      const w = r() < 0.3 + d * 0.4 ? 2 : 1;
      for (let k = 0; k < w; k++) this.set(x + k, this.groundRow - 1, SPIKE);
      this.coin(x + (w === 2 ? 1 : 0), this.groundRow - 3);
      if (w === 2) this.coin(x, this.groundRow - 3);
      x += w + randInt(r, 3, 4);
    }
    this.genCol = c + len;
  }

  _stairs(d) {
    const r = this.rng;
    let x = this.genCol, row = this.groundRow;
    const canUp = row - 3 >= MIN_ROW;
    const canDown = row + 3 <= MAX_ROW;
    const up = canUp && (!canDown || r() < 0.6);
    for (let s = 0; s < 3; s++) {
      row += up ? -1 : 1;
      this.fillGround(x, x + 1, row);
      if (up && s < 2) this.coin(x + 1, row - 2);
      x += 2;
    }
    this.fillGround(x, x + 3, row);
    if (!up) this.coinLine(x, x + 2, row - 2);
    this.groundRow = row;
    this.genCol = x + 4;
  }

  _walkers(d) {
    const r = this.rng, c = this.genCol;
    const len = randInt(r, 7, 10);
    this.fillGround(c, c + len - 1, this.groundRow);
    this.spawn({ type: 'walker', x: (c + 3.5) * T, y: this.groundRow * T, dir: 1 });
    if (d > 0.5 && r() < 0.5) this.spawn({ type: 'walker', x: (c + len - 2.5) * T, y: this.groundRow * T, dir: -1 });
    if (r() < 0.5) this.coinLine(c + 2, c + len - 3, this.groundRow - 3);
    this.genCol = c + len;
  }

  _mover(d) {
    const r = this.rng, c = this.genCol;
    const L = randInt(r, 7, 9);
    const w = 3 * T;
    this.spawn({
      type: 'mover', x0: (c + 0.5) * T, x1: (c + L - 0.5) * T - w, y: this.groundRow * T, w, h: 22,
      period: 3 + L * 0.2, phase: r() * Math.PI * 2,
    });
    this.coinArc(c + 2, c + L - 3, this.groundRow - 3, 1);
    this.groundRow = clamp(this.groundRow + randInt(r, -1, 1), MIN_ROW, MAX_ROW);
    const land = randInt(r, 3, 6);
    this.fillGround(c + L, c + L + land - 1, this.groundRow);
    this.genCol = c + L + land;
  }

  _bats(d) {
    const r = this.rng, c = this.genCol;
    const len = randInt(r, 8, 10);
    this.fillGround(c, c + len - 1, this.groundRow);
    const n = 1 + (d > 0.6 && r() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      this.spawn({
        type: 'bat', x: (c + 3 + i * 4) * T, y: (this.groundRow - 3) * T,
        ax: 1.5 * T, ay: 0.7 * T, period: 2.2 + r(), phase: r() * Math.PI * 2,
      });
    }
    for (let x = c + 1; x <= c + len - 2; x += 2) this.coin(x, this.groundRow - 1);
    this.genCol = c + len;
  }

  _checkpoint(d) {
    const r = this.rng, c = this.genCol;
    const len = 7;
    this.fillGround(c, c + len - 1, this.groundRow);
    this.spawn({ type: 'checkpoint', x: (c + 2) * T + T / 2, y: this.groundRow * T });
    this.sinceCheckpoint = 0;
    if (this.sinceHeart >= 9) {
      this.set(c + 5, this.groundRow - 3, SOLID);
      this.set(c + 6, this.groundRow - 3, SOLID);
      this.spawn({ type: 'heart', x: (c + 6) * T, y: (this.groundRow - 3) * T - 22 });
      this.sinceHeart = 0;
    }
    this.genCol = c + len;
    void r;
  }
}
