// WebAudio synthesized SFX and a small looping chiptune. No audio files needed.
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// 8 bars x 8 eighth notes. Chord roots (MIDI) per bar.
const ROOTS = [48, 48, 45, 45, 41, 41, 43, 43];
// Lead melody in MIDI (0 = rest), 64 steps.
const LEAD = [
  72, 0, 76, 0, 79, 76, 0, 72,   74, 0, 72, 0, 69, 0, 0, 0,
  69, 0, 72, 0, 76, 72, 0, 69,   67, 0, 69, 0, 72, 0, 0, 0,
  65, 0, 69, 0, 72, 69, 0, 65,   67, 0, 65, 0, 64, 0, 0, 0,
  67, 0, 71, 0, 74, 71, 0, 67,   72, 0, 74, 0, 76, 0, 79, 0,
];
const BASS_PATTERN = [1, 0, 0, 1, 1, 0, 1, 0];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('hd_muted') === '1';
    this._timer = null;
    this._next = 0;
    this._step = 0;
    this.bpm = 148;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.55;
      this.sfx.connect(this.master);
      this.mus = this.ctx.createGain();
      this.mus.gain.value = 0.18;
      this.mus.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('hd_muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  tone({ f0, f1 = f0, type = 'square', dur = 0.1, vol = 0.3, delay = 0, dest = null, attack = 0.004 }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f0), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest || this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  noise(dur = 0.1, vol = 0.2, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'jump': this.tone({ f0: 320, f1: 640, dur: 0.12, vol: 0.22 }); break;
      case 'djump': this.tone({ f0: 420, f1: 980, dur: 0.15, vol: 0.22 }); this.tone({ f0: 630, f1: 1260, dur: 0.12, vol: 0.12, delay: 0.03 }); break;
      case 'land': this.noise(0.05, 0.12); break;
      case 'coin': this.tone({ f0: 988, dur: 0.06, vol: 0.18 }); this.tone({ f0: 1319, dur: 0.16, vol: 0.18, delay: 0.06 }); break;
      case 'stomp': this.tone({ f0: 260, f1: 60, dur: 0.16, vol: 0.3 }); this.noise(0.12, 0.2); break;
      case 'hurt': this.tone({ f0: 220, f1: 70, type: 'sawtooth', dur: 0.3, vol: 0.3 }); this.noise(0.15, 0.2); break;
      case 'fall': this.tone({ f0: 500, f1: 90, type: 'triangle', dur: 0.6, vol: 0.3 }); break;
      case 'checkpoint': [523, 659, 784, 1047].forEach((f, i) => this.tone({ f0: f, dur: 0.12, vol: 0.2, delay: i * 0.07 })); break;
      case 'heart': [659, 784, 988, 1319].forEach((f, i) => this.tone({ f0: f, type: 'triangle', dur: 0.14, vol: 0.25, delay: i * 0.08 })); break;
      case 'gameover': [440, 415, 392, 349].forEach((f, i) => this.tone({ f0: f, f1: f * 0.98, type: 'sawtooth', dur: 0.28, vol: 0.22, delay: i * 0.22 })); break;
      case 'select': this.tone({ f0: 880, dur: 0.05, vol: 0.15 }); break;
      case 'start': [523, 659, 784].forEach((f, i) => this.tone({ f0: f, dur: 0.1, vol: 0.2, delay: i * 0.06 })); break;
    }
  }

  startMusic() {
    if (!this.ctx || this._timer) return;
    this._next = this.ctx.currentTime + 0.05;
    this._step = 0;
    this._timer = setInterval(() => this._schedule(), 60);
  }

  stopMusic() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _schedule() {
    if (!this.ctx) return;
    const stepDur = 60 / this.bpm / 2;
    while (this._next < this.ctx.currentTime + 0.25) {
      this._playStep(this._step, this._next - this.ctx.currentTime, stepDur);
      this._step = (this._step + 1) % 64;
      this._next += stepDur;
    }
  }

  _playStep(step, delay, stepDur) {
    if (this.muted) return;
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    const root = ROOTS[bar];
    if (BASS_PATTERN[beat]) {
      this.tone({ f0: midi(root - 12), type: 'triangle', dur: stepDur * 0.9, vol: 0.5, dest: this.mus });
    }
    const n = LEAD[step];
    if (n) this.tone({ f0: midi(n), type: 'square', dur: stepDur * 0.8, vol: 0.16, dest: this.mus, attack: 0.01 });
    if (beat % 2 === 1) {
      // soft hi-hat
      const ctx = this.ctx;
      const t = ctx.currentTime + delay;
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.12;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6000;
      src.connect(f).connect(g).connect(this.mus);
      src.start(t);
    }
  }
}
