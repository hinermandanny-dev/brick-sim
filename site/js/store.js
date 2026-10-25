// Walmart Supercenter #1977, 1872 Route 88: the building you walk into and the OGP (online grocery pickup) job.
// Layout follows the standard Supercenter plan fitted to the real OSM footprint: two front entrances
// (Grocery / Home & Pharmacy), produce at the grocery door, bakery + deli on the grocery side wall, meat and dairy
// coolers on the back wall, frozen in glass-door aisles, dry grocery aisles, general merchandise on the other half,
// registers across the front, the OGP room in the front corner by grocery with Pickup spots outside.
// STORE_LAYOUT can be edited to match the real store exactly (see HANDOFF.md).
import * as THREE from '../vendor/three.module.js';
import { pointInPoly, distSeg, toast, prompt, rng, clamp, canvasTex } from './util.js';

export const STORE_LAYOUT = { groceryEnd: 'auto', aisleW: 2.7, shelfD: 1.1 };

// grocery catalogue (generic names): [name, dept, temp, price, emoji-ish icon colour]
const CAT = [
  ['Bananas, bunch (~2.5 lb)', 'Produce', 'amb', 1.42, '#f2d23a'], ['Gala apples 3 lb bag', 'Produce', 'amb', 4.47, '#c8352d'], ['Russet potatoes 5 lb', 'Produce', 'amb', 3.97, '#a07a4a'], ['Yellow onions 3 lb', 'Produce', 'amb', 2.98, '#d9b064'],
  ['Baby carrots 1 lb', 'Produce', 'chl', 1.27, '#ec8a2c'], ['Romaine hearts 3 ct', 'Produce', 'chl', 3.44, '#5fa046'], ['Strawberries 1 lb', 'Produce', 'chl', 2.97, '#d4312e'], ['Avocados, each', 'Produce', 'amb', .78, '#3d5a2a'],
  ['Whole milk 1 gal', 'Dairy', 'chl', 3.38, '#f4f4f0'], ['2% milk 1/2 gal', 'Dairy', 'chl', 2.12, '#f4f4f0'], ['Large eggs 18 ct', 'Dairy', 'chl', 4.92, '#efe2c8'], ['Salted butter 1 lb', 'Dairy', 'chl', 4.47, '#f2dc7c'],
  ['Shredded mozzarella 2 lb', 'Dairy', 'chl', 7.97, '#f3f0d8'], ['American cheese 24 sl', 'Dairy', 'chl', 4.18, '#f0b23a'], ['Greek yogurt 32 oz', 'Dairy', 'chl', 4.97, '#e9eef2'], ['Orange juice 52 oz', 'Dairy', 'chl', 3.98, '#f39a1e'],
  ['Ground beef 80/20 2 lb', 'Meat', 'chl', 10.84, '#a3333a'], ['Chicken breast 3 lb', 'Meat', 'chl', 9.37, '#e8b8a8'], ['Bacon 16 oz', 'Meat', 'chl', 5.97, '#b54848'], ['Deli turkey 16 oz', 'Deli', 'chl', 5.48, '#e2c4a0'],
  ['Frozen pizza, pepperoni', 'Frozen', 'frz', 4.98, '#c2412e'], ['Frozen fries 32 oz', 'Frozen', 'frz', 3.24, '#e8c35a'], ['Vanilla ice cream 48 oz', 'Frozen', 'frz', 3.47, '#f5ecd6'], ['Frozen broccoli 12 oz', 'Frozen', 'frz', 1.38, '#4f8a3a'],
  ['Chicken nuggets 32 oz', 'Frozen', 'frz', 7.68, '#d39a4a'], ['Waffles 24 ct', 'Frozen', 'frz', 3.98, '#d6a24a'], ['Ice 10 lb bag', 'Frozen', 'frz', 2.48, '#cfe6f2'],
  ['White bread 20 oz', 'Bakery', 'amb', 1.42, '#f3ead8'], ['Bagels 6 ct', 'Bakery', 'amb', 2.97, '#d8a868'], ['Chocolate chip cookies', 'Bakery', 'amb', 3.48, '#7a4a2a'],
  ['Spaghetti 16 oz', 'Pasta & Sauce', 'amb', 1.12, '#2f5aa8'], ['Marinara sauce 24 oz', 'Pasta & Sauce', 'amb', 1.98, '#b8352a'], ['Mac & cheese 7.25 oz', 'Pasta & Sauce', 'amb', 1.08, '#2c6ad0'],
  ['Long grain rice 5 lb', 'Rice & Beans', 'amb', 4.12, '#e9e3d0'], ['Black beans 15.5 oz', 'Rice & Beans', 'amb', .84, '#3a3030'], ['Chicken noodle soup', 'Soup', 'amb', 1.48, '#c8302c'],
  ['Peanut butter 40 oz', 'Breakfast', 'amb', 5.48, '#b98a4a'], ['Grape jelly 32 oz', 'Breakfast', 'amb', 2.98, '#6b2f6b'], ['Honey oat cereal 18 oz', 'Breakfast', 'amb', 3.92, '#e2a62a'], ['Oatmeal 42 oz', 'Breakfast', 'amb', 4.48, '#c8a878'],
  ['Ground coffee 30.5 oz', 'Coffee', 'amb', 11.97, '#5a3a2a'], ['Tortilla chips 13 oz', 'Snacks', 'amb', 2.48, '#e0b04a'], ['Potato chips family size', 'Snacks', 'amb', 4.98, '#e2c23a'], ['Pretzels 16 oz', 'Snacks', 'amb', 2.58, '#b07a3a'],
  ['Spring water 24 pk', 'Beverages', 'amb', 4.38, '#7fc2e8'], ['Cola 12 pk cans', 'Beverages', 'amb', 7.48, '#b8202a'], ['Sports drink 8 pk', 'Beverages', 'amb', 6.48, '#3fb0e0'], ['Sparkling water 8 pk', 'Beverages', 'amb', 4.27, '#d8e8ee'],
  ['Paper towels 6 rolls', 'Paper', 'amb', 8.97, '#f2f2f2'], ['Toilet paper 12 rolls', 'Paper', 'amb', 9.84, '#f0f0f6'], ['Laundry detergent 92 oz', 'Laundry', 'amb', 11.97, '#2a62c8'], ['Dish soap 24 oz', 'Cleaning', 'amb', 2.47, '#46b04a'],
  ['Trash bags 13 gal 40 ct', 'Cleaning', 'amb', 7.48, '#3a3a3a'], ['Dog food 15 lb', 'Pet', 'amb', 14.98, '#a0522d'], ['Cat litter 25 lb', 'Pet', 'amb', 9.97, '#9a9a9a'], ['Diapers size 3, 84 ct', 'Baby', 'amb', 24.97, '#7fb6e6'],
  ['Shampoo 25 oz', 'Health & Beauty', 'amb', 4.97, '#9f6ad0'], ['Toothpaste 2 pk', 'Health & Beauty', 'amb', 3.97, '#e8eef6'], ['Ibuprofen 200 ct', 'Pharmacy OTC', 'amb', 6.88, '#c8302c'], ['AA batteries 8 pk', 'Electronics', 'amb', 7.97, '#e0b02a'],
];
const DEPT_ORDER = ['Produce', 'Bakery', 'Deli', 'Meat', 'Dairy', 'Frozen', 'Pasta & Sauce', 'Rice & Beans', 'Soup', 'Breakfast', 'Coffee', 'Snacks', 'Beverages', 'Paper', 'Laundry', 'Cleaning', 'Pet', 'Baby', 'Health & Beauty', 'Pharmacy OTC', 'Electronics'];
const FIRST = ['M.', 'J.', 'A.', 'K.', 'S.', 'D.', 'R.', 'L.', 'T.', 'C.', 'P.', 'B.'], LAST = ['Russo', 'Kowalski', 'Murphy', 'Patel', 'Ruiz', "O'Neill", 'Esposito', 'Nguyen', 'Schmidt', 'Rivera', 'Kelly', 'Lombardi', 'Shah', 'Fitzgerald', 'DeMarco', 'Cohen'];

export class Store {
  constructor(scene, world, roads, player, phone) {
    this.scene = scene; this.world = world; this.roads = roads; this.player = player; this.phone = phone;
    this.built = false; this.job = { clocked: false, batch: null, done: [], picks: 0, startT: 0, pickT: 0, cart: false, nils: 0, subs: 0, shift: 0 };
    this.r = rng(1977);
  }
  find() {
    const w = this.world.meta.walmart; if (!w) return null;
    const P = []; for (let q = 0; q < w.poly.length; q += 2) P.push(w.poly[q] / 10, w.poly[q + 1] / 10);
    return P;
  }
  tryBuild() {
    if (this.built) return; const P = this.find(); if (!P) return;
    let cx = 0, cz = 0; for (let q = 0; q < P.length; q += 2) { cx += P[q]; cz += P[q + 1]; } cx /= P.length / 2; cz /= P.length / 2;
    this.cx = cx; this.cz = cz;
    if (Math.hypot(this.player.x - cx, this.player.z - cz) > 1300 || !this.world.ready(cx, cz)) return; // built whenever its tile is loaded: the store IS the building
    this.build(P); this.built = true;
  }
  build(P) {
    this.P = P;
    // oriented box of the footprint
    let best = null;
    for (let q = 0; q < P.length; q += 2) {
      const a = Math.atan2(P[(q + 3) % P.length] - P[q + 1], P[(q + 2) % P.length] - P[q]), c = Math.cos(a), s = Math.sin(a);
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (let k = 0; k < P.length; k += 2) { const u = P[k] * c + P[k + 1] * s, v = -P[k] * s + P[k + 1] * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      // big boxes are built square to their longest wall: orient on the longest edge, not the min-area box
      const el = Math.hypot(P[(q + 2) % P.length] - P[q], P[(q + 3) % P.length] - P[q + 1]);
      if (!best || el > best.el) best = { el, a, u0, u1, v0, v1 };
    }
    let { a, u0, u1, v0, v1 } = best; if (v1 - v0 > u1 - u0) { a += Math.PI / 2; [u0, u1, v0, v1] = [v0, v1, -u1, -u0]; }
    const c = Math.cos(a), s = Math.sin(a);
    // front = the long side facing the bigger parking lot / Route 88 (nearest major road)
    const Wd = (u, v) => [u * c - v * s, u * s + v * c];
    const mA = Wd((u0 + u1) / 2, v0), mB = Wd((u0 + u1) / 2, v1);
    // the front faces the main parking lot: area-weighted centre of the parking polygons around the building
    let px = 0, pz = 0, pw = 0;
    for (const t of this.world.tiles.values()) for (const ar of t.d.areas) {
      if (ar.k !== 'parking') continue; let cx2 = 0, cz2 = 0, n2 = ar.p.length / 2; for (let q = 0; q < ar.p.length; q += 2) { cx2 += ar.p[q] / 10; cz2 += ar.p[q + 1] / 10; } cx2 /= n2; cz2 /= n2;
      if (Math.hypot(cx2 - this.cx, cz2 - this.cz) > 260) continue; let A = 0; for (let q = 0, j = ar.p.length - 2; q < ar.p.length; j = q, q += 2) A += (ar.p[j] * ar.p[q + 1] - ar.p[q] * ar.p[j + 1]) / 200; A = Math.abs(A);
      px += cx2 * A; pz += cz2 * A; pw += A;
    }
    let frontIsV0;
    // strongest evidence: mapped doors. Loading docks / service doors are the back; customer entrances the front
    const doors = []; for (const t of this.world.tiles.values()) for (const pr of t.d.props) if (pr[0] === 'door_service' || pr[0] === 'door_main') { const x = pr[1] / 10, z = pr[2] / 10; if (Math.hypot(x - this.cx, z - this.cz) < 160) doors.push([pr[0], x, z]); }
    const svc = doors.filter(d => d[0] === 'door_service'), mainD = doors.filter(d => d[0] === 'door_main');
    if (mainD.length) { const [, x, z] = mainD[0]; frontIsV0 = Math.hypot(mA[0] - x, mA[1] - z) <= Math.hypot(mB[0] - x, mB[1] - z); }
    else if (svc.length) { const sx = svc.reduce((a, d) => a + d[1], 0) / svc.length, sz = svc.reduce((a, d) => a + d[2], 0) / svc.length; frontIsV0 = Math.hypot(mA[0] - sx, mA[1] - sz) > Math.hypot(mB[0] - sx, mB[1] - sz); }
    else if (pw > 500) { px /= pw; pz /= pw; frontIsV0 = Math.hypot(mA[0] - px, mA[1] - pz) <= Math.hypot(mB[0] - px, mB[1] - pz); }
    else { const near = (x, z) => { const h = this.roads.nearest(x, z, 400, e => e.cls >= 5); return h ? h.d : 999; }; frontIsV0 = near(...mA) <= near(...mB); }
    // local frame: u along the front (0..L), v depth from the front wall (0..D)
    let L = u1 - u0, D = v1 - v0;
    const F0 = frontIsV0 ? (u, v) => Wd(u0 + u, v0 + v) : (u, v) => Wd(u1 - u, v1 - v);
    // real footprints are not rectangles (chamfered corners, notches, the 2013 grocery addition): shrink the frame
    // to the rectangle that is actually inside the walls, so nothing (the OGP room!) lands outside the building
    const inP = (u, v) => pointInPoly(...F0(u, v), P);
    let ua = 0, ub = L, va = 0, vb = D;
    for (let k = 3; k <= 7; k++) { const v = D * k / 10; let a2 = 0; while (a2 < L / 2 && !inP(a2, v)) a2 += .5; let b2 = L; while (b2 > L / 2 && !inP(b2, v)) b2 -= .5; ua = Math.max(ua, a2); ub = Math.min(ub, b2); }
    for (let k = 3; k <= 7; k++) { const u = ua + (ub - ua) * k / 10; let a2 = 0; while (a2 < D / 2 && !inP(u, a2)) a2 += .5; let b2 = D; while (b2 > D / 2 && !inP(u, b2)) b2 -= .5; va = Math.max(va, a2); vb = Math.min(vb, b2); }
    ua += .3; va += .3; ub -= .3; vb -= .3;
    L = ub - ua; D = vb - va;
    const F = (u, v) => F0(ua + u, va + v);
    const yawF = Math.atan2(...(() => { const [ax, az] = F(0, 0), [bx, bz] = F(0, 1); return [bx - ax, bz - az]; })()); // +v direction
    this.F = F; this.L = L; this.D = D;
    // which end is grocery: the end nearer the bigger open lot (pickup spots). Default: u=0 end.
    const gEnd = STORE_LAYOUT.groceryEnd === 'right' ? 1 : 0;
    const G = gEnd ? (u, v) => F(L - u, v) : F; // grocery-relative frame (u=0 at the grocery end)
    this.G = G;
    const [ox, oz] = G(0, 0); const y0 = Math.min(...[0, 1, 2, 3].map(i => this.world.height(...G(i % 2 ? L : 0, i > 1 ? D : 0)))) + .15;
    this.floorY = y0;
    const grp = new THREE.Group(); this.g = grp; this.scene.add(grp);
    const yaw = Math.atan2(...(() => { const [ax, az] = G(0, 0), [bx, bz] = G(1, 0); return [bx - ax, bz - az]; })()) - Math.PI / 2; // local +x along u
    const frontV = (u) => { let v = 0; while (v > -40 && pointInPoly(...G(u, v - .2), P)) v -= .2; return v; }; // the real facade in front of u
    this.frontV = frontV;
    const [vox, voz] = G(0, 0), [v1x, v1z] = G(0, 1); const out = Math.atan2(-(v1x - vox), -(v1z - voz)), inn = out + Math.PI; // plane yaw facing out of / into the store
    const box = (u, v, y, su, sy, sv, mat) => { const [x, z] = G(u, v); const o = new THREE.Mesh(new THREE.BoxGeometry(su, sy, sv), mat); o.position.set(x, y0 + y, z); o.rotation.y = yaw; grp.add(o); return o; };
    const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
    const floor = M('#d9d6cd'), shelf = M('#e8e8e6'), shelfDk = M('#9aa0a6'), cooler = M('#f4f5f6'), glass = new THREE.MeshPhongMaterial({ color: '#cfe6f2', transparent: true, opacity: .35, shininess: 90 }), blue = M('#0b4fa8'), yel = M('#ffc220'), wall = M('#ecebe6', { side: THREE.DoubleSide, emissive: '#3a3a38' }), ceil = M('#c8c9c4', { side: THREE.DoubleSide, emissive: '#77776f' });
    // shell: the store draws its own building along the REAL footprint (the world skips Walmart's walls), so the
    // entrances are real openings you walk through
    const fl = box(L / 2, D / 2, -.08, L + 1, .16, D + 1, floor); fl.receiveShadow = true;
    const H = 7.6;
    { const shp = new THREE.Shape(); for (let q = 0; q < P.length; q += 2) q ? shp.lineTo(P[q], P[q + 1]) : shp.moveTo(P[q], P[q + 1]);
      const fl2 = new THREE.Mesh(new THREE.ShapeGeometry(shp), floor); fl2.rotation.x = Math.PI / 2; fl2.position.y = y0 + .005; fl2.material.side = THREE.DoubleSide; grp.add(fl2);
      const rf = new THREE.Mesh(new THREE.ShapeGeometry(shp), ceil); rf.rotation.x = Math.PI / 2; rf.position.y = y0 + H; grp.add(rf);
      const rfo = new THREE.Mesh(new THREE.ShapeGeometry(shp), M('#d9d6cf', { side: THREE.DoubleSide })); rfo.rotation.x = Math.PI / 2; rfo.position.y = y0 + H + .9; grp.add(rfo); }
    // ceiling light strips
    const lightM = new THREE.MeshBasicMaterial({ color: '#fbfbf4' });
    for (let u = 6; u < L - 4; u += 6) for (let v = 6; v < D - 4; v += 12) box(u, v, 7.1, .3, .05, 8, lightM);
    this.lamps = []; for (let k = 0; k < 4; k++) { const l = new THREE.PointLight('#fff8ec', 30, 60, 1.2); const [x, z] = G(L * (k + .5) / 4, D * .5); l.position.set(x, y0 + 6.5, z); grp.add(l); this.lamps.push(l); }
    // entrances on the front wall: grocery (u≈0.18L) and home & pharmacy (u≈0.78L)
    this.doors = [[L * .18, 0, 'Grocery & Pickup'], [L * .78, 0, 'Home & Pharmacy']];
    const walls = [];
    // exterior walls on the footprint, split where an entrance meets them (3.6 m openings)
    const doorPts = this.doors.map(([u]) => G(u, 0));
    const extM = M('#cdcac1', { side: THREE.DoubleSide }), band = M('#8e9399', { side: THREE.DoubleSide });
    const wallSeg = (ax, az, bx, bz) => { const Lw = Math.hypot(bx - ax, bz - az); if (Lw < .05) return; walls.push([ax, az, bx, bz]);
      for (const [hh, yy, m] of [[H + .9, (H + .9) / 2, extM]]) { const o = new THREE.Mesh(new THREE.PlaneGeometry(Lw, hh), m); o.position.set((ax + bx) / 2, y0 + yy, (az + bz) / 2); o.rotation.y = -Math.atan2(bz - az, bx - ax); grp.add(o); }
      const o2 = new THREE.Mesh(new THREE.BoxGeometry(Lw, .9, .25), band); o2.position.set((ax + bx) / 2, y0 + H + .45, (az + bz) / 2); o2.rotation.y = -Math.atan2(bz - az, bx - ax); grp.add(o2); };
    for (let q = 0; q < P.length; q += 2) {
      const ax = P[q], az = P[q + 1], bx = P[(q + 2) % P.length], bz = P[(q + 3) % P.length]; const Lw = Math.hypot(bx - ax, bz - az);
      const cuts = [];
      for (const [dx, dz] of doorPts) { const [d, t] = distSeg(dx, dz, ax, az, bx, bz); if (d < 9 && t > 0 && t < 1) cuts.push(t); }
      if (!cuts.length) { wallSeg(ax, az, bx, bz); continue; }
      cuts.sort(); let t0 = 0;
      for (const t of cuts) { const h = 1.8 / Lw; wallSeg(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * (t - h), az + (bz - az) * (t - h)); t0 = t + h;
        // entrance portal: canopy + blue fascia over the opening
        const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t; const nx = (bz - az) / Lw, nz = -(bx - ax) / Lw;
        const can = new THREE.Mesh(new THREE.BoxGeometry(7, .5, 3.2), M('#9aa3ab')); can.position.set(cx + nx * 1.6 * this.outSign(cx, cz, nx, nz), y0 + 4.2, cz + nz * 1.6 * this.outSign(cx, cz, nx, nz)); can.rotation.y = -Math.atan2(bz - az, bx - ax); grp.add(can);
        const fas = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.6, .3), blue); fas.position.copy(can.position); fas.position.y = y0 + 5.2; fas.rotation.y = can.rotation.y; grp.add(fas); }
      wallSeg(ax + (bx - ax) * t0, az + (bz - az) * t0, bx, bz);
    }
    // signs above the doors (outside + inside)
    for (const [u, v, txt] of this.doors) {
      const tex = canvasTex(512, 96, (g) => { g.fillStyle = '#0b4fa8'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#fff'; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 256, 50); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); const [x, z] = G(u, frontV(u) - .45); m.position.set(x, y0 + 6.1, z); m.rotation.y = out; grp.add(m);
      // vestibule doors (slide open when near)
      const dl = box(u - .75, -.05, 1.15, 1.5, 2.3, .06, glass), dr = box(u + .75, -.05, 1.15, 1.5, 2.3, .06, glass);
      (this.slides = this.slides || []).push([dl, dr, u]);
    }
    // the big front sign
    { const tex = canvasTex(1024, 192, (g) => { g.fillStyle = '#0b4fa8'; g.font = 'bold 150px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Walmart', 470, 100); g.fillStyle = '#ffc220'; for (let k = 0; k < 6; k++) { g.save(); g.translate(890, 96); g.rotate(k * Math.PI / 3); g.fillRect(-9, -70, 18, 46); g.restore(); } });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(22, 4.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); const [x, z] = G(L * .48, frontV(L * .48) - .2); m.position.set(x, y0 + 6.6, z); m.rotation.y = out; grp.add(m); }
    // ---- departments ----
    const locs = new Map(); // dept -> list of pick locations {u,v,face,aisle,sec}
    const addLoc = (dept, u, v, face, aisle) => { if (!locs.has(dept)) locs.set(dept, []); locs.get(dept).push({ u, v, face, aisle, sec: locs.get(dept).length % 12 + 1 }); };
    const prod = new THREE.MeshLambertMaterial(); // per-instance colours
    const facings = []; const fr = rng(42);
    const shelfRun = (uC, vA, vB, aisleNo, depts, cold) => {
      // a double-sided gondola along v at uC
      const len = vB - vA; box(uC, (vA + vB) / 2, .9, STORE_LAYOUT.shelfD, 1.8 + (cold ? .3 : 0), len, cold ? cooler : shelf);
      box(uC, (vA + vB) / 2, 1.95 + (cold ? .3 : 0), STORE_LAYOUT.shelfD + .05, .08, len, blue);
      for (let v = vA + .6; v < vB - .3; v += 1.25) for (let lvl = 0; lvl < 5; lvl++) for (const sd of [-1, 1]) facings.push([uC + sd * (STORE_LAYOUT.shelfD / 2 + .02), v, .25 + lvl * .36, fr()]);
      for (let k = 0; k < depts.length; k++) { const d = depts[k]; for (let v = vA + 1; v < vB - 1; v += len / 6) { addLoc(d, uC - STORE_LAYOUT.shelfD / 2 - 1.0, v, 1, aisleNo); addLoc(d, uC + STORE_LAYOUT.shelfD / 2 + 1.0, v, -1, aisleNo + 1); } }
      // aisle marker sign hanging above
      const tex = canvasTex(256, 160, (g) => { g.fillStyle = '#0b4fa8'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#ffc220'; g.font = 'bold 56px Arial'; g.textAlign = 'center'; g.fillText(String(aisleNo), 128, 60); g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; depts.slice(0, 3).forEach((d, i) => g.fillText(d, 128, 98 + i * 24)); });
      for (const vv of [vA - .5, vB + .5]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); const [x, z] = G(uC + 1.6, vv); m.position.set(x, y0 + 3.4, z); m.rotation.y = yaw + Math.PI / 2; grp.add(m); }
    };
    // grocery half: u in [0, 0.47L]
    const gW = L * .47, aw = STORE_LAYOUT.aisleW + STORE_LAYOUT.shelfD;
    // produce at the grocery entrance (bins), bakery + deli along the side wall, meat/dairy coolers along the back
    for (let u = 6; u < Math.min(gW * .5, 30); u += 3.2) for (let v = 9; v < 22; v += 3.6) { box(u, v, .45, 2.2, .9, 2.6, M('#7a5a3a')); for (let k = 0; k < 6; k++) facings.push([u - .8 + (k % 3) * .8, v - .8 + ((k / 3) | 0) * 1.6, .95, fr(), 1]); addLoc('Produce', u + 1.6, v, 0, 0); }
    box(1.2, D * .35, 1.1, 1.6, 2.2, D * .35, M('#e9e0cf')); for (let v = D * .2; v < D * .5; v += 3) addLoc('Bakery', 3, v, -1, 0);
    box(1.2, D * .62, 1.1, 1.6, 2.2, D * .15, M('#f0ece4')); for (let v = D * .56; v < D * .69; v += 3) addLoc('Deli', 3, v, -1, 0);
    box(gW / 2, D - 1.1, 1.2, gW - 4, 2.4, 1.4, cooler); box(gW / 2, D - .45, 1.2, gW - 4, 2.4, .08, glass);
    for (let u = 4; u < gW - 3; u += 3) { addLoc(u < gW * .45 ? 'Meat' : 'Dairy', u, D - 3.2, 1, 0); for (let lvl = 0; lvl < 4; lvl++) facings.push([u, D - 1.85, .4 + lvl * .45, fr()]); }
    // aisles: frozen (glass doors) then dry grocery
    const aisleDepts = [['Frozen'], ['Frozen'], ['Pasta & Sauce', 'Rice & Beans'], ['Soup', 'Breakfast'], ['Coffee', 'Breakfast'], ['Snacks'], ['Beverages'], ['Paper', 'Cleaning'], ['Laundry', 'Cleaning'], ['Pet', 'Baby'], ['Health & Beauty'], ['Pharmacy OTC', 'Electronics']];
    let aisle = 1; const startU = Math.min(gW * .5, 30) + 4;
    const vA = 26, vB = D - 8;
    let k = 0;
    for (let u = startU; u < L * .9 && k < aisleDepts.length; u += aw, k++) { shelfRun(u, vA, vB, aisle, aisleDepts[k], aisleDepts[k][0] === 'Frozen'); aisle += 2; }
    // general merchandise blocks (apparel racks, electronics wall, toys) on the far half
    for (let u = startU + aw * aisleDepts.length + 3; u < L - 6; u += 5) for (let v = 28; v < D - 10; v += 6) box(u, v, .7, 3.4, 1.4, 4, M(['#7a6a8c', '#8c5a5a', '#5a7a8c', '#7a8c5a'][((u * 7 + v) | 0) % 4]));
    // registers across the front
    for (let u = gW * .45; u < L * .72; u += 3.4) { box(u, 13, .5, 1.0, 1.0, 3.2, M('#4a4f56')); box(u + .4, 11.4, 2.2, .1, .1, .1, yel); }
    // pharmacy + vision + service desk on the GM side
    box(L * .88, D - 4, 1.2, 14, 2.4, 3, M('#e6eef6')); box(L * .86, 9, .6, 8, 1.2, 2, M('#dfe3e8'));
    // instanced product facings
    const fg = new THREE.BoxGeometry(.32, .3, .22); const im = new THREE.InstancedMesh(fg, prod, facings.length); const col = new THREE.Color(); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const hues = CAT.map(x => x[4]);
    facings.forEach(([u, v, y, h, big], i) => { const [x, z] = G(u, v); p.set(x, y0 + y, z); sc.set(big ? 2 : 1, big ? .6 : .9 + h * .4, big ? 2 : 3.2); im.setMatrixAt(i, m4.compose(p, q, sc)); col.set(hues[(h * hues.length) | 0]); im.setColorAt(i, col); });
    grp.add(im); this.inner = [im, ...this.lamps];
    // ---- the OGP room: front corner at the grocery end ----
    const ogU = 2, ogV = 2, ogW = Math.min(16, gW * .3), ogD = 9;
    box(ogU + ogW / 2, ogV + ogD + .05, 1.5, ogW, 3, .12, M('#dfe2e4'));
    box(ogU + ogW + .05, ogV + ogD / 2 + 1.5, 1.5, .12, 3, ogD - 3, M('#dfe2e4'));
    { const [ax, az] = G(ogU, ogV + ogD), [bx, bz] = G(ogU + ogW, ogV + ogD); walls.push([ax, az, bx, bz]); const [cx2, cz2] = G(ogU + ogW, ogV + 3), [dx2, dz2] = G(ogU + ogW, ogV + ogD); walls.push([cx2, cz2, dx2, dz2]); }
    const tex = canvasTex(512, 96, (g) => { g.fillStyle = '#f47321'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#fff'; g.font = 'bold 50px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Pickup · Associates', 256, 50); });
    { const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, .85), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); const [x, z] = G(ogU + ogW / 2, ogV + ogD + .15); m.position.set(x, y0 + 3.4, z); m.rotation.y = inn; grp.add(m); }
    // staging: ambient racks, chiller and freezer (walk-in doors)
    this.stage = { amb: [], chl: null, frz: null, carts: null };
    for (let kq = 0; kq < 4; kq++) { box(ogU + 1 + kq * 2.6, ogV + 1.2, 1.1, 2.2, 2.2, .7, shelfDk); this.stage.amb.push([ogU + 1 + kq * 2.6, ogV + 2.2, 'A' + (kq + 1)]); }
    box(ogU + ogW - 2.2, ogV + 4.5, 1.3, 3.8, 2.6, 2.6, cooler); this.stage.chl = [ogU + ogW - 4.6, ogV + 4.5, 'Chiller'];
    box(ogU + ogW - 2.2, ogV + 7.6, 1.3, 3.8, 2.6, 2.6, M('#eef0f6')); this.stage.frz = [ogU + ogW - 4.6, ogV + 7.6, 'Freezer'];
    this.stage.carts = [ogU + 2, ogV + 6.5, 'OGP carts'];
    for (let kq = 0; kq < 3; kq++) box(ogU + 1.2 + kq * .9, ogV + 6.5, .55, .8, 1.1, 1.4, M('#3b5f9e'));
    // pickup spots outside (orange signs), on the lot in front of the grocery end
    this.spots = [];
    for (let kq = 0; kq < 8; kq++) { const u = 3 + kq * 3.0, v = frontV(3 + kq * 3.0) - 16; const [x, z] = G(u, v); const post = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.2, .08), M('#999')); post.position.set(x, this.world.height(x, z) + 1.1, z); grp.add(post); const t2 = canvasTex(128, 128, (g) => { g.fillStyle = '#f47321'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText('Pickup', 64, 50); g.font = 'bold 50px Arial'; g.fillText(String(kq + 1), 64, 104); }); const sg = new THREE.Mesh(new THREE.PlaneGeometry(.6, .6), new THREE.MeshBasicMaterial({ map: t2, side: THREE.DoubleSide })); sg.position.set(x, this.world.height(x, z) + 2.0, z); sg.rotation.y = out; grp.add(sg); this.spots.push([u, v + 3]); }
    // bike rack by the grocery door (to chain up the scooter)
    { const [x, z] = G(L * .18 - 6, frontV(L * .18 - 6) - 3.5); const rack = new THREE.Mesh(new THREE.BoxGeometry(2.4, .8, .1), M('#8b9094')); rack.position.set(x, this.world.height(x, z) + .4, z); rack.rotation.y = yaw; grp.add(rack); this.rack = [x, z]; }
    // building becomes walkable inside
    const cols = this.world.colliders.get(this.world.key(this.cx, this.cz)) || [];
    for (const cc of cols) if (cc.b && cc.b.n && /walmart/i.test(cc.b.n)) cc.enterable = true;
    for (const [kk, cs] of this.world.colliders) for (const cc of cs) if (cc.b && cc.b.n && /walmart/i.test(cc.b.n)) cc.enterable = true;
    this.walls = walls; this.locs = locs; this.yaw = yaw;
    this.coworkers = this.makeCoworkers(grp, G, y0, L, D);
  }
  makeCoworkers(grp, G, y0, L, D) {
    const out = []; const M = (c) => new THREE.MeshLambertMaterial({ color: c });
    const names = ['Tasha', 'Mike', 'Priya', 'Joe', 'Ana', 'Kev'];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.32, .9, .2), M('#2a2b30')); leg.position.y = .45; g.add(leg);
      const body = new THREE.Mesh(new THREE.BoxGeometry(.42, .6, .24), M('#24427f')); body.position.y = 1.2; g.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(.2, .24, .22), M(['#e0b195', '#a26e4c', '#c99272', '#f1c9ad', '#7a4f33', '#e0b195'][i])); head.position.y = 1.65; g.add(head);
      const [x, z] = G(8 + i * 9, 24 + (i % 3) * 14); g.position.set(x, y0, z); grp.add(g);
      out.push({ g, name: names[i], t: Math.random() * 10, u: 8 + i * 9, v: 24 + (i % 3) * 14 });
    }
    return out;
  }
  outSign(x, z, nx, nz) { return pointInPoly(x + nx * 2, z + nz * 2, this.P) ? -1 : 1; } // which side of a wall is outside
  local(x, z) { // world -> grocery-frame (u, v)
    const [ox, oz] = this.G(0, 0), [ux, uz] = this.G(1, 0), [vx, vz] = this.G(0, 1);
    const dx = x - ox, dz = z - oz; return [dx * (ux - ox) + dz * (uz - oz), dx * (vx - ox) + dz * (vz - oz)];
  }
  inside(x, z) { return this.P && pointInPoly(x, z, this.P); }
  // ---------------------------------------------------------------- per frame
  update(dt, hour) {
    if (!this.built) { this.tryBuild(); return; }
    const p = this.player; const near = Math.hypot(p.x - this.cx, p.z - this.cz) < 200;
    for (const o of this.inner) o.visible = near; // shelves full of product and the ceiling lights only matter up close
    if (!near) { if (p.walls === this.walls) p.walls = []; return; }
    if (!p.walls.length || p.walls === this.walls) p.walls = this.walls;
    const ins = this.inside(p.x, p.z);
    p.inside = ins ? { floorY: this.floorY } : (p.inside && p.inside.floorY === this.floorY ? null : p.inside);
    for (const [dl, dr, u] of this.slides) { const [lu, lv] = this.local(p.x, p.z); const o = Math.abs(lu - u) < 4 && Math.abs(lv) < 5 ? 1.4 : 0; const [bx, bz] = this.G(u - .75 - o, -.05), [cx, cz] = this.G(u + .75 + o, -.05); dl.position.x += (bx - dl.position.x) * Math.min(1, dt * 6); dl.position.z += (bz - dl.position.z) * Math.min(1, dt * 6); dr.position.x += (cx - dr.position.x) * Math.min(1, dt * 6); dr.position.z += (cz - dr.position.z) * Math.min(1, dt * 6); }
    for (const c of this.coworkers) { c.t += dt; const u = c.u + Math.sin(c.t * .2) * 6, v = c.v + Math.cos(c.t * .13) * 3; const [x, z] = this.G(u, v); c.g.position.x = x; c.g.position.z = z; c.g.rotation.y = this.yaw + Math.sin(c.t * .2) * 1.5; }
    if (this.job.batch) this.job.pickT += dt;
    if (this.job.clocked) this.job.shift += dt;
  }
  // interaction prompt + action when E is pressed
  interact(press) {
    const p = this.player; if (!this.built) return null;
    const [lu, lv] = this.local(p.x, p.z);
    if (this.rack && Math.hypot(p.x - this.rack[0], p.z - this.rack[1]) < 2.6 && !p.riding) {
      const sd = Math.hypot(p.sc.x - this.rack[0], p.sc.z - this.rack[1]);
      if (sd < 3.2) { if (press) { p.sc.locked = !p.sc.locked; p.lockAnim = 1.2; toast(p.sc.locked ? 'Chained up to the rack. (E to unlock)' : 'Unlocked.'); } return p.sc.locked ? 'E: unlock the scooter' : 'E: chain the scooter to the rack'; }
    }
    if (!this.inside(p.x, p.z)) return null;
    const J = this.job;
    const st = this.stage;
    const d2 = (a) => Math.hypot(lu - a[0], lv - a[1]);
    if (d2(st.carts) < 2.2 && J.clocked && !J.cart) { if (press) { J.cart = true; toast('Grabbed an OGP cart: 6 tote slots, A-F.'); this.phone.refresh(); } return 'E: grab an OGP cart'; }
    if (J.batch) {
      const it = J.batch.items[J.batch.i];
      if (it) {
        const L = it.loc; const d = Math.hypot(lu - L.u, lv - L.v);
        if (d < 1.6) {
          if (press) this.scan(it);
          return `E: scan ${it.name} (${it.got}/${it.qty})`;
        }
      } else {
        // all picked: stage totes
        const zone = J.batch.temp; const tgt = zone === 'amb' ? st.amb[J.batch.slot % st.amb.length] : zone === 'chl' ? st.chl : st.frz;
        if (d2(tgt) < 2.4) { if (press) this.stageBatch(); return `E: stage totes at ${tgt[2]}`; }
      }
    }
    return null;
  }
  // ---------------------------------------------------------------- OGP job
  clockIn() {
    if (!this.built || !this.player || Math.hypot(this.player.x - this.cx, this.player.z - this.cz) > 160) { toast('You have to be at the store to clock in (geofence).'); return false; }
    this.job.clocked = !this.job.clocked; this.job.shift = this.job.clocked ? 0 : this.job.shift;
    toast(this.job.clocked ? 'Clocked in. Grab a cart in the Pickup room.' : 'Clocked out. Nice work.'); return true;
  }
  newBatch(temp) {
    const J = this.job; if (!J.clocked) { toast('Clock in first (Me app).'); return; } if (!J.cart) { toast('Grab an OGP cart from the Pickup room first.'); return; }
    const r = this.r; const pool = CAT.filter(c => c[2] === temp); const nOrders = 2 + ((r() * 3) | 0);
    const items = []; const orders = [];
    for (let o = 0; o < nOrders; o++) {
      const id = 4000 + ((r() * 5999) | 0); const cust = FIRST[(r() * FIRST.length) | 0] + ' ' + LAST[(r() * LAST.length) | 0]; const tote = 'ABCDEF'[o];
      orders.push({ id, cust, tote, subsOK: r() < .75 });
      const n = 2 + ((r() * (temp === 'amb' ? 7 : 4)) | 0);
      for (let k = 0; k < n; k++) {
        const c = pool[(r() * pool.length) | 0]; const lst = this.locs.get(c[1]) || [...this.locs.values()][0];
        const loc = lst[(r() * lst.length) | 0];
        items.push({ name: c[0], dept: c[1], price: c[3], col: c[4], qty: 1 + (r() < .25 ? 1 : 0) + (r() < .08 ? 2 : 0), got: 0, order: o, tote, loc, oos: r() < .07, upc: String(10000 + ((r() * 89999) | 0)) });
      }
    }
    // pick-walk order: by department order then aisle then section (what the app does)
    items.sort((a, b) => DEPT_ORDER.indexOf(a.dept) - DEPT_ORDER.indexOf(b.dept) || a.loc.aisle - b.loc.aisle || a.loc.v - b.loc.v);
    J.batch = { temp, items, orders, i: 0, due: (temp === 'frz' ? 20 : temp === 'chl' ? 30 : 45) * 60, slot: (r() * 4) | 0, t0: J.shift };
    J.pickT = 0; toast(`Batch: ${orders.length} orders, ${items.reduce((s, i) => s + i.qty, 0)} units (${temp === 'amb' ? 'ambient' : temp === 'chl' ? 'chilled' : 'frozen'}).`);
    this.phone.refresh();
  }
  scan(it) {
    const J = this.job;
    if (it.oos) { this.phone.oos(it); return; }
    it.got++; J.picks++; this.onBeep && this.onBeep(true);
    if (it.got >= it.qty) { toast(`✓ ${it.name} → tote ${it.tote}`); J.batch.i++; }
    this.phone.refresh();
  }
  resolveOOS(it, choice) {
    const J = this.job; const order = J.batch.orders[it.order];
    if (choice === 'sub' && order.subsOK) { const sub = CAT.find(c => c[1] === it.dept && c[0] !== it.name) || CAT[0]; toast(`Substituted ${sub[0]} (customer allows subs).`); J.subs++; it.name = sub[0] + ' (sub)'; it.oos = false; it.got = it.qty; J.picks += it.qty; }
    else { toast(`Nil pick: ${it.name}. The customer gets a refund.`); J.nils++; }
    J.batch.i++; this.phone.refresh();
  }
  stageBatch() {
    const J = this.job, b = J.batch; const units = b.items.reduce((s, i) => s + i.got, 0);
    const mins = J.pickT / 60; const rate = mins > 0 ? Math.round(units / mins * 60) : 0;
    J.done.push({ temp: b.temp, units, mins, rate, late: J.pickT > b.due, orders: b.orders.length });
    toast(`Staged ${b.orders.length} orders, ${units} units in ${mins.toFixed(1)} min: ${rate} units/hr${J.pickT > b.due ? ' (late)' : ''}.`, 4200);
    J.batch = null; this.phone.refresh();
  }
  itemsLeft() { const b = this.job.batch; return b ? b.items.slice(b.i) : []; }
}
export { CAT };
