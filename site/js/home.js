// 172 Taft Ave: the house you can walk into, the bathroom mirror and the closet, the charger.
import * as THREE from '../vendor/three.module.js';
import { Reflector } from '../vendor/addons/Reflector.js';
import { pointInPoly, toast, distSeg } from './util.js';
import { TOPS, BOTTOMS, TOP_COLS, BOTTOM_COLS, SKINS, HAIRS, HAIR_STYLES } from './character.js';

export class Home {
  constructor(scene, world, player, save) {
    this.scene = scene; this.world = world; this.player = player; this.save = save;
    this.house = null; this.built = false; this.g = null; this.addr = null;
  }
  // find the house record (from the tile builder) closest to the home point
  attach(hx, hz, label) {
    this.hx = hx; this.hz = hz; this.label = label;
  }
  tryBuild() {
    if (this.built || this.hx === undefined) return;
    const t = this.world.tiles.get(this.world.key(this.hx, this.hz)); if (!t || !t.houses) return;
    let best = null, bd = 30;
    for (const h of t.houses) { const inside = pointInPoly(this.hx, this.hz, h.P); const d = inside ? 0 : Math.hypot(h.cx - this.hx, h.cz - this.hz); if (d < bd) { bd = d; best = h; } }
    if (!best || !best.door) return;
    this.house = best; this.build(best); this.built = true;
  }
  build(h) {
    const g = new THREE.Group(); this.g = g; this.scene.add(g);
    const P = h.P, fy = h.door.y, wallH = 2.5;
    // the collider becomes enterable: footprint edges are walls with a gap at the front door
    const cols = this.world.colliders.get(this.world.key(h.cx, h.cz)) || [];
    const col = cols.find(c => c.P === h.P); if (col) col.enterable = true;
    const walls = [];
    for (let q = 0; q < P.length; q += 2) {
      const ax = P[q], az = P[q + 1], bx = P[(q + 2) % P.length], bz = P[(q + 3) % P.length];
      const [d, t] = distSeg(h.door.x, h.door.z, ax, az, bx, bz);
      if (d < .6) { // split around the 1 m door
        const L = Math.hypot(bx - ax, bz - az), t0 = Math.max(0, t - .5 / L), t1 = Math.min(1, t + .5 / L);
        walls.push([ax, az, ax + (bx - ax) * t0, az + (bz - az) * t0], [ax + (bx - ax) * t1, az + (bz - az) * t1, bx, bz]);
      } else walls.push([ax, az, bx, bz]);
    }
    // interior layout in the house's own frame: front = door side
    const fx = -h.door.ox, fz = -h.door.oz; // pointing into the house
    const rx = -fz, rz = fx;
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (let q = 0; q < P.length; q += 2) { const dx = P[q] - h.door.x, dz = P[q + 1] - h.door.z; const u = dx * rx + dz * rz, v = dx * fx + dz * fz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const W = (u, v) => [h.door.x + rx * u + fx * v, h.door.z + rz * u + fz * v];
    const yaw = Math.atan2(rx, rz); // local +x = right, local +z = into the house... (we place boxes with yaw)
    const D = v1 - Math.max(0, v0) - .3; // interior depth
    const mid = Math.min(D * .55, 5.2);
    const wallMat = new THREE.MeshLambertMaterial({ color: '#efe9dc', side: THREE.DoubleSide }), floorMat = new THREE.MeshLambertMaterial({ color: '#a77d55' }), tile = new THREE.MeshLambertMaterial({ color: '#dfe2e2' });
    const B = (u, v, y, su, sy, sv, m, rot = 0) => { const [x, z] = W(u, v); const o = new THREE.Mesh(new THREE.BoxGeometry(su, sy, sv), m); o.position.set(x, fy + y, z); o.rotation.y = yaw + rot; o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    // floor + ceiling covering the footprint
    const shp = new THREE.Shape(); for (let q = 0; q < P.length; q += 2) q ? shp.lineTo(P[q], P[q + 1]) : shp.moveTo(P[q], P[q + 1]);
    const fl = new THREE.Mesh(new THREE.ShapeGeometry(shp), floorMat); fl.rotation.x = Math.PI / 2; fl.position.y = fy + .01; fl.scale.set(1, 1, 1); fl.material.side = THREE.DoubleSide; g.add(fl);
    const ce = new THREE.Mesh(new THREE.ShapeGeometry(shp), new THREE.MeshLambertMaterial({ color: '#f6f3ec', side: THREE.DoubleSide })); ce.rotation.x = Math.PI / 2; ce.position.y = fy + wallH; g.add(ce);
    // inner wall lining (so the outside walls are visible from inside)
    for (const [ax, az, bx, bz] of walls) { const L = Math.hypot(bx - ax, bz - az); if (L < .05) continue; const o = new THREE.Mesh(new THREE.PlaneGeometry(L, wallH), wallMat); o.position.set((ax + bx) / 2, fy + wallH / 2, (az + bz) / 2); o.rotation.y = -Math.atan2(bz - az, bx - ax); g.add(o); }
    // interior partition: living room in front, hall, bedroom + bathroom behind
    const wl = (ua, va, ub, vb) => { const [ax, az] = W(ua, va), [bx, bz] = W(ub, vb); walls.push([ax, az, bx, bz]); const L = Math.hypot(bx - ax, bz - az); const o = new THREE.Mesh(new THREE.BoxGeometry(L, wallH, .1), wallMat); o.position.set((ax + bx) / 2, fy + wallH / 2, (az + bz) / 2); o.rotation.y = -Math.atan2(bz - az, bx - ax); g.add(o); };
    const uL = u0 + .2, uR = u1 - .2;
    // back wall of the living room with a 1 m opening into the hall
    wl(uL, mid, -0.6, mid); wl(0.6, mid, uR, mid);
    const bathW = Math.min(2.6, (uR - uL) * .35);
    wl(uR - bathW, mid, uR - bathW, Math.min(v1 - .2, mid + 2.6)); // bathroom side wall
    wl(uR - bathW + .9, Math.min(v1 - .2, mid + 2.6), uR, Math.min(v1 - .2, mid + 2.6));
    // furniture
    const sofa = new THREE.MeshLambertMaterial({ color: '#6c6f78' }), wood = new THREE.MeshLambertMaterial({ color: '#6b4a32' }), black = new THREE.MeshLambertMaterial({ color: '#111' }), white = new THREE.MeshLambertMaterial({ color: '#f4f4f2' });
    B(uL + 1.2, mid - 1.0, .4, 2.0, .8, .9, sofa); B(uL + 1.2, mid - .62, .75, 2.0, .7, .2, sofa);
    B(uL + 1.2, mid - 3.0, .25, 1.1, .45, .6, wood);
    B(uL + .25, mid - 2.2, 1.1, .08, .7, 1.25, black, Math.PI / 2); // TV on the wall
    B(uL + .25, mid - 2.2, .3, .45, .6, 1.4, wood);
    // bedroom: bed, desk with a PC (he makes games), dresser
    const bedV = Math.min(v1 - 1.4, mid + 1.6);
    B(uL + 1.1, bedV, .3, 1.5, .5, 2.05, new THREE.MeshLambertMaterial({ color: '#3c4a62' })); B(uL + 1.1, bedV + .95, .65, 1.5, .8, .1, wood);
    B(uR - bathW - .6, mid + .5, .38, .7, .76, 1.4, wood); B(uR - bathW - .75, mid + .5, 1.0, .05, .4, .6, black, Math.PI / 2);
    // bathroom: sink + the mirror on the wall
    const bu = uR - bathW / 2, bv = mid + .2;
    B(bu, bv + .25, .42, .9, .84, .5, white);
    const mirror = new Reflector(new THREE.PlaneGeometry(.9, 1.1), { textureWidth: 512, textureHeight: 640, color: 0xb8c0c4 });
    const [mx, mz] = W(bu, mid + .06); mirror.position.set(mx, fy + 1.55, mz); mirror.rotation.y = Math.atan2(fx, fz); g.add(mirror);
    B(uR - .5, bv + 1.6, .2, .8, .4, 1.6, tile);
    this.mirrorPos = [mx + fx * .6, mz + fz * .6]; this.mirror = mirror;
    // in first person your head is hidden from the main camera; the mirror still has to show it
    const before = mirror.onBeforeRender.bind(mirror);
    mirror.onBeforeRender = (...a) => { const fp = this.player.fp && !this.player.camOverride; if (fp) this.player.body.setFirstPerson(false); before(...a); if (fp) this.player.body.setFirstPerson(true); };
    // light inside
    const lamp = new THREE.PointLight('#ffe4b8', 0, 9, 1.5); const [lx, lz] = W((uL + uR) / 2, mid - 1.5); lamp.position.set(lx, fy + 2.3, lz); g.add(lamp); this.lamp = lamp;
    const lamp2 = new THREE.PointLight('#ffe4b8', 0, 7, 1.5); const [l2x, l2z] = W((uL + uR) / 2, mid + 1.4); lamp2.position.set(l2x, fy + 2.3, l2z); g.add(lamp2); this.lamp2 = lamp2;
    // charger by the front door
    this.chargerPos = W(1.4, -.8);
    this.walls = walls; this.floorY = fy; this.P = P;
    // front door (opens when you are near)
    const door = new THREE.Mesh(new THREE.BoxGeometry(.95, 2.1, .06), new THREE.MeshLambertMaterial({ color: '#5a3b2a' }));
    const hinge = new THREE.Group(); const [hx2, hz2] = W(-.48, 0.02); hinge.position.set(hx2, fy, hz2); hinge.rotation.y = yaw; door.position.set(.475, 1.05, 0); hinge.add(door); g.add(hinge); this.door = hinge; this.doorYaw = yaw;
    // mark the mailbox
    toast('Home: ' + (this.label || 'your house') + ' is on the map (H).', 3000);
  }
  update(dt, night) {
    if (!this.built) { this.tryBuild(); return; }
    const p = this.player;
    const inside = pointInPoly(p.x, p.z, this.P);
    p.walls = Math.hypot(p.x - this.house.cx, p.z - this.house.cz) < 25 ? this.walls : [];
    p.inside = inside ? { floorY: this.floorY } : null;
    const dd = Math.hypot(p.x - this.house.door.x, p.z - this.house.door.z);
    const open = dd < 2.2 ? 1.6 : 0; this.door.rotation.y += (this.doorYaw + open - this.door.rotation.y) * Math.min(1, dt * 5);
    this.lamp.intensity = inside ? (night > .4 ? 14 : 6) : (night > .5 ? 6 : 0); this.lamp2.intensity = this.lamp.intensity * .8;
    this.mirror.visible = Math.hypot(p.x - this.mirrorPos[0], p.z - this.mirrorPos[1]) < 8;
  }
  nearMirror() { return this.built && Math.hypot(this.player.x - this.mirrorPos[0], this.player.z - this.mirrorPos[1]) < 1.3; }
  nearCharger() { return this.built && Math.hypot(this.player.sc.x - this.chargerPos[0], this.player.sc.z - this.chargerPos[1]) < 6 && Math.hypot(this.player.x - this.chargerPos[0], this.player.z - this.chargerPos[1]) < 6; }
  // ---------- closet UI ----------
  openCloset(onChange, onClose) {
    const el = document.getElementById('closet'), box = document.getElementById('closet-opts'); el.classList.remove('hidden');
    const o = this.player.body.o;
    const row = (label, opts, key, swatch) => {
      const r = document.createElement('div'); r.className = 'closet-row'; r.innerHTML = `<label>${label}</label><div></div>`;
      const d = r.querySelector('div');
      for (const [k, v] of opts) { const s = document.createElement('span'); if (swatch) { s.className = 'sw' + (o[key] === k ? ' on' : ''); s.style.background = k; } else { s.textContent = v; s.className = o[key] === k ? 'on' : ''; } s.onclick = () => { onChange({ [key]: k }); this.openCloset(onChange, onClose); }; d.appendChild(s); }
      return r;
    };
    box.innerHTML = '';
    box.append(row('Top', Object.entries(TOPS), 'top'), row('Top colour', TOP_COLS.map(c => [c]), 'topCol', 1), row('Bottoms', Object.entries(BOTTOMS), 'bottom'), row('Bottoms colour', BOTTOM_COLS.map(c => [c]), 'bottomCol', 1),
      row('Hair', Object.entries(HAIR_STYLES), 'hairStyle'), row('Hair colour', HAIRS.map(c => [c]), 'hair', 1), row('Skin', SKINS.map(c => [c]), 'skin', 1));
    document.getElementById('closet-done').onclick = () => { el.classList.add('hidden'); onClose(); };
  }
}
