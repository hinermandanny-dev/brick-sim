// Small WebAudio synth: hub-motor whine, wind, tyre hum, passing cars, horns, scanner beeps, birds / crickets.
export class Audio {
  constructor() { this.ok = false; }
  start() {
    if (this.ok) return; const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    const c = this.c = new A(); this.ok = true;
    this.master = c.createGain(); this.master.gain.value = .6; this.master.connect(c.destination);
    const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = noise;
    const loop = (filterType, freq, q) => { const s = c.createBufferSource(); s.buffer = noise; s.loop = true; const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); s.start(); return { f, g }; };
    this.wind = loop('lowpass', 500, .5); this.road = loop('bandpass', 180, .8); this.traffic = loop('lowpass', 260, .6);
    this.motor = c.createOscillator(); this.motor.type = 'sawtooth'; this.mg = c.createGain(); this.mg.gain.value = 0; const mf = c.createBiquadFilter(); mf.type = 'bandpass'; mf.frequency.value = 900; mf.Q.value = 3; this.motor.connect(mf); mf.connect(this.mg); this.mg.connect(this.master); this.motor.start();
    this.amb = { t: 0 };
  }
  update(dt, st) {
    if (!this.ok) return; const t = this.c.currentTime;
    const v = st.v || 0;
    this.wind.g.gain.setTargetAtTime(Math.min(.35, v * v * .004), t, .1); this.wind.f.frequency.setTargetAtTime(300 + v * 60, t, .1);
    this.road.g.gain.setTargetAtTime(st.riding ? Math.min(.18, v * .025) * (st.grass ? 2 : 1) : 0, t, .1);
    this.motor.frequency.setTargetAtTime(120 + v * 95, t, .05); this.mg.gain.setTargetAtTime(st.riding && st.throttle ? .05 + v * .006 : st.riding ? .012 : 0, t, .08);
    this.traffic.g.gain.setTargetAtTime(Math.min(.25, st.carNear * .5), t, .2);
    this.amb.t -= dt;
    if (this.amb.t < 0) { this.amb.t = 1.5 + Math.random() * 4; if (st.inside) return; if (st.night > .6) this.cricket(); else if (Math.random() < .6) this.bird(); }
  }
  tone(f, dur, type = 'sine', vol = .2, slide = 0) { if (!this.ok) return; const c = this.c, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; if (slide) o.frequency.linearRampToValueAtTime(f + slide, c.currentTime + dur); g.gain.value = vol; g.gain.exponentialRampToValueAtTime(.001, c.currentTime + dur); o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur); }
  beep(ok = true) { this.tone(ok ? 1850 : 400, .09, 'square', .08); }
  chirp() { this.tone(1200, .05, 'square', .05); setTimeout(() => this.tone(900, .06, 'square', .04), 70); }
  horn() { this.tone(370, .45, 'sawtooth', .12); this.tone(466, .45, 'sawtooth', .1); }
  kick() { if (!this.ok) return; const c = this.c, s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; const g = c.createGain(); g.gain.value = .25; g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .18); s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + .2); }
  thud() { this.tone(70, .35, 'sine', .4, -30); this.kick(); }
  bird() { const f = 2400 + Math.random() * 1800; for (let k = 0; k < 2 + Math.random() * 3; k++) setTimeout(() => this.tone(f, .08, 'sine', .025, (Math.random() - .5) * 900), k * 120); }
  cricket() { for (let k = 0; k < 6; k++) setTimeout(() => this.tone(4300, .03, 'square', .012), k * 45); }
  chime() { this.tone(880, .3, 'sine', .08); setTimeout(() => this.tone(660, .4, 'sine', .08), 220); }
}
