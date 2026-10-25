// Traffic: IDM car-following on real OSM lanes, junction connectors, signals with actuated phases and
// protected lefts, stop / all-way stop / yield priority, right-on-red, lane changes for turns, blinkers,
// brake lights, curve speeds, parked cars in driveways and lots, and cars that react to you.
import * as THREE from '../vendor/three.module.js';
import { MODELS, pickModel } from './cars.js';
import { laneOff, laneGeom } from './roads.js';
import { rng, hash, clamp, angDiff, CARCOL } from './util.js';

const MPH = 0.44704;
const SPAWN_MIN = 140, SPAWN_MAX = 420, DESPAWN = 520;
const CAP = 160;

class Signal {
  constructor(tr, nid) {
    const R = tr.roads, n = R.nodes[nid]; this.n = n; this.id = nid;
    this.app = []; // approaches: {e, dir, h (arrival heading), grp}
    for (const ei of n.inc) {
      const e = R.edges[ei]; const dir = e.b === nid ? 0 : 1; // travelling dir that arrives here
      if (!R.canDrive(e, dir) || R.lanes(e, dir) <= 0) continue;
      const [dx, dz] = R.leaveDir(e, nid); this.app.push({ e, dir, h: Math.atan2(-dx, -dz), cls: e.cls });
    }
    if (!this.app.length) { this.dead = true; return; }
    const main = this.app.reduce((a, b) => (b.cls > a.cls ? b : a));
    for (const a of this.app) { const d = Math.abs(angDiff(a.h, main.h)); a.grp = (d < 0.6 || d > Math.PI - 0.6) ? 0 : 1; }
    const cA = Math.max(...this.app.filter(a => a.grp === 0).map(a => a.cls)), cB = Math.max(0, ...this.app.filter(a => a.grp === 1).map(a => a.cls));
    this.gA = clamp(28 + (cA - cB) * 9, 22, 70); this.gB = clamp(16 + (cB - 3) * 4, 14, 32);
    this.protA = cA >= 6 && this.app.some(a => a.grp === 1); // county roads and up get a protected left arrow
    // phases: [name, dur]. AL = protected left for group 0, A, Ay, Ar, B, By, Br
    this.ph = [['AL', this.protA ? 8 : 0], ['A', this.gA], ['Ay', 4], ['Ar', 2], ['BL', 0], ['B', this.gB], ['By', 4], ['Br', 2]];
    this.k = 1; this.t = hash(nid) * this.gA; this.heads = [];
  }
  state(grp, turn) { // 'G' | 'Y' | 'R' | 'GA' (protected arrow) for an approach group and turn kind
    const p = this.ph[this.k][0];
    if (p === 'AL') return grp === 0 ? (turn === 'L' ? 'GA' : 'R') : 'R';
    if (p === 'A') return grp === 0 ? 'G' : 'R';
    if (p === 'Ay') return grp === 0 ? 'Y' : 'R';
    if (p === 'B') return grp === 1 ? 'G' : 'R';
    if (p === 'By') return grp === 1 ? 'Y' : 'R';
    return 'R';
  }
  step(dt, demand) {
    this.t += dt;
    const [name, dur] = this.ph[this.k];
    let d = dur;
    if (name === 'A' && !demand[1] && this.t >= dur) d = Math.min(this.t + 1, 120); // actuated: hold main street green until a side street car is waiting
    if (name === 'B' && !demand[1] && this.t > 7) d = 7;                         // gap-out on an empty side street
    if (this.t >= d) { this.t = 0; do { this.k = (this.k + 1) % this.ph.length; } while (this.ph[this.k][1] === 0); }
  }
}

export class Traffic {
  constructor(scene, world, roads) {
    this.scene = scene; this.world = world; this.roads = roads;
    this.cars = []; this.r = rng(1977); this.sig = new Map(); this.conn = new Map(); this.connConf = new Map();
    this.meshes = MODELS.map(m => { const im = new THREE.InstancedMesh(m.geo(), new THREE.MeshLambertMaterial({ vertexColors: true }), CAP); im.count = 0; im.castShadow = true; im.frustumCulled = false; scene.add(im); return im; });
    for (const im of this.meshes) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    // light glows (tail/brake, blinkers, headlights)
    const lg = new THREE.BoxGeometry(.44, .15, .04);
    this.tail = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: '#ffffff' }), CAP * 2); this.tail.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 6), 3); this.tail.frustumCulled = false; scene.add(this.tail);
    this.blink = new THREE.InstancedMesh(new THREE.BoxGeometry(.16, .12, .05), new THREE.MeshBasicMaterial({ color: '#ffb12a' }), CAP * 2); this.blink.frustumCulled = false; scene.add(this.blink);
    this.head = new THREE.InstancedMesh(new THREE.BoxGeometry(.46, .13, .05), new THREE.MeshBasicMaterial({ color: '#fff7dc' }), CAP * 2); this.head.frustumCulled = false; scene.add(this.head);
    const cone = new THREE.PlaneGeometry(3.2, 14); cone.rotateX(-Math.PI / 2); cone.translate(0, 0, 8);
    const coneTex = makeConeTex();
    this.beam = new THREE.InstancedMesh(cone, new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .55 }), CAP); this.beam.frustumCulled = false; scene.add(this.beam);
    // parked cars live per tile as their own instanced meshes
    this.parked = new Map();
    world.listeners.push((ev, t) => ev === 'load' ? this.parkTile(t) : this.unparkTile(t));
    this.sigGroup = new THREE.Group(); scene.add(this.sigGroup);
    this.headGeo = makeSignalGeo();
    this.night = 0; this.horn = null; this.time = 8;
    this.player = null;
  }
  // ---------- signals ----------
  signalAt(nid) {
    if (this.sig.has(nid)) return this.sig.get(nid);
    const n = this.roads.nodes[nid]; let s = null;
    if ((n.f & 1) || (n.f & 32)) { s = new Signal(this, nid); if (s.dead) s = null; else this.buildHeads(s); }
    this.sig.set(nid, s); return s;
  }
  buildHeads(s) {
    const n = s.n, R = this.roads;
    for (const a of s.app) {
      const e = a.e; const lanes = R.lanes(e, a.dir);
      // heads hang on a mast arm on the far side of the junction, over the approach lanes
      const hx = Math.sin(a.h), hz = Math.cos(a.h), rx = -hz, rz = hx; // travel + right
      const far = n.r + 2.5;
      const poleX = n.x + hx * far + rx * (e.way.w / 2 + 2.2), poleZ = n.z + hz * far + rz * (e.way.w / 2 + 2.2);
      const y0 = this.world.height(poleX, poleZ);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, 6.6, 8), this.headGeo.pole); pole.position.set(poleX, y0 + 3.3, poleZ); g.add(pole);
      const reach = e.way.w / 2 + 2.2 - laneOff(e.way, a.dir, Math.max(0, lanes - 1)) + .5;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.14, .14, reach + .4), this.headGeo.pole);
      arm.position.set(poleX - rx * reach / 2, y0 + 6.3, poleZ - rz * reach / 2); arm.rotation.y = Math.atan2(rx, rz); g.add(arm);
      a.lamps = [];
      for (let li = 0; li < lanes; li++) {
        const off = laneOff(e.way, a.dir, li);
        const x = n.x + hx * far + rx * off, z = n.z + hz * far + rz * off;
        const head = new THREE.Group(); head.position.set(x, y0 + 5.6, z); head.rotation.y = a.h + Math.PI;
        const body = new THREE.Mesh(this.headGeo.body, this.headGeo.yellow); head.add(body);
        const L = [];
        for (const [k, col, yy] of [['R', '#ff3b2f', .32], ['Y', '#ffc53a', 0], ['G', '#35e07a', -.32]]) {
          const m = new THREE.MeshBasicMaterial({ color: '#222' }); const lamp = new THREE.Mesh(this.headGeo.lamp, m); lamp.position.set(0, yy, .17); head.add(lamp); L.push([k, m, new THREE.Color(col)]);
        }
        if (li === lanes - 1 && s.protA && a.grp === 0) { // left-arrow section on the inside head
          const m = new THREE.MeshBasicMaterial({ color: '#222' }); const lamp = new THREE.Mesh(this.headGeo.lamp, m); lamp.position.set(-.32, -.32, .17); head.add(lamp); L.push(['GA', m, new THREE.Color('#35e07a')]);
          const ext = new THREE.Mesh(new THREE.BoxGeometry(.32, .32, .3), this.headGeo.yellow); ext.position.set(-.32, -.32, 0); head.add(ext);
        }
        g.add(head); a.lamps.push(L);
      }
      // a pedestrian head on the corner pole for the crossing street
      s.heads.push(g); this.sigGroup.add(g);
    }
  }
  updateSignals(dt) {
    for (const [nid, s] of this.sig) {
      if (!s) continue;
      const near = this.player && Math.hypot(s.n.x - this.player.x, s.n.z - this.player.z) < 700;
      if (!near) { for (const g of s.heads) { this.sigGroup.remove(g); } this.sig.delete(nid); continue; }
      const demand = [0, 0];
      for (const c of this.cars) if (c.waitNode === nid) demand[c.waitGrp] = 1;
      if (this.player && this.player.waitNode === nid) demand[1] = 1;
      s.step(dt, demand);
      for (const a of s.app) {
        const st = s.state(a.grp, 'S'), sl = s.state(a.grp, 'L');
        for (const L of a.lamps) for (const [k, m, col] of L) {
          const on = (k === 'R' && st === 'R' && sl !== 'GA') || (k === 'Y' && st === 'Y') || (k === 'G' && st === 'G') || (k === 'GA' && sl === 'GA');
          m.color.copy(on ? col : DIM);
        }
      }
    }
  }
  // ---------- connectors through a junction ----------
  connector(e1, d1, e2, d2, nid, l1, l2) {
    const key = e1.i + ':' + d1 + ':' + e2.i + ':' + d2 + ':' + l1 + ':' + l2;
    let c = this.conn.get(key); if (c) return c;
    const R = this.roads, n = R.nodes[nid];
    const r1 = Math.min(e1.len * .45, n.r || 0), r2 = Math.min(e2.len * .45, n.r || 0);
    const p0 = this.lanePos(e1, d1, e1.len - r1, laneOff(e1.way, d1, l1));
    const p2 = this.lanePos(e2, d2, r2, laneOff(e2.way, d2, l2));
    // control point: intersection of the two lane lines (fallback: node)
    const den = p0.hx * p2.hz - p0.hz * p2.hx;
    let cx = n.x, cz = n.z;
    if (Math.abs(den) > 0.15) { const t = ((p2.x - p0.x) * p2.hz - (p2.z - p0.z) * p2.hx) / den; if (t > 0 && t < 40) { cx = p0.x + p0.hx * t; cz = p0.z + p0.hz * t; } }
    else { cx = (p0.x + p2.x) / 2; cz = (p0.z + p2.z) / 2; }
    const pts = []; let L = 0, px = p0.x, pz = p0.z; const cum = [0];
    for (let i = 0; i <= 12; i++) { const t = i / 12, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t; const x = a * p0.x + b * cx + d * p2.x, z = a * p0.z + b * cz + d * p2.z; if (i) { L += Math.hypot(x - px, z - pz); cum.push(L); } pts.push(x, z); px = x; pz = z; }
    const turn = R.turnKind(angDiff(Math.atan2(p0.hx, p0.hz), Math.atan2(p2.hx, p2.hz)));
    c = { key, pts, cum, len: Math.max(L, .5), r2, turn, nid, e1, d1, e2, d2 };
    this.conn.set(key, c); return c;
  }
  conflicts(a, b) {
    if (a.key === b.key) return false;
    if (a.e1 === b.e1 && a.d1 === b.d1) return false; // same approach: handled by following
    const k = a.key < b.key ? a.key + '|' + b.key : b.key + '|' + a.key;
    let v = this.connConf.get(k); if (v !== undefined) return v;
    v = false;
    for (let i = 2; i < a.pts.length && !v; i += 2) for (let j = 2; j < b.pts.length; j += 2) if (Math.hypot(a.pts[i] - b.pts[j], a.pts[i + 1] - b.pts[j + 1]) < 2.4) { v = true; break; }
    if (a.e2 === b.e2 && a.d2 === b.d2) v = true; // merging into the same lane
    this.connConf.set(k, v); return v;
  }
  lanePos(e, dir, s, off) { const p = this.roads.at(e, s, dir); return { x: p.x - p.hz * off, z: p.z + p.hx * off, hx: p.hx, hz: p.hz }; }
  // ---------- spawning ----------
  targetCount() {
    const h = this.time % 24;
    const tod = h < 5 ? .12 : h < 6.5 ? .35 : h < 9 ? 1 : h < 15.5 ? .72 : h < 18.5 ? 1 : h < 21 ? .6 : h < 23 ? .35 : .18;
    return Math.round(95 * tod);
  }
  spawn(px, pz, camDir) {
    const R = this.roads, r = this.r;
    for (let tries = 0; tries < 30; tries++) {
      const a = r() * Math.PI * 2, d = SPAWN_MIN + r() * (SPAWN_MAX - SPAWN_MIN);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (!this.world.ready(x, z)) continue;
      const h = R.nearest(x, z, 60, e => e.cls >= 2 && e.way.sv !== 'driveway' && e.way.sv !== 'parking_aisle');
      if (!h) continue;
      const e = h.e; if (r() > (e.cls >= 5 ? 1 : e.cls >= 3 ? .45 : .12)) continue;
      // in front of the camera? only far away
      if (camDir) { const vx = x - px, vz = z - pz; if ((vx * camDir.x + vz * camDir.z) / d > .5 && d < 260) continue; }
      const dirs = [0, 1].filter(dd => R.canDrive(e, dd) && R.lanes(e, dd) > 0); if (!dirs.length) continue;
      const dir = dirs[(r() * dirs.length) | 0]; const s = dir ? e.len - h.s : h.s;
      const lanes = R.lanes(e, dir); const li = (r() * lanes) | 0;
      if (this.cars.some(c => c.e === e && c.dir === dir && Math.abs(c.s - s) < 18)) continue;
      let mi = pickModel(r(), e.cls >= 4);
      const hh = this.time % 24, bell = (hh > 6.8 && hh < 8.4) || (hh > 14 && hh < 15.7);
      if (e.way.bus && r() < .22) mi = 6;                      // NJ Transit on its real route
      else if (bell && e.cls >= 3 && r() < .07) mi = 7;         // school buses at bell times
      const car = this.addCar(e, dir, s, li, mi); if (mi === 6) car.route = e.way.bus;
      return true;
    }
    return false;
  }
  addCar(e, dir, s, li, mi) {
    const r = this.r, M = MODELS[mi];
    const agg = r();
    const c = {
      id: (r() * 1e9) | 0, e, dir, s, li, lat: laneOff(e.way, dir, li), latT: 0, mi, M,
      v: 0, a: 0, col: new THREE.Color(M.white ? '#ffffff' : M.name === 'bus' ? '#ffffff' : CARCOL[(r() * CARCOL.length) | 0]),
      // driver: NJ-flavoured, most go a little over, some a lot
      f: .96 + agg * .2 + (r() < .08 ? .12 : 0), A: 1.5 + agg * 1.1, B: 2.6 + r() * .8, T: 1.55 - agg * .5, S0: 2 + r(),
      conn: null, cs: 0, next: null, stopT: 0, waitNode: -1, waitGrp: 0, blink: 0, brake: 0, lc: 0, honk: 0, arrive: 0,
    };
    c.latT = c.lat; c.v = this.vmax(c) * .75;
    this.plan(c);
    this.cars.push(c); return c;
  }
  vmax(c) { const e = c.conn ? c.next.e : c.e; return Math.max(4, e.way.s * MPH * c.f * (e.way.sv === 'parking_aisle' ? .6 : 1)); }
  // choose the next move at the end of the current edge
  plan(c) {
    const R = this.roads; const mv = R.moves(c.e, c.dir);
    let opts = mv.filter(m => R.turnKind(m.turn) !== 'U');
    if (!opts.length) opts = mv;
    if (!opts.length) { c.next = null; return; }
    let tot = 0; const w = opts.map(m => {
      const k = R.turnKind(m.turn); let x = k === 'S' ? 3 : k === 'R' ? 1.2 : k === 'L' ? 1 : .1;
      if (m.e.way.n && m.e.way.n === c.e.way.n) x *= 2.5;
      if (c.route) x *= m.e.way.bus === c.route ? 40 : .05;   // buses keep to their route
      x *= m.e.cls >= c.e.cls ? 1.4 : m.e.cls >= 3 ? .8 : .15;
      if (m.e.way.sv === 'driveway') x *= .02; if (m.e.way.sv === 'parking_aisle' || m.e.way.t === 'service') x *= .25;
      const far = R.nodes[m.dir === 0 ? m.e.b : m.e.a]; if (far.deg === 1) x *= .15;
      tot += x; return x;
    });
    let q = this.r() * tot, pick = opts[0];
    for (let i = 0; i < opts.length; i++) { q -= w[i]; if (q <= 0) { pick = opts[i]; break; } }
    const kind = R.turnKind(pick.turn), nl = R.lanes(pick.e, pick.dir);
    c.next = { e: pick.e, dir: pick.dir, kind, turn: pick.turn, node: pick.node, li: kind === 'L' ? nl - 1 : kind === 'R' ? 0 : Math.min(nl - 1, c.li) };
    // lane wanted on the approach
    const lanes = R.lanes(c.e, c.dir);
    c.wantLane = kind === 'L' ? lanes - 1 : kind === 'R' ? 0 : c.li;
  }
  // ---------- per-frame ----------
  update(dt, player, camDir) {
    this.player = player; dt = Math.min(dt, .05);
    const px = player.x, pz = player.z;
    // signals near the player
    for (const c of this.cars) { if (c.next && !c.conn && c.e.len - c.s < 80) this.signalAt(c.next.node); }
    this.updateSignals(dt);
    // spawn / despawn
    const want = this.targetCount();
    let n = 0; while (this.cars.length < want && n++ < 3) if (!this.spawn(px, pz, camDir)) break;
    for (let i = this.cars.length - 1; i >= 0; i--) { const c = this.cars[i]; if (Math.hypot(c.x - px, c.z - pz) > DESPAWN || c.dead) this.cars.splice(i, 1); }
    // lane occupancy index
    const lanes = new Map();
    for (const c of this.cars) { const k = c.conn ? 'n' + c.next.e.i + ':' + c.next.dir : c.e.i + ':' + c.dir; if (!lanes.has(k)) lanes.set(k, []); lanes.get(k).push(c); }
    this.lanes = lanes;
    const box = new Map(); for (const c of this.cars) if (c.conn) { const id = c.conn.nid; if (!box.has(id)) box.set(id, []); box.get(id).push(c); }
    this.box = box;
    for (const c of this.cars) this.think(c, dt, player);
    for (const c of this.cars) this.move(c, dt);
    this.draw(player);
  }
  // find the car ahead (gap m, speed) in my lane, across the junction if needed
  leader(c, player) {
    let best = 1e9, bv = 0, bc = null;
    const R = this.roads;
    if (!c.conn) {
      const l = this.lanes.get(c.e.i + ':' + c.dir) || [];
      for (const o of l) if (o !== c && !o.conn && o.s > c.s && Math.abs(o.lat - c.lat) < 2.2) { const g = o.s - c.s - (o.M.L + c.M.L) / 2; if (g < best) { best = g; bv = o.v; bc = o; } }
      if (best > 1e8 && c.next) {
        const rem = c.e.len - c.s;
        const l2 = this.lanes.get(c.next.e.i + ':' + c.next.dir) || [];
        for (const o of l2) { const os = o.conn ? -o.conn.len + o.cs : o.s; if (Math.abs(laneOff(c.next.e.way, c.next.dir, c.next.li) - o.lat) > 2.2 && !o.conn) continue; const g = rem + os - (o.M.L + c.M.L) / 2; if (g < best) { best = g; bv = o.v; bc = o; } }
        const l3 = this.lanes.get('n' + c.next.e.i + ':' + c.next.dir) || [];
        for (const o of l3) { if (o === c) continue; const g = rem + (o.cs - o.conn.len) + (o.M.L) * 0 - (o.M.L + c.M.L) / 2; if (g < best) { best = g; bv = o.v; bc = o; } }
      }
    } else {
      const rem = c.conn.len - c.cs;
      const l2 = this.lanes.get(c.next.e.i + ':' + c.next.dir) || [];
      for (const o of l2) { if (o.conn) continue; const g = rem + o.s - (o.M.L + c.M.L) / 2; if (g < best && Math.abs(o.lat - laneOff(c.next.e.way, c.next.dir, c.next.li)) < 2.2) { best = g; bv = o.v; bc = o; } }
      const l3 = this.lanes.get('n' + c.next.e.i + ':' + c.next.dir) || [];
      for (const o of l3) if (o !== c && o.conn === c.conn && o.cs > c.cs) { const g = o.cs - c.cs - (o.M.L + c.M.L) / 2; if (g < best) { best = g; bv = o.v; bc = o; } }
    }
    // people walking in front of the bumper
    if (this.peds) for (const p of this.peds) {
      const dx = p.x - c.x, dz = p.z - c.z; if (Math.abs(dx) > 45 || Math.abs(dz) > 45) continue;
      const ahead = dx * c.hx + dz * c.hz, side = Math.abs(-dx * c.hz + dz * c.hx);
      if (ahead > 0 && ahead < 40 && side < c.M.Wd / 2 + .8) { const g = ahead - c.M.L / 2 - 1.2; if (g < best) { best = g; bv = 0; bc = 'ped'; } }
    }
    // the player (on foot or scooter) in front of the bumper
    if (player && !player.inside) {
      const hx = c.hx || 0, hz = c.hz || 0; const dx = player.x - c.x, dz = player.z - c.z;
      const ahead = dx * hx + dz * hz, side = Math.abs(-dx * hz + dz * hx);
      if (ahead > 0 && ahead < 45 && side < (c.M.Wd / 2 + .9)) { const g = ahead - c.M.L / 2 - .6; const pv = Math.max(0, player.vx * hx + player.vz * hz); if (g < best) { best = g; bv = pv; bc = 'player'; } }
    }
    return [best, bv, bc];
  }
  idm(c, gap, vl, v0) {
    const v = c.v; const ds = c.S0 + Math.max(0, v * c.T + v * (v - vl) / (2 * Math.sqrt(c.A * c.B)));
    const free = 1 - Math.pow(v / Math.max(v0, .1), 4);
    return c.A * (free - (gap < 1e8 ? Math.pow(ds / Math.max(gap, .1), 2) : 0));
  }
  think(c, dt, player) {
    const R = this.roads;
    let v0 = this.vmax(c);
    // curve speed on the current edge, ahead 35 m
    if (!c.conn) { const kmax = this.curvAhead(c.e, c.dir, c.s, 35); if (kmax > 0) v0 = Math.min(v0, Math.sqrt(2.6 / kmax)); }
    else { const tv = c.conn.turn === 'R' ? 5.6 : c.conn.turn === 'L' ? 7.6 : v0; v0 = Math.min(v0, tv); }
    let [gap, vl, who] = this.leader(c, player); c.why = who ? 'lead' : '';
    let acc = this.idm(c, gap, vl, v0);
    c.waitNode = -1; c.remBar = 99;
    // junction control ahead
    if (!c.conn && c.next) {
      const n = R.nodes[c.next.node]; const rem = c.e.len - c.s - Math.min(c.e.len * .45, n.r || 0) - 1.2 - c.M.L / 2; // front bumper to stop bar
      c.remBar = rem;
      // slow for the turn itself
      const tv = c.next.kind === 'R' ? 5.6 : c.next.kind === 'L' ? 7.6 : 1e9;
      if (tv < c.v && rem > 0) { const need = (c.v * c.v - tv * tv) / (2 * Math.max(rem, .5)); if (need > .3) acc = Math.min(acc, -need); }
      if (rem < 70 && rem > -1) {
        const must = this.mustStop(c, n, rem);
        // the bar is a virtual stopped car: aim to stop ~0.6 m short of it, not a full S0 back
        if (must) { const a2 = this.idm(c, Math.max(.1, rem + c.S0 - .6), 0, v0); acc = Math.min(acc, a2); c.why = 'stop:' + must; } else c.why = who ? 'lead' : '';
      }
      // turn signals 100 m before a turn, then on during the lane change
      if (c.next.kind !== 'S' && rem < 100) c.blink = c.next.kind === 'L' ? -1 : 1; else if (!c.lc) c.blink = 0;
      // change lanes for the turn (or to pass a slow car on multilane roads)
      const lanes = R.lanes(c.e, c.dir);
      if (lanes > 1 && !c.lc) {
        let target = c.li;
        if (rem < 160 && c.wantLane !== c.li) target = c.li + Math.sign(c.wantLane - c.li);
        else if (who && who !== 'player' && vl < v0 * .7 && gap < 35 && rem > 160) target = c.li < lanes - 1 ? c.li + 1 : c.li - 1;
        if (target !== c.li && target >= 0 && target < lanes && this.laneFree(c, target)) { c.blink = target > c.li ? -1 : 1; c.li = target; c.latT = laneOff(c.e.way, c.dir, target); c.lc = 2.5; } // higher lane index = further left
      }
    }
    // honk at a player who stands in the road
    if (who === 'player' && gap < 7 && c.v < 1) { c.honk += dt; if (c.honk > 1.6 && c.honk < 1.6 + dt * 1.5) this.onHorn && this.onHorn(c); } else c.honk = 0;
    c.brake = acc < -.6 || c.v < .2 ? 1 : 0;
    c.a = clamp(acc, -8, c.A);
  }
  laneFree(c, li) {
    const off = laneOff(c.e.way, c.dir, li); const l = this.lanes.get(c.e.i + ':' + c.dir) || [];
    for (const o of l) if (o !== c && Math.abs(o.lat - off) < 1.8 && o.s > c.s - 10 - c.v * 1.2 && o.s < c.s + 8) return false;
    return true;
  }
  curvAhead(e, dir, s, d) {
    if (!e.kap) { // per-vertex curvature (1/R) estimated from turn angles
      const p = e.pts, n = p.length / 2; e.kap = new Float32Array(n);
      for (let k = 1; k < n - 1; k++) { const a1 = Math.atan2(p[2 * k] - p[2 * k - 2], p[2 * k + 1] - p[2 * k - 1]), a2 = Math.atan2(p[2 * k + 2] - p[2 * k], p[2 * k + 3] - p[2 * k + 1]); const L = (e.cum[k + 1] - e.cum[k - 1]) / 2; e.kap[k] = Math.abs(angDiff(a1, a2)) / Math.max(L, 3); }
    }
    let m = 0; const s0 = dir ? e.len - s - d : s, s1 = dir ? e.len - s : s + d;
    for (let k = 1; k < e.kap.length - 1; k++) if (e.cum[k] >= s0 && e.cum[k] <= s1) m = Math.max(m, e.kap[k]);
    return m;
  }
  // is this car required to stop at the bar right now?
  mustStop(c, n, rem) {
    const R = this.roads, nx = c.next; const nid = nx.node;
    const sig = this.signalAt(nid);
    const myConn = this.connector(c.e, c.dir, nx.e, nx.dir, nid, c.li, nx.li);
    const boxCars = this.box.get(nid) || [];
    const boxClear = () => !boxCars.some(o => o !== c && this.conflicts(o.conn, myConn));
    if (sig) {
      const app = sig.app.find(a => a.e === c.e && a.dir === c.dir); const grp = app ? app.grp : 0;
      const st = sig.state(grp, nx.kind);
      c.waitNode = nid; c.waitGrp = grp;
      if (st === 'GA') return boxClear() ? false : 'box';
      if (st === 'G') {
        if (nx.kind === 'L' && !this.gapOpposing(c, nid, myConn, 4.5)) return 'left'; // permissive left: yield to oncoming
        if (!boxClear() && rem < 6) return 'box';
        c.waitNode = -1; return false;
      }
      if (st === 'Y') { const stopDist = c.v * c.v / (2 * 3.4); if (rem > stopDist + 1) return 'yellow'; c.waitNode = -1; return false; }
      // red: right on red after a full stop, if the crossing traffic leaves a gap (NJ allows it)
      if (nx.kind === 'R' && c.stopT > 1.4 && rem < 3.5 && boxClear() && this.gapAll(c, nid, myConn, 5)) return false;
      return 'red';
    }
    // stop signs / priority
    const myCls = c.e.cls;
    const stopCtl = (n.f & (2 | 64)) && (myCls <= Math.min(...n.inc.map(i => R.edges[i].cls)) || (n.f & 16));
    const minor = myCls < n.cls && n.deg >= 3;
    if (stopCtl || (minor && myCls <= n.cls - 2)) {
      c.waitNode = nid;
      if (c.stopT < 1.0 || rem > 3.5) return 'stopline'; // must come to a full stop at the line
      const allWay = (n.f & 16) || n.inc.every(i => R.edges[i].cls === myCls);
      if (allWay) { // first come, first served
        const others = this.cars.filter(o => o !== c && o.waitNode === nid && o.stopT > .3 && o.remBar < 3.5 && o.arrive < c.arrive && !(o.e === c.e && o.dir === c.dir));
        if (others.length) return 'fcfs';
      }
      return !boxClear() ? 'box' : !this.gapAll(c, nid, myConn, allWay ? 1.5 : 5.5) ? 'gap' : false;
    }
    if (minor) { // yield: slow, look, go
      if (c.v > 5 && rem < 20) return this.gapAll(c, nid, myConn, 4.5) ? false : 'yield';
      return !boxClear() ? 'box' : !this.gapAll(c, nid, myConn, 4) ? 'yield' : false;
    }
    return (!boxClear() && rem < 4) ? 'box' : false;
  }
  // time gap check against cars approaching on other approaches whose path crosses mine
  gapAll(c, nid, myConn, tgap) {
    const R = this.roads;
    for (const o of this.cars) {
      if (o === c || o.conn || !o.next || o.next.node !== nid || (o.e === c.e && o.dir === c.dir)) continue;
      const rem = o.e.len - o.s; const tt = rem / Math.max(o.v, .5);
      if (tt > tgap && rem > 8) continue;
      if (o.waitNode === nid && o.v < .5) continue; // they are stopped and waiting too
      const oc = this.connector(o.e, o.dir, o.next.e, o.next.dir, nid, o.li, o.next.li);
      if (this.conflicts(oc, myConn)) return false;
    }
    return true;
  }
  gapOpposing(c, nid, myConn, tgap) {
    const boxCars = this.box.get(nid) || [];
    if (boxCars.some(o => o !== c && this.conflicts(o.conn, myConn) && o.conn.turn !== 'L')) return false;
    for (const o of this.cars) {
      if (o === c || o.conn || !o.next || o.next.node !== nid || (o.e === c.e && o.dir === c.dir)) continue;
      if (o.next.kind === 'L') continue;
      const rem = o.e.len - o.s, tt = rem / Math.max(o.v, .5);
      if (tt > tgap || (o.v < .5 && o.waitNode === nid)) continue;
      const oc = this.connector(o.e, o.dir, o.next.e, o.next.dir, nid, o.li, o.next.li);
      if (this.conflicts(oc, myConn)) return false;
    }
    return true;
  }
  move(c, dt) {
    c.v = Math.max(0, c.v + c.a * dt);
    if (c.v < .15) { if (c.stopT === 0) c.arrive = performance.now(); c.stopT += dt; } else if (c.v > 1.2) c.stopT = 0;
    let ds = c.v * dt;
    if (c.lc > 0) { c.lc -= dt; if (c.lc <= 0) { c.lc = 0; } }
    c.lat += clamp(c.latT - c.lat, -1.1 * dt, 1.1 * dt);
    const R = this.roads;
    if (!c.conn) {
      c.s += ds;
      const n = c.next ? R.nodes[c.next.node] : R.nodes[c.dir ? c.e.a : c.e.b];
      const trim = Math.min(c.e.len * .45, n.r || 0);
      if (c.s >= c.e.len - trim) {
        if (!c.next) { c.dead = true; return; }
        c.conn = this.connector(c.e, c.dir, c.next.e, c.next.dir, c.next.node, c.li, c.next.li); c.cs = c.s - (c.e.len - trim);
        c.stopT = 0; c.waitNode = -1;
      }
    } else {
      c.cs += ds;
      if (c.cs >= c.conn.len) {
        const nx = c.next; const over = c.cs - c.conn.len;
        c.e = nx.e; c.dir = nx.dir; c.s = c.conn.r2 + over; c.li = nx.li; c.lat = c.latT = laneOff(c.e.way, c.dir, c.li); c.conn = null; c.blink = 0;
        this.plan(c);
      }
    }
    // pose
    let x, z, hx, hz;
    if (c.conn) {
      const q = c.conn; let k = 1; while (k < q.cum.length - 1 && q.cum[k] < c.cs) k++;
      const t = clamp((c.cs - q.cum[k - 1]) / ((q.cum[k] - q.cum[k - 1]) || 1), 0, 1);
      x = q.pts[2 * k - 2] + (q.pts[2 * k] - q.pts[2 * k - 2]) * t; z = q.pts[2 * k - 1] + (q.pts[2 * k + 1] - q.pts[2 * k - 1]) * t;
      hx = q.pts[2 * k] - q.pts[2 * k - 2]; hz = q.pts[2 * k + 1] - q.pts[2 * k - 1]; const L = Math.hypot(hx, hz) || 1; hx /= L; hz /= L;
    } else {
      const p = this.lanePos(c.e, c.dir, c.s, c.lat); x = p.x; z = p.z; hx = p.hx; hz = p.hz;
      if (c.lc > 0) { const yaw = (c.latT - c.lat) > 0 ? .06 : -.06; const cs = Math.cos(yaw), sn = Math.sin(yaw); [hx, hz] = [hx * cs + hz * sn, -hx * sn + hz * cs]; }
    }
    // smooth heading so cars don't snap on polyline joints
    if (c.hx === undefined) { c.hx = hx; c.hz = hz; }
    const k = 1 - Math.exp(-dt * 9); c.hx += (hx - c.hx) * k; c.hz += (hz - c.hz) * k; const L = Math.hypot(c.hx, c.hz) || 1; c.hx /= L; c.hz /= L;
    c.x = x; c.z = z;
    const e = c.conn ? c.next.e : c.e;
    c.y = c.conn ? this.world.height(x, z) + .06 : this.world.edgeY(c.e, x, z, c.dir ? c.e.len - c.s : c.s);
  }
  // ---------- drawing ----------
  draw(player) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const counts = this.meshes.map(() => 0);
    let nt = 0, nb = 0, nh = 0, nbeam = 0;
    const blinkOn = (performance.now() % 760) < 400;
    const tailDim = new THREE.Color(this.night > .3 ? '#8a1010' : '#5a0d0d'), tailBr = new THREE.Color('#ff2a1f');
    for (const c of this.cars) {
      if (c.x === undefined) continue;
      const im = this.meshes[c.mi], i = counts[c.mi]++;
      if (i >= CAP) continue;
      const yaw = Math.atan2(c.hx, c.hz);
      e.set(-clamp(c.a, -6, 3) * .006, yaw, 0, 'YXZ'); q.setFromEuler(e); p.set(c.x, c.y, c.z);
      im.setMatrixAt(i, m4.compose(p, q, s)); im.instanceColor.setXYZ(i, c.col.r, c.col.g, c.col.b);
      const [hy, hzf, ty, tz] = c.M.light; const rx = Math.cos(yaw), rz = -Math.sin(yaw); const fx = c.hx, fz = c.hz; const w = c.M.Wd / 2 - .3;
      for (const sd of [-1, 1]) {
        if (nt < CAP * 2) { p.set(c.x + fx * tz + rx * w * sd, c.y + ty, c.z + fz * tz + rz * w * sd); this.tail.setMatrixAt(nt, m4.compose(p, q, s)); const col = c.brake ? tailBr : tailDim; this.tail.instanceColor.setXYZ(nt, col.r, col.g, col.b); nt++; }
        if (c.blink && blinkOn && ((c.blink < 0 && sd === 1) || (c.blink > 0 && sd === -1)) && nb < CAP * 2) { // (rx,rz) points LEFT, so sd=+1 is the left side
          for (const zz of [hzf, tz]) { p.set(c.x + fx * (zz + Math.sign(zz) * .02) + rx * (c.M.Wd / 2 - .08) * sd, c.y + (zz > 0 ? hy : ty), c.z + fz * (zz + Math.sign(zz) * .02) + rz * (c.M.Wd / 2 - .08) * sd); this.blink.setMatrixAt(nb++, m4.compose(p, q, s)); }
        }
        if (this.night > .3 && nh < CAP * 2) { p.set(c.x + fx * hzf + rx * w * sd, c.y + hy, c.z + fz * hzf + rz * w * sd); this.head.setMatrixAt(nh++, m4.compose(p, q, s)); }
      }
      if (this.night > .3 && nbeam < CAP) { p.set(c.x + fx * hzf, c.y + .08, c.z + fz * hzf); this.beam.setMatrixAt(nbeam++, m4.compose(p, q, s)); }
    }
    this.meshes.forEach((im, k) => { im.count = Math.min(CAP, counts[k]); im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; });
    this.tail.count = nt; this.tail.instanceMatrix.needsUpdate = true; this.tail.instanceColor.needsUpdate = true;
    this.blink.count = nb; this.blink.instanceMatrix.needsUpdate = true;
    this.head.count = nh; this.head.instanceMatrix.needsUpdate = true;
    this.beam.count = nbeam; this.beam.instanceMatrix.needsUpdate = true;
  }
  // ---------- parked cars ----------
  parkTile(t) {
    const recs = this.world.drives.get(t.k) || []; const R = this.roads; const spots = [];
    const r = rng(t.i * 131 + t.j * 7);
    for (const d of recs) {
      if (!d.car) continue;
      const f = .35 + r() * .3; const x = d.sx + (d.ex - d.sx) * f, z = d.sz + (d.ez - d.sz) * f;
      spots.push([x, z, d.yaw + (r() < .5 ? Math.PI : 0), pickModel(r(), false)]);
      if (d.width > 5 && r() < .5) { const ox = Math.cos(d.yaw) * 2.6, oz = -Math.sin(d.yaw) * 2.6; spots.push([x + ox, z + oz, d.yaw, pickModel(r(), false)]); }
    }
    // parking-lot aisles: stalls both sides, perpendicular
    const x0 = t.i * 400, z0 = t.j * 400;
    for (const ei of t.d.roads) {
      const e = R.edges[ei]; if (e.way.sv !== 'parking_aisle') continue;
      const occ = .45 + r() * .4;
      for (let s = 4; s < e.len - 4; s += 2.75) for (const sd of [-1, 1]) {
        if (r() > occ) continue;
        const a = R.at(e, s); const off = e.way.w / 2 + 2.7; const x = a.x - a.hz * off * sd, z = a.z + a.hx * off * sd;
        if (x < x0 || x >= x0 + 400 || z < z0 || z >= z0 + 400) continue;
        if (this.world.buildingAt(x, z, 1.5)) continue;
        spots.push([x, z, Math.atan2(a.hx, a.hz) + (Math.PI / 2) * sd + (r() < .3 ? Math.PI : 0), pickModel(r(), false)]);
      }
    }
    const g = new THREE.Group(); const by = MODELS.map(() => []);
    for (const s of spots) by[s[3]].push(s);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    by.forEach((list, k) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(this.meshes[k].geometry, this.meshes[k].material, list.length); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      list.forEach(([x, z, yaw], i) => { q.setFromAxisAngle(Y, yaw); p.set(x, this.world.height(x, z) + .05, z); im.setMatrixAt(i, m4.compose(p, q, sc)); const c = new THREE.Color(CARCOL[(r() * CARCOL.length) | 0]); im.instanceColor.setXYZ(i, c.r, c.g, c.b); });
      im.castShadow = true; g.add(im);
    });
    t.g.add(g); this.parked.set(t.k, spots);
  }
  unparkTile(t) { this.parked.delete(t.k); }
  // solid obstacles for the player: moving + parked cars as oriented boxes
  obstacles(x, z, r) {
    const out = [];
    for (const c of this.cars) if (c.x !== undefined && Math.abs(c.x - x) < r && Math.abs(c.z - z) < r) out.push({ x: c.x, z: c.z, hx: c.hx, hz: c.hz, L: c.M.L, W: c.M.Wd, v: c.v, car: c });
    const k = Math.floor(x / 400) + '_' + Math.floor(z / 400); const ps = this.parked.get(k) || [];
    for (const [px, pz, yaw, mi] of ps) if (Math.abs(px - x) < r && Math.abs(pz - z) < r) out.push({ x: px, z: pz, hx: Math.sin(yaw), hz: Math.cos(yaw), L: MODELS[mi].L, W: MODELS[mi].Wd, v: 0 });
    return out;
  }
}
const DIM = new THREE.Color('#2a2622');
function makeSignalGeo() {
  return {
    body: new THREE.BoxGeometry(.42, 1.08, .3), lamp: new THREE.CircleGeometry(.12, 12),
    yellow: new THREE.MeshLambertMaterial({ color: '#d8a91c' }), pole: new THREE.MeshLambertMaterial({ color: '#8c9195' }),
  };
}
function makeConeTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,240,200,0)'); gr.addColorStop(.75, 'rgba(255,240,200,.5)'); gr.addColorStop(1, 'rgba(255,240,200,.0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 128); g.lineTo(0, 0); g.lineTo(64, 0); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); return t;
}
