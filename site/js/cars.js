// Blocky-but-proportioned vehicle models. Body vertices are white so instanceColor paints them.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';

function box(sx, sy, sz, col, x, y, z, taperTop = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  if (taperTop) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setZ(i, p.getZ(i) * (1 - taperTop)); } }
  g.translate(x, y, z);
  const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = col.r; c[i + 1] = col.g; c[i + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function wheel(r, w, x, y, z) {
  const g = new THREE.CylinderGeometry(r, r, w, 10).toNonIndexed(); g.rotateZ(Math.PI / 2); g.translate(x, y, z);
  const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = .11; c[i + 1] = .11; c[i + 2] = .12; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
const W = new THREE.Color(1, 1, 1), GL = new THREE.Color('#2a3238'), DK = new THREE.Color('#2b2b2d'), CH = new THREE.Color('#b9bdc1'), TL = new THREE.Color('#7a1414'), HL = new THREE.Color('#e9e6d6'), PL = new THREE.Color('#e7dfa8');

// z+ is the front. Dimensions are real-world averages (m).
function sedan(L = 4.85, Wd = 1.85, H = 1.45, hood = 1.05, cab = 0.62) {
  const parts = [];
  parts.push(box(Wd, .62, L, W, 0, .55, 0));                                   // lower body
  parts.push(box(Wd - .12, H - .9, L * .48, W, 0, .86 + (H - .9) / 2, -L * .04, .18)); // cabin
  parts.push(box(Wd - .1, H - .95, L * .44, GL, 0, .87 + (H - .95) / 2, -L * .04, .2)); // glass band
  parts.push(box(Wd + .02, .16, .14, DK, 0, .38, L / 2));                      // front bumper
  parts.push(box(Wd + .02, .18, .14, DK, 0, .4, -L / 2));                       // rear bumper
  parts.push(box(.5, .12, .05, HL, -Wd / 2 + .32, .72, L / 2 + .01), box(.5, .12, .05, HL, Wd / 2 - .32, .72, L / 2 + .01));
  parts.push(box(.42, .14, .05, TL, -Wd / 2 + .3, .74, -L / 2 - .01), box(.42, .14, .05, TL, Wd / 2 - .3, .74, -L / 2 - .01));
  parts.push(box(.52, .12, .03, PL, 0, .5, -L / 2 - .08));                       // NJ plate
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) parts.push(wheel(.34, .24, x * (Wd / 2 - .12), .34, z * (L / 2 - .82)));
  parts.push(box(.12, .1, .2, W, -Wd / 2 - .04, .98, L * .17), box(.12, .1, .2, W, Wd / 2 + .04, .98, L * .17)); // mirrors
  return mergeGeometries(parts);
}
function suv() {
  const L = 4.9, Wd = 1.95, H = 1.78, parts = [];
  parts.push(box(Wd, .8, L, W, 0, .72, 0));
  parts.push(box(Wd - .1, .7, L * .66, W, 0, 1.45, -L * .1, .08));
  parts.push(box(Wd - .08, .5, L * .62, GL, 0, 1.43, -L * .1, .1));
  parts.push(box(Wd + .02, .2, .14, DK, 0, .45, L / 2), box(Wd + .02, .2, .14, DK, 0, .48, -L / 2));
  parts.push(box(.5, .14, .05, HL, -Wd / 2 + .32, .92, L / 2 + .01), box(.5, .14, .05, HL, Wd / 2 - .32, .92, L / 2 + .01));
  parts.push(box(.2, .5, .05, TL, -Wd / 2 + .15, 1.1, -L / 2 - .01), box(.2, .5, .05, TL, Wd / 2 - .15, 1.1, -L / 2 - .01));
  parts.push(box(.52, .12, .03, PL, 0, .7, -L / 2 - .08));
  parts.push(box(Wd - .3, .05, L * .5, DK, 0, 1.82, -L * .1)); // roof rails
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) parts.push(wheel(.38, .27, x * (Wd / 2 - .13), .38, z * (L / 2 - .86)));
  return mergeGeometries(parts);
}
function pickup() {
  const L = 5.8, Wd = 2.0, parts = [];
  parts.push(box(Wd, .85, L, W, 0, .82, 0));
  parts.push(box(Wd - .08, .75, 2.3, W, 0, 1.62, .35, .06));
  parts.push(box(Wd - .06, .52, 2.1, GL, 0, 1.62, .35, .08));
  parts.push(box(Wd - .2, .5, 2.1, DK, 0, 1.0, -1.65));            // bed liner
  parts.push(box(Wd + .02, .22, .16, CH, 0, .52, L / 2), box(Wd + .02, .2, .14, CH, 0, .52, -L / 2));
  parts.push(box(1.2, .4, .05, CH, 0, 1.0, L / 2 + .01));           // grille
  parts.push(box(.4, .2, .05, HL, -Wd / 2 + .28, 1.05, L / 2 + .015), box(.4, .2, .05, HL, Wd / 2 - .28, 1.05, L / 2 + .015));
  parts.push(box(.15, .55, .05, TL, -Wd / 2 + .1, 1.05, -L / 2 - .01), box(.15, .55, .05, TL, Wd / 2 - .1, 1.05, -L / 2 - .01));
  parts.push(box(.52, .12, .03, PL, 0, .62, -L / 2 - .1));
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) parts.push(wheel(.41, .29, x * (Wd / 2 - .14), .41, z * (L / 2 - 1.0)));
  return mergeGeometries(parts);
}
function minivan() {
  const L = 5.15, Wd = 2.0, parts = [];
  parts.push(box(Wd, .75, L, W, 0, .66, 0));
  parts.push(box(Wd - .08, .8, L * .78, W, 0, 1.42, -L * .06, .05));
  parts.push(box(Wd - .06, .55, L * .74, GL, 0, 1.42, -L * .06, .06));
  parts.push(box(Wd + .02, .2, .14, DK, 0, .42, L / 2), box(Wd + .02, .2, .14, DK, 0, .44, -L / 2));
  parts.push(box(.5, .14, .05, HL, -Wd / 2 + .32, .88, L / 2 + .01), box(.5, .14, .05, HL, Wd / 2 - .32, .88, L / 2 + .01));
  parts.push(box(.2, .55, .05, TL, -Wd / 2 + .13, 1.15, -L / 2 - .01), box(.2, .55, .05, TL, Wd / 2 - .13, 1.15, -L / 2 - .01));
  parts.push(box(.52, .12, .03, PL, 0, .66, -L / 2 - .08));
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) parts.push(wheel(.36, .25, x * (Wd / 2 - .13), .36, z * (L / 2 - .9)));
  return mergeGeometries(parts);
}
function boxtruck() {
  const L = 7.6, Wd = 2.45, parts = [];
  parts.push(box(Wd - .1, 1.3, 2.0, W, 0, 1.3, L / 2 - 1.0));
  parts.push(box(Wd - .14, .6, 1.9, GL, 0, 1.75, L / 2 - 1.0));
  parts.push(box(Wd, 2.6, L - 2.2, new THREE.Color('#f1efe9'), 0, 2.1, -1.1));
  parts.push(box(Wd, .25, L, DK, 0, .62, 0));
  parts.push(box(.4, .18, .05, HL, -Wd / 2 + .3, 1.0, L / 2 + .01), box(.4, .18, .05, HL, Wd / 2 - .3, 1.0, L / 2 + .01));
  parts.push(box(.2, .3, .05, TL, -Wd / 2 + .12, .9, -L / 2 - .01), box(.2, .3, .05, TL, Wd / 2 - .12, .9, -L / 2 - .01));
  for (const [x, z] of [[-1, L / 2 - 1.2], [1, L / 2 - 1.2], [-1, -L / 2 + 1.4], [1, -L / 2 + 1.4]]) parts.push(wheel(.48, .3, x * (Wd / 2 - .16), .48, z));
  return mergeGeometries(parts);
}
function bus() { // NJ Transit-style transit bus
  const L = 12.2, Wd = 2.6, parts = [];
  parts.push(box(Wd, 2.6, L, new THREE.Color('#eceeef'), 0, 1.75, 0));
  parts.push(box(Wd + .01, .9, L - 1.4, GL, 0, 2.15, -.3));
  parts.push(box(Wd + .02, .28, L - .6, new THREE.Color('#1c4f9c'), 0, 1.25, 0));
  parts.push(box(Wd + .02, .12, L - .6, new THREE.Color('#e2662a'), 0, 1.45, 0));
  parts.push(box(Wd - .2, 1.3, .05, GL, 0, 2.2, L / 2 + .01));
  parts.push(box(1.6, .25, .06, new THREE.Color('#f5b31b'), 0, 2.95, L / 2 + .02));
  for (const [x, z] of [[-1, L / 2 - 2.4], [1, L / 2 - 2.4], [-1, -L / 2 + 3.0], [1, -L / 2 + 3.0]]) parts.push(wheel(.5, .32, x * (Wd / 2 - .15), .5, z));
  return mergeGeometries(parts);
}
function schoolbus() { // Type C school bus, National School Bus Yellow
  const L = 11.0, Wd = 2.45, Y = new THREE.Color('#f7b500'), parts = [];
  parts.push(box(Wd, 2.0, L - 2.0, Y, 0, 1.95, -1.0));
  parts.push(box(Wd - .2, 1.1, 2.0, Y, 0, 1.15, L / 2 - 1.0));
  parts.push(box(Wd + .01, .7, L - 2.6, GL, 0, 2.35, -1.0));
  parts.push(box(Wd + .02, .1, L - 2.0, DK, 0, 1.7, -1.0), box(Wd + .02, .1, L - 2.0, DK, 0, 1.3, -1.0));
  parts.push(box(Wd - .3, .8, .05, GL, 0, 2.3, L / 2 - 2.0));
  parts.push(box(.6, .45, .03, DK, -.9, 1.9, L / 2 - 2.0 + .03)); // stop arm stowed
  parts.push(box(.4, .18, .05, HL, -Wd / 2 + .3, 1.0, L / 2 + .01), box(.4, .18, .05, HL, Wd / 2 - .3, 1.0, L / 2 + .01));
  parts.push(box(.22, .22, .05, TL, -Wd / 2 + .2, 1.2, -L / 2 - .01), box(.22, .22, .05, TL, Wd / 2 - .2, 1.2, -L / 2 - .01));
  for (const [x, z] of [[-1, L / 2 - 1.4], [1, L / 2 - 1.4], [-1, -L / 2 + 2.4], [1, -L / 2 + 2.4]]) parts.push(wheel(.5, .3, x * (Wd / 2 - .15), .5, z));
  return mergeGeometries(parts);
}
export const MODELS = [
  { name: 'sedan', geo: () => sedan(), L: 4.85, Wd: 1.85, H: 1.45, w: 30, light: [.72, 2.42, .74, -2.43] },
  { name: 'compact', geo: () => sedan(4.4, 1.78, 1.45), L: 4.4, Wd: 1.78, H: 1.45, w: 14, light: [.72, 2.2, .74, -2.21] },
  { name: 'suv', geo: suv, L: 4.9, Wd: 1.95, H: 1.78, w: 30, light: [.92, 2.45, 1.1, -2.46] },
  { name: 'pickup', geo: pickup, L: 5.8, Wd: 2.0, H: 1.95, w: 14, light: [1.05, 2.9, 1.05, -2.91] },
  { name: 'minivan', geo: minivan, L: 5.15, Wd: 2.0, H: 1.8, w: 8, light: [.88, 2.57, 1.15, -2.58] },
  { name: 'boxtruck', geo: boxtruck, L: 7.6, Wd: 2.45, H: 3.4, w: 2, light: [1.0, 3.8, .9, -3.81], commercial: true },
  { name: 'bus', geo: bus, L: 12.2, Wd: 2.6, H: 3.0, w: 0, light: [1.0, 6.1, 1.0, -6.11], commercial: true },
  { name: 'schoolbus', geo: schoolbus, L: 11.0, Wd: 2.45, H: 3.0, w: 0, light: [1.0, 5.5, 1.2, -5.51], commercial: true, white: true },
];
export function pickModel(r, commercialOK = true) {
  let tot = 0; for (const m of MODELS) if (commercialOK || !m.commercial) tot += m.w;
  let x = r * tot; for (let i = 0; i < MODELS.length; i++) { const m = MODELS[i]; if (!commercialOK && m.commercial) continue; x -= m.w; if (x <= 0) return i; }
  return 0;
}
