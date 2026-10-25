// Dan's two vehicles, modelled from their real numbers:
//  - Segway Ninebot KickScooter E2 Pro: 1050 x 470 x 1130 mm folded-out, 10" tyres, steerable bar with the
//    integrated dashboard (speed, battery bars, mode, headlight, Bluetooth) drawn live on a canvas screen.
//  - 2005 Nissan Pathfinder (R51): 4.74 m long, 2.85 m wheelbase, 1.85 m wide, ~2,000 kg, 4.0 VQ40DE V6
//    (270 hp @ 5600, 291 lb-ft @ 4000), 5-speed automatic (RE5R05A ratios), 265/70R16 tyres. Exterior + a driver's
//    cabin you can sit in: binnacle with live tach / speedo / fuel / temp, the wheel turning with your hands on it,
//    real reflecting mirrors, A-pillars and the hood in view. PathfinderDrive is the drivetrain + chassis model.
import * as THREE from '../vendor/three.module.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const MPH = 0.44704;

// =============================================================== E2 Pro
export function makeScooter() {
  const g = new THREE.Group();
  const body = lam('#34383c'), trim = lam('#8d9399'), gray = lam('#5c6166'), rub = lam('#161617'), alu = lam('#b4b9be'), blk = lam('#1d1f22');
  const led = new THREE.MeshBasicMaterial({ color: '#fff6d8' }), red = new THREE.MeshBasicMaterial({ color: '#7a0f0f' });
  const add = (par, geo, mat, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; par.add(o); return o; };
  // deck: 0.53 m long, 0.17 wide, top 0.155 m, rounded nose and tail, grey side trim
  add(g, box(.17, .05, .5), body, 0, .13, -.03);
  for (const z of [.22, -.28]) { const c = add(g, new THREE.CylinderGeometry(.085, .085, .05, 14), body, 0, .13, z); c.scale.z = .45; }
  add(g, box(.152, .006, .5), lam('#2a2c2e'), 0, .158, -.03);                  // grip mat
  for (const x of [.087, -.087]) add(g, box(.006, .018, .5), trim, x, .14, -.03); // side trim
  // rear: swing arm, fender arc with the foot brake pad and the tail light under it
  add(g, box(.05, .035, .16), gray, .05, .127, -.33); add(g, box(.05, .035, .16), gray, -.05, .127, -.33);
  for (let k = 0; k < 7; k++) { const a = -.15 + k * .3; const r = .16; add(g, box(.075, .012, .065), body, 0, .127 + Math.cos(a) * r, -.4 + Math.sin(a) * r, a); }
  add(g, box(.07, .006, .08), rub, 0, .292, -.4);                                // brake pad on the fender
  add(g, box(.06, .022, .02), red, 0, .2, -.535).userData.tail = true;
  // front neck + folding latch with its lever, the steering pivot (rake 13°)
  add(g, box(.09, .07, .12), body, 0, .19, .29, -.5);
  const latch = add(g, box(.07, .05, .05), alu, 0, .3, .335); add(g, box(.02, .02, .09), gray, .045, .3, .3);
  const pivot = new THREE.Group(); pivot.position.set(0, .27, .345); pivot.rotation.x = -.227; g.add(pivot);
  const steer = new THREE.Group(); pivot.add(steer);
  // stem, headlight under the bar, front fork + fender + wheel (all turn with the bar)
  add(steer, box(.042, .82, .042), gray, 0, .44, 0); add(steer, box(.05, .1, .05), alu, 0, .05, 0);
  const lamp = add(steer, new THREE.CylinderGeometry(.026, .03, .02, 12), led, 0, .74, .03, Math.PI / 2);
  add(steer, box(.06, .055, .035), body, 0, .74, .012);
  const fork = new THREE.Group(); fork.rotation.x = .227; fork.position.set(0, -.02, 0); steer.add(fork); // forks hang plumb
  for (const x of [.04, -.04]) add(fork, box(.012, .16, .03), gray, x, -.07, .03);
  for (let k = 0; k < 6; k++) { const a = -.1 + k * .27; add(fork, box(.07, .01, .06), body, 0, -.143 + Math.cos(a) * .158, .045 + Math.sin(a) * .158, a); }
  // handlebar: 0.47 m wide, grips, thumb throttle (right), brake lever + bell (left), dashboard pod in the middle
  const bar = new THREE.Group(); bar.position.set(0, .87, 0); bar.rotation.x = .227; steer.add(bar);
  add(bar, new THREE.CylinderGeometry(.012, .012, .47, 8), gray, 0, 0, 0).rotation.z = Math.PI / 2;
  for (const x of [.2, -.2]) add(bar, new THREE.CylinderGeometry(.018, .018, .1, 10), rub, x, 0, 0).rotation.z = Math.PI / 2;
  add(bar, box(.03, .035, .025), blk, -.135, .005, .02); add(bar, box(.11, .008, .02), alu, .16, -.01, .045); // throttle paddle (rider's right = -x), brake lever
  add(bar, new THREE.CylinderGeometry(.015, .015, .012, 10), alu, .12, .02, 0);                                  // bell
  add(bar, box(.13, .034, .085), blk, 0, .012, -.005);
  const scr = document.createElement('canvas'); scr.width = 192; scr.height = 112; const stex = new THREE.CanvasTexture(scr); stex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.1, .058), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }));
  screen.position.set(0, .03, -.006); screen.rotation.set(-Math.PI / 2 + .55, Math.PI, 0); bar.add(screen);
  // drink holder velcroed to the stem (Dan's)
  add(steer, new THREE.CylinderGeometry(.045, .04, .11, 12), lam('#3d3f42'), .052, .5, .0); add(steer, box(.03, .05, .05), lam('#222'), .028, .5, 0);
  // wheels: 10" pneumatic, 0.127 m radius, grey 5-spoke hubs
  const wheel = (par, x, y, z) => { const w = new THREE.Group(); const t = new THREE.Mesh(new THREE.TorusGeometry(.1, .03, 8, 20), rub); t.rotation.y = Math.PI / 2; const h = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .045, 10), alu); h.rotation.z = Math.PI / 2; w.add(t, h); for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(box(.05, .012, .1), gray); s.rotation.x = k * Math.PI * 2 / 5; w.add(s); } w.position.set(x, y, z); par.add(w); return w; };
  const rw = wheel(g, 0, .127, -.4);
  const fw = wheel(fork, 0, -.143, .045);
  const ks = add(g, box(.018, .15, .018), gray, .085, .07, -.05); ks.rotation.z = -.45;
  g.userData = { fw, rw, kick: ks, lights: led, steer, screen: { c: scr, tex: stex, t: 0, last: '' }, latch, lamp };
  return g;
}
// draws the E2 Pro dashboard: big speed digits, 5 battery bars, mode letter, headlight + Bluetooth icons, lock
export function drawScooterScreen(S, st) {
  const u = S.userData.screen; const key = [Math.round(st.kmh ? st.speed * 3.6 : st.speed / MPH), Math.ceil(st.batt * 5), st.mode, st.light, st.locked, st.on].join('|');
  if (key === u.last) return; u.last = key;
  const g = u.c.getContext('2d'), W = u.c.width, H = u.c.height;
  g.fillStyle = '#0b0d0f'; g.fillRect(0, 0, W, H);
  if (!st.on) { u.tex.needsUpdate = true; return; }
  const fg = '#e8f4ff', dim = 'rgba(232,244,255,.16)';
  g.fillStyle = fg; g.font = 'bold 58px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(Math.round(st.kmh ? st.speed * 3.6 : st.speed / MPH)).padStart(2, ' '), W / 2, 50);
  g.font = 'bold 13px sans-serif'; g.fillText(st.kmh ? 'km/h' : 'mph', W / 2, 86);
  const bars = Math.ceil(st.batt * 5); for (let i = 0; i < 5; i++) { g.fillStyle = i < bars ? (bars <= 1 ? '#ff5b4a' : fg) : dim; g.fillRect(18 + i * 32, 98, 26, 8); }
  g.font = 'bold 22px sans-serif'; g.textAlign = 'left';
  for (const [i, m] of [[1, 'ECO'], [2, 'D'], [3, 'S']]) { if (st.mode !== i) continue; g.fillStyle = st.mode === 3 ? '#ffb340' : st.mode === 1 ? '#7dff9a' : fg; g.fillText(m, 10, 22); }
  g.fillStyle = st.light ? '#7fd3ff' : dim; g.beginPath(); g.arc(W - 22, 20, 8, -Math.PI / 2, Math.PI / 2); g.fill(); for (let k = 0; k < 3; k++) g.fillRect(W - 44, 13 + k * 6, 10, 2.5);
  g.strokeStyle = '#4ea3ff'; g.globalAlpha = .9; g.lineWidth = 2; g.beginPath(); g.moveTo(W - 30, 38); g.lineTo(W - 20, 48); g.lineTo(W - 25, 53); g.lineTo(W - 25, 33); g.lineTo(W - 20, 38); g.lineTo(W - 30, 48); g.stroke(); g.globalAlpha = 1;
  if (st.locked) { g.fillStyle = '#ff5b4a'; g.fillRect(12, 40, 16, 12); g.strokeStyle = '#ff5b4a'; g.beginPath(); g.arc(20, 40, 6, Math.PI, 0); g.stroke(); }
  u.tex.needsUpdate = true;
}

// =============================================================== 2005 Pathfinder (R51)
export const PF = { L: 4.74, W: 1.85, WB: 2.85, mass: 2000, r: .38, track: 1.57, axF: 1.36, axR: -1.49, eye: [.39, 1.43, -.12],
  gears: [3.827, 2.368, 1.52, 1.0, .834], rev: 2.613, fd: 3.357, idle: 650, red: 6500 };
const TQ = [[600, 240], [1000, 285], [2000, 340], [3000, 372], [4000, 395], [4800, 384], [5600, 343], [6200, 300], [6600, 0]]; // N·m, VQ40DE
const torque = (rpm) => { for (let i = 1; i < TQ.length; i++) if (rpm <= TQ[i][0]) { const [a, ta] = TQ[i - 1], [b, tb] = TQ[i]; return ta + (tb - ta) * (rpm - a) / (b - a); } return 0; };

export function makePathfinder(colour = '#a9adb1', outfit = {}) {
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body); // body rolls/pitches on the chassis
  const paint = new THREE.MeshPhongMaterial({ color: colour, shininess: 70, specular: '#555' });
  const plast = lam('#2c2d2f'), chrome = new THREE.MeshPhongMaterial({ color: '#c9ccd0', shininess: 120, specular: '#fff' }), rub = lam('#141414');
  const glass = new THREE.MeshPhongMaterial({ color: '#1c2630', transparent: true, opacity: .32, shininess: 100, specular: '#9ab', side: THREE.DoubleSide, depthWrite: false });
  const inner = lam('#2a2a2c'), cloth = lam('#55524d'), head = lam('#9a968e');
  const add = (par, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; par.add(o); return o; };
  // lower body: 1.84 wide, sill at 0.52, beltline 1.13; hood slopes 1.14 -> 1.06 to the grille
  add(body, box(1.84, .58, 4.46), paint, 0, .82, -.06);
  const hood = add(body, box(1.74, .06, 1.42), paint, 0, 1.12, 1.47, -.05);
  add(body, box(1.84, .3, .25), plast, 0, .58, 2.25); add(body, box(1.84, .3, .22), plast, 0, .58, -2.3); // bumpers
  add(body, box(1.2, .3, .06), chrome, 0, .95, 2.21); for (let k = 0; k < 3; k++) add(body, box(1.16, .025, .07), plast, 0, .86 + k * .08, 2.215); // grille + bars
  for (const x of [.72, -.72]) { add(body, box(.36, .2, .06), new THREE.MeshPhongMaterial({ color: '#dfe3e6', shininess: 90, emissive: '#000' }), x, .98, 2.2).userData.head = true; }
  for (const x of [.86, -.86]) add(body, box(.1, .5, .06), new THREE.MeshBasicMaterial({ color: '#6a0c0c' }), x, 1.13, -2.3).userData.tail = true; // tall R51 tail lamps
  // wheel arch flares + side cladding
  for (const z of [PF.axF, PF.axR]) for (const x of [.93, -.93]) { add(body, box(.06, .1, .95), plast, x, 1.0, z); add(body, box(.06, .32, .12), plast, x, .85, z + .44); add(body, box(.06, .32, .12), plast, x, .85, z - .44); }
  // glasshouse: extruded side profile (raked windshield, near-flat roof, upright rear glass)
  const prof = new THREE.Shape(); prof.moveTo(.75, 1.13); prof.lineTo(-.02, 1.78); prof.lineTo(-2.08, 1.82); prof.lineTo(-2.27, 1.15); prof.lineTo(.75, 1.13);
  const gh = new THREE.ExtrudeGeometry(prof, { depth: 1.62, bevelEnabled: false }); gh.rotateY(-Math.PI / 2); gh.translate(.81, 0, 0); // profile x -> z
  add(body, gh, glass, 0, 0, 0).castShadow = false;
  add(body, box(1.66, .06, 2.12), paint, 0, 1.83, -1.04);                                   // roof
  for (const x of [.6, -.6]) add(body, box(.05, .05, 1.9), plast, x, 1.89, -1.04);          // roof rails
  for (const x of [.8, -.8]) {
    const ap = add(body, box(.07, .9, .1), paint, x, 1.45, .37, -.87); ap.userData.pillar = true;   // A-pillars along the windshield rake
    add(body, box(.08, .66, .12), paint, x, 1.47, -.78);                                             // B
    add(body, box(.08, .66, .34), paint, x, 1.47, -1.72);                                            // C (R51 rear door handle lives here)
    add(body, box(.1, .04, .1), chrome, x * 1.02, 1.62, -1.62);
    add(body, box(.08, .66, .1), paint, x, 1.47, -2.2, .2);                                          // D
  }
  add(body, box(1.62, .06, .05), paint, 0, 1.77, .0); add(body, box(1.62, .1, .05), paint, 0, 1.15, .74); // windshield header + cowl
  // wheels 265/70R16 (0.76 m), 6-spoke alloys; the fronts steer
  const wheels = [];
  for (const [z, f] of [[PF.axF, 1], [PF.axR, 0]]) for (const x of [.79, -.79]) {
    const hub = new THREE.Group(); hub.position.set(x, PF.r, z); g.add(hub); const spin = new THREE.Group(); hub.add(spin);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(PF.r, PF.r, .265, 20), rub); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true; spin.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(.21, .21, .27, 12), chrome); rim.rotation.z = Math.PI / 2; spin.add(rim);
    for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(box(.272, .035, .36), lam('#9ea2a6')); s.rotation.x = k * Math.PI / 3; spin.add(s); }
    wheels.push({ hub, spin, front: f });
  }
  // ---- cabin (what you see from the driver's seat, which is on the left = +x)
  const cab = new THREE.Group(); body.add(cab);
  add(cab, box(1.7, .22, .5), inner, 0, 1.0, .58); add(cab, box(1.7, .07, .62), lam('#3a3a3d'), 0, 1.15, .66, -.12); // dash + padded top
  add(cab, box(.46, .025, .2), inner, PF.eye[0], 1.27, .6, -.12); add(cab, box(.46, .1, .03), inner, PF.eye[0], 1.2, .68);                                                    // binnacle hood
  add(cab, box(.3, .36, .3), inner, 0, .88, .5); add(cab, box(.18, .08, .02), lam('#0d0f10'), 0, 1.03, .348);      // centre stack + radio
  for (let k = 0; k < 3; k++) add(cab, new THREE.CylinderGeometry(.022, .022, .02, 12), lam('#3c3d40'), -.07 + k * .07, .93, .35, Math.PI / 2);
  add(cab, box(.22, .12, .7), inner, 0, .72, -.1); add(cab, box(.04, .12, .04), lam('#1a1a1a'), 0, .82, .05);   // console + shifter
  const gl = document.createElement('canvas'); gl.width = 512; gl.height = 200; const gtex = new THREE.CanvasTexture(gl); gtex.colorSpace = THREE.SRGBColorSpace;
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(.38, .15), new THREE.MeshBasicMaterial({ map: gtex, toneMapped: false }));
  cluster.position.set(PF.eye[0], 1.2, .5); cluster.rotation.set(-.25, Math.PI, 0); cab.add(cluster);
  for (const [x, s] of [[PF.eye[0], 1], [-PF.eye[0], 1]]) { add(cab, box(.52, .12, .52), cloth, x, .62, -.32); add(cab, box(.5, .66, .12), cloth, x, 1.0, -.6, -.12); add(cab, box(.26, .18, .1), cloth, x, 1.42, -.66); }
  add(cab, box(1.5, .14, .5), cloth, 0, .66, -1.3); add(cab, box(1.5, .6, .12), cloth, 0, .98, -1.55, -.1);
  add(cab, box(1.6, .02, 2.2), head, 0, 1.79, -1.0);                                                                 // headliner
  for (const x of [.86, -.86]) add(cab, box(.04, .4, 2.6), lam('#4a4844'), x, .92, -.6);                           // door cards
  // steering wheel: 4-spoke, 0.38 m, column tilted 24°, with your hands at ten and two
  const col = new THREE.Group(); col.position.set(PF.eye[0], .98, .3); col.rotation.x = -.42; cab.add(col);
  add(col, new THREE.CylinderGeometry(.03, .04, .3, 8), inner, 0, 0, .15, Math.PI / 2);
  const wheelG = new THREE.Group(); col.add(wheelG);
  add(wheelG, new THREE.TorusGeometry(.19, .018, 8, 32), lam('#1b1b1c'), 0, 0, 0);
  add(wheelG, new THREE.CylinderGeometry(.055, .055, .05, 14), lam('#222326'), 0, 0, .01, Math.PI / 2);
  add(wheelG, box(.04, .02, .01), chrome, 0, 0, -.017);
  for (const a of [.35, -.35, Math.PI / 2 + 1.0, -Math.PI / 2 - 1.0]) { const sp = add(wheelG, box(.15, .028, .02), lam('#232427'), Math.cos(a) * .1, Math.sin(a) * .1, 0); sp.rotation.z = a; }
  const skin = lam(outfit.skin || '#e0b195'), sleeve = lam(outfit.topCol || '#5b6670'); const hands = [];
  for (const sd of [1, -1]) { // hand on the rim at ten / two, forearm reaching back to the seat
    const hnd = new THREE.Group(); const a = Math.PI / 2 - sd * .95; hnd.position.set(Math.cos(a) * .19, Math.sin(a) * .19, -.02); wheelG.add(hnd);
    add(hnd, box(.05, .085, .045), skin, 0, 0, 0); add(hnd, box(.055, .055, .26), sleeve, 0, -.02, -.15, .25);
    hands.push(hnd);
  }
  // mirrors that really reflect (render targets, updated round-robin while you drive)
  const mirrors = [];
  const mkMirror = (par, x, y, z, w, h, ry, camOff, camYaw) => {
    const rt = new THREE.WebGLRenderTarget(w > .2 ? 256 : 160, w > .2 ? 80 : 112); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const m = add(par, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false }), x, y, z, 0, ry); m.scale.x = -1; m.castShadow = false;
    const cam = new THREE.PerspectiveCamera(w > .2 ? 32 : 26, w / h, .3, 400); mirrors.push({ rt, cam, off: camOff, yaw: camYaw, mesh: m });
  };
  for (const sd of [1, -1]) { const x = sd * 1.0; add(body, box(.06, .14, .22), paint, x, 1.25, .62); add(body, box(.2, .16, .05), paint, x, 1.25, .53); mkMirror(body, x, 1.25, .55, .17, .12, Math.PI + sd * .18, [x + sd * .05, 1.25, .5], Math.PI + sd * .12); }
  add(body, box(.24, .07, .03), inner, 0, 1.68, .02); mkMirror(body, 0, 1.68, .0, .22, .055, Math.PI + .1, [0, 1.75, -2.5], Math.PI);
  g.userData = { body, wheels, wheelG, hands, cluster: { c: gl, tex: gtex, t: 0 }, mirrors, mi: 0, hood, cab, paint };
  return g;
}
// live binnacle: tach (left), speedo (right), fuel + temp, PRND4321 with the gear lit, odometer
export function drawCluster(car, st) {
  const u = car.mesh.userData.cluster; const g = u.c.getContext('2d'), W = u.c.width, H = u.c.height;
  g.fillStyle = '#060607'; g.fillRect(0, 0, W, H);
  const dial = (cx, cy, R, v, max, step, label, big) => {
    const a0 = Math.PI * .75, a1 = Math.PI * 2.25; g.lineWidth = 2;
    for (let x = 0; x <= max + 1e-6; x += step / 2) { const a = a0 + (a1 - a0) * x / max; const major = Math.abs(x / step - Math.round(x / step)) < 1e-6; g.strokeStyle = big && x >= 6000 ? '#ff4630' : '#ffffff'; g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * (R - (major ? 12 : 6)), cy + Math.sin(a) * (R - (major ? 12 : 6))); g.stroke();
      if (major) { g.fillStyle = '#e9edf0'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(big ? String(x / 1000) : String(x), cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22)); } }
    const a = a0 + (a1 - a0) * Math.min(v, max * 1.02) / max; g.strokeStyle = '#ff5a1f'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10); g.lineTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6)); g.stroke();
    g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, 8, 0, 7); g.fill(); g.fillStyle = '#9aa'; g.font = '10px sans-serif'; g.fillText(label, cx, cy + R * .45);
  };
  dial(130, 100, 88, st.rpm, 7000, 1000, 'x1000 r/min', true);
  dial(382, 100, 88, st.mph, 120, 20, 'MPH');
  const small = (cx, v, l, r) => { g.strokeStyle = '#ddd'; g.lineWidth = 2; g.beginPath(); g.arc(cx, 170, 22, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); const a = Math.PI * (1.15 + .7 * v); g.strokeStyle = '#ff5a1f'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, 170); g.lineTo(cx + Math.cos(a) * 20, 170 + Math.sin(a) * 20); g.stroke(); g.fillStyle = '#aaa'; g.font = '9px sans-serif'; g.fillText(l, cx - 18, 186); g.fillText(r, cx + 18, 186); };
  small(256 - 30, st.fuel, 'E', 'F'); small(256 + 30, st.temp, 'C', 'H');
  g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; const sel = ['P', 'R', 'N', 'D', '4', '3', '2', '1'];
  sel.forEach((c, i) => { g.fillStyle = c === st.sel ? '#7cff6b' : '#3a3f3a'; g.fillText(c, 256 - 49 + i * 14, 40); });
  g.fillStyle = '#6fdcff'; g.font = '11px monospace'; g.fillText(String(Math.floor(st.odo)).padStart(6, '0') + ' mi', 256, 72);
  if (st.blink) { g.fillStyle = '#4cff6a'; g.beginPath(); const x = st.blink > 0 ? 40 : W - 40, d = st.blink > 0 ? -1 : 1; g.moveTo(x + d * 12, 20); g.lineTo(x, 12); g.lineTo(x, 28); g.fill(); }
  u.tex.needsUpdate = true;
}
export function renderMirrors(car, R, scene) {
  const U = car.mesh.userData; if (!U.mirrors.length) return;
  const M = U.mirrors[U.mi = (U.mi + 1) % U.mirrors.length]; const b = U.body; b.updateMatrixWorld();
  const p = new THREE.Vector3(...M.off).applyMatrix4(b.matrixWorld); M.cam.position.copy(p);
  M.cam.rotation.order = 'YXZ'; M.cam.rotation.set(-.04, car.yaw + M.yaw, 0); M.cam.updateMatrixWorld();
  const au = R.shadowMap.autoUpdate, rt0 = R.getRenderTarget(); R.shadowMap.autoUpdate = false; M.mesh.visible = false;
  R.setRenderTarget(M.rt); R.render(scene, M.cam); R.setRenderTarget(rt0); R.shadowMap.autoUpdate = au; M.mesh.visible = true;
}

// Drivetrain + chassis: engine torque curve, torque converter, 5-speed auto with a shift schedule and kickdown,
// progressive brakes, tyre grip with understeer, steering-wheel angle with return-to-centre, roll / pitch springs.
export class PathfinderDrive {
  constructor() { this.v = 0; this.rpm = PF.idle; this.gear = 1; this.rev = false; this.shiftT = 0; this.thr = 0; this.brk = 0; this.hand = 0; this.steer = 0;
    this.roll = 0; this.rollV = 0; this.pitch = 0; this.pitchV = 0; this.latA = 0; this.lonA = 0; this.squeal = 0; this.yawRate = 0; this.revHold = 0; this.odo = 61874 + Math.random() * 3000; this.fuel = .62; this.temp = .1; }
  get sel() { return this.rev ? 'R' : Math.abs(this.v) < .2 && this.thr < .01 && this.brk > .1 ? 'P' : 'D'; }
  step(dt, inp, surf) {
    const m = PF.mass, gR = PF.r;
    // pedals and wheel ramp like real feet and hands
    this.thr += ((inp.thr ? 1 : 0) - this.thr) * (1 - Math.exp(-dt * (inp.thr ? 3.2 : 7)));
    const brkIn = inp.brk && !this.rev ? 1 : (inp.thr && this.rev ? 1 : 0);
    this.brk += (brkIn - this.brk) * (1 - Math.exp(-dt * (brkIn ? 4 : 9)));
    // R: hold S at a stop -> reverse; W at a stop in reverse -> drive
    if (Math.abs(this.v) < .3) { if (inp.brk && !this.rev) { this.revHold += dt; if (this.revHold > .45) { this.rev = true; this.revHold = 0; } } else if (inp.thr && this.rev) { this.revHold += dt; if (this.revHold > .3) { this.rev = false; this.revHold = 0; } } else this.revHold = 0; }
    const gas = this.rev ? (inp.brk ? 1 : 0) : this.thr;
    const ratio = this.rev ? PF.rev : PF.gears[this.gear - 1];
    const wheelRpm = Math.abs(this.v) / gR * 60 / (2 * Math.PI) * ratio * PF.fd;
    // torque converter: below its coupling point the engine runs toward stall speed and torque multiplies up to 2x
    const stall = PF.idle + gas * 1900; const eng = Math.max(wheelRpm, PF.idle + gas * 1700 * Math.max(0, 1 - wheelRpm / 2600));
    this.rpm += (Math.min(PF.red + 150, eng) - this.rpm) * (1 - Math.exp(-dt * 9));
    const sr = Math.min(1, wheelRpm / Math.max(this.rpm, 1)); const mult = 1 + Math.max(0, (.85 - sr) / .85) * .45;
    let Te = torque(this.rpm) * gas - (1 - gas) * (18 + this.rpm * .011);
    if (this.rpm > PF.red) Te = Math.min(Te, 0); // limiter
    if (this.shiftT > 0) { this.shiftT -= dt; Te *= .45; }
    let F = Te * mult * ratio * PF.fd * .86 / gR * (this.rev ? -1 : 1);
    if (Math.abs(this.v) < .5 && gas < .01) F = (this.rev ? -1 : 1) * 260 * (1 - this.brk); // idle creep
    // shift schedule (mph by throttle), kickdown, downshift on low rpm
    if (!this.rev && this.shiftT <= 0) {
      const mph = this.v / MPH; const up = [0, 12 + 23 * this.thr, 22 + 36 * this.thr, 35 + 50 * this.thr, 45 + 40 * this.thr][this.gear];
      if (this.gear < 5 && (mph > up || this.rpm > 6100)) { this.gear++; this.shiftT = .32; }
      else if (this.gear > 1) { const lower = PF.gears[this.gear - 2] / PF.gears[this.gear - 1] * wheelRpm; const down = [0, 0, 7, 15, 26, 36][this.gear];
        if ((mph < down - 2) || (this.thr > .85 && lower < 5600 && mph < up * .8)) { this.gear--; this.shiftT = .28; } }
    }
    if (this.rev) this.gear = 1;
    // resistances and brakes (≈0.85 g at full pedal, gentler on grass)
    const mu = surf === 'grass' ? .55 : surf === 'path' ? .75 : .9;
    const crr = surf === 'grass' ? .05 : .013;
    const res = .5 * 1.2 * .45 * 2.9 * this.v * Math.abs(this.v) + crr * m * 9.81 * Math.sign(this.v);
    const Fb = this.brk * mu * 1.02 * m * 9.81;
    let a = (F - res) / m; const vs = Math.sign(this.v);
    if (Fb > 0 && Math.abs(this.v) > .05) { a -= vs * Fb / m; if (Math.sign(this.v + a * dt) !== vs && vs !== 0) { a = -this.v / dt; } }
    a = Math.max(-mu * 9.81 * 1.05, Math.min(mu * 9.81, a));
    this.v += a * dt; if (Math.abs(this.v) < .03 && !gas) this.v = 0;
    this.lonA += (a - this.lonA) * (1 - Math.exp(-dt * 8));
    // steering wheel: 3.2 turns lock to lock (≈ ±10 rad), 17.6:1; hands turn at most ~2 turns/s;
    // speed limits how far you crank it; with no input the caster self-centres it, faster at speed
    const v = Math.abs(this.v); const maxHand = 10 / (1 + v * v / 160);
    const tgt = (inp.left - inp.right) * maxHand; const rate = inp.left || inp.right ? 9 : 2.5 + v * .45;
    this.hand += Math.max(-rate * dt, Math.min(rate * dt, tgt - this.hand));
    this.steer = this.hand / 17.6;
    // yaw from a bicycle model with an understeer gradient, capped by tyre grip -> understeer + squeal past the limit
    let yr = this.v * Math.tan(this.steer) / (PF.WB * (1 + .0028 * this.v * this.v));
    const lim = mu * 9.81 * .82; const lat = Math.abs(yr * this.v);
    this.squeal += ((lat > lim * .8 && v > 6 ? Math.min(1, (lat - lim * .8) / (lim * .4)) : 0) - this.squeal) * (1 - Math.exp(-dt * 6));
    if (lat > lim) yr *= lim / lat;
    this.yawRate = yr; this.latA += (yr * this.v - this.latA) * (1 - Math.exp(-dt * 7));
    // body: roll ~5° at 0.8 g, pitch ~2° dive under hard braking; springs at 1.5 Hz with dampers
    const kR = 2 * Math.PI * 1.4, kP = 2 * Math.PI * 1.7;
    this.rollV += (-this.latA * .0115 - this.roll) * kR * kR * dt - 2 * .45 * kR * this.rollV * dt; this.roll += this.rollV * dt;
    this.pitchV += (this.lonA * .0045 - this.pitch) * kP * kP * dt - 2 * .5 * kP * this.pitchV * dt; this.pitch += this.pitchV * dt;
    this.odo += v * dt / 1609.34; this.fuel = Math.max(0, this.fuel - (gas * this.rpm * 3e-9 + 1e-8) * dt * 60); this.temp = Math.min(.5, this.temp + dt * .003);
    return yr;
  }
}
