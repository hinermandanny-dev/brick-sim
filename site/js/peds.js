// People: walkers, joggers and dog walkers on the mapped sidewalks and paths (and the edge of quiet streets,
// since most of Brick's side streets have no sidewalk). Cars see them and stop.
import * as THREE from '../vendor/three.module.js';
import { Character, TOP_COLS, BOTTOM_COLS, SKINS, HAIRS } from './character.js';
import { rng, clamp } from './util.js';

const MAX = 16;
export class Peds {
  constructor(scene, world, roads) { this.scene = scene; this.world = world; this.roads = roads; this.list = []; this.r = rng(88); this.pool = []; }
  want(hour) { return Math.round(MAX * (hour < 6 ? .1 : hour < 8 ? .5 : hour < 19 ? 1 : hour < 22 ? .5 : .15)); }
  spawn(px, pz) {
    const r = this.r; const t = this.world.tiles.get(this.world.key(px + (r() - .5) * 600, pz + (r() - .5) * 600)); if (!t) return;
    let path = null;
    if (t.walks && t.walks.length && r() < .6) { const w = t.walks[(r() * t.walks.length) | 0]; if (w.P.length >= 2 && w.k !== 'cx') path = w.P.map(p => [p[0], p[1], w.raise]); }
    if (!path) { // the edge of a residential street
      const es = t.d.roads.map(i => this.roads.edges[i]).filter(e => e.way.t === 'residential' && e.len > 60); if (!es.length) return;
      const e = es[(r() * es.length) | 0]; const side = r() < .5 ? 1 : -1; const off = e.way.w / 2 - .6;
      path = []; for (let s = 0; s <= e.len; s += 6) { const a = this.roads.at(e, s); path.push([a.x - a.hz * off * side, a.z + a.hx * off * side, .06]); }
    }
    let L = 0; const cum = [0]; for (let k = 1; k < path.length; k++) { L += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]); cum.push(L); }
    if (L < 20) return;
    const ch = this.pool.pop() || new Character();
    ch.setOutfit({ top: r() < .5 ? 'tshirt' : 'sweater', bottom: r() < .35 ? 'short' : 'long', topCol: TOP_COLS[(r() * TOP_COLS.length) | 0], bottomCol: BOTTOM_COLS[(r() * BOTTOM_COLS.length) | 0], skin: SKINS[(r() * SKINS.length) | 0], hair: HAIRS[(r() * HAIRS.length) | 0], hairStyle: ['short', 'buzz', 'curly', 'long'][(r() * 4) | 0] });
    this.scene.add(ch.root);
    const jog = r() < .15;
    this.list.push({ ch, path, cum, L, s: r() * L, dir: r() < .5 ? 1 : -1, v: jog ? 2.8 + r() * .6 : 1.15 + r() * .35, jog, x: 0, z: 0, wait: 0 });
  }
  update(dt, px, pz, hour, traffic) {
    const want = this.want(hour);
    if (this.list.length < want && this.r() < .2) this.spawn(px, pz);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      // stop for a car that is about to hit you (the cars stop for you too)
      p.s += p.dir * p.v * dt;
      if (p.s < 0 || p.s > p.L) { p.dir *= -1; p.s = clamp(p.s, 0, p.L); }
      let k = 1; while (k < p.cum.length - 1 && p.cum[k] < p.s) k++;
      const a = p.path[k - 1], b = p.path[k]; const f = clamp((p.s - p.cum[k - 1]) / ((p.cum[k] - p.cum[k - 1]) || 1), 0, 1);
      p.x = a[0] + (b[0] - a[0]) * f; p.z = a[1] + (b[1] - a[1]) * f;
      const y = this.world.height(p.x, p.z) + a[2];
      const yaw = Math.atan2((b[0] - a[0]) * p.dir, (b[1] - a[1]) * p.dir);
      p.ch.root.position.set(p.x, y, p.z); p.ch.root.rotation.y += ((yaw - p.ch.root.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 6);
      p.vx = Math.sin(yaw) * p.v; p.vz = Math.cos(yaw) * p.v;
      const d = Math.hypot(p.x - px, p.z - pz);
      p.ch.root.visible = d < 260;
      if (d < 160) p.ch.animate(dt, { mode: p.jog ? 'run' : 'walk', speed: p.v });
      if (d > 520 || !this.world.ready(p.x, p.z)) { this.scene.remove(p.ch.root); this.pool.push(p.ch); this.list.splice(i, 1); }
    }
  }
}
