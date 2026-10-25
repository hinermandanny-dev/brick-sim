// Hand-built houses. A spec (local/house.json: private, git-ignored, never published) describes ONE real house
// (a front-gabled colonial with an attached garage, its colours, windows, plantings); the OSM / Microsoft footprint
// gives its size and orientation. fitHouse() reads the footprint's shape, buildHandHouse() models it.
// Footprint shape expected: six corners, a short "jog" edge where the garage front stands proud of the main front.
// Anything else returns null and the normal generated house is used instead.
import * as THREE from '../vendor/three.module.js';

// ---------- footprint -> frame ----------
// local frame: u = to the right when you face the house from the street, v = away from the house towards the street,
// y = up from the ground floor; origin = the main front wall's corner beside the garage.
export function fitHouse(P, road, wantGarage = 'left') {
  const n = P.length / 2; if (n !== 6) return null;
  const pt = (i) => [P[(((i % n) + n) % n) * 2], P[(((i % n) + n) % n) * 2 + 1]];
  const len = (i) => Math.hypot(pt(i + 1)[0] - pt(i)[0], pt(i + 1)[1] - pt(i)[1]);
  const dir = (i) => { const l = len(i) || 1; return [(pt(i + 1)[0] - pt(i)[0]) / l, (pt(i + 1)[1] - pt(i)[1]) / l]; };
  let jog = -1;
  for (let i = 0; i < n; i++) {
    if (len(i) > 3.6 || len(i) < .4) continue;
    const a = dir(i - 1), b = dir(i), c = dir(i + 1);
    if (Math.abs(a[0] * c[0] + a[1] * c[1]) < .9 || Math.abs(a[0] * b[0] + a[1] * b[1]) > .35) continue;
    if (len(i - 1) > len(i) && len(i + 1) > len(i)) { jog = i; break; }
  }
  if (jog < 0) return null;
  // the shorter of the two front edges is the garage
  const garPrev = len(jog - 1) < len(jog + 1);
  const gEnd = garPrev ? pt(jog) : pt(jog + 1), mEnd = garPrev ? pt(jog + 1) : pt(jog);
  let ox = gEnd[0] - mEnd[0], oz = gEnd[1] - mEnd[1]; const ol = Math.hypot(ox, oz); ox /= ol; oz /= ol;
  const gp = ol; // how far the garage stands out
  let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += pt(i)[0]; cz += pt(i)[1]; } cx /= n; cz /= n;
  if (road && (road.x - cx) * ox + (road.z - cz) * oz <= 0) return null; // the "front" must face the street
  const rx = oz, rz = -ox; // viewer's right (derived: right = forward x up, forward = -out)
  const U = (p) => (p[0] - mEnd[0]) * rx + (p[1] - mEnd[1]) * rz, V = (p) => (p[0] - mEnd[0]) * ox + (p[1] - mEnd[1]) * oz;
  let u0 = 1e9, u1 = -1e9, vb = 1e9; for (let i = 0; i < n; i++) { const p = pt(i); u0 = Math.min(u0, U(p)); u1 = Math.max(u1, U(p)); vb = Math.min(vb, V(p)); }
  const garageLeft = U(gEnd) <= 0 && u0 < -.5;
  if ((wantGarage === 'left') !== garageLeft) return null;
  return { ox, oz, rx, rz, x0: mEnd[0], z0: mEnd[1], gw: -u0, mw: u1, gp, back: vb };
}

// ---------- geometry bag: flat-coloured triangles, one merged mesh per colour ----------
class Bag {
  constructor() { this.m = new Map(); }
  c(col) { if (!this.m.has(col)) this.m.set(col, []); return this.m.get(col); }
  tri(a, b, c, col) { this.c(col).push(...a, ...b, ...c); }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  box(u0, u1, y0, y1, v0, v1, col) {
    const p = (u, y, v) => [u, y, v];
    const A = p(u0, y0, v0), B = p(u1, y0, v0), C = p(u1, y0, v1), D = p(u0, y0, v1), E = p(u0, y1, v0), F = p(u1, y1, v0), G = p(u1, y1, v1), H = p(u0, y1, v1);
    this.quad(E, F, G, H, col); this.quad(D, C, G, H, col); this.quad(A, B, F, E, col); this.quad(B, C, G, F, col); this.quad(A, D, H, E, col);
  }
  mesh(parent, tf) {
    for (const [col, arr] of this.m) {
      const g = new THREE.BufferGeometry(); const pos = new Float32Array(arr);
      for (let i = 0; i < pos.length; i += 3) { const q = tf(pos[i], pos[i + 1], pos[i + 2]); pos[i] = q[0]; pos[i + 1] = q[1]; pos[i + 2] = q[2]; }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
      const mt = new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide }); mt._own = true;
      const o = new THREE.Mesh(g, mt); o.castShadow = o.receiveShadow = true; parent.add(o);
    }
  }
}

// ---------- the house ----------
// spec fields (all optional, defaults are a plain colonial): colors{siding,brick,garageWall,roof,shutter,trim,glass,door,foundation},
// eave, ridge (m above the floor), garageEave, wingFrac [left wing, bay, right wing] as fractions of the main width.
export function buildHandHouse(spec, f, ground, road) {
  const S = Object.assign({ eave: 5.3, rise: 2.0, garageEave: 3.0, wingFrac: [.29, .34, .37], storeys: 2 }, spec || {});
  const C = Object.assign({ siding: '#b4b1a5', brick: '#b98a62', garageWall: '#e6e4dc', roof: '#45484b', shutter: '#6b2e33', trim: '#f2f1ec', glass: '#2a3541', door: '#f4f3ee', foundation: '#8e8a82', concrete: '#b7b2a6', fence: '#f1f0ea' }, S.colors || {});
  const { gw, mw, gp, back } = f; const E = S.eave, fl = -.45, wl = mw * S.wingFrac[0], bw = mw * S.wingFrac[1], bx0 = wl, bx1 = wl + bw, ov = .4, proj = .12;
  const b = new Bag(), g = new THREE.Group();
  // ---- walls
  b.box(0, mw, fl, E, back, 0, C.siding);
  b.box(0, mw, fl - .15, fl + .5 + .45, back - .02, .03, C.foundation);
  b.box(bx0, bx1, fl, E, -.02, proj, C.brick); // the brick bay
  b.box(-gw, 0, fl, S.garageEave, back, gp, C.garageWall);
  b.box(-gw, 0, fl - .15, fl + .95, back - .02, gp + .03, C.foundation);
  // ---- roofs (flat-shaded planes)
  const rid = E + S.rise, vm = back / 2, vf = ov, vbk = back - ov, u0 = -ov, u1 = mw + ov; // main: ridge along u
  b.quad([u0, E, vf], [u1, E, vf], [u1, rid, vm], [u0, rid, vm], C.roof); b.quad([u0, E, vbk], [u1, E, vbk], [u1, rid, vm], [u0, rid, vm], C.roof);
  b.tri([0, E, back], [0, E, 0], [0, rid, vm], C.siding); b.tri([mw, E, back], [mw, E, 0], [mw, rid, vm], C.siding); // gable ends
  // the front pediment over the brick bay: ridge along v, as high as the main ridge
  const gx0 = bx0 - .3, gx1 = bx1 + .3, gm = (bx0 + bx1) / 2, gv = proj + .35;
  b.quad([gx0, E, gv], [gm, rid, gv], [gm, rid, vm], [gx0, E, vm + .6], C.roof); b.quad([gx1, E, gv], [gm, rid, gv], [gm, rid, vm], [gx1, E, vm + .6], C.roof);
  b.tri([bx0, E, proj], [bx1, E, proj], [gm, rid - .12, proj], C.trim); b.tri([bx0 + .2, E, proj + .01], [bx1 - .2, E, proj + .01], [gm, rid - .45, proj + .01], C.brick);
  b.box(gm - .26, gm + .26, E + .55, E + 1.05, proj, proj + .03, C.trim); // round vent in the pediment (as a square plate)
  // garage: hipped, ridge along v
  const ge = S.garageEave, gr = ge + (gw / 2 + ov) * .5, gu0 = -gw - ov, gu1 = ov, gv0 = gp + ov, gv1 = back - ov, gmu = -gw / 2, hl = Math.min(gw / 2 + ov, (gv0 - gv1) / 2 - .3);
  b.quad([gu0, ge, gv0], [gmu, gr, gv0 - hl], [gmu, gr, gv1 + hl], [gu0, ge, gv1], C.roof); b.quad([gu1, ge, gv0], [gmu, gr, gv0 - hl], [gmu, gr, gv1 + hl], [gu1, ge, gv1], C.roof);
  b.tri([gu0, ge, gv0], [gu1, ge, gv0], [gmu, gr, gv0 - hl], C.roof); b.tri([gu0, ge, gv1], [gu1, ge, gv1], [gmu, gr, gv1 + hl], C.roof);
  b.box(.25, .55, rid - .1, rid + 1.0, vm - .2, vm + .1, '#8a8d90'); // flue
  // ---- garage doors: two panelled doors, header trim
  const dw = (gw - .9) / 2, dh = 2.15;
  for (let k = 0; k < 2; k++) {
    const a0 = -gw + .35 + k * (dw + .2); b.box(a0 - .06, a0 + dw + .06, fl + .45 - .06, fl + .45 + dh + .08, gp, gp + .035, C.trim);
    b.box(a0, a0 + dw, fl + .45, fl + .45 + dh, gp + .035, gp + .06, C.door);
    for (let r = 1; r < 4; r++) b.box(a0, a0 + dw, fl + .45 + r * dh / 4 - .015, fl + .45 + r * dh / 4 + .015, gp + .06, gp + .075, '#c9c7c0');
    for (let p = 0; p < 4; p++) b.box(a0 + .2 + p * (dw - .6) / 3 + .08, a0 + .2 + p * (dw - .6) / 3 + .46, fl + .45 + dh * .74, fl + .45 + dh * .74 + .22, gp + .06, gp + .08, '#35414d'); // door windows
  }
  // ---- windows with muntins and shutters on a wall plane (front faces +v)
  const win = (uc, y0, w, h, vWall, shut = true) => {
    b.box(uc - w / 2 - .05, uc + w / 2 + .05, y0 - .05, y0 + h + .05, vWall, vWall + .05, C.trim); b.box(uc - w / 2, uc + w / 2, y0, y0 + h, vWall + .05, vWall + .065, C.glass);
    b.box(uc - .015, uc + .015, y0, y0 + h, vWall + .065, vWall + .08, C.trim); b.box(uc - w / 2, uc + w / 2, y0 + h / 2 - .015, y0 + h / 2 + .015, vWall + .065, vWall + .08, C.trim);
    b.box(uc - w / 2 - .08, uc + w / 2 + .08, y0 - .1, y0 - .05, vWall, vWall + .1, C.trim); // sill
    if (shut) for (const s of [-1, 1]) { const c0 = uc + s * (w / 2 + .05 + .17); b.box(c0 - .16, c0 + .16, y0 - .05, y0 + h + .05, vWall, vWall + .06, C.shutter); for (let l = 1; l < 7; l++) b.box(c0 - .14, c0 + .14, y0 + l * h / 7, y0 + l * h / 7 + .02, vWall + .06, vWall + .075, '#582428'); }
  };
  const y1w = .85, h1 = 1.4, y2w = 3.3, h2 = 1.4, ww = .78;
  win(wl * .27, y2w, ww, h2, 0); win(wl * .75, y2w, ww, h2, 0); win(wl * .5, y1w, ww + .1, h1, 0);
  const wr0 = bx1, wR = mw - bx1; win((bx0 + bx1) / 2, y2w, ww, h2, proj); win(wr0 + wR * .24, y2w, ww, h2, 0); win(wr0 + wR * .76, y2w, ww, h2, 0); win(wr0 + wR * .5, y1w, ww + .1, h1, 0);
  // ---- front door: white door with one glazed sidelight and coach lights, three steps, white rails
  const dc = gm + .22, fd = proj; b.box(dc - .62, dc - .04, 0 - .02, 2.2, fd, fd + .05, C.trim); b.box(dc - .5, dc + .5, 0, 2.15, fd + .05, fd + .09, C.door);
  b.box(dc - .3, dc + .3, 1.2, 1.9, fd + .09, fd + .105, C.glass); for (const r of [0, 1]) b.box(dc - .3 + r * .32 + .02, dc - .3 + r * .32 + .28, .35, 1.05, fd + .09, fd + .1, '#e8e7e1'); b.box(dc + .34, dc + .4, .98, 1.04, fd + .09, fd + .13, '#c8a24a');
  b.box(dc - .6 - .36, dc - .06 - .02, .35, 2.0, fd + .05, fd + .07, C.glass); // sidelight glass
  for (const s of [-1, 1]) b.box(dc + s * .9 - .06, dc + s * .9 + .06, 1.7, 1.95, fd, fd + .2, '#202225'); // coach lights
  b.box(dc - .95, dc + .95, -.45, .0, fd, fd + 1.55, C.concrete); b.box(dc - .95, dc + .95, -.45, -.15, fd + 1.55, fd + 2.0, C.concrete); b.box(dc - .95, dc + .95, -.45, -.3, fd + 2.0, fd + 2.45, C.concrete);
  for (const s of [-1, 1]) for (const [v0, top] of [[fd + .05, .0], [fd + 1.55, -.15], [fd + 2.0, -.3]]) { b.box(dc + s * .92 - .04, dc + s * .92 + .04, top, top + .95, v0, v0 + .08, C.trim); } // posts
  for (const s of [-1, 1]) { b.box(dc + s * .92 - .035, dc + s * .92 + .035, .88, .94, fd + .05, fd + 1.6, C.trim); b.box(dc + s * .92 - .035, dc + s * .92 + .035, .72, .78, fd + 1.55, fd + 2.0, C.trim); }
  // ---- side and back windows (plain)
  const sideWin = (v, y0) => { b.box(mw, mw + .05, y0, y0 + 1.35, v - .4, v + .4, C.trim); b.box(mw + .05, mw + .065, y0 + .05, y0 + 1.3, v - .35, v + .35, C.glass); };
  for (const v of [back * .3, back * .72]) { sideWin(v, y1w); sideWin(v, y2w); }
  b.box(-gw - .05, -gw, ge - 1.9, ge - .6, back * .4 - .4, back * .4 + .4, C.trim); b.box(-gw - .065, -gw - .05, ge - 1.85, ge - .65, back * .4 - .35, back * .4 + .35, C.glass);
  // ---- mulch bed, front plantings
  b.box(.0, bx0 - .0, fl + .45, fl + .5, proj, 1.1, '#5a3e2b'); b.box(bx1, mw, fl + .45, fl + .5, proj, 1.1, '#5a3e2b');
  // ---- driveway (separate flat quads) is built by the caller; the fence + plants here
  const ball = (u, v, r, col, ry = r) => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), (() => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true }); m._own = true; return m; })()); s.scale.set(r, ry, r); s.position.set(u, fl + .5 + ry * .85, v); s.castShadow = true; g.add(s); return s; };
  const tree = (u, v, r, ry, col, trunk) => { b.box(u - .09, u + .09, fl + .45, fl + 2.1, v - .09, v + .09, trunk); const s = ball(u, v, r, col, ry); s.position.y = fl + .45 + 2.0 + ry * .7; };
  const cone = (u, v, r, h, col) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true }); m._own = true; const s = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), m); s.position.set(u, fl + .45 + h / 2, v); s.castShadow = true; g.add(s); };
  cone(wl * .52, 1.35, .8, 3.5, '#2f5a2e'); // the tall arborvitae by the left wing
  tree(wr0 + wR * .62, 2.3, 1.7, 1.4, '#6b2b3a', '#4a3a30'); // the red Japanese maple at right
  ball(bx1 + .55, 1.0, .62, '#b2ab45'); ball(wl * .12, .9, .45, '#4f6e34'); ball(wr0 + wR * .1, .9, .45, '#4f6e34'); ball(wr0 + wR * .9, .9, .45, '#4f6e34');
  // white vinyl privacy fence from the right wall, across and turning to the street
  const fenceLen = 8.5, fenceTurn = 6, fh = 1.8, ft = .07, fu = mw + .05;
  b.box(fu, fu + fenceLen, fl + .45, fl + .45 + fh, 0 - ft, 0, C.fence); b.box(fu + fenceLen - ft, fu + fenceLen, fl + .45, fl + .45 + fh, 0, fenceTurn, C.fence);
  for (let k = 0; k <= 5; k++) b.box(fu + k * fenceLen / 5 - .06, fu + k * fenceLen / 5 + .06, fl + .45, fl + .45 + fh + .08, -.1, .02, '#e4e3dc');
  b.box(fu, fu + fenceLen, fl + .45 + fh, fl + .45 + fh + .05, -.09, .02, '#e4e3dc');
  // ---- place the local frame in the world
  // world = origin + u*right + v*out ; the local y 0 is the ground floor at ground.y0 (+ the flat floor)
  const y0 = ground.y;
  b.mesh(g, (u, y, v) => [f.x0 + f.rx * u + f.ox * v, y0 + y, f.z0 + f.rz * u + f.oz * v]);
  // trees/balls were added in local coords; move them by the same transform
  for (const o of g.children) if (!o.geometry.attributes.position.count || o.geometry.type === 'IcosahedronGeometry' || o.geometry.type === 'ConeGeometry') { const p = o.position; const u = p.x, y = p.y, v = p.z; o.position.set(f.x0 + f.rx * u + f.ox * v, y0 + y, f.z0 + f.rz * u + f.oz * v); }
  // doors/drive records in WORLD coordinates for the rest of the game (interior, car, parking)
  const W = (u, v) => [f.x0 + f.rx * u + f.ox * v, f.z0 + f.rz * u + f.oz * v];
  const [dxp, dzp] = W(dc, 0), [gx, gz] = W(-gw / 2, gp + .05);
  let ex = gx, ez = gz; if (road) { const dx = road.qx - gx, dz = road.qz - gz, d = Math.hypot(dx, dz) || 1, edge = Math.max(0, d - road.half); ex = gx + dx / d * edge; ez = gz + dz / d * edge; }
  return {
    group: g,
    door: { x: dxp, z: dzp, ox: f.ox, oz: f.oz, wx: f.rx, wz: f.rz, y: y0 },
    drive: { sx: gx, sz: gz, ex, ez, width: Math.min(gw, 6) + .4, yaw: Math.atan2(ex - gx, ez - gz) },
    mail: W(-gw / 2 + 4.2, gp + Math.hypot(ex - gx, ez - gz) - .3),
  };
}
