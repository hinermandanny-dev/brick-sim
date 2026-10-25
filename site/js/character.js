// Dan: a jointed, blocky-but-proportioned body with procedural animation, and outfits.
import * as THREE from '../vendor/three.module.js';
import { canvasTex, clamp, lerp } from './util.js';

const box = (w, h, d, ox = 0, oy = 0, oz = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(ox, oy, oz); return g; };
const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });

export const OUTFIT_DEFAULT = { top: 'sweater', bottom: 'long', topCol: '#5b6670', bottomCol: '#3d5372', skin: '#e0b195', hair: '#4a3324', hairStyle: 'short', shoes: '#e8e6e1' };
export const TOPS = { sweater: 'Sweater', tshirt: 'T-shirt', vest: 'Walmart vest' };
export const BOTTOMS = { short: 'Shorts', long: 'Long pants', pj: 'Pajama pants' };
export const TOP_COLS = ['#5b6670', '#2c3e5c', '#7a2e2e', '#2f4f3a', '#d9d4c7', '#1f1f22', '#b07d3a', '#6b5b8a'];
export const BOTTOM_COLS = ['#3d5372', '#2a2b30', '#6f6a5c', '#4b3a2c', '#8c8f94', '#a39d84'];
export const SKINS = ['#f1c9ad', '#e0b195', '#c99272', '#a26e4c', '#7a4f33', '#5a3825'];
export const HAIRS = ['#1c1714', '#4a3324', '#7a5536', '#b08850', '#d9c08a', '#8a3b22'];
export const HAIR_STYLES = { short: 'Short', buzz: 'Buzz', curly: 'Curly', long: 'Long' };

function plaid(base) {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 6, 64); g.fillRect(0, i, 64, 6); }
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 8; i < 64; i += 16) { g.fillRect(i, 0, 2, 64); g.fillRect(0, i, 64, 2); }
  });
}
function knit(base) {
  return canvasTex(64, 64, (g) => { g.fillStyle = base; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(0,0,0,.12)'; for (let x = 0; x < 64; x += 4) for (let y = 0; y < 64; y += 4) if ((x + y) % 8 === 0) g.fillRect(x, y, 2, 4); });
}
function denim(base) {
  return canvasTex(64, 64, (g) => { g.fillStyle = base; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .08})`; g.fillRect(Math.random() * 64, Math.random() * 64, 1, 3); } });
}

export class Character {
  constructor(outfit = OUTFIT_DEFAULT) {
    this.root = new THREE.Group(); this.o = { ...outfit };
    const J = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    // skeleton (metres, standing ~1.78 m)
    this.hips = J(this.root, 0, .98, 0);
    this.spine = J(this.hips, 0, .06, 0);
    this.chest = J(this.spine, 0, .26, 0);
    this.neck = J(this.chest, 0, .25, 0);
    this.head = J(this.neck, 0, .08, 0);
    this.shL = J(this.chest, .22, .2, 0); this.shR = J(this.chest, -.22, .2, 0);
    this.elL = J(this.shL, 0, -.3, 0); this.elR = J(this.shR, 0, -.3, 0);
    this.waL = J(this.elL, 0, -.27, 0); this.waR = J(this.elR, 0, -.27, 0);
    this.hipL = J(this.hips, .1, -.04, 0); this.hipR = J(this.hips, -.1, -.04, 0);
    this.knL = J(this.hipL, 0, -.45, 0); this.knR = J(this.hipR, 0, -.45, 0);
    this.anL = J(this.knL, 0, -.44, 0); this.anR = J(this.knR, 0, -.44, 0);
    this.parts = {};
    this.build();
    this.t = 0; this.state = 'idle'; this.blend = {};
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  }
  mat(k, c, tex) { const m = lam(c); if (tex) { m.map = tex; m.color.set('#ffffff'); } return m; }
  build() {
    for (const k in this.parts) { const m = this.parts[k]; m.parent && m.parent.remove(m); m.geometry.dispose(); }
    this.parts = {};
    const o = this.o, P = this.parts;
    const skin = lam(o.skin), hair = lam(o.hair), shoe = lam(o.shoes), sole = lam('#2b2b2b'), sock = lam('#f2f2f0');
    const topM = o.top === 'sweater' ? this.mat('top', o.topCol, knit(o.topCol)) : lam(o.top === 'vest' ? '#e9e6df' : o.topCol);
    const botTex = o.bottom === 'pj' ? plaid(o.bottomCol) : o.bottom === 'long' ? denim(o.bottomCol) : null;
    const botM = botTex ? this.mat('bot', o.bottomCol, botTex) : lam(o.bottomCol);
    const add = (name, parent, geo, m) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; parent.add(mesh); P[name] = mesh; return mesh; };
    // head: face box, nose, ears, hair cap
    add('headM', this.head, box(.2, .24, .22, 0, .12, 0), skin);
    add('nose', this.head, box(.04, .05, .04, 0, .1, .12), skin);
    add('earL', this.head, box(.03, .06, .05, .105, .12, 0), skin); add('earR', this.head, box(.03, .06, .05, -.105, .12, 0), skin);
    const hs = o.hairStyle;
    add('hair', this.head, hs === 'buzz' ? box(.21, .05, .23, 0, .235, -.005) : hs === 'long' ? box(.23, .12, .25, 0, .22, -.02) : hs === 'curly' ? box(.24, .11, .25, 0, .245, 0) : box(.215, .07, .235, 0, .24, -.005), hair);
    add('hairBack', this.head, box(.215, hs === 'long' ? .26 : .13, .05, 0, hs === 'long' ? .1 : .17, -.11), hair);
    add('eyeL', this.head, box(.035, .02, .01, .05, .15, .111), lam('#2a2018')); add('eyeR', this.head, box(.035, .02, .01, -.05, .15, .111), lam('#2a2018'));
    add('neckM', this.neck, box(.09, .1, .09, 0, .02, 0), skin);
    // torso
    const sweater = o.top === 'sweater';
    add('chestM', this.chest, box(.4, .3, .22, 0, .1, 0), topM);
    add('belly', this.spine, box(.36, .28, .2, 0, .12, 0), topM);
    if (sweater) add('hem', this.spine, box(.37, .05, .21, 0, -.01, 0), lam(new THREE.Color(o.topCol).multiplyScalar(.85)));
    if (o.top === 'vest') {
      const vestM = lam('#24427f');
      add('vestC', this.chest, box(.42, .32, .235, 0, .1, 0), vestM); add('vestB', this.spine, box(.38, .28, .215, 0, .12, 0), vestM);
      add('badge', this.chest, box(.07, .05, .01, .1, .13, .12), lam('#f2c230')); add('vline', this.chest, box(.02, .6, .01, 0, -.04, .119), lam('#e9e6df'));
    }
    add('pelvis', this.hips, box(.36, .16, .2, 0, 0, 0), botM);
    // arms: sleeve length depends on top
    const longSleeve = sweater;
    add('uaL', this.shL, box(.11, .3, .11, 0, -.14, 0), topM); add('uaR', this.shR, box(.11, .3, .11, 0, -.14, 0), topM);
    if (!longSleeve) { add('uaLs', this.shL, box(.095, .14, .095, 0, -.23, 0), skin); add('uaRs', this.shR, box(.095, .14, .095, 0, -.23, 0), skin); }
    add('faL', this.elL, box(.09, .27, .09, 0, -.13, 0), longSleeve ? topM : skin); add('faR', this.elR, box(.09, .27, .09, 0, -.13, 0), longSleeve ? topM : skin);
    if (longSleeve) { add('cuffL', this.elL, box(.095, .04, .095, 0, -.25, 0), lam(new THREE.Color(o.topCol).multiplyScalar(.85))); add('cuffR', this.elR, box(.095, .04, .095, 0, -.25, 0), lam(new THREE.Color(o.topCol).multiplyScalar(.85))); }
    add('hdL', this.waL, box(.08, .1, .05, 0, -.05, .005), skin); add('hdR', this.waR, box(.08, .1, .05, 0, -.05, .005), skin);
    // legs
    const shorts = o.bottom === 'short';
    add('thL', this.hipL, box(.15, .46, .16, 0, -.22, 0), botM); add('thR', this.hipR, box(.15, .46, .16, 0, -.22, 0), botM);
    if (shorts) {
      add('shL', this.knL, box(.11, .42, .12, 0, -.21, 0), skin); add('shR', this.knR, box(.11, .42, .12, 0, -.21, 0), skin);
      add('sockL', this.knL, box(.115, .08, .125, 0, -.39, 0), sock); add('sockR', this.knR, box(.115, .08, .125, 0, -.39, 0), sock);
    } else {
      add('shL', this.knL, box(.13, .43, .14, 0, -.21, 0), botM); add('shR', this.knR, box(.13, .43, .14, 0, -.21, 0), botM);
      if (o.bottom === 'pj') { add('cfL', this.knL, box(.14, .05, .15, 0, -.41, 0), botM); add('cfR', this.knR, box(.14, .05, .15, 0, -.41, 0), botM); }
    }
    // sneakers: upper, sole, toe
    for (const [s, a] of [['L', this.anL], ['R', this.anR]]) {
      add('shoe' + s, a, box(.115, .09, .27, 0, -.04, .05), shoe); add('sole' + s, a, box(.12, .03, .28, 0, -.095, .05), sole);
      add('lace' + s, a, box(.06, .01, .1, 0, .006, .1), lam('#cfcfcf'));
    }
  }
  setOutfit(o) { Object.assign(this.o, o); this.build(); }
  setFirstPerson(fp) { for (const k of ['headM', 'nose', 'earL', 'earR', 'hair', 'hairBack', 'eyeL', 'eyeR', 'neckM']) if (this.parts[k]) this.parts[k].visible = !fp; }
  // pose: procedural animation driven by locomotion state
  animate(dt, st) {
    // st: {mode:'walk'|'ride'|'kick'|'idle'|'fall'|'crouch'|'jump', speed, steer, lean, look (pitch)}
    this.t += dt;
    const R = (j, x = 0, y = 0, z = 0, k = 12) => { const a = 1 - Math.exp(-dt * k); j.rotation.x += (x - j.rotation.x) * a; j.rotation.y += (y - j.rotation.y) * a; j.rotation.z += (z - j.rotation.z) * a; };
    const PY = (j, y, k = 12) => { j.position.y += (y - j.position.y) * (1 - Math.exp(-dt * k)); };
    const v = st.speed || 0;
    let hipY = .98;
    if (st.mode === 'walk' || st.mode === 'run' || st.mode === 'idle') {
      const run = st.mode === 'run';
      const amp = st.mode === 'idle' ? 0 : clamp(v / (run ? 3.6 : 1.5), 0, 1);
      this.ph = (this.ph || 0) + dt * (run ? 2.4 : 1.85) * Math.max(.6, v / (run ? 3.3 : 1.35)) * Math.PI * (amp > 0 ? 1 : 0);
      const s = Math.sin(this.ph), c = Math.cos(this.ph);
      const sw = (run ? .75 : .42) * amp;
      // legs: hip swing, knee bends on the swing phase, foot rolls
      R(this.hipL, -s * sw, 0, .02); R(this.hipR, s * sw, 0, -.02);
      R(this.knL, Math.max(0, c) * (run ? 1.5 : .75) * amp + .04); R(this.knR, Math.max(0, -c) * (run ? 1.5 : .75) * amp + .04);
      R(this.anL, -Math.max(0, -s) * .3 * amp + (s > 0 ? .15 * amp : 0)); R(this.anR, -Math.max(0, s) * .3 * amp + (s < 0 ? .15 * amp : 0));
      // arms counter-swing, elbows bent more when running
      R(this.shL, s * sw * .8, 0, -.08); R(this.shR, -s * sw * .8, 0, .08);
      R(this.elL, -(run ? 1.25 : .25 + amp * .2)); R(this.elR, -(run ? 1.25 : .25 + amp * .2));
      R(this.waL, 0); R(this.waR, 0);
      R(this.spine, run ? .18 : .04 * amp, -s * .06 * amp); R(this.chest, 0, -s * .05 * amp);
      R(this.neck, (st.look || 0) * .35); R(this.head, (st.look || 0) * .45);
      hipY = .98 - Math.abs(c) * .03 * amp - (run ? .04 : 0) + (st.mode === 'idle' ? Math.sin(this.t * 1.7) * .004 : 0);
      if (st.mode === 'idle') { R(this.chest, Math.sin(this.t * 1.7) * .012); }
    } else if (st.mode === 'ride' || st.mode === 'kick') {
      // standing on the deck: left foot forward, right foot behind, knees soft, hands on the grips
      const lean = st.lean || 0, steer = st.steer || 0;
      this.kp = st.mode === 'kick' ? (this.kp || 0) + dt * 3.2 : 0;
      const k = st.mode === 'kick' ? Math.sin(Math.min(this.kp, 1) * Math.PI) : 0;
      R(this.hipL, -.28, .35, 0); R(this.knL, .32); R(this.anL, -.04, 0, 0);
      R(this.hipR, .12 - k * -.55 + k * .45, -.2, -.05 - k * .12); R(this.knR, .3 + k * .5); R(this.anR, .1 + k * .3);
      R(this.spine, .12 + k * .12, .25, -lean * .5); R(this.chest, .1, .15, -lean * .3);
      // arms forward and down to the bar (steer turns the shoulders)
      R(this.shL, -.95 - steer * .3, 0, -.18); R(this.elL, -.55); R(this.waL, .2);
      R(this.shR, -.95 + steer * .3, 0, .18); R(this.elR, -.55); R(this.waR, .2);
      R(this.neck, (st.look || 0) * .35 - .1, -.3); R(this.head, (st.look || 0) * .45, -.1);
      hipY = .98 + .155 - .05 - k * .06; // deck height ~15.5 cm
    } else if (st.mode === 'crouch') {
      R(this.hipL, -1.5); R(this.knL, 2.1); R(this.anL, -.5); R(this.hipR, -1.2, 0, -.2); R(this.knR, 2.3); R(this.anR, -.6);
      R(this.spine, .6); R(this.chest, .2); R(this.shL, -1.2); R(this.shR, -1.3); R(this.elL, -.4); R(this.elR, -.4);
      hipY = .5;
    } else if (st.mode === 'fall') {
      R(this.spine, -1.2, 0, .3, 6); R(this.hipL, -1.0, 0, .3, 6); R(this.hipR, -.4, 0, -.3, 6); R(this.knL, .8, 0, 0, 6); R(this.knR, .3, 0, 0, 6);
      R(this.shL, -2.4, 0, -.5, 6); R(this.shR, -2.2, 0, .5, 6); hipY = .25;
    } else if (st.mode === 'jump') {
      R(this.hipL, -.6); R(this.knL, 1.0); R(this.hipR, -.3); R(this.knR, .8); R(this.shL, -.6, 0, -.3); R(this.shR, -.6, 0, .3); R(this.elL, -.6); R(this.elR, -.6);
    }
    PY(this.hips, hipY, st.mode === 'fall' ? 5 : 14);
  }
  // world position of the eyes (for first person)
  eye(out) { this.head.updateWorldMatrix(true, false); return out.set(0, .15, .07).applyMatrix4(this.head.matrixWorld); }
}

// Segway Ninebot E2 Pro (to scale: 10" wheels, 1.1 m stem, ~15 cm deck) with Dan's velcro drink holder
export function makeScooter() {
  const g = new THREE.Group();
  const dark = lam('#2d3033'), gray = lam('#55595e'), rub = lam('#1a1a1b'), acc = lam('#b9bdc2'), led = new THREE.MeshBasicMaterial({ color: '#fff6d8' }), red = new THREE.MeshBasicMaterial({ color: '#8a1010' });
  const m = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  m(box(.17, .06, .62), dark, 0, .135, -.02);               // deck
  m(box(.15, .006, .56), lam('#3a3d40'), 0, .168, -.02);    // grip tape
  m(box(.08, .04, .15), dark, 0, .2, .3).rotation.x = -.4;  // neck
  const stem = m(box(.045, 1.0, .045), gray, 0, .66, .33); stem.rotation.x = -.13;
  m(box(.56, .03, .03), gray, 0, 1.16, .395);              // handlebar
  m(box(.11, .038, .038), rub, .25, 1.16, .395); m(box(.11, .038, .038), rub, -.25, 1.16, .395);
  m(box(.07, .03, .05), lam('#1e2226'), 0, 1.18, .38);     // display
  m(box(.05, .03, .02), led, 0, .9, .385);                  // headlight on the stem
  m(box(.06, .05, .03), red, 0, .17, -.355);                // tail light
  m(box(.13, .03, .22), dark, 0, .25, -.33).rotation.x = .25; // rear fender
  // drink holder velcroed to the stem
  const cup = m(new THREE.CylinderGeometry(.045, .04, .11, 10), lam('#3d3f42'), .055, .82, .35);
  m(box(.03, .05, .05), lam('#222'), .03, .82, .35);
  const wheel = (z) => { const w = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(.127, .127, .055, 14), rub); t.rotation.z = Math.PI / 2; const h = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .06, 10), acc); h.rotation.z = Math.PI / 2; w.add(t, h); w.position.set(0, .127, z); g.add(w); return w; };
  g.userData.fw = wheel(.36); g.userData.rw = wheel(-.36);
  const ks = m(box(.02, .14, .02), gray, -.08, .07, -.05); g.userData.kick = ks;
  g.userData.lights = led;
  return g;
}
