// The Road: partway through Dreamed Country the platformer bends into a different genre,
// a roguelite road trip. A pseudo-3D highway, five legs, towns dreamed by strangers,
// level-ups with perks, and a world that gets stranger every county. Nobody dies:
// take three dents and you wake up at the on-ramp.
import { clamp, lerp, hash2, mulberry32, roundRect } from './util.js';
import { WORDS } from './story.js';

const SEG = 200;                 // segment length (world units)
const ROAD_W = 1100;             // half-width of the road
const CAM_H = 1000;              // camera height
const CAM_D = 0.84;              // camera depth (1 / tan(fov / 2))
const PLAYER_Z = CAM_H * CAM_D;  // distance from camera to the car
const LEGS = 5;
const LEG_SEGS = 1000;
const BASE_DRAW = 150;
const MAX_SPEED = SEG * 50;
const LANES = [-0.6, 0, 0.6];
const xpNeed = (level) => 12 + level * 8;

const PAL = [
  { sky: ['#33246a', '#ff9fcf'], hills: ['#9a7fd6', '#4fb59f'], grass: ['#7fd6c9', '#6cc6b8'], rumble: ['#ffffff', '#ff6fa8'], road: ['#6b5f8f', '#655988'], lane: '#fff3c4', sun: 1 },
  { sky: ['#1d2b6b', '#ffb38a'], hills: ['#a0614e', '#6f3d30'], grass: ['#d9b06b', '#cda25e'], rumble: ['#ffffff', '#e0453a'], road: ['#5a5560', '#54505a'], lane: '#ffe14f', sun: 1 },
  { sky: ['#0d3b4f', '#9ff0d0'], hills: ['#2a6b6b', '#1d4a52'], grass: ['#f4f0e6', '#24222c'], rumble: ['#ffd166', '#ff5d5d'], road: ['#7a6bd0', '#7466c8'], lane: '#ffffff', stars: 0.4 },
  { sky: ['#3a0d3f', '#ff7a5c'], hills: ['#7a2a6b', '#4a1a48'], grass: ['#ff9fe0', '#f08fd2'], rumble: ['#7fe0ff', '#ffffff'], road: ['#2b2b38', '#262633'], lane: '#7fe0ff', moons: 3, stars: 0.3 },
  { sky: ['#05040e', '#3b1d6b'], hills: ['#1b1531', '#120e24'], grass: ['#1b1531', '#15102a'], rumble: ['#2b2420', '#f4ecd8'], road: ['#f4ecd8', '#ece2cc'], lane: '#2b2420', moons: 7, stars: 0.8, words: 1 },
];
const CARS = ['wagon', 'convertible', 'sofa', 'bathtub', 'typewriter'];
const DECOR = [
  ['cactus', 'pole', 'motel', 'billboard', 'cactus'],
  ['billboard', 'mailbox', 'door', 'pole', 'billboard'],
  ['pawn', 'rook', 'lamp', 'door', 'pawn'],
  ['armchair', 'clock', 'piano', 'lamp', 'billboard'],
  ['moonpole', 'letter', 'tv', 'clock', 'letter'],
];
const OBST = [
  ['pothole', 'tumbleweed', 'cone'],
  ['cone', 'door', 'tumbleweed'],
  ['pawn', 'rook', 'armchair'],
  ['clock', 'lamp', 'armchair'],
  ['letter', 'tv', 'pawn'],
];
const SIZE = {
  cactus: [260, 520], pole: [70, 900], motel: [420, 760], billboard: [900, 700], mailbox: [160, 360], door: [300, 600],
  pawn: [260, 420], rook: [280, 440], lamp: [220, 560], armchair: [420, 360], clock: [260, 640], piano: [560, 460],
  moonpole: [320, 900], letter: [420, 520], tv: [360, 300], pothole: [420, 50], tumbleweed: [260, 240], cone: [170, 240],
  fragment: [190, 190], gas: [200, 240],
};
// how high the car must be to hop clean over each obstacle
const CLEAR = { pothole: 0, tumbleweed: 110, cone: 120, door: 210, pawn: 200, rook: 220, armchair: 190, clock: 230, lamp: 220, letter: 230, tv: 160 };
const ADS = [
  'DREAMS REPAIRED WHILE U WAIT', 'VACANCY: ONE MOON', 'LAST EXIT BEFORE MORNING', 'YOU ARE HERE (PROBABLY)',
  'NOW LEAVING THE PLOT', 'TRY SLEEP', 'GENRE CHANGE AHEAD', 'MOTEL: NO QUESTIONS (THEY COST KARMA)',
];
const LETTERS = 'ADMQRWZ&?';

const PERKS = [
  { id: 'tires', name: 'Wider Tires', text: 'Steer a quarter sharper.', apply: (s) => { s.steer *= 1.25; } },
  { id: 'shocks', name: 'Shock Absorbers', text: 'Take one more dent. Repairs one now.', apply: (s, r) => { s.maxDents++; r.dents++; } },
  { id: 'sleep', name: 'Sleepwalker', text: 'Stay untouchable longer after a hit.', apply: (s) => { s.invuln += 0.8; } },
  { id: 'radio', name: 'Magnet Radio', text: 'Fragments drift into reach from farther away.', apply: (s) => { s.magnet += 0.18; } },
  { id: 'hop', name: 'Long Hop', text: 'Hops go higher and stay up longer.', apply: (s) => { s.hop *= 1.3; } },
  { id: 'eyes', name: 'Night Eyes', text: 'See farther down the road.', apply: (s) => { s.sight += 0.35; } },
  { id: 'hubcap', name: 'Lucky Hubcap', text: 'One in four hits just… doesn’t.', apply: (s) => { s.luck = Math.min(0.6, s.luck + 0.25); } },
  { id: 'roo', name: 'A Kangaroo in a Good Suit', text: 'A hitchhiker. Doesn’t say much. Grabs fragments from the next lane.', once: true, apply: (s) => { s.roo = true; } },
  { id: 'gear', name: 'Second Gear', text: 'Drive faster. Every fragment is worth a quarter more.', apply: (s) => { s.speed *= 1.08; s.xpMult *= 1.25; } },
  { id: 'logic', name: 'Dream Logic', text: 'Things you hop over sometimes turn into fragments.', apply: (s) => { s.logic = Math.min(1, s.logic + 0.5); } },
  { id: 'mechanic', name: 'Roadside Mechanic', text: 'Repair every dent, right now.', apply: (s, r) => { r.dents = s.maxDents; } },
];
const RULES = [
  { id: 'night', text: 'It is always night here.' },
  { id: 'river', text: 'The road remembers being a river.' },
  { id: 'sunday', text: 'Every day is Sunday. Slower, and the fragments pile up.' },
  { id: 'rumor', text: 'Gravity is only a rumor.' },
  { id: 'fog', text: 'Nobody here remembers past the next mile.' },
  { id: 'radio', text: 'The radio plays what you remember. Fragments come to you.' },
  { id: 'crowded', text: 'Everyone in this county owns too much furniture.' },
];
const TOWN_A = ['Lower', 'Little', 'New', 'Port', 'East', 'Mount', 'Lake', 'Fort', 'Old'];
const TOWN_B = ['Static', 'Sunday', 'Mirage', 'Echo', 'Drive-In', 'Horizon', 'Amnesia', 'Sleepwalk', 'Moonlight', 'Rumor'];
const DREAMERS = [
  'a retired projectionist', 'a girl who can’t sleep', 'a dog', 'nobody in particular', 'the radio',
  'a man who sold maps', 'twins who disagree', 'a substitute teacher', 'the motel clerk', 'a kangaroo, allegedly',
];
const ROADS_PLAIN = ['Route 9', 'the County Road', 'the Old Highway', 'Route 66½', 'the Frontage Road'];
const ROADS_STRANGE = ['the road that isn’t on the map', 'the Static Highway', 'the Dream Bypass', 'the road you took as a kid', 'the Moon Road'];
const FRAG_WORDS = [...WORDS.dream, ...WORDS.mind];

const pick = (r, a) => a[Math.floor(r() * a.length)];
const easeIn = (a, b, t) => a + (b - a) * t * t;
const easeInOut = (a, b, t) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);

export class Road {
  constructor({ input, sound, story, ui, memory }) {
    this.input = input; this.sound = sound; this.story = story; this.ui = ui;
    this.rng = mulberry32((Math.random() * 1e9) | 0);
    this.stats = { steer: 1, maxDents: 3, invuln: 1.2, magnet: 0, hop: 1, sight: 1, luck: 0, roo: false, speed: 1, xpMult: 1, logic: 0 };
    this.level = 1; this.xp = 0; this.totalXp = 0; this.dents = 3; this.leg = 0; this.strange = 0; this.tier = 0;
    this.perks = [];
    this.time = 0; this.t = 0;
    this.pos = 0; this.x = 0; this.y = 0; this.vy = 0; this.speed = 0; this.invuln = 0;
    this.skyOffset = 0; this.shake = 0; this.flash = 0.8;
    this.texts = []; this.sparks = [];
    this.result = null;
    this.choice = null; this.queue = [];
    this.prevDir = 0;
    this.startLeg({ rule: null, gain: 0, name: 'the on-ramp' });
    const gifts = Math.min(2, memory || 0);
    for (let i = 0; i < gifts; i++) this.queue.push(() => this.perkChoice('You remember something from last time', 'Choose a gift to start with.'));
    this.state = 'drive';
    this.nextChoice();
  }

  // ---- run structure ----------------------------------------------------------
  startLeg({ rule, gain, name }) {
    this.strange += gain;
    const tier = Math.min(4, Math.floor(this.strange / 2));
    if (tier > this.tier) this.story.special('tier' + tier);
    this.tier = tier;
    this.rule = rule;
    this.legName = name;
    const L = { curveMult: 1, speedMult: 1, fragMult: 1, hopMult: 1, sightMult: 1, magnetBonus: 0, obstacleMult: 1, night: false };
    if (rule === 'night') L.night = true;
    if (rule === 'river') L.curveMult = 1.8;
    if (rule === 'sunday') { L.speedMult = 0.8; L.fragMult = 1.5; }
    if (rule === 'rumor') L.hopMult = 1.6;
    if (rule === 'fog') L.sightMult = 0.55;
    if (rule === 'radio') L.magnetBonus = 0.25;
    if (rule === 'crowded') L.obstacleMult = 1.4;
    if (gain >= 2) L.fragMult *= 1.4;
    this.L = L;
    this.build();
    this.pos = 0;
    this.speed = MAX_SPEED * 0.4;
  }

  build() {
    const r = this.rng, L = this.L, tier = this.tier;
    const segs = [];
    let lastY = 0;
    const addSeg = (curve, y) => {
      const i = segs.length;
      segs.push({ i, curve, y1: lastY, y2: y, band: Math.floor(i / 3) % 2, items: [], decor: [], p1: {}, p2: {} });
      lastY = y;
    };
    const addRoad = (enter, hold, leave, curve, height) => {
      const y0 = lastY, y1 = y0 + height * SEG, total = enter + hold + leave;
      for (let n = 0; n < enter; n++) addSeg(easeIn(0, curve, n / enter), easeInOut(y0, y1, n / total));
      for (let n = 0; n < hold; n++) addSeg(curve, easeInOut(y0, y1, (enter + n) / total));
      for (let n = 0; n < leave; n++) addSeg(easeInOut(curve, 0, n / leave), easeInOut(y0, y1, (enter + hold + n) / total));
    };
    addRoad(10, 40, 10, 0, 0);
    while (segs.length < LEG_SEGS) {
      const k = r();
      const curve = (2 + r() * 3.5) * L.curveMult * (r() < 0.5 ? -1 : 1);
      const hill = (r() < 0.5 ? -1 : 1) * (8 + r() * 22);
      if (k < 0.25) addRoad(10, 20 + Math.floor(r() * 30), 10, 0, r() < 0.4 ? hill : 0);
      else if (k < 0.7) addRoad(20, 30 + Math.floor(r() * 40), 20, curve, r() < 0.5 ? hill * 0.6 : 0);
      else { addRoad(15, 25, 15, curve, 0); addRoad(15, 25, 15, -curve, r() < 0.5 ? hill : 0); }
    }
    addRoad(10, BASE_DRAW * 2, 10, 0, 0);
    this.segs = segs;
    this.legLen = LEG_SEGS;

    // obstacles: one or two lanes at a time, never all three
    const gapBase = 42 - tier * 3;
    for (let i = 70; i < LEG_SEGS - 40;) {
      const lanes = [...LANES].sort(() => r() - 0.5).slice(0, r() < 0.22 + tier * 0.07 ? 2 : 1);
      for (const off of lanes) segs[i].items.push({ type: 'obstacle', kind: pick(r, OBST[tier]), off: off + (r() - 0.5) * 0.12 });
      i += Math.max(12, Math.round((gapBase + r() * 16) / L.obstacleMult));
    }
    // fragments: short runs along a lane or snaking across, avoiding obstacles
    for (let i = 40; i < LEG_SEGS - 30; i += 70 + Math.floor(r() * 40)) {
      const n = 4 + Math.floor(r() * 3), snake = r() < 0.4;
      let lane = Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const si = i + k * 4;
        if (snake && k % 2 === 1) lane = clamp(lane + (r() < 0.5 ? -1 : 1), 0, 2);
        const off = LANES[lane];
        const blocked = [-3, -2, -1, 0, 1, 2, 3].some((d) => segs[si + d] && segs[si + d].items.some((it) => it.type === 'obstacle' && Math.abs(it.off - off) < 0.35));
        if (!blocked) segs[si].items.push({ type: 'fragment', off, word: pick(r, FRAG_WORDS) });
      }
      if (L.fragMult > 1 && r() < L.fragMult - 1) segs[i + 2].items.push({ type: 'fragment', off: pick(r, LANES), word: pick(r, FRAG_WORDS) });
    }
    if (r() < 0.6) segs[200 + Math.floor(r() * 600)].items.push({ type: 'gas', off: pick(r, LANES) });
    // scenery by the roadside
    for (let i = 5; i < segs.length - 5; i += 6 + Math.floor(r() * 10)) {
      const side = r() < 0.5 ? -1 : 1;
      const kind = pick(r, DECOR[tier]);
      segs[i].decor.push({ kind, off: side * (1.35 + r() * 1.3), text: kind === 'billboard' ? pick(r, ADS) : kind === 'letter' ? pick(r, LETTERS.split('')) : '' });
    }
  }

  nextChoice() {
    if (this.choice) return;
    const fn = this.queue.shift();
    if (fn) { this.state = 'choice'; fn(); } else if (this.state === 'choice') this.state = 'drive';
  }

  open(choice) {
    this.choice = { ...choice, idx: 0 };
    this.t = 0;
    this.input.reset();
    this.ui.roadChoice(this.choice, (i) => this.pick(i));
  }

  pick(i) {
    const c = this.choice;
    if (!c) return;
    this.choice = null;
    this.ui.roadChoice(null);
    this.sound.play('select');
    c.options[i].go();
    this.input.reset();
    this.state = 'drive';
    this.nextChoice();
  }

  perkChoice(title, sub) {
    const pool = PERKS.filter((p) => !(p.once && this.perks.includes(p.id)));
    const opts = [];
    while (opts.length < 3 && pool.length) opts.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
    this.open({
      title, sub,
      options: opts.map((p) => ({
        name: p.name, text: p.text, tag: this.perks.filter((x) => x === p.id).length ? 'again' : 'perk',
        go: () => { p.apply(this.stats, this); this.perks.push(p.id); this.dents = Math.min(this.dents, this.stats.maxDents); if (p.id === 'roo') this.story.say('A kangaroo in a good suit got in. Didn’t say much.'); },
      })),
    });
  }

  townChoice() {
    const r = this.rng;
    const town = `${pick(r, TOWN_A)} ${pick(r, TOWN_B)}`;
    const dreamer = pick(r, DREAMERS);
    const rules = [...RULES].sort(() => r() - 0.5);
    const plain = { name: pick(r, ROADS_PLAIN), rule: rules[0], gain: 1 };
    const strange = { name: pick(r, ROADS_STRANGE), rule: rules[1], gain: 2 };
    this.dents = Math.min(this.stats.maxDents, this.dents + 1);
    this.sound.play('ding');
    this.open({
      title: `${town}, a town dreamed by ${dreamer}`,
      sub: `Leg ${this.leg + 1} of ${LEGS}. You slept at the motel and fixed a dent. Which way out?`,
      options: [plain, strange].map((o, k) => ({
        name: o.name.replace(/^./, (c) => c.toUpperCase()),
        text: o.rule.text,
        tag: k ? 'stranger · more fragments' : 'a little stranger',
        go: () => this.startLeg({ rule: o.rule.id, gain: o.gain, name: o.name }),
      })),
    });
  }

  gainXp(n) {
    this.xp += n; this.totalXp += n;
    while (this.xp >= xpNeed(this.level)) {
      this.xp -= xpNeed(this.level);
      this.level++;
      this.sound.play('heart');
      this.texts.push({ x: 0.5, y: 0.55, text: `LEVEL ${this.level}`, life: 1.4, big: true, color: '#ffe14f' });
      this.queue.push(() => this.perkChoice(`Level ${this.level}`, 'The dream adjusts to you. Choose one.'));
      this.story.event('level', 0.6);
    }
    if (this.queue.length) this.nextChoice();
  }

  hit() {
    if (this.invuln > 0) return;
    if (this.rng() < this.stats.luck) { this.story.special('lucky'); this.invuln = 0.6; return; }
    this.dents--;
    this.invuln = this.stats.invuln;
    this.shake = 1; this.flash = 0.5;
    this.speed *= 0.55;
    this.sound.play('hurt');
    this.story.event('hit', 0.6);
    if (this.dents <= 0) { this.state = 'wake'; this.t = 0; this.sound.play('fall'); }
  }

  segAt(z) { return this.segs[Math.min(this.segs.length - 1, Math.max(0, Math.floor(z / SEG)))]; }

  // ---- update -----------------------------------------------------------------
  step(dt, VW, VH) {
    this.time += dt; this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 1.5);
    for (const t of this.texts) t.life -= dt;
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const s of this.sparks) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 300 * dt; }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    const inp = this.input;

    if (this.state === 'choice') {
      // keyboard and touch zones can also choose: ◀ ▶ to move, jump to pick
      const nav = inp.consumeNav();
      if (nav && this.choice) {
        this.choice.idx = (this.choice.idx + nav + this.choice.options.length) % this.choice.options.length;
        this.ui.roadChoiceSelect(this.choice.idx);
      }
      if (inp.consumeJump() && this.choice && this.t > 0.35) this.pick(this.choice.idx);
      return;
    }
    if (this.state === 'wake' || this.state === 'end') {
      this.speed *= Math.max(0, 1 - dt * 2);
      this.pos += this.speed * dt;
      if (this.t > 1.8) this.result = this.state === 'wake' ? { type: 'wake' } : { type: 'end', karma: this.totalXp * 5 + this.level * 25 };
      return;
    }

    const S = this.stats, L = this.L;
    const max = MAX_SPEED * S.speed * L.speedMult;
    const off = Math.abs(this.x) > 1;
    const target = off ? max * 0.5 : max;
    this.speed = lerp(this.speed, target, Math.min(1, dt * (this.speed < target ? 0.9 : 3)));
    const pct = this.speed / MAX_SPEED;
    const seg = this.segAt(this.pos + PLAYER_Z);
    this.x += inp.dir * dt * 2.3 * S.steer * Math.min(1, pct + 0.2);
    this.x -= dt * 2 * pct * seg.curve * 0.12;   // curves push outward, but steering always wins
    this.x = clamp(this.x, -2.2, 2.2);
    if (inp.consumeJump() && this.y <= 0) { this.vy = 2000 * Math.sqrt(S.hop * L.hopMult); this.sound.play('jump'); }
    this.vy -= (4200 / L.hopMult) * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0 && this.vy < 0) this.vy = 0;
    this.invuln = Math.max(0, this.invuln - dt);
    this.skyOffset += seg.curve * pct * dt * 0.02;

    const prevSeg = Math.floor((this.pos + PLAYER_Z) / SEG);
    this.pos += this.speed * dt;
    const curSeg = Math.floor((this.pos + PLAYER_Z) / SEG);
    for (let si = prevSeg; si <= curSeg; si++) this.collide(this.segs[si]);
    if (this.state !== 'drive') return;

    if (this.pos >= this.legLen * SEG) {
      this.leg++;
      if (this.leg >= LEGS) { this.state = 'end'; this.t = 0; this.story.special('end'); this.sound.play('page'); }
      else { this.queue.push(() => this.townChoice()); this.t = 0; this.nextChoice(); }
    }
  }

  collide(seg) {
    if (!seg) return;
    const S = this.stats;
    for (const it of seg.items) {
      if (it.taken) continue;
      const dx = Math.abs(this.x - it.off);
      if (it.type === 'fragment') {
        const reach = Math.max(0.22 + S.magnet + this.L.magnetBonus, S.roo ? 0.75 : 0);
        if (dx < reach) {
          it.taken = true;
          this.sound.play('coin');
          this.texts.push({ x: 0.5 + (it.off - this.x) * 0.25, y: 0.62, text: it.word, life: 0.9, color: '#ffe68a' });
          this.gainXp(S.xpMult * this.L.fragMult);
        }
      } else if (it.type === 'gas') {
        if (dx < 0.3) { it.taken = true; this.dents = Math.min(S.maxDents, this.dents + 1); this.sound.play('heart'); this.texts.push({ x: 0.5, y: 0.6, text: 'dent repaired', life: 1, color: '#9dffb0' }); }
      } else if (it.type === 'obstacle') {
        const half = SIZE[it.kind][0] / ROAD_W / 2;
        if (dx < 0.11 + half) {
          if (this.y > CLEAR[it.kind]) {
            if (!it.cleared && this.rng() < S.logic) { it.cleared = true; this.texts.push({ x: 0.5, y: 0.55, text: 'dream logic', life: 0.9, color: '#c7a6ff' }); this.gainXp(2); }
            continue;
          }
          it.taken = true;
          this.hit();
        }
      }
    }
  }

  // ---- render -----------------------------------------------------------------
  render(ctx, VW, VH) {
    const P = PAL[this.tier], L = this.L;
    const sh = this.shake * 6;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    this.drawSky(ctx, VW, VH, P);

    const base = this.segAt(this.pos);
    const basePct = (this.pos % SEG) / SEG;
    const pseg = this.segAt(this.pos + PLAYER_Z);
    const ppct = ((this.pos + PLAYER_Z) % SEG) / SEG;
    const playerY = lerp(pseg.y1, pseg.y2, ppct);
    const camX = this.x * ROAD_W, camY = playerY + CAM_H, camZ = this.pos;
    const draw = Math.round(BASE_DRAW * this.stats.sight * L.sightMult);
    const fogRGB = P.sky[1];
    let maxy = VH, x = 0, dx = -(base.curve * basePct);
    const visible = [];
    for (let n = 0; n < draw; n++) {
      const s = this.segs[base.i + n];
      if (!s) break;
      project(s.p1, s.y1, s.i * SEG, camX - x, camY, camZ, VW, VH);
      project(s.p2, s.y2, (s.i + 1) * SEG, camX - x - dx, camY, camZ, VW, VH);
      x += dx; dx += s.curve;
      s.fog = Math.pow(n / draw, 2);
      if (s.p1.cz <= CAM_D || s.p2.sy >= s.p1.sy || s.p2.sy >= maxy) continue;
      s.clip = maxy;
      this.drawSegment(ctx, VW, s, P, fogRGB);
      maxy = s.p2.sy;
      visible.push(s);
    }
    for (let k = visible.length - 1; k >= 0; k--) {
      const s = visible[k];
      const sc = s.p1.scale;
      ctx.globalAlpha = 1 - s.fog * 0.85;
      for (const d of s.decor) this.drawThing(ctx, d.kind, s.p1.sx + sc * d.off * ROAD_W * VW / 2, s.p1.sy, sc * VW / 2, d.text, s.clip);
      for (const it of s.items) {
        if (it.taken) continue;
        const kind = it.type === 'obstacle' ? it.kind : it.type;
        this.drawThing(ctx, kind, s.p1.sx + sc * it.off * ROAD_W * VW / 2, s.p1.sy, sc * VW / 2, it.word, s.clip);
      }
      ctx.globalAlpha = 1;
    }
    if (L.night) {
      const g = ctx.createRadialGradient(VW / 2, VH * 0.72, 40, VW / 2, VH * 0.6, VW * 0.6);
      g.addColorStop(0, 'rgba(0,0,18,0)');
      g.addColorStop(1, 'rgba(0,0,18,0.78)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH);
    }
    this.drawSpeedLines(ctx, VW, VH);
    this.drawCar(ctx, VW, VH);
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / 0.4);
      ctx.font = t.big ? '900 34px system-ui, sans-serif' : 'italic 700 16px Georgia, serif';
      ctx.lineWidth = t.big ? 6 : 4; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(20,10,30,0.7)';
      const y = VH * t.y - (1 - t.life) * 30;
      ctx.strokeText(t.text, VW * t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, VW * t.x, y);
    }
    ctx.globalAlpha = 1;
    this.drawHud(ctx, VW, VH);
    const white = this.state === 'end' ? Math.min(1, this.t / 1.5) : 0;
    const dark = this.state === 'wake' ? Math.min(1, this.t / 1.4) : 0;
    if (white) { ctx.fillStyle = `rgba(250,245,232,${white})`; ctx.fillRect(0, 0, VW, VH); }
    if (dark) { ctx.fillStyle = `rgba(7,6,14,${dark})`; ctx.fillRect(0, 0, VW, VH); }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,240,240,${this.flash * 0.5})`; ctx.fillRect(0, 0, VW, VH); }
  }

  drawSky(ctx, VW, VH, P) {
    const g = ctx.createLinearGradient(0, 0, 0, VH * 0.55);
    g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    const hz = VH * 0.5;
    if (P.stars) {
      ctx.fillStyle = `rgba(255,255,255,${P.stars})`;
      for (let i = 0; i < 60; i++) ctx.fillRect(((hash2(i, 1) * VW * 2 - this.skyOffset * 300) % VW + VW) % VW, hash2(i, 2) * hz * 0.9, 1.5, 1.5);
    }
    if (P.sun) {
      ctx.fillStyle = 'rgba(255,236,190,0.95)';
      ctx.beginPath(); ctx.arc(VW * 0.7 - this.skyOffset * 60, hz * 0.55, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,170,190,0.5)';
      for (let k = 0; k < 4; k++) ctx.fillRect(VW * 0.7 - this.skyOffset * 60 - 40, hz * 0.55 + 4 + k * 8, 80, 3);
    }
    for (let m = 0; m < (P.moons || 0); m++) {
      const mx = ((hash2(m, 9) * VW * 1.4 - this.skyOffset * (60 + m * 20)) % (VW * 1.4) + VW * 1.4) % (VW * 1.4) - VW * 0.2;
      const my = 30 + hash2(m, 10) * hz * 0.6, mr = 10 + hash2(m, 11) * 24;
      ctx.fillStyle = `rgba(240,240,255,${0.6 + hash2(m, 12) * 0.4})`;
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = P.sky[0];
      ctx.beginPath(); ctx.arc(mx + mr * 0.4, my - mr * 0.2, mr * 0.85, 0, Math.PI * 2); ctx.fill();
    }
    if (P.words) {
      ctx.font = 'italic 14px Georgia, serif';
      ctx.fillStyle = 'rgba(220,210,255,0.35)';
      ctx.textAlign = 'center';
      for (let i = 0; i < 14; i++) ctx.fillText(FRAG_WORDS[i % FRAG_WORDS.length], ((hash2(i, 21) * VW * 1.5 - this.skyOffset * 120) % (VW * 1.5) + VW * 1.5) % (VW * 1.5) - VW * 0.25, 20 + hash2(i, 22) * hz * 0.8);
    }
    for (const [k, f, amp] of [[0, 40, 46], [1, 80, 28]]) {
      ctx.fillStyle = P.hills[k];
      ctx.beginPath();
      ctx.moveTo(0, hz + 2);
      for (let sx = 0; sx <= VW + 10; sx += 10) {
        const w = sx + this.skyOffset * f * 10 + k * 300;
        ctx.lineTo(sx, hz - Math.abs(Math.sin(w * 0.006) * amp + Math.sin(w * 0.017) * amp * 0.4));
      }
      ctx.lineTo(VW + 10, hz + 2);
      ctx.closePath(); ctx.fill();
    }
  }

  drawSegment(ctx, VW, s, P, fogRGB) {
    const a = s.p1, b = s.p2;
    const band = s.band;
    const fog = (c) => (s.fog > 0.02 ? mixHex(c, fogRGB, s.fog * 0.8) : c);
    ctx.fillStyle = fog(P.grass[band]);
    ctx.fillRect(0, b.sy, VW, a.sy - b.sy + 1);
    const r1 = a.sw / 6, r2 = b.sw / 6;
    quad(ctx, a.sx - a.sw - r1, a.sy, a.sx - a.sw, a.sy, b.sx - b.sw, b.sy, b.sx - b.sw - r2, b.sy, fog(P.rumble[band]));
    quad(ctx, a.sx + a.sw + r1, a.sy, a.sx + a.sw, a.sy, b.sx + b.sw, b.sy, b.sx + b.sw + r2, b.sy, fog(P.rumble[band]));
    quad(ctx, a.sx - a.sw, a.sy, a.sx + a.sw, a.sy, b.sx + b.sw, b.sy, b.sx - b.sw, b.sy, fog(P.road[band]));
    if (band === 0) {
      const l1 = a.sw / 32, l2 = b.sw / 32;
      for (const k of [-1 / 3, 1 / 3]) {
        const x1 = a.sx + a.sw * k * 2 * 0.9, x2 = b.sx + b.sw * k * 2 * 0.9;
        quad(ctx, x1 - l1, a.sy, x1 + l1, a.sy, x2 + l2, b.sy, x2 - l2, b.sy, fog(P.lane));
      }
    }
  }

  drawSpeedLines(ctx, VW, VH) {
    const pct = this.speed / MAX_SPEED;
    if (pct < 0.7) return;
    ctx.strokeStyle = `rgba(255,255,255,${(pct - 0.7) * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      const y = VH * 0.55 + hash2(i, 3) * VH * 0.4;
      const ph = (this.time * 3 + hash2(i, 4)) % 1;
      const x = VW / 2 + side * (VW * 0.3 + ph * VW * 0.3);
      ctx.moveTo(x, y); ctx.lineTo(x + side * 30 * ph, y + 8 * ph);
    }
    ctx.stroke();
  }

  // Everything by the road and on it, drawn standing on (x, groundY) at screen scale k.
  drawThing(ctx, kind, x, gy, k, text, clip) {
    const [W0, H0] = SIZE[kind] || [200, 200];
    const w = W0 * k, h = H0 * k;
    if (w < 1.2 || gy - h > clip + 2) return;
    const l = x - w / 2, t = gy - h;
    const c = ctx;
    switch (kind) {
      case 'cactus':
        c.fillStyle = '#3f9a52';
        roundRect(c, x - w * 0.15, t, w * 0.3, h, w * 0.15); c.fill();
        roundRect(c, l, t + h * 0.3, w * 0.3, h * 0.12, w * 0.06); c.fill();
        roundRect(c, l, t + h * 0.15, w * 0.12, h * 0.3, w * 0.06); c.fill();
        roundRect(c, x + w * 0.15, t + h * 0.4, w * 0.35, h * 0.1, w * 0.05); c.fill();
        roundRect(c, x + w * 0.38, t + h * 0.22, w * 0.12, h * 0.28, w * 0.06); c.fill();
        break;
      case 'pole':
        c.fillStyle = '#5a3e2b';
        c.fillRect(x - w * 0.3, t, w * 0.6, h);
        c.fillRect(x - w * 2, t + h * 0.08, w * 4, h * 0.03);
        break;
      case 'motel':
        c.fillStyle = '#3a2a40'; c.fillRect(x - w * 0.04, t + h * 0.35, w * 0.08, h * 0.65);
        c.fillStyle = '#2a1e30'; roundRect(c, l, t, w, h * 0.4, w * 0.05); c.fill();
        if (w > 14) {
          c.fillStyle = '#ff6fa8'; c.font = `900 ${Math.max(6, h * 0.14)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('MOTEL', x, t + h * 0.13);
          c.fillStyle = '#7fe0ff'; c.font = `700 ${Math.max(5, h * 0.08)}px system-ui, sans-serif`;
          c.fillText('VACANCY', x, t + h * 0.29);
        }
        break;
      case 'billboard':
        c.fillStyle = '#4a3a2e'; c.fillRect(l + w * 0.15, t + h * 0.5, w * 0.05, h * 0.5); c.fillRect(l + w * 0.8, t + h * 0.5, w * 0.05, h * 0.5);
        c.fillStyle = '#f4ecd8'; c.fillRect(l, t, w, h * 0.55);
        c.strokeStyle = '#2b2420'; c.lineWidth = Math.max(1, w * 0.01); c.strokeRect(l, t, w, h * 0.55);
        if (w > 30 && text) {
          c.fillStyle = '#b3261e'; c.font = `900 ${Math.max(6, h * 0.09)}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(text, x, t + h * 0.27, w * 0.92);
        }
        break;
      case 'mailbox':
        c.fillStyle = '#5a3e2b'; c.fillRect(x - w * 0.08, t + h * 0.35, w * 0.16, h * 0.65);
        c.fillStyle = '#3d6fd6'; roundRect(c, l, t, w, h * 0.38, w * 0.3); c.fill();
        c.fillStyle = '#e0453a'; c.fillRect(x + w * 0.3, t - h * 0.1, w * 0.08, h * 0.25);
        break;
      case 'door':
        c.fillStyle = '#7a5235'; c.fillRect(l, t, w, h);
        c.fillStyle = '#ffe8a8'; c.fillRect(l + w * 0.12, t + h * 0.06, w * 0.5, h * 0.9);
        c.fillStyle = '#a0704a'; c.fillRect(l + w * 0.45, t + h * 0.06, w * 0.43, h * 0.9);
        c.fillStyle = '#ffd166'; c.beginPath(); c.arc(l + w * 0.52, t + h * 0.55, Math.max(1, w * 0.04), 0, Math.PI * 2); c.fill();
        break;
      case 'pawn': case 'rook': {
        const dark = (Math.floor(x * 7 + gy) & 1) === 0;
        c.fillStyle = dark ? '#1d1d24' : '#f4f0e6';
        c.strokeStyle = dark ? '#f4f0e6' : '#1d1d24'; c.lineWidth = Math.max(1, w * 0.02);
        c.beginPath();
        c.moveTo(l, gy); c.lineTo(l + w, gy); c.lineTo(x + w * 0.32, gy - h * 0.15); c.lineTo(x + w * 0.2, gy - h * 0.62); c.lineTo(x - w * 0.2, gy - h * 0.62); c.lineTo(x - w * 0.32, gy - h * 0.15);
        c.closePath(); c.fill(); c.stroke();
        if (kind === 'pawn') { c.beginPath(); c.arc(x, t + h * 0.2, w * 0.24, 0, Math.PI * 2); c.fill(); c.stroke(); }
        else { c.fillRect(x - w * 0.32, t, w * 0.64, h * 0.4); c.strokeRect(x - w * 0.32, t, w * 0.64, h * 0.4); c.fillStyle = dark ? '#f4f0e6' : '#1d1d24'; c.fillRect(x - w * 0.08, t, w * 0.16, h * 0.1); }
        break;
      }
      case 'lamp':
        c.fillStyle = '#2b2420'; c.fillRect(x - w * 0.05, t + h * 0.3, w * 0.1, h * 0.7); c.fillRect(l + w * 0.2, gy - h * 0.04, w * 0.6, h * 0.04);
        c.fillStyle = '#ffd98a'; c.beginPath(); c.moveTo(l + w * 0.15, t + h * 0.32); c.lineTo(l + w * 0.85, t + h * 0.32); c.lineTo(l + w * 0.65, t); c.lineTo(l + w * 0.35, t); c.closePath(); c.fill();
        break;
      case 'armchair':
        c.fillStyle = '#8c3a5a'; roundRect(c, l + w * 0.1, t, w * 0.8, h * 0.75, w * 0.12); c.fill();
        c.fillStyle = '#a84a6e'; roundRect(c, l, t + h * 0.35, w * 0.22, h * 0.55, w * 0.08); c.fill(); roundRect(c, l + w * 0.78, t + h * 0.35, w * 0.22, h * 0.55, w * 0.08); c.fill();
        c.fillStyle = '#c45c84'; c.fillRect(l + w * 0.2, t + h * 0.55, w * 0.6, h * 0.25);
        c.fillStyle = '#3a2420'; c.fillRect(l + w * 0.1, gy - h * 0.1, w * 0.08, h * 0.1); c.fillRect(l + w * 0.82, gy - h * 0.1, w * 0.08, h * 0.1);
        break;
      case 'clock':
        c.fillStyle = '#6b4226'; roundRect(c, l, t, w, h, w * 0.1); c.fill();
        c.fillStyle = '#f4ecd8'; c.beginPath(); c.arc(x, t + w * 0.55, w * 0.38, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#2b2420'; c.lineWidth = Math.max(1, w * 0.05);
        c.beginPath(); c.moveTo(x, t + w * 0.55); c.lineTo(x + Math.cos(this.time) * w * 0.3, t + w * 0.55 + Math.sin(this.time) * w * 0.3); c.stroke();
        c.fillStyle = '#d9b06b'; c.fillRect(x - w * 0.04, t + h * 0.5, w * 0.08, h * 0.3 + Math.sin(this.time * 3) * h * 0.05);
        break;
      case 'piano':
        c.fillStyle = '#1d1a22'; c.fillRect(l, t, w, h);
        c.fillStyle = '#f4f0e6'; c.fillRect(l + w * 0.05, t + h * 0.45, w * 0.9, h * 0.15);
        c.fillStyle = '#1d1a22'; for (let i = 1; i < 12; i++) c.fillRect(l + w * 0.05 + (w * 0.9 * i) / 12, t + h * 0.45, Math.max(0.5, w * 0.012), h * 0.15);
        break;
      case 'moonpole':
        c.fillStyle = '#9a8fb8'; c.fillRect(x - w * 0.04, t + h * 0.3, w * 0.08, h * 0.7);
        c.fillStyle = '#f0f0ff'; c.beginPath(); c.arc(x, t + w * 0.4, w * 0.4, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#05040e'; c.beginPath(); c.arc(x + w * 0.16, t + w * 0.32, w * 0.34, 0, Math.PI * 2); c.fill();
        break;
      case 'letter':
        c.fillStyle = '#f4ecd8'; c.strokeStyle = '#2b2420'; c.lineWidth = Math.max(1, w * 0.03);
        c.font = `700 ${h * 1.1}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'bottom';
        c.strokeText(text || 'A', x, gy + h * 0.1); c.fillText(text || 'A', x, gy + h * 0.1);
        break;
      case 'tv':
        c.fillStyle = '#3a3340'; roundRect(c, l, t, w, h * 0.85, w * 0.08); c.fill();
        c.fillStyle = '#c9c4d8'; c.fillRect(l + w * 0.1, t + h * 0.1, w * 0.62, h * 0.6);
        c.fillStyle = 'rgba(40,30,60,0.5)'; for (let i = 0; i < 6; i++) c.fillRect(l + w * 0.1, t + h * (0.12 + ((i * 0.1 + this.time * 0.7) % 0.58)), w * 0.62, Math.max(0.5, h * 0.03));
        c.strokeStyle = '#3a3340'; c.lineWidth = Math.max(1, w * 0.02); c.beginPath(); c.moveTo(x - w * 0.1, t); c.lineTo(x - w * 0.3, t - h * 0.3); c.moveTo(x + w * 0.1, t); c.lineTo(x + w * 0.3, t - h * 0.3); c.stroke();
        break;
      case 'pothole':
        c.fillStyle = 'rgba(20,14,24,0.85)'; c.beginPath(); c.ellipse(x, gy - h * 0.5, w / 2, Math.max(1, h * 0.6), 0, 0, Math.PI * 2); c.fill();
        break;
      case 'tumbleweed':
        c.strokeStyle = '#9a7a4a'; c.lineWidth = Math.max(1, w * 0.04);
        c.beginPath();
        for (let i = 0; i < 6; i++) { const a = this.time * 4 + i; c.moveTo(x + Math.cos(a) * w * 0.45, t + h / 2 + Math.sin(a) * h * 0.45); c.lineTo(x + Math.cos(a + 2.5) * w * 0.45, t + h / 2 + Math.sin(a + 2.5) * h * 0.45); }
        c.stroke();
        break;
      case 'cone':
        c.fillStyle = '#ff7a2a'; c.beginPath(); c.moveTo(l, gy); c.lineTo(l + w, gy); c.lineTo(x, t); c.closePath(); c.fill();
        c.fillStyle = '#fff'; c.fillRect(x - w * 0.22, t + h * 0.45, w * 0.44, h * 0.12);
        break;
      case 'fragment': {
        const bob = Math.sin(this.time * 4 + x * 0.05) * h * 0.08;
        const gr = c.createRadialGradient(x, t + h * 0.5 + bob, 1, x, t + h * 0.5 + bob, w * 0.6);
        gr.addColorStop(0, 'rgba(255,240,180,0.95)'); gr.addColorStop(0.4, 'rgba(255,200,120,0.5)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(x, t + h * 0.5 + bob, w * 0.6, 0, Math.PI * 2); c.fill();
        if (w > 26 && text) {
          c.font = `italic 700 ${Math.max(7, w * 0.28)}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillStyle = '#5a3b00'; c.fillText(text, x, t + h * 0.5 + bob);
        }
        break;
      }
      case 'gas':
        c.fillStyle = '#e0453a'; roundRect(c, l, t + h * 0.15, w, h * 0.85, w * 0.12); c.fill();
        c.fillStyle = '#ffd166'; c.fillRect(l + w * 0.6, t, w * 0.25, h * 0.2);
        c.fillStyle = '#fff'; c.fillRect(l + w * 0.2, t + h * 0.45, w * 0.6, h * 0.1);
        break;
    }
  }

  drawCar(ctx, VW, VH) {
    const form = CARS[this.tier];
    const lift = this.y * 0.06;
    const bounce = Math.sin(this.time * 22) * (this.speed / MAX_SPEED) * 1.2;
    const x = VW / 2, gy = VH - 14 - lift + bounce;
    const tilt = this.input.dir * 0.05;
    ctx.save();
    ctx.translate(x, gy);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, lift - bounce + 4, 70 - lift * 0.3, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(tilt);
    if (this.invuln > 0 && Math.floor(this.time * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    const wheel = (wx) => { ctx.fillStyle = '#1a1820'; roundRect(ctx, wx - 11, -18, 22, 20, 5); ctx.fill(); };
    if (form === 'wagon' || form === 'convertible') {
      wheel(-46); wheel(46);
      ctx.fillStyle = form === 'wagon' ? '#2f8f8a' : '#d6334a';
      roundRect(ctx, -62, -46, 124, 36, 10); ctx.fill();
      if (form === 'wagon') { ctx.fillStyle = '#2a7a76'; roundRect(ctx, -50, -78, 100, 36, 10); ctx.fill(); ctx.fillStyle = 'rgba(160,210,230,0.55)'; roundRect(ctx, -44, -74, 88, 28, 6); ctx.fill(); }
      ctx.fillStyle = '#ff4d5e'; ctx.fillRect(-58, -38, 16, 8); ctx.fillRect(42, -38, 16, 8);
      ctx.fillStyle = '#c9ced9'; ctx.fillRect(-62, -16, 124, 6);
      ctx.fillStyle = '#f4ecd8'; ctx.fillRect(-14, -28, 28, 9);
      this.drawDriver(ctx, form === 'wagon' ? -58 : -50);
    } else if (form === 'sofa') {
      wheel(-50); wheel(50);
      ctx.fillStyle = '#6b8f3a'; roundRect(ctx, -66, -40, 132, 30, 8); ctx.fill();
      ctx.fillStyle = '#7fa84a'; roundRect(ctx, -60, -78, 120, 44, 12); ctx.fill();
      ctx.fillStyle = '#5a7a30'; roundRect(ctx, -72, -62, 18, 52, 8); ctx.fill(); roundRect(ctx, 54, -62, 18, 52, 8); ctx.fill();
      this.drawDriver(ctx, -60);
    } else if (form === 'bathtub') {
      ctx.fillStyle = '#d9b06b';
      for (const fx of [-48, 48]) { ctx.beginPath(); ctx.arc(fx, -6, 9, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#f4f4f8'; roundRect(ctx, -68, -52, 136, 44, 22); ctx.fill();
      ctx.fillStyle = '#cfe6f4'; ctx.fillRect(-60, -52, 120, 6);
      ctx.fillStyle = '#c9ced9'; ctx.fillRect(56, -76, 5, 26); ctx.fillRect(48, -78, 14, 5);
      this.drawDriver(ctx, -62);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-40 + i * 20, -52 + Math.sin(this.time * 3 + i) * 2, 6, 0, Math.PI * 2); ctx.fill(); }
    } else {
      wheel(-50); wheel(50);
      ctx.fillStyle = '#26232b'; roundRect(ctx, -70, -48, 140, 40, 8); ctx.fill();
      ctx.fillStyle = '#f4ecd8'; for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(-56 + i * 14 + r * 7, -36 + r * 14, 4.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#3a3640'; ctx.fillRect(-60, -60, 120, 12);
      ctx.fillStyle = '#fbf6e8'; ctx.fillRect(-40, -110, 80, 52);
      ctx.fillStyle = 'rgba(40,30,30,0.6)'; ctx.font = 'italic 8px Georgia, serif'; ctx.textAlign = 'left';
      ['the road', 'kept going', 'past the', 'last page'].forEach((l, i) => ctx.fillText(l, -34, -98 + i * 11));
      this.drawDriver(ctx, -60, true);
    }
    ctx.restore();
  }

  drawDriver(ctx, seatY, small) {
    const lv = this.level;
    const s = small ? 0.8 : 1;
    if (this.stats.roo) {
      ctx.fillStyle = '#a0704a';
      roundRect(ctx, 14, seatY - 22, 22, 26, 10); ctx.fill();
      ctx.beginPath(); ctx.ellipse(18, seatY - 30, 4, 11, -0.2, 0, Math.PI * 2); ctx.ellipse(31, seatY - 30, 4, 11, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2a3a'; ctx.fillRect(12, seatY - 2, 26, 8);
    }
    const hx = -14, hy = seatY - 6;
    ctx.fillStyle = '#ff5d5d';
    roundRect(ctx, hx - 15 * s, hy - 30 * s, 30 * s, 34 * s, 11 * s); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; roundRect(ctx, hx - 12 * s, hy - 27 * s, 24 * s, 7 * s, 3); ctx.fill();
    if (lv >= 2) { // scarf, streaming in the wind
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx + 10, hy - 6); ctx.quadraticCurveTo(hx + 30, hy - 14 + Math.sin(this.time * 12) * 5, hx + 52, hy - 8 + Math.sin(this.time * 12 + 1) * 7); ctx.stroke();
    }
    if (lv >= 3) { // a fedora
      ctx.fillStyle = '#14161f';
      ctx.beginPath(); ctx.ellipse(hx, hy - 30 * s, 22 * s, 4.5 * s, 0, 0, Math.PI * 2); ctx.fill();
      roundRect(ctx, hx - 12 * s, hy - 42 * s, 24 * s, 13 * s, 4); ctx.fill();
      ctx.fillStyle = '#8a3030'; ctx.fillRect(hx - 12 * s, hy - 33 * s, 24 * s, 3 * s);
    }
    if (lv >= 5) { // a halo, slightly crooked
      ctx.strokeStyle = 'rgba(255,236,150,0.9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(hx, hy - (lv >= 3 ? 52 : 40) * s, 14, 4, 0.15, 0, Math.PI * 2); ctx.stroke();
    }
    if (lv >= 7) { // words orbiting, like the figment in the mind
      ctx.font = 'italic 700 9px Georgia, serif'; ctx.fillStyle = '#ffe08a'; ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) { const a = this.time * 2 + i * 2.1; ctx.fillText(FRAG_WORDS[i * 5], hx + Math.cos(a) * 34, hy - 20 + Math.sin(a) * 10); }
    }
  }

  drawHud(ctx, VW, VH) {
    const x = 14, y = 12, w = 170;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '900 15px system-ui, sans-serif';
    ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(10,8,20,0.6)';
    const head = `LV ${this.level}   leg ${Math.min(LEGS, this.leg + 1)}/${LEGS}`;
    ctx.strokeText(head, x, y); ctx.fillStyle = '#fff8e6'; ctx.fillText(head, x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y + 21, w, 6);
    ctx.fillStyle = '#ffe14f'; ctx.fillRect(x, y + 21, Math.min(w, (w * this.xp) / xpNeed(this.level)), 6);
    ctx.font = '700 15px system-ui, sans-serif';
    let hearts = '';
    for (let i = 0; i < this.stats.maxDents; i++) hearts += i < this.dents ? '♥' : '♡';
    ctx.strokeText(hearts, x, y + 31); ctx.fillStyle = '#ff6a80'; ctx.fillText(hearts, x, y + 31);
    ctx.font = 'italic 12px Georgia, serif';
    const st = `strangeness ${'●'.repeat(this.tier + 1)}${'○'.repeat(4 - this.tier)}`;
    ctx.strokeText(st, x + 70, y + 33); ctx.fillStyle = '#d9c9ff'; ctx.fillText(st, x + 70, y + 33);
    if (this.perks.length) {
      const names = {};
      for (const id of this.perks) names[id] = (names[id] || 0) + 1;
      const line = Object.entries(names).map(([id, n]) => PERKS.find((p) => p.id === id).name.replace('A Kangaroo in a Good Suit', 'Kangaroo') + (n > 1 ? ` ×${n}` : '')).join(' · ');
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.strokeText(line, x, y + 52, VW * 0.6); ctx.fillStyle = '#fff3c4'; ctx.fillText(line, x, y + 52, VW * 0.6);
    }
    if (this.rule) {
      ctx.textAlign = 'center'; ctx.font = 'italic 12px Georgia, serif';
      const txt = RULES.find((r) => r.id === this.rule).text;
      ctx.strokeText(txt, VW / 2, VH - 16); ctx.fillStyle = '#fff3c4'; ctx.fillText(txt, VW / 2, VH - 16);
    }
  }
}

function project(p, wy, wz, camX, camY, camZ, VW, VH) {
  p.cz = wz - camZ;
  p.scale = CAM_D / p.cz;
  p.sx = Math.round(VW / 2 + p.scale * -camX * VW / 2);
  p.sy = Math.round(VH / 2 - p.scale * (wy - camY) * VH / 2);
  p.sw = Math.round(p.scale * ROAD_W * VW / 2);
}

function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

const hexCache = new Map();
function mixHex(a, b, t) {
  const k = `${a}${b}${Math.round(t * 20)}`;
  let v = hexCache.get(k);
  if (!v) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), q = Math.round(t * 20) / 20;
    const ch = (s) => Math.round(((pa >> s) & 255) + ((((pb >> s) & 255) - ((pa >> s) & 255)) * q));
    v = `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    hexCache.set(k, v);
  }
  return v;
}
