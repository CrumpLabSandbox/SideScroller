import { Input } from './input.js';
import { Sound } from './audio.js';
import { Game, MAX_HEARTS } from './game.js';
import { Story, readPref, writePref } from './story.js';
import { CHAPTERS, LAST_CHAPTER } from './chapters.js';
import { drawTouchHints } from './render.js';
import { getArt } from './mind.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const $ = (id) => document.getElementById(id);

const MIN_W = 540, MIN_H = 360, MAX_SCALE = 2.4;
let dpr = 1, scale = 1, VW = 800, VH = 450;
let dprCap = 2;      // lowered automatically if the device can't keep up

const sound = new Sound();
const input = new Input($('touch'));
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const params = new URLSearchParams(location.search);
const debugChapter = params.has('chapter') ? clamp(+params.get('chapter') || 0, 0, LAST_CHAPTER) : null;
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

const screens = { title: $('screen-title'), pause: $('screen-pause') };
let cardTimer = null;
const ui = {
  hearts(n) {
    $('hearts').innerHTML = Array.from({ length: MAX_HEARTS }, (_, i) => `<span class="heart${i < n ? '' : ' off'}">♥</span>`).join('');
  },
  coins(n) { $('coins').textContent = n; },
  score(n) { $('score-val').textContent = n; },
  scoreLabel(t) { $('score-label').textContent = t; },
  show(name) {
    for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
    $('overlay').classList.toggle('hidden', !name);
    $('hud').classList.toggle('dim', !!name);
    if (name) { $('caption').classList.remove('show'); }
    if (name === 'pause') {
      const ch = CHAPTERS[game.chapterIdx];
      $('pause-chapter').textContent = game.road ? 'On the road out of the dream' : game.mind ? 'Inside the mind' : game.chapterIdx > 0 ? `${ch.num} · ${ch.title}` : '';
      updateSettingsBtns();
    }
  },
  caption(text, shown = 0, hint = false) {
    const el = $('caption');
    if (!text) { el.classList.remove('show'); return; }
    el.classList.toggle('hint', !!hint);
    el.firstChild.textContent = text.slice(0, shown);
    el.lastChild.textContent = text.slice(shown);
    el.classList.add('show');
  },
  chapterCard(card) {
    const el = $('chapter-card');
    el.querySelector('.cc-after').innerHTML = card.after
      ? 'after Jonathan Lethem’s ' + card.after.map(([t, y]) => `<i>${t}</i> (${y})`).join(' and ')
      : '';
    el.querySelector('.cc-num').textContent = card.num;
    el.querySelector('.cc-title').textContent = card.title;
    el.classList.add('show');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => el.classList.remove('show'), card.after ? 4200 : 3200);
  },
  endCard(on) { $('end-card').classList.toggle('show', on); },
  arrestHud(on) { $('hud').classList.toggle('arrested', on); },
  // The Mind and the Road replace the side-scroller's HUD with their own.
  altMode(on) {
    document.body.classList.toggle('in-mind', on);
    if (on) { $('chapter-card').classList.remove('show'); $('end-card').classList.remove('show'); }
  },
  roadChoice(choice, onPick) {
    const el = $('road-choice');
    document.body.classList.toggle('choosing', !!choice);
    if (!choice) { el.classList.add('hidden'); return; }
    el.querySelector('.rc-title').textContent = choice.title;
    el.querySelector('.rc-sub').textContent = choice.sub || '';
    const box = el.querySelector('.rc-options');
    box.innerHTML = '';
    choice.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'rc-card' + (i === choice.idx ? ' sel' : '');
      b.innerHTML = `<span class="rc-tag"></span><strong></strong><span class="rc-text"></span>`;
      b.querySelector('.rc-tag').textContent = o.tag || '';
      b.querySelector('strong').textContent = o.name;
      b.querySelector('.rc-text').textContent = o.text;
      b.addEventListener('click', () => { sound.unlock(); onPick(i); });
      box.appendChild(b);
    });
    el.classList.remove('hidden');
  },
  roadChoiceSelect(idx) {
    [...$('road-choice').querySelectorAll('.rc-card')].forEach((b, i) => b.classList.toggle('sel', i === idx));
  },
};

const story = new Story(ui);
const game = new Game(input, sound, ui, story);
const bookmark = () => clamp(+readPref('hd_bookmark', '0') || 0, 0, LAST_CHAPTER);

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, dprCap);
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
function updateSettingsBtns() {
  $('btn-sound-pause').textContent = sound.muted ? 'Sound: off' : 'Sound: on';
  $('btn-narration').textContent = story.enabled ? 'Narration: on' : 'Narration: off';
  $('btn-textsize').textContent = document.body.classList.contains('large-text') ? 'Text: large' : 'Text: normal';
}
function toggleMute() { sound.unlock(); sound.setMuted(!sound.muted); updateSoundBtn(); updateSettingsBtns(); }
updateSoundBtn();
document.body.classList.toggle('large-text', readPref('hd_textsize', 'normal') === 'large');

async function goFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
  } catch (_) { /* unsupported (e.g. iOS Safari) */ }
}

function startGame(chapter) {
  sound.unlock();
  ui.show(null);
  game.start(params.has('road') ? 4 : debugChapter ?? chapter);
  if (params.has('road')) game.enterRoad();   // debug: straight onto the road
}

$('btn-play').addEventListener('click', () => { startGame(0); if (isTouch) goFullscreen(); });
$('btn-continue').addEventListener('click', () => { startGame(bookmark()); if (isTouch) goFullscreen(); });
$('btn-fullscreen').addEventListener('click', () => { sound.unlock(); goFullscreen(); });
$('btn-resume').addEventListener('click', () => { sound.unlock(); game.resume(); });
$('btn-quit').addEventListener('click', () => {
  game.recordBest();
  game.state = 'title';
  game.mind = null;
  game.road = null;
  ui.altMode(false);
  ui.roadChoice(null);
  sound.stopMusic();
  game.newGame(0);
  $('end-card').classList.remove('show');
  $('chapter-card').classList.remove('show');
  showTitle();
});
$('btn-pause').addEventListener('click', () => { sound.unlock(); game.togglePause(); });
$('btn-sound').addEventListener('click', toggleMute);
$('btn-sound-pause').addEventListener('click', toggleMute);
$('btn-narration').addEventListener('click', () => { story.setEnabled(!story.enabled); updateSettingsBtns(); });
$('btn-textsize').addEventListener('click', () => {
  const large = !document.body.classList.contains('large-text');
  document.body.classList.toggle('large-text', large);
  writePref('hd_textsize', large ? 'large' : 'normal');
  updateSettingsBtns();
});
input.onPause = () => { if (['playing', 'respawn', 'mind', 'dying', 'road', 'paused'].includes(game.state)) game.togglePause(); };
input.onMute = toggleMute;
input.onAny = () => sound.unlock();

function showTitle() {
  $('title-best').textContent = game.best;
  $('title-best-row').classList.toggle('hidden', !game.best);
  const bm = debugChapter ?? bookmark();
  const cont = $('btn-continue');
  cont.classList.toggle('hidden', bm < 1);
  if (bm >= 1) cont.textContent = `▶ Continue: ${CHAPTERS[bm].num} · ${CHAPTERS[bm].title}`;
  $('btn-play').textContent = bm >= 1 ? 'From the beginning' : '▶ Play';
  $('btn-play').classList.toggle('primary', bm < 1);
  $('btn-play').classList.toggle('ghost', bm >= 1);
  if (readPref('hd_finished', '0') === '1') $('tagline').textContent = 'A novel in nine parts, after Jonathan Lethem.';
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
let slowFrames = 0, sampled = 0;
function adaptQuality(dt) {
  // If the game runs well below 60fps for a few seconds, render at a lower resolution.
  if (!['playing', 'mind', 'road'].includes(game.state) || dprCap <= 1 || dt > 0.1) return;
  sampled++;
  if (dt > 1 / 45) slowFrames++;
  if (sampled >= 180) {
    if (slowFrames > 90 && dpr > 1) { dprCap = Math.max(1, dpr - 0.5); resize(); }
    sampled = 0; slowFrames = 0;
  }
}
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  adaptQuality(dt);
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 8) { game.step(STEP); acc -= STEP; n++; }
  if (n === 8) acc = 0;
  game.render(ctx, dpr, scale);
  if ((game.state === 'playing' || game.state === 'mind' || (game.state === 'road' && game.road.state === 'drive')) && isTouch) {
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

// Build the Mind's word art while the player is still on the title screen, so the first
// fall into the Mind doesn't stutter.
const warmMind = () => { try { getArt(); } catch (_) { /* built on demand instead */ } };
if ('requestIdleCallback' in window) requestIdleCallback(warmMind, { timeout: 4000 }); else setTimeout(warmMind, 1500);

// Debug handle (used by the automated tests).
window.hollowDash = { game, input, sound, story };
