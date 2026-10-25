// Hand-built details where the open data only has a footprint: casino signs in Atlantic City, the MATES sign,
// the Sedge Island house (an island in Barnegat Bay with no building in any dataset).
import * as THREE from '../vendor/three.module.js';
import { canvasTex, pointInPoly } from './util.js';

export class SetPieces {
  constructor(game) { this.g = game; this.todo = []; this.lights = [];
    const id = game.region.id;
    if (id === 'ac') { this.todo.push(() => this.casinoSign(/^caesars atlantic city$/i, 'CAESARS', '#f2d27a', '#4a2a10')); this.todo.push(() => this.casinoSign(/^resorts/i, 'RESORTS', '#ffffff', '#0a5a6a')); }
    if (id === 'mates') this.todo.push(() => this.monument(/marine academy of technology/i, 'MATES', 'Marine Academy of Technology & Environmental Science'));
    if (id === 'ibsp') this.todo.push(() => this.sedgeHouse());
  }
  poi(re) { const p = this.g.meta.pois.find(p => re.test(p[0])); return p ? [p[1] / 10, p[2] / 10] : null; }
  bldNear(x, z, r = 90) { // the building under / nearest a point, from the loaded tiles
    let best = null, bd = r;
    for (const t of this.g.world.tiles.values()) for (const b of t.d.bld) {
      const P = []; for (let q = 0; q < b.p.length; q += 2) P.push(b.p[q] / 10, b.p[q + 1] / 10);
      let cx = 0, cz = 0; for (let q = 0; q < P.length; q += 2) { cx += P[q]; cz += P[q + 1]; } cx /= P.length / 2; cz /= P.length / 2;
      const d = pointInPoly(x, z, P) ? 0 : Math.hypot(cx - x, cz - z) + (b.h > 20 ? -20 : 0);
      if (d < bd) { bd = d; best = { b, P, cx, cz }; }
    }
    return best;
  }
  update(dt, night) {
    for (let i = this.todo.length - 1; i >= 0; i--) { try { if (this.todo[i]()) this.todo.splice(i, 1); } catch (e) { console.warn('setpiece', e); this.todo.splice(i, 1); } }
    for (const l of this.lights) l.material.opacity = night > .4 ? 1 : .85;
  }
  casinoSign(re, text, fg, bg) {
    const p = this.poi(re); if (!p) return true; if (!this.g.world.ready(p[0], p[1])) return false;
    const hit = this.bldNear(p[0], p[1]); if (!hit) return true;
    const { b, cx, cz } = hit; const y = this.g.world.height(cx, cz) + b.h + .5;
    const tex = canvasTex(1024, 256, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 1024, 256); g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(14, 14, 996, 228); g.fillStyle = fg; g.font = 'bold 170px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 138); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }));
    m.position.set(cx, y + 3.4, cz); m.rotation.y = Math.PI / 4; // faces the ocean (south-east of the island) and the Boardwalk
    this.g.scene.add(m); this.lights.push(m); return true;
  }
  monument(re, title, sub) {
    const p = this.poi(re); if (!p) return true; if (!this.g.world.ready(p[0], p[1])) return false;
    const n = this.g.roads.nearest(p[0], p[1], 250, e => e.cls >= 3); if (!n) return true;
    const dx = p[0] - n.qx, dz = p[1] - n.qz, L = Math.hypot(dx, dz) || 1; const x = n.qx + dx / L * (n.e.way.w / 2 + 6), z = n.qz + dz / L * (n.e.way.w / 2 + 6); const y = this.g.world.height(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(-dx, -dz);
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.9, .5), new THREE.MeshLambertMaterial({ color: '#8c7b68' })); base.position.y = .95; g.add(base);
    const tex = canvasTex(1024, 380, (c) => { c.fillStyle = '#123f6b'; c.fillRect(0, 0, 1024, 380); c.fillStyle = '#ffffff'; c.font = 'bold 150px Arial'; c.textAlign = 'center'; c.fillText(title, 512, 175); c.font = '42px Arial'; c.fillText(sub, 512, 270); c.fillStyle = '#7fc4e8'; c.fillRect(160, 300, 704, 10); });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.6), new THREE.MeshBasicMaterial({ map: tex })); face.position.set(0, 1.05, .26); g.add(face);
    const face2 = face.clone(); face2.position.z = -.26; face2.rotation.y = Math.PI; g.add(face2);
    this.g.scene.add(g); return true;
  }
  sedgeHouse() {
    const p = this.poi(/^sedge islands$/i); if (!p) return true; if (!this.g.world.ready(p[0], p[1])) return false;
    // nearest dry ground to the label (the islands are low marsh: anything above the bay)
    const W = this.g.world; let best = null;
    for (let r = 0; r < 400 && !best; r += 6) for (let a = 0; a < 6.283; a += .3) { const x = p[0] + Math.cos(a) * r, z = p[1] + Math.sin(a) * r; if (W.height(x, z) > .3) { best = [x, z]; break; } }
    if (!best) best = p;
    const [x, z] = best; const y = Math.max(W.height(x, z), 0) + 1.6; // on pilings above the marsh
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const cedar = new THREE.MeshLambertMaterial({ color: '#8a7358' }), trim = new THREE.MeshLambertMaterial({ color: '#f2efe8' }), roof = new THREE.MeshLambertMaterial({ color: '#4a4744', flatShading: true }), pile = new THREE.MeshLambertMaterial({ color: '#5b4a3a' });
    for (const [px, pz] of [[-4, -3], [4, -3], [-4, 3], [4, 3], [0, -3], [0, 3], [-4, 6], [4, 6]]) { const o = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, y + .5, 6), pile); o.position.set(px, (y + .5) / 2 - .5, pz); g.add(o); }
    const body = new THREE.Mesh(new THREE.BoxGeometry(8.5, 5.4, 6.5), cedar); body.position.set(0, y + 2.7, 0); g.add(body);
    const r1 = new THREE.Mesh(new THREE.CylinderGeometry(.01, 5.4, 3, 4, 1), roof); r1.rotation.y = Math.PI / 4; r1.scale.set(1.15, 1, .88); r1.position.set(0, y + 6.9, 0); g.add(r1);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8.5, .2, 3.2), pile); deck.position.set(0, y, 4.8); g.add(deck);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(8.5, .9, .08), trim); rail.position.set(0, y + .55, 6.35); g.add(rail);
    for (let i = -3; i <= 3; i += 2) for (const yy of [1.6, 4.1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, .06), new THREE.MeshLambertMaterial({ color: '#3a4650' })); w.position.set(i, y + yy, 3.27); g.add(w); const f = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, .04), trim); f.position.set(i, y + yy, 3.25); g.add(f); }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.1, .08), trim); door.position.set(0, y + 1.05, 3.3); g.add(door);
    // dock out into the bay with a couple of kayaks
    const dock = new THREE.Mesh(new THREE.BoxGeometry(2, .18, 22), pile); dock.position.set(0, .9, 17); g.add(dock);
    for (let i = 0; i < 6; i++) { const o = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 2.2, 6), pile); o.position.set(i % 2 ? .9 : -.9, 0, 8 + i * 4); g.add(o); }
    for (const [kx, kc] of [[1.6, '#e8b23a'], [2.4, '#d0452f']]) { const k = new THREE.Mesh(new THREE.CapsuleGeometry(.3, 3.1, 4, 8), new THREE.MeshLambertMaterial({ color: kc })); k.rotation.x = Math.PI / 2; k.scale.set(1, 1, .45); k.position.set(kx, .15, 22); g.add(k); }
    const flag = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 8, 6), trim); flag.position.set(-5.5, y + 4, 4); g.add(flag);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.g.scene.add(g); return true;
  }
}
