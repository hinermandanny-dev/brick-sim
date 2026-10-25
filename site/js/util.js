import * as THREE from '../vendor/three.module.js';

export function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); }; }
export function strHash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
export function pointInPoly(x, z, p) { // p flat [x,z,...] metres
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c;
  }
  return c;
}
export function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = clamp(t, 0, 1);
  const qx = ax + t * dx, qz = az + t * dz; return [Math.hypot(px - qx, pz - qz), t, qx, qz];
}
export function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1]; return a / 2; }

// palette: warm, slightly desaturated "storybook real" colours
export const PAL = {
  grass: new THREE.Color('#7f9a52'), lawn: new THREE.Color('#86a157'), wood: new THREE.Color('#5f7140'), needles: new THREE.Color('#7b6b47'),
  asphalt: new THREE.Color('#4a4a4c'), asphaltOld: new THREE.Color('#5a5957'), concrete: new THREE.Color('#bdb7ac'), sand: new THREE.Color('#e3d3a8'),
  water: new THREE.Color('#3f6f88'), wet: new THREE.Color('#6f7d4f'),
};
export const SIDING = ['#e9e4d8', '#d9d2c3', '#c8c0ae', '#b7b8b2', '#a9b4b7', '#8f9ea6', '#c9b896', '#e0d4b0', '#b7a68a', '#9aa596', '#d8cdbc', '#f0ece2', '#c3b49c', '#8b8f93', '#a3887a', '#7f8c8d'];
export const BRICKS = ['#9b5a43', '#8c4f3c', '#a8664a', '#7d4a3a'];
export const ROOFS = ['#3f3f43', '#4a4643', '#55504a', '#3a3c40', '#5b534b', '#2f3034', '#6b5e52', '#4d4f55'];
export const CARCOL = ['#f2f2f0', '#f2f2f0', '#f2f2f0', '#1b1c1e', '#1b1c1e', '#1b1c1e', '#8a8d91', '#8a8d91', '#b9bcc0', '#b9bcc0', '#28407a', '#7b1f22', '#3d4a3d', '#5a2e1c', '#c4b593', '#2b5f8a', '#a01e1e', '#6c6f73'];

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = opts.aniso ?? 8; if (opts.nearest) { t.magFilter = THREE.NearestFilter; }
  return t;
}
export function noiseFill(g, w, h, base, amp, n = 4000, sz = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const r = rng(w * 31 + h);
  for (let i = 0; i < n; i++) { const v = (r() - 0.5) * amp; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(r() * w, r() * h, sz, sz); }
}

export function toast(msg, ms = 2600) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
export function prompt(msg) { const p = document.getElementById('prompt'); if (p.textContent !== msg) p.textContent = msg || ''; }

// a merged geometry builder with vertex colours (fast to fill, one draw call)
export class GeoBuilder {
  constructor(withUV = false, extra = 0) { this.p = []; this.n = []; this.c = []; this.uv = withUV ? [] : null; this.ex = extra ? [] : null; this.exN = extra; this.idx = []; }
  get count() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, col, u = 0, v = 0, ex) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b);
    if (this.uv) this.uv.push(u, v); if (this.ex) for (let i = 0; i < this.exN; i++) this.ex.push(ex ? ex[i] : 0);
    return this.p.length / 3 - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  // push a triangle wound so its geometric normal points along (dx,dy,dz)
  triTo(a, b, c, dx, dy, dz) {
    const p = this.p, A = a * 3, B = b * 3, C = c * 3;
    const ux = p[B] - p[A], uy = p[B + 1] - p[A + 1], uz = p[B + 2] - p[A + 2], vx = p[C] - p[A], vy = p[C + 1] - p[A + 1], vz = p[C + 2] - p[A + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * dx + ny * dy + nz * dz >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
  quadTo(a, b, c, d, dx, dy, dz) { this.triTo(a, b, c, dx, dy, dz); this.triTo(a, c, d, dx, dy, dz); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  // axis aligned/rotated box: centre, size, yaw
  box(cx, cy, cz, sx, sy, sz, col, yaw = 0, colTop) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const R = (x, z) => [cx + x * cs - z * sn, cz + x * sn + z * cs];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const faces = [
      [[1, 0, 0], [[hx, -hy, -hz], [hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz]]],
      [[-1, 0, 0], [[-hx, -hy, hz], [-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz]]],
      [[0, 1, 0], [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]]],
      [[0, -1, 0], [[-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [-hx, -hy, -hz]]],
      [[0, 0, 1], [[hx, -hy, hz], [-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz]]],
      [[0, 0, -1], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz]]],
    ];
    for (const [nn, vs] of faces) {
      const nx = nn[0] * cs - nn[2] * sn, nz = nn[0] * sn + nn[2] * cs;
      const cc = (nn[1] === 1 && colTop) ? colTop : col;
      const ids = vs.map(([x, y, z]) => { const [wx, wz] = R(x, z); return this.vert(wx, cy + y, wz, nx, nn[1], nz, cc); });
      this.quadTo(ids[0], ids[1], ids[2], ids[3], nx, nn[1], nz);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.ex) g.setAttribute('wdata', new THREE.Float32BufferAttribute(this.ex, this.exN));
    g.setIndex(this.idx.length > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
