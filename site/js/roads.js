// Road graph built from roads.json (OSM ways split at junctions). Shared by the renderer, physics, GPS and traffic.
import { clamp, distSeg, angDiff } from './util.js';

export const CLASS = { motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5, motorway_link: 6, trunk_link: 5, primary_link: 5, secondary_link: 4, tertiary_link: 4, unclassified: 3, residential: 3, living_street: 2, service: 1 };
export const LANE_W = { motorway: 3.7, trunk: 3.6, primary: 3.6, secondary: 3.5, tertiary: 3.4, unclassified: 3.2, residential: 3.1, living_street: 3.0, service: 2.9 };
const CELL = 32;

export class Roads {
  constructor(j) {
    this.ways = j.ways;
    this.nodes = j.nodes.map(([x, z, f], i) => ({ i, x: x / 10, z: z / 10, f, out: [], inc: [], deg: 0, r: 0, cls: 0 }));
    for (const w of this.ways) { // odd lane count on an untagged two-way = centre two-way left-turn lane (very common on Brick's county roads and Rt 88)
      w.ctl = 0;
      if (!w.o && w.lf + w.lb >= 3 && (w.lf + w.lb) % 2 === 1 && Math.abs(w.lf - w.lb) === 1 && !/;|\|/.test(w.tl || '') ) { const k = (w.lf + w.lb - 1) / 2; w.lf = k; w.lb = k; w.ctl = 1; }
    }
    this.edges = j.edges.map(([a, b, w, poly], i) => {
      const n = poly.length / 2, pts = new Float32Array(poly.length), cum = new Float32Array(n);
      for (let k = 0; k < poly.length; k++) pts[k] = poly[k] / 10;
      for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(pts[2 * k] - pts[2 * k - 2], pts[2 * k + 1] - pts[2 * k - 1]);
      const way = this.ways[w];
      return { i, a, b, w, way, pts, cum, len: cum[n - 1] || 0.01, cls: CLASS[way.t] || 1, cars: [[], []], sigState: null };
    });
    for (const e of this.edges) {
      const A = this.nodes[e.a], B = this.nodes[e.b];
      A.inc.push(e.i); B.inc.push(e.i); A.deg++; B.deg++;
      A.r = Math.max(A.r, e.way.w / 2); B.r = Math.max(B.r, e.way.w / 2);
      A.cls = Math.max(A.cls, e.cls); B.cls = Math.max(B.cls, e.cls);
    }
    // a node's intersection radius: only real junctions get a trimmed box
    for (const n of this.nodes) { if (n.deg >= 3 || this.namesAt(n).size > 1) n.r = n.r + 1.2; else n.r = 0; }
    // turn restrictions: key from-way|via|to-way
    this.noTurn = new Set(); this.onlyTurn = new Map();
    for (const [fw, via, tw, only] of (j.restr || [])) {
      if (only) { const k = fw + '|' + via; if (!this.onlyTurn.has(k)) this.onlyTurn.set(k, new Set()); this.onlyTurn.get(k).add(tw); }
      else this.noTurn.add(fw + '|' + via + '|' + tw);
    }
    // spatial index of segments
    this.grid = new Map();
    for (const e of this.edges) {
      const p = e.pts;
      for (let k = 0; k < p.length / 2 - 1; k++) {
        const x0 = Math.min(p[2 * k], p[2 * k + 2]) - e.way.w, x1 = Math.max(p[2 * k], p[2 * k + 2]) + e.way.w;
        const z0 = Math.min(p[2 * k + 1], p[2 * k + 3]) - e.way.w, z1 = Math.max(p[2 * k + 1], p[2 * k + 3]) + e.way.w;
        for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
          for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
            const key = gx * 100000 + gz; let l = this.grid.get(key); if (!l) this.grid.set(key, l = []); l.push(e.i, k);
          }
      }
    }
    this.signals = new Map(); // node -> controller, built lazily by traffic
  }
  namesAt(n) { const s = new Set(); for (const ei of n.inc) s.add(this.edges[ei].way.n || ('#' + this.edges[ei].w)); return s; }
  // nearest road segment to a point
  nearest(x, z, maxD = 40, filter) {
    let best = null, bd = maxD;
    const r = Math.ceil(maxD / CELL);
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let gx = cx - r; gx <= cx + r; gx++) for (let gz = cz - r; gz <= cz + r; gz++) {
      const l = this.grid.get(gx * 100000 + gz); if (!l) continue;
      for (let q = 0; q < l.length; q += 2) {
        const e = this.edges[l[q]], k = l[q + 1]; if (filter && !filter(e)) continue;
        const p = e.pts; const [d, t, qx, qz] = distSeg(x, z, p[2 * k], p[2 * k + 1], p[2 * k + 2], p[2 * k + 3]);
        if (d < bd) { bd = d; best = { e, k, t, d, qx, qz, s: e.cum[k] + t * (e.cum[k + 1] - e.cum[k]) }; }
      }
    }
    return best;
  }
  // is the point on the paved road? returns the hit with lateral offset sign (+ right of edge direction)
  onRoad(x, z) {
    const h = this.nearest(x, z, 20);
    if (!h) return null;
    if (h.d > h.e.way.w / 2 + 0.05) { h.on = false; return h; }
    h.on = true; return h;
  }
  // point + heading along an edge at arc length s; dir 0 = a->b, 1 = b->a
  at(e, s, dir = 0) {
    if (dir) s = e.len - s;
    s = clamp(s, 0, e.len);
    const c = e.cum, p = e.pts; let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const seg = c[hi] - c[lo] || 1e-6, t = (s - c[lo]) / seg;
    const x = p[2 * lo] + (p[2 * hi] - p[2 * lo]) * t, z = p[2 * lo + 1] + (p[2 * hi + 1] - p[2 * lo + 1]) * t;
    let hx = p[2 * hi] - p[2 * lo], hz = p[2 * hi + 1] - p[2 * lo + 1];
    const L = Math.hypot(hx, hz) || 1; hx /= L; hz /= L;
    if (dir) { hx = -hx; hz = -hz; }
    return { x, z, hx, hz };
  }
  // heading of an edge leaving node n (unit vector)
  leaveDir(e, n) {
    const p = e.pts, m = p.length;
    let dx, dz;
    if (e.a === n) { const k = Math.min(2, m / 2 - 1); dx = p[2 * k] - p[0]; dz = p[2 * k + 1] - p[1]; if (Math.hypot(dx, dz) < 3 && m > 4) { dx = p[4] - p[0]; dz = p[5] - p[1]; } }
    else { dx = p[m - 4] - p[m - 2]; dz = p[m - 3] - p[m - 1]; }
    const L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L];
  }
  canDrive(e, dir) { return !e.way.o || dir === 0; } // oneways are stored with forward = a->b
  lanes(e, dir) { return dir === 0 ? (e.way.lf || 1) : (e.way.lb || (e.way.o ? 0 : 1)); }
  // outgoing moves from edge e travelling dir (arriving at node)
  moves(e, dir) {
    const nId = dir === 0 ? e.b : e.a, n = this.nodes[nId];
    const [ix, iz] = this.leaveDir(e, nId); const inH = Math.atan2(-ix, -iz); // arrival heading
    const res = [];
    const only = this.onlyTurn.get(e.w + '|' + nId);
    for (const ei of n.inc) {
      const f = this.edges[ei];
      const fdir = f.a === nId ? 0 : 1;
      if (f.a === f.b) continue;
      if (ei === e.i && n.deg > 1) continue;
      if (!this.canDrive(f, fdir)) continue;
      if (this.lanes(f, fdir) <= 0) continue;
      if (this.noTurn.has(e.w + '|' + nId + '|' + f.w)) continue;
      if (only && !only.has(f.w)) continue;
      const [ox, oz] = this.leaveDir(f, nId); const outH = Math.atan2(ox, oz);
      const turn = angDiff(inH, outH); // + = left? (x east, z south): computed below
      res.push({ e: f, dir: fdir, turn, node: nId });
    }
    return res;
  }
  turnKind(turn) { // turn angle between headings, positive = right turn in this coordinate frame
    const a = turn * 180 / Math.PI;
    if (Math.abs(a) < 35) return 'S';
    if (Math.abs(a) > 150) return 'U';
    return a > 0 ? 'L' : 'R';
  }
}

// lane layout across the paved width (u = 0 at the left edge of a->b travel)
export function laneGeom(way) {
  const n = way.lf + way.lb + (way.ctl || 0);
  const lw = Math.min(3.7, Math.max(2.6, (way.w - 0.6) / Math.max(1, n)));
  const m0 = Math.max(0, (way.w - n * lw) / 2);
  return { lw, m0, n };
}
// lateral offset (m, + = right of travel) of lane li (0 = curb lane) for travel dir
export function laneOff(way, dir, li) {
  const { lw, m0 } = laneGeom(way), w = way.w;
  if (way.o) { const n = way.lf; const u = w - m0 - (li + 0.5) * lw; return u - w / 2 - (n === 1 ? 0 : 0); }
  if (dir === 0) { const u = w - m0 - (li + 0.5) * lw; return u - w / 2; }
  const u = m0 + (li + 0.5) * lw; return w / 2 - u;
}
