import { Input } from './input.js';
import { Sound } from './audio.js';
import { Game, MAX_HEARTS } from './game.js';
import { drawTouchHints } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const $ = (id) => document.getElementById(id);

const MIN_W = 540, MIN_H = 360, MAX_SCALE = 2.4;
let dpr = 1, scale = 1, VW = 800, VH = 450;

const sound = new Sound();
const input = new Input($('touch'));
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const screens = { title: $('screen-title'), pause: $('screen-pause'), over: $('screen-over') };
const ui = {
  hearts(n) {
    $('hearts').innerHTML = Array.from({ length: MAX_HEARTS }, (_, i) => `<span class="heart${i < n ? '' : ' off'}">♥</span>`).join('');
  },
  coins(n) { $('coins').textContent = n; },
  score(n) { $('score').textContent = n; },
  show(name) {
    for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
    $('overlay').classList.toggle('hidden', !name);
    $('hud').classList.toggle('dim', !!name);
  },
  gameOver(r) {
    $('over-score').textContent = r.score;
    $('over-dist').textContent = `${r.distance} m`;
    $('over-coins').textContent = r.coins;
    $('over-kills').textContent = r.kills;
    $('over-best').textContent = r.best;
    $('over-newbest').classList.toggle('hidden', !r.isBest);
    this.show('over');
  },
};

const game = new Game(input, sound, ui);

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = window.innerWidth, ch = window.innerHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  scale = Math.min(cw / MIN_W, ch / MIN_H, MAX_SCALE);
  VW = cw / scale; VH = ch / scale;
  game.setView(VW, VH);
  document.body.classList.toggle('portrait', ch > cw * 1.1);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ---- UI wiring --------------------------------------------------------------
function updateSoundBtn() {
  $('btn-sound').textContent = sound.muted ? '🔇' : '🔊';
  $('btn-sound').setAttribute('aria-label', sound.muted ? 'Unmute' : 'Mute');
}
function toggleMute() { sound.unlock(); sound.setMuted(!sound.muted); updateSoundBtn(); }
updateSoundBtn();

async function goFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
  } catch (_) { /* unsupported (e.g. iOS Safari) */ }
}

function startGame() {
  sound.unlock();
  ui.show(null);
  game.start();
}

$('btn-play').addEventListener('click', () => { startGame(); if (isTouch) goFullscreen(); });
$('btn-fullscreen').addEventListener('click', () => { sound.unlock(); goFullscreen(); });
$('btn-retry').addEventListener('click', () => { startGame(); });
$('btn-resume').addEventListener('click', () => { sound.unlock(); game.resume(); });
$('btn-quit').addEventListener('click', () => { game.state = 'title'; sound.stopMusic(); game.newGame(); showTitle(); });
$('btn-pause').addEventListener('click', () => { sound.unlock(); game.togglePause(); });
$('btn-sound').addEventListener('click', toggleMute);
$('btn-sound-pause').addEventListener('click', () => { toggleMute(); $('btn-sound-pause').textContent = sound.muted ? 'Sound: off' : 'Sound: on'; });
input.onPause = () => { if (game.state === 'playing' || game.state === 'paused') game.togglePause(); };
input.onMute = toggleMute;
input.onAny = () => sound.unlock();

function showTitle() {
  $('title-best').textContent = game.best;
  $('title-best-row').classList.toggle('hidden', !game.best);
  $('controls-hint').textContent = isTouch
    ? 'Left side: ◀ ▶ move · Right side: ▲ jump · hold for higher, tap again to double jump'
    : '← → / A D move · Space / ↑ jump (hold for higher, press again to double jump) · P pause · M mute';
  ui.show('title');
}
showTitle();

document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });

// ---- loop -------------------------------------------------------------------
const STEP = 1 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 8) { game.step(STEP); acc -= STEP; n++; }
  if (n === 8) acc = 0;
  game.render(ctx, dpr, scale);
  if (game.state === 'playing' && isTouch) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTouchHints(ctx, input.zones, window.innerWidth, window.innerHeight, true);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- PWA --------------------------------------------------------------------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Debug handle (used by the automated smoke test).
window.hollowDash = { game, input, sound };
