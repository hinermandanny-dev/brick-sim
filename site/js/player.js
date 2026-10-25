// You: walking, riding the E2 Pro (real power/drag/battery model), curbs, crashes, camera.
import * as THREE from '../vendor/three.module.js';
import { Character } from './character.js';
import { makeScooter, drawScooterScreen, makePathfinder, PathfinderDrive, drawCluster, PF } from './vehicles.js';
import { clamp, angDiff, toast, prompt, pointInPoly, distSeg } from './util.js';

const MPH = 0.44704;
export const MODES = { 1: { n: 'ECO', v: 9.3 * MPH, F: 70 }, 2: { n: 'D', v: 12.4 * MPH, F: 85 }, 3: { n: 'S', v: 18.6 * MPH, F: 100 } }; // E2 Pro: 350 W rated / 750 W peak
const M_RIDER = 75, M_SCOOT = 18.8, G = 9.81, CDA = 0.55, RHO = 1.2, WB = 0.88, BATT_WH = 275;

export class Player {
  constructor(scene, world, roads, traffic, camera, outfit) {
    this.scene = scene; this.world = world; this.roads = roads; this.traffic = traffic; this.cam = camera;
    this.body = new Character(outfit); scene.add(this.body.root);
    this.scooter = makeScooter(); scene.add(this.scooter);
    // the family car: Dan's 2005 Nissan Pathfinder (R51). Drive it with F at the driver's door
    let cc = '#eef0ef'; // Dan: the family Pathfinder is white (25 Oct) try { cc = localStorage.getItem('carColor') || cc; } catch (e) { }
    this.car = { x: 0, z: 0, y: 0, yaw: 0, v: 0, steer: 0, dyn: new PathfinderDrive(), mesh: makePathfinder(cc, outfit) }; scene.add(this.car.mesh);
    this.thr = 0; this.brkP = 0; this.bob = 0; this.vib = 0; this.slabD = 0;
    this.driving = false;
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0; this.vx = 0; this.vz = 0; this.vy = 0;
    this.lookYaw = 0; this.pitch = -0.05; this.fp = true; this.camDist = 4.2;
    this.riding = false; this.v = 0; this.steer = 0; this.mode = 2; this.batt = 1; this.blink = 0; this.light = false;
    this.sc = { x: 0, z: 0, yaw: 0, y: 0, locked: false, lockTo: null, folded: false, carried: false };
    this.keys = {}; this.state = 'idle'; this.fallT = 0; this.kickT = 0; this.jolt = 0; this.inside = null;
    this.walls = []; // extra segment colliders (home interior)
    this.waitNode = -1;
    this.surf = null;
    this.input();
    this.body.setFirstPerson(true);
    this.stats = { dist: 0, top: 0, wh: 0 };
  }
  input() {
    addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; this.keys[e.code] = true; this.onKey && this.onKey(e.code, e); });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) { this.mouseLookT = performance.now(); this.lookYaw -= e.movementX * .0022; this.pitch = clamp(this.pitch - e.movementY * .0022, -1.45, 1.2); }
    });
    addEventListener('wheel', (e) => { if (!this.fp) this.camDist = clamp(this.camDist + e.deltaY * .004, 2, 12); });
  }
  placeCar(x, z, yaw) { const C = this.car; C.x = x; C.z = z; C.yaw = yaw; C.v = 0; C.dyn.v = 0; C.dyn.rev = false; C.dyn.gear = 1; C.y = this.world.surface(x, z).y; }
  nearCar() { const C = this.car; const sx = C.x + Math.cos(C.yaw) * 1.3, sz = C.z - Math.sin(C.yaw) * 1.3; /* driver's door (left side) */ return Math.hypot(sx - this.x, sz - this.z) < 2.2 || Math.hypot(C.x - this.x, C.z - this.z) < 2.6; }
  enterCar() {
    const C = this.car;
    if (this.driving) {
      if (Math.abs(C.v) > 1.2) { toast('Stop the car first.'); return; }
      this.driving = false; this.x = C.x + Math.cos(C.yaw) * 1.6; this.z = C.z - Math.sin(C.yaw) * 1.6; this.yaw = this.lookYaw = C.yaw; this.body.root.visible = true; toast('Parked.'); return;
    }
    if (this.riding || !this.nearCar()) return;
    this.driving = true; this.body.root.visible = false; this.lookYaw = C.yaw; this.pitch = -.05;
    toast('W gas · S brake / reverse · A D steer · Space horn · F get out');
  }
  drive(dt, k) {
    const C = this.car, D = C.dyn;
    const surf = this.world.surface(C.x, C.z); this.surf = surf;
    const yr = D.step(dt, { thr: !!k.KeyW, brk: !!k.KeyS, left: k.KeyA ? 1 : 0, right: k.KeyD ? 1 : 0 }, surf.kind);
    C.v = D.v; C.steer = D.steer; C.yaw += yr * dt;
    const nx = C.x + Math.sin(C.yaw) * C.v * dt, nz = C.z + Math.cos(C.yaw) * C.v * dt;
    const blocked = (x, z) => { for (const [ox, oz] of [[0, 2.35], [0, -2.35], [.92, 1.5], [-.92, 1.5], [.92, -1.5], [-.92, -1.5]]) { const cx = x + Math.sin(C.yaw) * oz + Math.cos(C.yaw) * ox, cz = z + Math.cos(C.yaw) * oz - Math.sin(C.yaw) * ox; const b = this.world.buildingAt(cx, cz); if (b && !b.enterable && !b.store) return true; } return false; };
    if (blocked(nx, nz)) { if (Math.abs(C.v) > 7) { toast('Crunch. That will need a body shop.'); this.onCrash && this.onCrash(); } D.v = C.v = 0; D.pitchV += 1.5 * Math.sign(D.lonA || 1); }
    else { C.x = nx; C.z = nz; }
    for (const o of this.traffic.obstacles(C.x, C.z, 10)) { const dx = C.x - o.x, dz = C.z - o.z; const a = dx * o.hx + dz * o.hz, b = -dx * o.hz + dz * o.hx; if (Math.abs(a) < o.L / 2 + 2.3 && Math.abs(b) < o.W / 2 + .9) { if (Math.abs(C.v) > 4) { toast('Fender bender.'); this.onCrash && this.onCrash(); } C.x -= Math.sin(C.yaw) * C.v * dt; C.z -= Math.cos(C.yaw) * C.v * dt; D.v = C.v = 0; } }
    // suspension follows the ground under each axle (pitch over humps and curb drops), plus fine road texture
    const f = this.world.surface(C.x + Math.sin(C.yaw) * PF.axF, C.z + Math.cos(C.yaw) * PF.axF).y, r = this.world.surface(C.x + Math.sin(C.yaw) * PF.axR, C.z + Math.cos(C.yaw) * PF.axR).y;
    C.y += ((f + r) / 2 - C.y) * Math.min(1, dt * 12); C.grade = Math.atan2(f - r, PF.WB);
    this.vib = (surf.kind === 'grass' ? .012 : surf.kind === 'road' ? .0025 : .005) * Math.min(1, Math.abs(C.v) / 12);
    this.x = C.x; this.z = C.z; this.y = C.y; this.yaw = C.yaw; this.vx = Math.sin(C.yaw) * C.v; this.vz = Math.cos(C.yaw) * C.v;
    if (!this.mouseLookT || performance.now() - this.mouseLookT > 1500) this.lookYaw += angDiff(this.lookYaw, C.yaw) * Math.min(1, dt * 4);
    this.state = 'idle'; this.stats.dist += Math.abs(C.v) * dt; this.stats.top = Math.max(this.stats.top, Math.abs(C.v));
    if (k.Space && !this._hornT) { this._hornT = .6; this.onHorn && this.onHorn(); } if (this._hornT) { this._hornT -= dt; if (this._hornT <= 0) this._hornT = 0; }
    if (this.world.height(C.x, C.z) < -.5 && !(surf.kind === 'road')) { toast('That is the bay. Back to the road.'); D.v = C.v = 0; }
  }
  place(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw; this.lookYaw = yaw; this.y = this.world.height(x, z) + .05;
    this.sc.x = x + Math.cos(yaw) * 1.1; this.sc.z = z - Math.sin(yaw) * 1.1; this.sc.yaw = yaw; this.sc.y = this.world.height(this.sc.x, this.sc.z);
  }
  get speed() { return this.driving ? Math.abs(this.car.v) : this.riding ? Math.abs(this.v) : Math.hypot(this.vx, this.vz); }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    const k = this.keys;
    if (this.state === 'fall') { this.fallT -= dt; this.v *= .9; if (this.fallT <= 0) { this.state = 'idle'; toast('Up you get.'); } this.pose(dt); return; }
    if (this.frozen) { this.pose(dt); return; }
    if (this.driving) this.drive(dt, k); else if (this.riding) this.ride(dt, k); else this.walk(dt, k);
    this.pose(dt);
  }
  walk(dt, k) {
    const run = k.ShiftLeft || k.ShiftRight;
    const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const sp = run ? 3.4 : 1.45;
    const cy = Math.cos(this.lookYaw), sy = Math.sin(this.lookYaw);
    // forward = (sin yaw, cos yaw); right = (-cos yaw, sin yaw)
    let tx = (sy * f - cy * s), tz = (cy * f + sy * s); const L = Math.hypot(tx, tz); if (L > 0) { tx = tx / L * sp; tz = tz / L * sp; }
    const a = 1 - Math.exp(-dt * (L > 0 ? 8 : 10));
    this.vx += (tx - this.vx) * a; this.vz += (tz - this.vz) * a;
    if (this.sc.carried) { this.vx *= .85; this.vz *= .85; }
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    this.moveTo(nx, nz, .3);
    // ground + jumping
    const surf = this.world.surface(this.x, this.z); this.surf = surf;
    let gy = this.inside ? this.inside.floorY : surf.y;
    if (k.Space && this.onGround && !this.sc.carried) { this.vy = 3.6; this.onGround = false; }
    this.vy -= G * dt; this.y += this.vy * dt;
    if (this.y <= gy) { if (this.y < gy - .3 && this.vy > -1) this.y = gy; else this.y = gy; this.vy = 0; this.onGround = true; }
    if (gy - this.y > 0 && gy - this.y < .35) this.y = gy; // step up curbs
    const spd = Math.hypot(this.vx, this.vz);
    if (spd > .2) this.yaw = this.lookYaw; else this.yaw += angDiff(this.yaw, this.lookYaw) * Math.min(1, dt * 3) * (Math.abs(angDiff(this.yaw, this.lookYaw)) > .9 ? 1 : 0);
    this.state = !this.onGround ? 'jump' : spd > 2.2 ? 'run' : spd > .15 ? 'walk' : 'idle';
    this.stats.dist += spd * dt;
    if (this.sc.carried) { this.sc.x = this.x - Math.sin(this.yaw) * -.05 + Math.cos(this.yaw) * .35; this.sc.z = this.z - Math.cos(this.yaw) * -.05 - Math.sin(this.yaw) * .35; this.sc.yaw = this.yaw; }
  }
  ride(dt, k) {
    const md = MODES[this.mode]; const m = M_RIDER + M_SCOOT;
    const brk = (k.KeyS || k.ShiftLeft || k.ShiftRight) ? 1 : 0;
    // thumb throttle: ramps in (softer in ECO), drops fast; brake lever squeezes in over ~0.25 s
    this.thr += ((k.KeyW ? 1 : 0) - this.thr) * (1 - Math.exp(-dt * (k.KeyW ? [0, 2.2, 3.5, 5][this.mode] : 12)));
    this.brkP += (brk - this.brkP) * (1 - Math.exp(-dt * (brk ? 9 : 14)));
    const thr = this.thr > .02 ? this.thr : 0;
    const surf = this.world.surface(this.x, this.z); this.surf = surf;
    const crr = surf.kind === 'grass' ? .055 : surf.kind === 'path' ? .02 : .012;
    // grade from terrain ahead/behind
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hA = this.world.height(this.x + fx, this.z + fz), hB = this.world.height(this.x - fx, this.z - fz); const grade = (hA - hB) / 2;
    let F = 0;
    const kickOK = this.v > .83; // E2 Pro: kick to 3 km/h before the motor engages
    if (thr && kickOK && this.batt > 0) {
      const P = 750 * (this.batt > .1 ? 1 : .5);
      F = Math.min(md.F, P / Math.max(this.v, .5)) * thr;
      if (this.v > md.v) F = 0; else if (this.v > md.v - .4) F *= (md.v - this.v) / .4;
    }
    if (thr && !kickOK && !this._kickHint) { this._kickHint = true; toast('Kick off first (Space): the motor engages at 3 km/h.'); }
    const drag = .5 * RHO * CDA * this.v * this.v + crr * m * G + m * G * grade;
    let a = (F - drag * Math.sign(this.v || 1)) / m;
    if (this.brkP > .01) a -= Math.min(4.6 * this.brkP, this.v / dt) * (this.v > 0 ? 1 : 0); // front drum + rear E-ABS ≈ 4.6 m/s²
    else if (!thr && this.v > 1.5) a -= .35; // KERS: the motor drags a little when you let go of the throttle (energy recovery "medium")
    this.v = Math.max(0, this.v + a * dt);
    if (this.v < .05 && !thr) this.v = 0;
    // battery (motor+controller ~80 %, lights 6 W), a little regen on the brake
    const Pel = F * this.v / .8 + (this.light ? 6 : 2) - (this.brkP > .01 ? Math.min(60, this.v * 25) * .3 : (!thr && this.v > 1.5 ? this.v * 8 : 0));
    this.stats.wh += Pel * dt / 3600; this.batt = clamp(this.batt - Pel * dt / 3600 / BATT_WH, 0, 1);
    // steering: bicycle model, less lock at speed
    const st = (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0);
    const maxSt = clamp(.55 - this.v * .06, .06, .55);
    this.steer += (st * maxSt - this.steer) * (1 - Math.exp(-dt * (st ? 6 : 9)));
    this.yaw += this.v * Math.tan(this.steer) / WB * dt;
    this.lookYaw += angDiff(this.lookYaw, this.yaw) * 0; // free look while riding
    const nx = this.x + Math.sin(this.yaw) * this.v * dt, nz = this.z + Math.cos(this.yaw) * this.v * dt;
    const oy = surf.y;
    if (!this.moveTo(nx, nz, .35)) { if (this.v > 2.5) this.crash('You rode into a wall.'); else this.v = 0; }
    // curbs: compare surface height under the front wheel before / after
    const s2 = this.world.surface(this.x + fx * .4, this.z + fz * .4);
    const dy = s2.y - oy;
    if (dy > .07 && !s2.cut && surf.kind === 'road') {
      const ang = Math.abs(Math.sin(angDiff(this.yaw, this.curbAngle(surf))));
      if (this.v > 3.0 && dy > .1) this.crash('Curb. The 10-inch front wheel did not make it.');
      else if (this.v > 1.4) { this.jolt = .35; this.v *= .6; }
    } else if (dy < -.1 && this.v > 4) this.jolt = .25;
    this.y += (Math.max(s2.y, surf.y) - this.y) * Math.min(1, dt * 18);
    // what the 10" tyres feel: sidewalk slab joints every 1.5 m, coarse asphalt buzz, grass is rough
    this.vib = this.v * (surf.kind === 'grass' ? .004 : surf.kind === 'road' ? .0007 : .0012);
    if (surf.kind === 'sidewalk' || surf.kind === 'path') { this.slabD += this.v * dt; if (this.slabD > 1.5) { this.slabD -= 1.5; if (this.v > 1.5) { this.jolt = Math.max(this.jolt, .08); this.onSlab && this.onSlab(this.v); } } }
    this.vx = Math.sin(this.yaw) * this.v; this.vz = Math.cos(this.yaw) * this.v;
    this.sc.x = this.x; this.sc.z = this.z; this.sc.yaw = this.yaw; this.sc.y = this.y;
    this.state = this.kickT > 0 ? 'kick' : 'ride';
    if (this.kickT > 0) this.kickT -= dt;
    this.stats.dist += this.v * dt; this.stats.top = Math.max(this.stats.top, this.v);
    // car hits
    for (const o of this.traffic.obstacles(this.x, this.z, 8)) if (this.inBox(this.x, this.z, o, .35)) { if (this.v > 2 || o.v > 2) this.crash(o.v > 2 ? 'A car clipped you.' : 'You hit a parked car.'); else this.v = 0; }
    // water
    if (this.world.height(this.x, this.z) < -.4 && !(surf.kind === 'road' && surf.hit && surf.hit.e.way.br)) this.splash();
  }
  curbAngle(surf) { if (!surf.hit) return this.yaw; const a = this.roads.at(surf.hit.e, surf.hit.s); return Math.atan2(a.hx, a.hz); }
  kick() {
    if (!this.riding || this.v > 6) return;
    this.v = Math.min(this.v + 1.25, 3.2); this.kickT = .32; this.onKick && this.onKick();
  }
  crash(msg) {
    this.state = 'fall'; this.fallT = 2.2; this.v = 0; this.vx = this.vz = 0;
    if (this.riding) { this.riding = false; this.sc.x = this.x + Math.cos(this.yaw) * .9; this.sc.z = this.z - Math.sin(this.yaw) * .9; this.sc.yaw = this.yaw + .9; this.scDown = true; }
    toast(msg, 3200); this.onCrash && this.onCrash();
  }
  splash() { toast('Into the water. IPX4 is not a swim rating. Back to shore.', 3500); this.v = 0; this.x = this.lastDry?.[0] ?? this.x; this.z = this.lastDry?.[1] ?? this.z; }
  inBox(x, z, o, pad) { const dx = x - o.x, dz = z - o.z; const a = dx * o.hx + dz * o.hz, b = -dx * o.hz + dz * o.hx; return Math.abs(a) < o.L / 2 + pad && Math.abs(b) < o.W / 2 + pad; }
  // move with building / wall collision (slides along walls)
  moveTo(nx, nz, r) {
    if (this.blocked(nx, nz, r)) {
      if (!this.blocked(nx, this.z, r)) { this.x = nx; return false; }
      if (!this.blocked(this.x, nz, r)) { this.z = nz; return false; }
      return false;
    }
    if (this.world.height(nx, nz) > -.3) this.lastDry = [nx, nz];
    this.x = nx; this.z = nz; return true;
  }
  blocked(x, z, r) {
    for (const w of this.walls) { const [d] = distSeg(x, z, w[0], w[1], w[2], w[3]); if (d < r) return true; }
    if (this.inside) return false;
    const b = this.world.buildingAt(x, z, r); if (b && !(b.enterable)) return true;
    if (!this.riding) for (const o of this.traffic.obstacles(x, z, 6)) if (this.inBox(x, z, o, .15)) return true;
    return false;
  }
  // ---------------------------------------------------------------- interactions
  mount() {
    if (this.riding) { // step off to the left, kickstand down
      if (this.v > 1.5) { toast('Slow down to get off.'); return; }
      this.riding = false; this.v = 0;
      this.x += Math.cos(this.yaw) * .5; this.z -= Math.sin(this.yaw) * .5; this.scDown = false;
      this.onMount && this.onMount(false); return;
    }
    const d = Math.hypot(this.sc.x - this.x, this.sc.z - this.z);
    if (this.sc.carried) { toast('Unfold it first (G).'); return; }
    if (d > 1.8) return;
    if (this.sc.locked) { toast('It is locked. Unlock it first (E).'); return; }
    this.riding = true; this.x = this.sc.x; this.z = this.sc.z; this.yaw = this.sc.yaw; this.v = 0; this.scDown = false;
    this.onMount && this.onMount(true);
  }
  fold() {
    if (this.riding) return;
    const d = Math.hypot(this.sc.x - this.x, this.sc.z - this.z);
    if (this.sc.carried) { this.sc.carried = false; this.sc.folded = false; this.sc.x = this.x + Math.sin(this.yaw) * .8; this.sc.z = this.z + Math.cos(this.yaw) * .8; toast('Unfolded.'); return; }
    if (d < 1.8 && !this.sc.locked) { this.sc.carried = true; this.sc.folded = true; toast('Folded and carrying it (18.8 kg). G to unfold.'); }
  }
  near(px, pz, r) { return Math.hypot(px - this.x, pz - this.z) < r; }
  // ---------------------------------------------------------------- body + camera
  pose(dt) {
    const B = this.body.root;
    B.position.set(this.x, this.y + (this.riding ? 0 : 0), this.z);
    let yaw = this.riding ? this.yaw : this.yaw;
    B.rotation.set(0, yaw, 0);
    const lean = this.riding ? clamp(this.v * this.v * Math.tan(this.steer) / WB / G, -.5, .5) : 0; // + = leaning left (into a left turn)
    this.body.root.rotation.order = 'YXZ'; this.body.root.rotation.z = -lean;
    const look = clamp(-this.pitch, -1, 1) * -1;
    this.body.animate(dt, { mode: this.state === 'ride' || this.state === 'kick' ? this.state : this.state, speed: this.speed, steer: this.steer / .5, lean, look: -this.pitch * .6 });
    // head follows look in first person (yaw offset relative to body)
    if (this.fp) { const rel = clamp(angDiff(yaw, this.lookYaw), -1.3, 1.3); this.body.neck.rotation.y = rel * .9; }
    // scooter
    const S = this.scooter; S.position.set(this.sc.x, (this.riding ? this.y : this.world.surface(this.sc.x, this.sc.z).y), this.sc.z);
    S.rotation.order = 'YXZ'; S.rotation.y = this.sc.yaw; S.rotation.z = this.riding ? -lean : (this.scDown ? Math.PI / 2.1 : -.12);
    if (this.sc.carried) { S.position.y = this.y + .25; S.rotation.z = 0; S.rotation.x = -1.35; }
    else S.rotation.x = 0;
    if (S.userData.fw) { const r = this.v / .127 * dt; S.userData.fw.rotation.x += r; S.userData.rw.rotation.x += r; }
    if (S.userData.steer) S.userData.steer.rotation.y = this.riding ? this.steer * 1.15 : (this.scDown ? 0 : .25);
    if (S.userData.screen && (this.riding || Math.hypot(this.sc.x - this.x, this.sc.z - this.z) < 4)) drawScooterScreen(S, { speed: this.v, batt: this.batt, mode: this.mode, light: this.light, locked: this.sc.locked, on: this.riding || this.batt > 0 && !this.sc.locked && !this.sc.folded, kmh: false });
    S.userData.kick.visible = !this.riding;
    S.userData.lights.color.set(this.light ? '#fff6d8' : '#6b6b62');
    // the car
    const C0 = this.car, D0 = C0.dyn, Cm = C0.mesh, U = Cm.userData;
    Cm.position.set(C0.x, C0.y, C0.z); Cm.rotation.order = 'YXZ'; Cm.rotation.set(-(C0.grade || 0), C0.yaw, 0);
    U.body.rotation.set(-D0.pitch, 0, D0.roll); U.body.position.y = (Math.random() - .5) * (this.driving ? this.vib : 0);
    for (const w of U.wheels) { w.spin.rotation.x += C0.v / PF.r * dt; if (w.front) w.hub.rotation.y = C0.steer; }
    U.wheelG.rotation.z = -D0.hand; // the wheel turns with your hands on it
    for (const o of U.body.children) if (o.userData.tail) o.material.color.set(this.driving && D0.brk > .1 ? '#ff2a1f' : '#6a0c0c');
    U.cab.visible = !this.driving || this.fp; for (const h of U.hands) h.visible = this.driving;
    if (this.driving && (U.cluster.t -= dt) <= 0) { U.cluster.t = 1 / 20; drawCluster(C0, { rpm: D0.rpm, mph: Math.abs(D0.v) / 0.44704, fuel: D0.fuel, temp: D0.temp, sel: D0.sel, odo: D0.odo, blink: this.blink }); }
    if (this.driving && !this.camOverride) {
      const cam = this.cam, C = this.car;
      if (this.fp) { // driver's seat (left), eye 1.43 m: R51s sit tall; your head sways a little against the body roll
        const D = C.dyn, e = new THREE.Vector3(PF.eye[0] - D.latA * .006, PF.eye[1] - D.lonA * .004, PF.eye[2] + D.lonA * .006);
        Cm.updateMatrixWorld(true); e.applyMatrix4(U.body.matrixWorld);
        cam.position.copy(e); cam.rotation.order = 'YXZ'; cam.rotation.set(this.pitch - D.pitch * .6 - (C.grade || 0), this.lookYaw + Math.PI, D.roll * .55);
      } else { const d = 7.5, yawC = this.lookYaw; const cx = C.x - Math.sin(yawC) * d, cz = C.z - Math.cos(yawC) * d; cam.position.set(cx, Math.max(C.y + 2.6, this.world.height(cx, cz) + .5), cz); cam.lookAt(C.x, C.y + 1.2, C.z); }
      return;
    }
    // camera
    const eye = new THREE.Vector3(); this.body.eye(eye);
    if (this.jolt > 0) { this.jolt -= dt; eye.y += Math.sin(this.jolt * 60) * this.jolt * .15; }
    if (this.riding) { this.bob += dt * (8 + this.v); eye.y += (Math.random() - .5) * this.vib + Math.sin(this.bob) * .004 * Math.min(1, this.v / 3); }
    const cam = this.cam;
    if (this.camOverride) { this.camOverride(cam, dt); return; }
    if (this.fp) {
      const fx = Math.sin(this.lookYaw), fz = Math.cos(this.lookYaw);
      cam.position.copy(eye).add(new THREE.Vector3(fx * .09, 0, fz * .09));
      cam.rotation.order = 'YXZ'; cam.rotation.set(this.pitch, this.lookYaw + Math.PI, lean * .7); // you lean with the scooter, a bit less than it
    } else {
      const d = this.camDist; const yawC = this.lookYaw;
      const tx = this.x, ty = this.y + 1.55, tz = this.z;
      const cx = tx - Math.sin(yawC) * d * Math.cos(this.pitch), cz = tz - Math.cos(yawC) * d * Math.cos(this.pitch), cy = ty - Math.sin(this.pitch) * d + .4;
      // pull the camera in front of any wall between you and it
      let f = 1; for (let k = 1; k <= 24; k++) { const u = k / 24; const x = tx + (cx - tx) * u, z = tz + (cz - tz) * u; if ((!this.inside && this.world.buildingAt(x, z, .3) && !this.world.buildingAt(tx, tz)) || this.walls.some(w => distSegHit(tx, tz, x, z, w))) { f = Math.max(.08, (k - 1.5) / 24); break; } }
      const fx2 = tx + (cx - tx) * f, fz2 = tz + (cz - tz) * f, fy2 = ty + (cy - ty) * f;
      cam.position.set(fx2, Math.max(fy2, this.world.height(fx2, fz2) + .4), fz2); cam.lookAt(tx, ty, tz);
    }
    this.body.setFirstPerson(this.fp);
  }
}

function distSegHit(ax, az, bx, bz, w) { // do segments a-b and wall w intersect?
  const [cx, cz, dx, dz] = w; const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d; return t > 0 && t < 1 && u > 0 && u < 1;
}

// (the placeholder sedan makeCar() was replaced by Dan's Pathfinder in vehicles.js, 25 Oct)
