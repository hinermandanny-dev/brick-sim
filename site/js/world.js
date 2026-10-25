// Streams 400 m tiles around the player and builds everything you see from the OSM bake.
import * as THREE from '../vendor/three.module.js';
import { PAL, SIDING, BRICKS, ROOFS, GeoBuilder, canvasTex, rng, hash, strHash, pointInPoly, polyArea, clamp, distSeg } from './util.js';
import { CLASS, laneGeom } from './roads.js';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';
import { fitHouse, buildHandHouse } from './handhouse.js';

const TS = 400, DS = 8, DN = 51;
const LOAD_R = 950, DROP_R = 1350;

// ----- shared materials -----
const vc = (o = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });
export const MAT = {};
function initMats() {
  initLamp();
  MAT.vc = vc();
  MAT.vcFlat = vc({ flatShading: true });
  MAT.curb = new THREE.MeshLambertMaterial({ color: '#c9c3b8' });
  const swTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#c4beb2'; g.fillRect(0, 0, w, h);
    const r = rng(9); for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${r() < .5 ? '0,0,0' : '255,255,255'},${r() * .08})`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.fillStyle = 'rgba(70,60,50,.45)'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 1, w, 1);
  });
  MAT.sidewalk = new THREE.MeshLambertMaterial({ map: swTex });
  const drv = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#b8b2a6'; g.fillRect(0, 0, w, h); const r = rng(3); for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${r() * .06})`; g.fillRect(r() * w, r() * h, 2, 2); } g.fillStyle = 'rgba(60,50,40,.35)'; g.fillRect(0, 0, w, 1); });
  MAT.driveway = new THREE.MeshLambertMaterial({ map: drv });
  MAT.drivewayA = new THREE.MeshLambertMaterial({ color: '#3f3f41' });
  MAT.boards = new THREE.MeshLambertMaterial({ map: canvasTex(128, 128, (g) => { g.fillStyle = '#9c7a55'; g.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 8) { g.fillStyle = y % 16 ? '#8e6d4a' : '#a5825c'; g.fillRect(0, y, 128, 7); g.fillStyle = 'rgba(40,25,10,.5)'; g.fillRect(0, y + 7, 128, 1); } }) }); // boardwalk planks
  MAT.path = new THREE.MeshLambertMaterial({ color: '#7a756c' });
  MAT.water = new THREE.MeshPhongMaterial({ color: '#3d6a84', specular: '#bcd4e0', shininess: 60, transparent: true, opacity: 0.92 });
  MAT.isect = roadTex('isect'); // a plain-asphalt material (no markings)
  MAT.white = new THREE.MeshLambertMaterial({ color: '#f3f1ea' });
  MAT.yellow = new THREE.MeshLambertMaterial({ color: '#e6b82e' });
  MAT.bld = vc();
  MAT.bld.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = MAT.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 wdata; varying vec4 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = wdata;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uNight; varying vec4 vW;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float u=vW.x, v=vW.y, L=vW.z, k=vW.w; // along-wall metres, height metres, wall length, kind
  if(k>0.5){
    vec3 glass=vec3(.23,.29,.34); vec3 frame=vec3(.93,.92,.88); float win=0., frm=0.; vec2 cell=vec2(0.);
    if(k<1.5){ // house: 2.8 m storeys, 0.9x1.2 windows on 3.1 m pitch, keep 0.8 m from corners
      float st=floor(v/2.8), lv=v-st*2.8; float n=floor((L-1.6)/3.1); float off=(L-n*3.1)*.5;
      float uu=u-off; float i=floor(uu/3.1); float lu=uu-i*3.1;
      if(n>=1. && i>=0. && i<n && lv>.9 && lv<2.1 && lu>1.1 && lu<2.0){ win=1.; frm=step(lv,.96)+step(2.04,lv)+step(lu,1.16)+step(1.94,lu)+step(abs(lu-1.55),.03); cell=vec2(i,st);}
      else if(k>1.2 && n>=1. && i>=0. && i<n && lv>.9 && lv<2.1 && ((lu>.78 && lu<1.08)||(lu>2.02 && lu<2.32))){ diffuseColor.rgb = vec3(.16,.2,.24) + .04*step(.5,fract(lv*6.)); } // shutters
    } else if(k<2.5){ // shop: storefront glass ground floor + upper windows
      if(v>.45 && v<2.9 && L>5.){ float lu=mod(u,1.6); win=1.; frm=step(lu,.08)+step(2.84,v)+step(v,.5); cell=vec2(floor(u/1.6),0.);}
      else if(v>3.6){ float st=floor((v-3.6)/3.2), lv=v-3.6-st*3.2; float lu=mod(u,2.6); if(lv>.8&&lv<2.3&&lu>.6&&lu<2.){win=1.;cell=vec2(floor(u/2.6),st+1.);} }
    } else if(k<3.5){ // big box: blank with panel joints and a cornice line
      float j=step(mod(u,3.05),.05)*.5; diffuseColor.rgb*=1.-j*.12; if(v>vW.y-0. && mod(v,8.)>7.6) diffuseColor.rgb*=.85;
    } else { // school / office / apartments: ribbon windows
      float st=floor(v/3.6), lv=v-st*3.6; float lu=mod(u,1.8); if(lv>1.0&&lv<2.6&&L>4.){ win=1.; frm=step(lu,.1); cell=vec2(floor(u/1.8),st);}
    }
    if(win>.5){
      float lit=step(.62,h21(cell+floor(vW.z)))*uNight;
      vec3 c=mix(glass,vec3(1.,.82,.5),lit*.9);
      diffuseColor.rgb = frm>.5 ? frame : c;
      totalEmissiveRadiance += (frm>.5?0.:1.)*lit*vec3(.9,.65,.35)*.8;
    }
  }
}`);
  };
  MAT.roof = vc({ flatShading: true });
  for (const k of ['res', 'two', 'multi']) {} // road textures are cached by key in roadTex
}
MAT.uNight = { value: 0 };

// ----- street lights (shared; brightness follows the night factor) -----
export const LAMP = {};
function initLamp() {
  LAMP.headGeo = new THREE.BoxGeometry(.38, .16, .75);
  LAMP.headMat = new THREE.MeshBasicMaterial({ color: '#7d7a72' });
  LAMP.armGeo = (() => { const g = new THREE.BoxGeometry(.07, .07, 1); g.translate(0, 0, .5); const c = []; for (let i = 0; i < g.attributes.position.count; i++) c.push(.55, .57, .58); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g; })();
  LAMP.poolGeo = new THREE.CircleGeometry(8, 20).rotateX(-Math.PI / 2);
  const tex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,200,130,.85)'); gr.addColorStop(.5, 'rgba(255,190,120,.35)'); gr.addColorStop(1, 'rgba(255,180,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }, { clamp: true });
  LAMP.poolMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 });
  LAMP.set = (night) => { const on = night > .5; LAMP.poolMat.opacity = on ? .55 : 0; LAMP.poolMat.visible = on; LAMP.headMat.color.set(on ? '#ffd59a' : '#7d7a72'); };
}
// ----- road textures (markings) -----
const rtCache = new Map();
export function roadTex(key, way) {
  if (rtCache.has(key)) return rtCache.get(key);
  const W = 256, H = 256; // H covers 12 m of road (one dash cycle)
  const t = canvasTex(W, H, (g) => {
    g.fillStyle = '#4b4b4d'; g.fillRect(0, 0, W, H);
    const r = rng(strHash(key));
    for (let i = 0; i < 2600; i++) { const v = r(); g.fillStyle = `rgba(${v < .5 ? '0,0,0' : '255,255,255'},${r() * .07})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
    // tar-snake patches
    g.strokeStyle = 'rgba(20,20,22,.35)'; g.lineWidth = 1.2; for (let i = 0; i < 3; i++) { g.beginPath(); let x = r() * W, y = r() * H; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - .5) * 40; y += r() * 30; g.lineTo(x, y); } g.stroke(); }
    if (key === 'isect' || !way) return;
    const w = way.w, px = W / w; const lf = way.lf, lb = way.lb, lanes = lf + lb;
    const { lw, m0 } = laneGeom(way);
    const X = (m) => m * px;
    const line = (m, col, dashed, wid = 0.13) => { g.fillStyle = col; if (dashed) { g.fillRect(X(m) - wid * px / 2, 0, wid * px, H * 3 / 12); } else g.fillRect(X(m) - wid * px / 2, 0, wid * px, H); };
    const t = way.t;
    if (t === 'service' || t === 'living_street' || ((t === 'residential' || t === 'unclassified') && lanes <= 2)) return; // Brick side streets: bare asphalt
    const edge = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'].includes(t);
    if (way.o) {
      if (edge) { line(m0, '#e6b82e', false); line(w - m0, '#f1efe8', false); }
      for (let i = 1; i < lanes; i++) line(m0 + i * lw, '#f1efe8', true);
      return;
    }
    if (edge) { line(m0, '#f1efe8', false); line(w - m0, '#f1efe8', false); }
    if (way.ctl) { // centre two-way left-turn lane: solid+dashed yellow both sides
      const c0 = m0 + lb * lw, c1 = c0 + lw;
      line(c0 + .1, '#e6b82e', false); line(c0 + .35, '#e6b82e', true);
      line(c1 - .1, '#e6b82e', false); line(c1 - .35, '#e6b82e', true);
      for (let i = 1; i < lb; i++) line(m0 + i * lw, '#f1efe8', true);
      for (let i = 1; i < lf; i++) line(c1 + i * lw, '#f1efe8', true);
    } else {
      const c = m0 + lb * lw;
      line(c - .12, '#e6b82e', false, .11); line(c + .12, '#e6b82e', false, .11);
      for (let i = 1; i < lb; i++) line(m0 + i * lw, '#f1efe8', true);
      for (let i = 1; i < lf; i++) line(c + i * lw, '#f1efe8', true);
    }
  });
  t.wrapS = THREE.ClampToEdgeWrapping;
  const m = new THREE.MeshLambertMaterial({ map: t, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  rtCache.set(key, m); return m;
}
function roadKey(way) { return [way.t, way.lf, way.lb, way.o, way.w, way.ctl].join('|'); }

// ----- area colours painted onto the terrain texture -----
const AREA = {
  res: '#86a157', com: '#8f9a6a', ind: '#8d8f78', school: '#8aa45a', farm: '#a49a5e', wood: '#5d6b3f', scrub: '#7a8450', grass: '#88a45a', park: '#80a052',
  golf: '#8fb35f', cemetery: '#86a45d', wetland: '#6c7748', sand: '#e2d3a6', dirt: '#9c8a68', pitch: '#78a04c', track: '#b5654a', play: '#c9b38a', fuel: '#6a6a6c',
  isle: '#7f8c55', parking: '#565658', asphalt: '#555557', water: '#3d6a84', pool: '#4fa3c7', pier: '#8a7860',
};

// ground texture: one pooled canvas per tile at a fixed size, plus a shared world-space detail map in the shader so the
// ground stays crisp up close without a bigger per-tile texture (late/low-res ground was part of the 25 Oct "corrupted map")
const GROUND_R = 768;
const PHOTO_WINS = new Set(['grass', 'park', 'golf', 'cemetery', 'school', 'farm', 'wood', 'scrub', 'wetland', 'res', 'com', 'ind', 'isle']);
let DETAIL = null;
function groundMat(tex) {
  if (!DETAIL) {
    DETAIL = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); const r = rng(77);
      for (let i = 0; i < 6000; i++) { const v = 100 + r() * 56; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    }, { aniso: 4 });
    DETAIL.colorSpace = THREE.NoColorSpace;
  }
  const m = new THREE.MeshLambertMaterial({ map: tex });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tDetail = { value: DETAIL };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(position, 1.)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tDetail; varying vec2 vGW;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ float d = texture2D(tDetail, vGW / 3.).r * .6 + texture2D(tDetail, vGW / 11.).r * .4; diffuseColor.rgb *= .72 + d * .56; }');
  };
  m.customProgramCacheKey = () => 'ground1';
  return m;
}

export class World {
  constructor(scene, meta, roads, base = 'data/') {
    initMats();
    this.scene = scene; this.meta = meta; this.roads = roads; this.base = base;
    this.tiles = new Map(); this.pending = new Set(); this.have = new Set(meta.tiles); this.fails = new Map();
    this.texPool = []; // ground canvases+textures are recycled (same size): no GPU re-allocation churn while moving
    this.group = new THREE.Group(); scene.add(this.group);
    this.colliders = new Map(); // tile -> [{poly, minx,maxx,minz,maxz, h}]
    this.drives = new Map();    // tile -> driveway records (curb cuts, parked cars)
    this.listeners = [];
    this.treeGeo = makeTreeGeos();
    this.propGeo = makePropGeos();
    this.home = null;
  }
  key(x, z) { return Math.floor(x / TS) + '_' + Math.floor(z / TS); }
  // ground height from the global 8 m grid (loaded at boot), so a building that straddles a tile edge never
  // samples an unloaded neighbour (that buried the Walmart under the terrain on 25 Oct)
  height(x, z) {
    const g = this.dem, M = this.meta;
    if (!g) return 0.4;
    const fx = (x - M.gx0) / DS, fz = (z - M.gz0) / DS, NX = M.demNX, NZ = M.demNZ;
    const x0 = Math.max(0, Math.min(NX - 2, Math.floor(fx))), z0 = Math.max(0, Math.min(NZ - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - x0)), tz = Math.max(0, Math.min(1, fz - z0));
    const a = g[z0 * NX + x0], b = g[z0 * NX + x0 + 1], c = g[(z0 + 1) * NX + x0], e = g[(z0 + 1) * NX + x0 + 1];
    return ((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz) / 10;
  }
  ready(x, z) { return this.tiles.has(this.key(x, z)); }
  update(px, pz) {
    const i0 = Math.floor((px - LOAD_R) / TS), i1 = Math.floor((px + LOAD_R) / TS);
    const j0 = Math.floor((pz - LOAD_R) / TS), j1 = Math.floor((pz + LOAD_R) / TS);
    const want = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i + '_' + j; if (!this.have.has(k) || this.tiles.has(k) || this.pending.has(k)) continue;
      const d = Math.hypot((i + .5) * TS - px, (j + .5) * TS - pz); if (d < LOAD_R + 200) want.push([d, k]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, k] of want.slice(0, 2 - this.pending.size > 0 ? 2 - this.pending.size : 0)) this.load(k);
    for (const [k, t] of this.tiles) {
      const [i, j] = k.split('_').map(Number);
      if (Math.hypot((i + .5) * TS - px, (j + .5) * TS - pz) > DROP_R) this.drop(k);
    }
  }
  async load(k) {
    this.pending.add(k);
    try {
      const r = await fetch(this.base + 'tiles/' + k + '.json'); const d = await r.json();
      const bin = atob(d.dem); const dem = new Int16Array(DN * DN);
      for (let q = 0; q < DN * DN; q++) dem[q] = (bin.charCodeAt(2 * q) | (bin.charCodeAt(2 * q + 1) << 8)) << 16 >> 16;
      const [i, j] = k.split('_').map(Number);
      const t = { k, i, j, d, dem, g: new THREE.Group() };
      if (d.g) { try { t.gimg = await createImageBitmap(await (await fetch(this.base + 'ground/' + k + '.png')).blob()); } catch (e) { t.gimg = null; } } // real ground cover (2020 orthophoto classes)
      this.build(t);                       // build fully first: a tile is never visible half-made
      if (this.renderer) for (const tx of t.texs || []) this.renderer.initTexture(tx); // upload now, not on first sight
      this.tiles.set(k, t);
      this.group.add(t.g);
      this.fails.delete(k);
      for (const f of this.listeners) f('load', t);
    } catch (e) { // a failed fetch or parse used to delete the tile for good (a permanent hole in the map): retry with backoff
      console.warn('tile', k, e); const n = (this.fails.get(k) || 0) + 1; this.fails.set(k, n);
      this.tiles.delete(k); this.colliders.delete(k); this.drives.delete(k);
      if (n < 6) { this.have.delete(k); setTimeout(() => this.have.add(k), 1000 * 2 ** n); } else this.have.delete(k);
    }
    this.pending.delete(k);
  }
  drop(k) {
    const t = this.tiles.get(k); if (!t) return;
    for (const f of this.listeners) f('drop', t);
    this.group.remove(t.g);
    if (t.ground) { this.texPool.push(t.ground.material.map); t.ground.material.map = null; }
    t.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material._own) { o.material.map?.dispose(); o.material.dispose(); } });
    this.tiles.delete(k); this.colliders.delete(k); this.drives.delete(k);
  }
  async loadAround(x, z, r = 450, onp) {
    const ks = [];
    for (let i = Math.floor((x - r) / TS); i <= Math.floor((x + r) / TS); i++) for (let j = Math.floor((z - r) / TS); j <= Math.floor((z + r) / TS); j++) { const k = i + '_' + j; if (this.have.has(k)) ks.push(k); }
    let n = 0; for (const k of ks) { if (!this.tiles.has(k)) await this.load(k); n++; onp && onp(n / ks.length); }
  }
  // ---------------------------------------------------------------- build
  build(t) {
    const d = t.d, x0 = t.i * TS, z0 = t.j * TS;
    this.buildTerrain(t, x0, z0);
    this.buildRoads(t);
    this.buildFoot(t);
    this.buildBuildings(t);
    this.buildDriveways(t);
    this.buildTrees(t);
    this.buildProps(t);
    this.buildLines(t);
    this.buildSigns(t);
  }
  buildTerrain(t, x0, z0) {
    const g = new THREE.PlaneGeometry(TS, TS, DN - 1, DN - 1); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let q = 0; q < pos.count; q++) {
      const lx = pos.getX(q) + TS / 2, lz = pos.getZ(q) + TS / 2;
      const ix = Math.round(lx / DS), iz = Math.round(lz / DS);
      pos.setXYZ(q, x0 + lx, t.dem[iz * DN + ix] / 10, z0 + lz);
    }
    g.computeVertexNormals();
    const R = GROUND_R;
    const tex = this.texPool.pop() || canvasTex(R, R, () => {}, { clamp: true, aniso: 4 });
    { const c = tex.image.getContext('2d');
      const s = R / TS;
      c.fillStyle = '#84a056'; c.fillRect(0, 0, R, R);
      const r = rng(t.i * 7919 + t.j);
      for (let q = 0; q < 9000; q++) { const v = r(); c.fillStyle = v < .5 ? `rgba(40,60,10,${r() * .12})` : `rgba(200,210,120,${r() * .1})`; const sz = 1 + r() * 3; c.fillRect(r() * R, r() * R, sz, sz); }
      const areas = [...t.d.areas].sort((a, b) => a.o - b.o);
      let paved = false;
      for (const a of areas) {
        if (!paved && a.o > 0) { paved = true; if (t.gimg) c.drawImage(t.gimg, 0, 0, R, R); else this.paintPaved(c, t, x0, z0, s); }
        if (t.gimg && a.o > 0 && PHOTO_WINS.has(a.k)) continue; // the photo knows better than a park / wood / landuse outline
        c.beginPath();
        const ring = (p) => { for (let q = 0; q < p.length; q += 2) { const X = (p[q] / 10 - x0) * s, Y = (p[q + 1] / 10 - z0) * s; q ? c.lineTo(X, Y) : c.moveTo(X, Y); } c.closePath(); };
        ring(a.p); for (const h of a.h) ring(h);
        c.fillStyle = AREA[a.k] || '#84a056'; c.fill('evenodd');
        if (a.k === 'wood' || a.k === 'scrub' || a.k === 'wetland') { c.save(); c.clip('evenodd'); for (let q = 0; q < 1800; q++) { c.fillStyle = r() < .5 ? 'rgba(95,80,50,.35)' : 'rgba(40,55,25,.3)'; c.fillRect(r() * R, r() * R, 2 + r() * 3, 2 + r() * 3); } c.restore(); }
        if (a.k === 'parking') { c.save(); c.clip('evenodd'); stalls(c, a.p, x0, z0, s); c.restore(); }
        if (a.k === 'golf') { c.save(); c.clip('evenodd'); c.fillStyle = 'rgba(255,255,255,.05)'; for (let q = 0; q < R; q += 14) c.fillRect(q, 0, 7, R); c.restore(); }
        if (a.k === 'pitch') { c.save(); c.clip('evenodd'); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.2; c.stroke(); c.restore(); }
        if (a.k === 'cemetery') { c.save(); c.clip('evenodd'); c.fillStyle = '#9a978f'; for (let q = 0; q < 700; q++) c.fillRect(r() * R, r() * R, 1.5, 1); c.restore(); }
      }
      if (!paved) { if (t.gimg) c.drawImage(t.gimg, 0, 0, R, R); else this.paintPaved(c, t, x0, z0, s); }
    }
    tex.needsUpdate = true; (t.texs || (t.texs = [])).push(tex);
    const m = groundMat(tex); m._own = true;
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; t.g.add(mesh); t.ground = mesh;
    if (t.d.water) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(TS, TS).rotateX(-Math.PI / 2), MAT.water);
      w.position.set(x0 + TS / 2, 0.0, z0 + TS / 2); t.g.add(w);
    }
  }
  // Paved lot surfaces that OSM implies but rarely maps as a polygon: stall rows either side of every parking aisle,
  // drive-throughs, lot lanes beside big buildings, and the concrete apron in front of big stores (Dan, 25 Oct: "a lot
  // of grass by the Walmart that isn't there"). Explicit grass / park / water areas are painted after this and win.
  paintPaved(c, t, x0, z0, s) {
    const R = this.roads, big = [];
    for (const b of t.d.bld) { if (b.k === 'res' || b.k === 'small' || b.p.length < 6) continue; const P = []; for (let q = 0; q < b.p.length; q += 2) P.push(b.p[q] / 10, b.p[q + 1] / 10); const A = Math.abs(polyArea(P)); if (A > 1500) { let cx = 0, cz = 0; for (let q = 0; q < P.length; q += 2) { cx += P[q]; cz += P[q + 1]; } big.push({ P, A, cx: cx / (P.length / 2), cz: cz / (P.length / 2), r: Math.sqrt(A) }); } }
    const X = (x) => (x - x0) * s, Z = (z) => (z - z0) * s;
    const path = (pts) => { c.beginPath(); for (let q = 0; q < pts.length; q += 2) q ? c.lineTo(X(pts[q]), Z(pts[q + 1])) : c.moveTo(X(pts[q]), Z(pts[q + 1])); };
    c.save(); c.lineJoin = c.lineCap = 'round';
    // aprons: 5 m of concrete walk around big stores / schools / offices
    c.strokeStyle = '#a6a297'; for (const b of big) { path(b.P); c.closePath(); c.lineWidth = 10 * s; c.stroke(); }
    const aisles = [];
    for (const ei of t.d.roads) {
      const e = R.edges[ei], w = e.way; if (w.t !== 'service') continue;
      let extra = 0;
      if (w.sv === 'parking_aisle') extra = 11.5; // 5.5 m stalls each side + a little
      else if (w.sv === 'drive-through') extra = 2;
      else if (!w.sv) { const mx = e.pts[(e.pts.length >> 2) * 2], mz = e.pts[(e.pts.length >> 2) * 2 + 1]; if (big.some(b => Math.hypot(b.cx - mx, b.cz - mz) < b.r + 90)) extra = 7; }
      if (!extra) continue;
      c.strokeStyle = AREA.parking; c.lineWidth = (w.w + extra) * s; path(e.pts); c.stroke();
      if (w.sv === 'parking_aisle') aisles.push(e);
    }
    // stall lines: ticks every 2.75 m on both sides of each aisle
    c.strokeStyle = 'rgba(240,238,228,.8)'; c.lineWidth = Math.max(1, .12 * s); c.lineCap = 'butt'; c.beginPath();
    for (const e of aisles) {
      const hw = e.way.w / 2;
      for (let d = 1.4; d < e.len - 1.4; d += 2.75) { const p = R.at(e, d, 0); const nx = -p.hz, nz = p.hx; for (const sd of [1, -1]) { c.moveTo(X(p.x + nx * sd * hw), Z(p.z + nz * sd * hw)); c.lineTo(X(p.x + nx * sd * (hw + 5.4)), Z(p.z + nz * sd * (hw + 5.4))); } }
    }
    c.stroke(); c.restore();
  }
  roadY(x, z) { return this.height(x, z) + 0.06; }
  edgeY(e, x, z, s) {
    const h = this.height(x, z);
    if (!e.way.br) return h + 0.06;
    // bridge decks: straight between abutments with a crown over water
    const ya = Math.max(0.6, this.height(e.pts[0], e.pts[1])), yb = Math.max(0.6, this.height(e.pts[e.pts.length - 2], e.pts[e.pts.length - 1]));
    const u = s / e.len; const crown = Math.min(7, e.len / 40) * Math.sin(Math.PI * u);
    return Math.max(h + 0.06, ya + (yb - ya) * u + crown + 0.06);
  }
  buildRoads(t) {
    const R = this.roads, groups = new Map(); const curbs = new GeoBuilder(); const bars = new GeoBuilder(); const isect = new GeoBuilder(true);
    const white = new THREE.Color('#f2f0e8'), cc = new THREE.Color('#c9c3b8');
    for (const ei of t.d.roads) {
      const e = R.edges[ei], way = e.way, A = R.nodes[e.a], B = R.nodes[e.b];
      const s0 = Math.min(e.len * .45, A.r), s1 = Math.max(e.len * .55, e.len - B.r);
      if (s1 - s0 < 0.2) continue;
      const key = roadKey(way); let gb = groups.get(key); if (!gb) groups.set(key, gb = { gb: new GeoBuilder(true), way });
      const b = gb.gb, hw = way.w / 2;
      const n = Math.max(2, Math.ceil((s1 - s0) / 3.5) + 1);
      let prevL = -1, prevR = -1, prevCL = -1;
      const curbed = !['service', 'track', 'motorway', 'motorway_link'].includes(way.t) && !way.br;
      for (let q = 0; q < n; q++) {
        const s = s0 + (s1 - s0) * q / (n - 1);
        const p = R.at(e, s, 0); const nx = -p.hz, nz = p.hx; // left normal
        const y = this.edgeY(e, p.x, p.z, s);
        // (nx,nz) is the RIGHT-hand normal of a->b travel; texture u=0 is the left edge
        const L = b.vert(p.x - nx * hw, y, p.z - nz * hw, 0, 1, 0, white, 0, s / 12);
        const Rr = b.vert(p.x + nx * hw, y, p.z + nz * hw, 0, 1, 0, white, 1, s / 12);
        if (prevL >= 0) b.quadTo(prevL, prevR, Rr, L, 0, 1, 0);
        prevL = L; prevR = Rr;
      }
      // proper curb ribbons (top + face) along both sides
      if (curbed) for (const sd of [1, -1]) {
        let pt = -1, pf = -1;
        for (let q = 0; q < n; q++) {
          const s = s0 + (s1 - s0) * q / (n - 1);
          const p = R.at(e, s, 0); const nx = -p.hz * sd, nz = p.hx * sd; const y = this.edgeY(e, p.x, p.z, s);
          const ax = p.x + nx * hw, az = p.z + nz * hw;
          const top0 = curbs.vert(ax, y + 0.15, az, 0, 1, 0, cc), top1 = curbs.vert(ax + nx * .18, y + 0.15, az + nz * .18, 0, 1, 0, cc);
          const f0 = curbs.vert(ax, y - 0.02, az, -nx, 0, -nz, cc), f1 = curbs.vert(ax, y + 0.15, az, -nx, 0, -nz, cc);
          if (pt >= 0) {
            curbs.quadTo(pt, top0, top1, pt + 1, 0, 1, 0); curbs.quadTo(pf, pf + 1, f1, f0, -nx, 0, -nz);
          }
          pt = top0; pf = f0;
        }
      }
      // stop bars at controlled approaches (signals, stop signs, or a minor road meeting a bigger one)
      for (const [nd, sEnd, dir] of [[B, s1, 0], [A, s0, 1]]) {
        if (!R.canDrive(e, dir) || nd.deg < 3) continue;
        const ctrl = (nd.f & (1 | 2 | 32 | 64)) || (nd.cls >= e.cls + 2 && e.cls >= 3);
        if (!ctrl) continue;
        const lanes = R.lanes(e, dir); if (!lanes) continue;
        const p = R.at(e, sEnd, 0); const y = this.edgeY(e, p.x, p.z, sEnd) + 0.018;
        const nx = -p.hz, nz = p.hx; const lw = laneGeom(way).lw;
        const sgn = dir === 0 ? 1 : -1; // lanes for a->b are on the right (+normal)
        const back = dir === 0 ? -1.2 : 1.2;
        const cx = p.x + p.hx * back, cz = p.z + p.hz * back;
        const inner = way.o ? -way.w / 2 + .4 : 0, outer = way.o ? way.w / 2 - .4 : lanes * lw;
        const a0 = way.o ? inner : 0.15, a1 = way.o ? outer : outer;
        const P = (off, along) => [cx + nx * off * sgn + p.hx * along, cz + nz * off * sgn + p.hz * along];
        const q0 = P(a0, -.25), q1 = P(a1, -.25), q2 = P(a1, .25), q3 = P(a0, .25);
        const ids = [q0, q1, q2, q3].map(([x, z]) => bars.vert(x, y, z, 0, 1, 0, white));
        bars.quadTo(ids[0], ids[1], ids[2], ids[3], 0, 1, 0);
        if (nd.f & (1 | 32 | 8)) { // ladder crosswalk beyond the bar
          for (let k = -way.w / 2 + .5; k < way.w / 2 - .4; k += 1.0) {
            const c = [[k, .7], [k + .5, .7], [k + .5, 3.4], [k, 3.4]].map(([o, al]) => { const X = cx + nx * o + p.hx * al * (dir === 0 ? 1 : -1), Z = cz + nz * o + p.hz * al * (dir === 0 ? 1 : -1); return bars.vert(X, y, Z, 0, 1, 0, white); });
            bars.quadTo(c[0], c[1], c[2], c[3], 0, 1, 0);
          }
        }
      }
    }
    for (const { gb, way } of groups.values()) { const m = new THREE.Mesh(gb.build(), roadTex(roadKey(way), way)); m.receiveShadow = true; t.g.add(m); }
    if (curbs.count) { const m = new THREE.Mesh(curbs.build(), MAT.vc); m.receiveShadow = true; t.g.add(m); }
    if (bars.count) { const m = new THREE.Mesh(bars.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); m.material._own = true; t.g.add(m); }
    // junction boxes for nodes that sit inside this tile
    const x0 = t.i * TS, z0 = t.j * TS;
    const done = new Set();
    for (const ei of t.d.roads) for (const ni of [R.edges[ei].a, R.edges[ei].b]) {
      const nd = R.nodes[ni]; if (done.has(ni) || nd.r <= 0) continue; done.add(ni);
      if (nd.x < x0 || nd.x >= x0 + TS || nd.z < z0 || nd.z >= z0 + TS) continue;
      const pts = [];
      for (const ej of nd.inc) {
        const e = R.edges[ej]; const s = e.a === ni ? Math.min(e.len * .45, nd.r) : Math.max(e.len * .55, e.len - nd.r);
        const p = R.at(e, s, 0); const nx = -p.hz, nz = p.hx, hw = e.way.w / 2;
        pts.push([p.x + nx * hw, p.z + nz * hw], [p.x - nx * hw, p.z - nz * hw]);
      }
      const hull = convexHull(pts); if (hull.length < 3) continue;
      const y = this.height(nd.x, nd.z) + 0.072; const W = new THREE.Color(1, 1, 1);
      const c = isect.vert(nd.x, y, nd.z, 0, 1, 0, W, nd.x / 12, nd.z / 12);
      const ids = hull.map(([x, z]) => isect.vert(x, this.height(x, z) + 0.072, z, 0, 1, 0, W, x / 12, z / 12));
      for (let q = 0; q < ids.length; q++) isect.triTo(c, ids[(q + 1) % ids.length], ids[q], 0, 1, 0);
    }
    if (isect.count) { const m = new THREE.Mesh(isect.build(), MAT.isect); m.receiveShadow = true; t.g.add(m); }
  }
  buildFoot(t) {
    const sw = new GeoBuilder(true), pth = new GeoBuilder(); let bw = null; const side = new THREE.Color('#b1aa9d'), top = new THREE.Color(1, 1, 1), pc = new THREE.Color('#7d776d');
    t.walks = [];
    for (const f of t.d.foot) {
      const p = f.p; if (p.length < 4) continue;
      const isSW = f.k === 'sw' || f.k === 'footway' || f.k === 'pedestrian';
      const board = /boardwalk/i.test(f.n || '') || (f.s === 'wood' && f.k === 'pedestrian'); // the Atlantic City Boardwalk
      const w = board ? (f.w || 18) : f.w ? Math.min(f.w, 12) : f.k === 'sw' ? 1.5 : f.k === 'cx' ? 2.4 : f.k === 'path' || f.k === 'track' ? 1.6 : f.k === 'cycleway' ? 2.2 : 1.6;
      const raise = board ? 1.2 : f.k === 'sw' ? 0.15 : f.k === 'cx' ? 0.01 : 0.04;
      const b = board ? (bw || (bw = new GeoBuilder(true))) : isSW && f.k !== 'cx' ? sw : pth; let dist = 0, pl = -1;
      const P = []; for (let q = 0; q < p.length; q += 2) P.push([p[q] / 10, p[q + 1] / 10]);
      t.walks.push({ k: f.k, P, w, raise });
      for (let q = 0; q < P.length; q++) {
        const [x, z] = P[q]; const a = P[Math.max(0, q - 1)], c = P[Math.min(P.length - 1, q + 1)];
        let dx = c[0] - a[0], dz = c[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        const nx = -dz * w / 2, nz = dx * w / 2;
        if (q) dist += Math.hypot(x - P[q - 1][0], z - P[q - 1][1]);
        const y = this.height(x, z) + raise + (f.br ? 0.5 : 0);
        if (b === sw || b === bw) {
          const i0 = b.vert(x + nx, y, z + nz, 0, 1, 0, top, 0, dist / 1.5), i1 = b.vert(x - nx, y, z - nz, 0, 1, 0, top, 1, dist / 1.5);
          const i2 = b.vert(x + nx, y - .2, z + nz, nx, 0, nz, top, 0, dist / 1.5), i3 = b.vert(x - nx, y - .2, z - nz, -nx, 0, -nz, top, 1, dist / 1.5);
          const i4 = b.vert(x + nx, y, z + nz, nx, 0, nz, top, 0, dist / 1.5), i5 = b.vert(x - nx, y, z - nz, -nx, 0, -nz, top, 1, dist / 1.5);
          if (pl >= 0) { b.quadTo(pl, i0, i1, pl + 1, 0, 1, 0); b.quadTo(pl + 2, i2, i4, pl + 4, nx, 0, nz); b.quadTo(pl + 5, i5, i3, pl + 3, -nx, 0, -nz); }
          pl = i0;
        } else {
          const i0 = b.vert(x + nx, y, z + nz, 0, 1, 0, f.k === 'cx' ? top : pc), i1 = b.vert(x - nx, y, z - nz, 0, 1, 0, f.k === 'cx' ? top : pc);
          if (pl >= 0) b.quadTo(pl, i0, i1, pl + 1, 0, 1, 0); pl = i0;
        }
      }
    }
    if (sw.count) { const m = new THREE.Mesh(sw.build(), MAT.sidewalk); m.receiveShadow = true; t.g.add(m); }
    if (bw && bw.count) { const m = new THREE.Mesh(bw.build(), MAT.boards); m.receiveShadow = true; t.g.add(m); }
    if (pth.count) { const m = new THREE.Mesh(pth.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 })); m.material._own = true; m.receiveShadow = true; t.g.add(m); }
  }
  buildBuildings(t) {
    const walls = new GeoBuilder(false, 4), roofs = new GeoBuilder(), cols = [];
    t.houses = [];
    for (const b of t.d.bld) {
      const P = []; for (let q = 0; q < b.p.length; q += 2) P.push(b.p[q] / 10, b.p[q + 1] / 10);
      if (polyArea(P) < 0) { const R = []; for (let q = P.length - 2; q >= 0; q -= 2) R.push(P[q], P[q + 1]); P.length = 0; P.push(...R); } // make CCW in x/z (clockwise seen from above)
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, ymin = 1e9;
      for (let q = 0; q < P.length; q += 2) { minx = Math.min(minx, P[q]); maxx = Math.max(maxx, P[q]); minz = Math.min(minz, P[q + 1]); maxz = Math.max(maxz, P[q + 1]); ymin = Math.min(ymin, this.height(P[q], P[q + 1])); }
      const r = rng(b.id * 2654435761 >>> 0);
      const res = b.k === 'res', small = b.k === 'small';
      const big = (maxx - minx) * (maxz - minz) > 6000;
      const kindCode = res || small ? (r() < .45 ? 1.3 : 1) : big ? 3 : ['school', 'office', 'apartments', 'hospital', 'university', 'college', 'hotel', 'public', 'civic'].includes(b.k) ? 4 : 2;
      const wallCol = new THREE.Color(res ? (b.bf ? BRICKS[(r() * 4) | 0] : SIDING[(r() * SIDING.length) | 0]) : big ? '#cfc8b8' : b.k === 'church' ? BRICKS[(r() * 4) | 0] : (r() < .35 ? BRICKS[(r() * 4) | 0] : ['#d8d0bf', '#c7bfae', '#e2dccf', '#b9b2a4', '#a8a091'][(r() * 5) | 0]));
      if (b.n && /walmart/i.test(b.n) && b.h > 4) { cols.push({ P, minx, maxx, minz, maxz, h: b.h, top: b.h + 3, b, store: true }); continue; } // the store draws Walmart itself (with real entrances)
      // a hand-built house (local/house.json, private): replaces the generated walls and roof of Dan's own house
      if (res && this.handSpec && this.homeXZ && Math.hypot((minx + maxx) / 2 - this.homeXZ[0], (minz + maxz) / 2 - this.homeXZ[1]) < 8) {
        const nr = this.roads.nearest((minx + maxx) / 2, (minz + maxz) / 2, 55, e => e.cls >= 3 && e.cls <= 7 && !e.way.sv);
        const fit = nr && fitHouse(P, { x: nr.qx, z: nr.qz }, this.handSpec.garage || 'left');
        if (fit) { const E = ymin + .45 + (this.handSpec.eave || 5.3); cols.push({ P, minx, maxx, minz, maxz, h: E, top: E + 3, b }); t.houses.push({ b, P, cx: (minx + maxx) / 2, cz: (minz + maxz) / 2, eave: E, ymin, col: wallCol, r: r(), custom: fit }); continue; }
        console.warn('hand-built house: the footprint does not fit the spec, using the generated house');
      }
      const found = res ? 0.45 : 0.15, base = ymin - 0.3, eave = ymin + found + b.h;
      let u = 0;
      for (let q = 0; q < P.length; q += 2) {
        const ax = P[q], az = P[q + 1], bx = P[(q + 2) % P.length], bz = P[(q + 3) % P.length];
        const L = Math.hypot(bx - ax, bz - az); if (L < 0.05) continue;
        const nx = (bz - az) / L, nz = -(bx - ax) / L; // outward for CCW-in-xz rings
        const f0 = ymin + found;
        const i0 = walls.vert(ax, base, az, nx, 0, nz, wallCol, 0, 0, [0, -1, L, 0]);
        const i1 = walls.vert(bx, base, bz, nx, 0, nz, wallCol, 0, 0, [L, -1, L, 0]);
        const i2 = walls.vert(bx, eave, bz, nx, 0, nz, wallCol, 0, 0, [L, eave - f0, L, kindCode]);
        const i3 = walls.vert(ax, eave, az, nx, 0, nz, wallCol, 0, 0, [0, eave - f0, L, kindCode]);
        // foundation strip colour + wall above: split at floor height so windows start at the floor
        const j0 = walls.vert(ax, f0, az, nx, 0, nz, wallCol, 0, 0, [0, 0, L, kindCode]), j1 = walls.vert(bx, f0, bz, nx, 0, nz, wallCol, 0, 0, [L, 0, L, kindCode]);
        const fc = new THREE.Color('#8e8a82');
        const k0 = walls.vert(ax, base, az, nx, 0, nz, fc, 0, 0, [0, 0, L, 0]), k1 = walls.vert(bx, base, bz, nx, 0, nz, fc, 0, 0, [L, 0, L, 0]), k2 = walls.vert(bx, f0, bz, nx, 0, nz, fc, 0, 0, [L, 0, L, 0]), k3 = walls.vert(ax, f0, az, nx, 0, nz, fc, 0, 0, [0, 0, L, 0]);
        walls.quadTo(k0, k1, k2, k3, nx, 0, nz); walls.quadTo(j0, j1, i2, i3, nx, 0, nz);
        u += L;
      }
      // roof
      const roofCol = new THREE.Color(b.rc && (res || small) ? '#' + b.rc : res || small || b.r === 'gable' ? ROOFS[(r() * ROOFS.length) | 0] : big ? '#d9d6cf' : '#8a8780'); // roof colour: the 2020 orthophoto's median over the footprint
      if ((b.r === 'gable' || b.r === 'hipped') && P.length <= 40) this.gableRoof(roofs, walls, P, eave, roofCol, wallCol, r, b.r === 'hipped' || (res && r() < .28));
      else this.flatRoof(roofs, P, eave, roofCol, big, r);
      cols.push({ P, minx, maxx, minz, maxz, h: eave, top: eave + 3, b });
      if (res) t.houses.push({ b, P, cx: (minx + maxx) / 2, cz: (minz + maxz) / 2, eave, ymin, col: wallCol, r: r() });
    }
    if (walls.count) { const m = new THREE.Mesh(walls.build(), MAT.bld); m.castShadow = true; m.receiveShadow = true; t.g.add(m); }
    if (roofs.count) { const m = new THREE.Mesh(roofs.build(), MAT.roof); m.castShadow = true; m.receiveShadow = true; t.g.add(m); }
    this.colliders.set(t.k, cols);
  }
  flatRoof(roofs, P, y, col, big, r) {
    const pts = []; for (let q = 0; q < P.length; q += 2) pts.push(new THREE.Vector2(P[q], P[q + 1]));
    let tris; try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { return; }
    const base = roofs.count; for (const p of pts) roofs.vert(p.x, y + .02, p.y, 0, 1, 0, col);
    for (const [a, b, c] of tris) roofs.triTo(base + a, base + b, base + c, 0, 1, 0);
    // parapet + rooftop units on commercial roofs
    const pc = col.clone().multiplyScalar(.85);
    for (let q = 0; q < P.length; q += 2) {
      const ax = P[q], az = P[q + 1], bx = P[(q + 2) % P.length], bz = P[(q + 3) % P.length]; const L = Math.hypot(bx - ax, bz - az); if (L < .2) continue;
      roofs.box((ax + bx) / 2, y + .35, (az + bz) / 2, L, .7, .25, pc, -Math.atan2(bz - az, bx - ax));
    }
    if (big || pts.length > 4) {
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9; for (const p of pts) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.y); maxz = Math.max(maxz, p.y); }
      const n = Math.min(40, ((maxx - minx) * (maxz - minz) / 250) | 0); const hv = new THREE.Color('#a6a49e');
      for (let k = 0; k < n; k++) { const x = minx + r() * (maxx - minx), z = minz + r() * (maxz - minz); if (pointInPoly(x, z, P)) roofs.box(x, y + .7, z, 1.6 + r() * 2, 1.2, 1.4 + r() * 1.5, hv); }
    }
  }
  gableRoof(roofs, walls, P, y, col, wallCol, r, hip) {
    // oriented bounding box of the footprint (min-area over edge directions)
    let best = null;
    for (let q = 0; q < P.length; q += 2) {
      const ax = P[q], az = P[q + 1], bx = P[(q + 2) % P.length], bz = P[(q + 3) % P.length];
      const a = Math.atan2(bz - az, bx - ax), c = Math.cos(a), s = Math.sin(a);
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (let k = 0; k < P.length; k += 2) { const u = P[k] * c + P[k + 1] * s, v = -P[k] * s + P[k + 1] * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      const ar = (u1 - u0) * (v1 - v0); if (!best || ar < best.ar) best = { ar, a, u0, u1, v0, v1 };
    }
    let { a, u0, u1, v0, v1 } = best;
    if (v1 - v0 > u1 - u0) { a += Math.PI / 2; [u0, u1, v0, v1] = [v0, v1, -u1, -u0]; }
    const c = Math.cos(a), s = Math.sin(a), ov = 0.35;
    u0 -= ov; u1 += ov; v0 -= ov; v1 += ov;
    const W = (u, v) => [u * c - v * s, u * s + v * c];
    const half = (v1 - v0) / 2, pitch = 0.5 + r() * 0.25, rise = Math.min(4.2, half * pitch), vm = (v0 + v1) / 2;
    const yr = y + rise;
    const inset = hip ? Math.min(half, (u1 - u0) / 2 - .5) : 0;
    const p = [W(u0, v0), W(u1, v0), W(u1, v1), W(u0, v1), W(u0 + inset, vm), W(u1 - inset, vm)];
    const V = (k, yy) => roofs.vert(p[k][0], yy, p[k][1], 0, 1, 0, col);
    const shade = col.clone().multiplyScalar(.82);
    // two roof planes (flat shading gives the facet normals)
    let i = roofs.count;
    roofs.vert(p[0][0], y, p[0][1], 0, 1, 0, col); roofs.vert(p[1][0], y, p[1][1], 0, 1, 0, col); roofs.vert(p[5][0], yr, p[5][1], 0, 1, 0, col); roofs.vert(p[4][0], yr, p[4][1], 0, 1, 0, col);
    roofs.quadTo(i, i + 1, i + 2, i + 3, 0, 1, 0);
    i = roofs.count;
    roofs.vert(p[2][0], y, p[2][1], 0, 1, 0, shade); roofs.vert(p[3][0], y, p[3][1], 0, 1, 0, shade); roofs.vert(p[4][0], yr, p[4][1], 0, 1, 0, shade); roofs.vert(p[5][0], yr, p[5][1], 0, 1, 0, shade);
    roofs.quadTo(i, i + 1, i + 2, i + 3, 0, 1, 0);
    if (hip) {
      i = roofs.count; roofs.vert(p[1][0], y, p[1][1], 0, 1, 0, col); roofs.vert(p[2][0], y, p[2][1], 0, 1, 0, col); roofs.vert(p[5][0], yr, p[5][1], 0, 1, 0, col); roofs.triTo(i, i + 1, i + 2, 0, 1, 0);
      i = roofs.count; roofs.vert(p[3][0], y, p[3][1], 0, 1, 0, shade); roofs.vert(p[0][0], y, p[0][1], 0, 1, 0, shade); roofs.vert(p[4][0], yr, p[4][1], 0, 1, 0, shade); roofs.triTo(i, i + 1, i + 2, 0, 1, 0);
    } else { // gable end triangles in siding colour
      const g0 = [W(u0 + ov, v0 + ov), W(u0 + ov, v1 - ov), W(u0 + ov, vm)], g1 = [W(u1 - ov, v1 - ov), W(u1 - ov, v0 + ov), W(u1 - ov, vm)];
      for (const g of [g0, g1]) {
        const ry = y + rise * (half - ov) / half;
        const nx = g === g0 ? -c : c, nz = g === g0 ? -s : s;
        const ia = walls.vert(g[0][0], y, g[0][1], nx, 0, nz, wallCol, 0, 0, [0, 0, 1, 0]), ib = walls.vert(g[1][0], y, g[1][1], nx, 0, nz, wallCol, 0, 0, [0, 0, 1, 0]), ic = walls.vert(g[2][0], ry, g[2][1], nx, 0, nz, wallCol, 0, 0, [0, 0, 1, 0]);
        walls.tri(ia, ic, ib); walls.tri(ia, ib, ic);
      }
    }
    // chimney on some houses
    if (r() < .3) { const [cx, cz] = W(u0 + (u1 - u0) * (.2 + r() * .6), vm + (r() - .5) * half); roofs.box(cx, yr + .3, cz, .7, 1.8, .7, new THREE.Color(BRICKS[(r() * 4) | 0]), a); }
  }
  // driveways, mailboxes, front doors, garage doors and parked-car slots for every house
  buildDriveways(t) {
    const R = this.roads, dw = new GeoBuilder(true), det = new GeoBuilder();
    const recs = []; const mailCol = new THREE.Color('#1d1d1f'), post = new THREE.Color('#e8e4da'), door = new THREE.Color('#5a3b2a'), gar = new THREE.Color('#ece9e1');
    for (const h of t.houses) {
      const near = R.nearest(h.cx, h.cz, 55, e => e.cls >= 3 && e.cls <= 7 && !e.way.sv);
      if (!near) continue;
      if (h.custom) { // hand-built house: its own door, garage, driveway and plantings
        const hr = buildHandHouse(this.handSpec, h.custom, { y: h.ymin + .45 }, { qx: near.qx, qz: near.qz, half: near.e.way.w / 2 + .3 });
        t.g.add(hr.group); const d = hr.drive, len = Math.hypot(d.ex - d.sx, d.ez - d.sz), width = d.width;
        const nx = -(d.ez - d.sz) / len * width / 2, nz = (d.ex - d.sx) / len * width / 2, steps = Math.max(1, Math.ceil(len / 3)); let pl = -1; const Wc = new THREE.Color(1, 1, 1);
        for (let k = 0; k <= steps; k++) { const x = d.sx + (d.ex - d.sx) * k / steps, z = d.sz + (d.ez - d.sz) * k / steps, y = this.height(x, z) + 0.05; const a = dw.vert(x + nx, y, z + nz, 0, 1, 0, Wc, 0, k * len / steps / 2), b2 = dw.vert(x - nx, y, z - nz, 0, 1, 0, Wc, 1, k * len / steps / 2); if (pl >= 0) dw.quadTo(pl, a, b2, pl + 1, 0, 1, 0); pl = a; }
        const mx = d.ex + nx / (width / 2) * (width / 2 + .8), mz = d.ez + nz / (width / 2) * (width / 2 + .8), my = this.height(mx, mz);
        det.box(mx, my + .55, mz, .1, 1.1, .1, post); det.box(mx, my + 1.15, mz, .24, .26, .5, mailCol, d.yaw);
        h.door = hr.door; h.drive = d; recs.push({ sx: d.sx, sz: d.sz, ex: d.ex, ez: d.ez, yaw: d.yaw, width, len, house: h, mail: [mx, mz], addr: h.b.a || '', car: true });
        continue;
      }
      const e = near.e; const qx = near.qx, qz = near.qz;
      // closest wall point to the road
      let best = null;
      for (let q = 0; q < h.P.length; q += 2) {
        const ax = h.P[q], az = h.P[q + 1], bx = h.P[(q + 2) % h.P.length], bz = h.P[(q + 3) % h.P.length];
        const [d, tt, px, pz] = distSeg(qx, qz, ax, az, bx, bz); if (!best || d < best.d) best = { d, px, pz, ax, az, bx, bz };
      }
      if (!best || best.d > 45) continue;
      let dx = qx - best.px, dz = qz - best.pz; const D = Math.hypot(dx, dz) || 1; dx /= D; dz /= D;
      const wl = Math.hypot(best.bx - best.ax, best.bz - best.az); const wx = (best.bx - best.ax) / wl, wz = (best.bz - best.az) / wl;
      // put the driveway towards one end of the front wall (garage side), the door near the middle
      const side = h.r < .5 ? 1 : -1; const off = Math.min(wl * .3, 3) * side;
      const sx = best.px + wx * off, sz = best.pz + wz * off;
      const roadHalf = e.way.w / 2 + .3; const ex = qx + wx * off - dx * roadHalf, ez = qz + wz * off - dz * roadHalf;
      const len = Math.hypot(ex - sx, ez - sz); if (len < 2 || len > 50) continue;
      const gk = h.b.g; // MOD-IV garage count when known (bake: b.g), else the old guess
      const width = gk !== undefined ? (gk >= 2 ? 5.4 : gk === 1 ? 3.3 : 2.8) : wl > 13 && h.r > .3 ? 5.4 : 3.3;
      { // a driveway that would run through a neighbour's house is not a driveway (audit: drive_through_other_house)
        const yw = Math.atan2(ex - sx, ez - sz); let blocked = false;
        for (let s = 1.8; s < len - .3 && !blocked; s += 1) { const f = s / len; for (const o of [-1, 0, 1]) { const px = sx + (ex - sx) * f + Math.cos(yw) * o * width * .4, pz = sz + (ez - sz) * f - Math.sin(yw) * o * width * .4; const c = this.buildingAt(px, pz); if (c && c.P !== h.P && !c.store) { blocked = true; break; } } }
        if (blocked) continue;
      }
      const nx = -(ez - sz) / len * width / 2, nz = (ex - sx) / len * width / 2;
      const steps = Math.ceil(len / 3); let pl = -1; const W = new THREE.Color(1, 1, 1);
      for (let k = 0; k <= steps; k++) {
        const x = sx + (ex - sx) * k / steps, z = sz + (ez - sz) * k / steps, y = this.height(x, z) + 0.05;
        const a = dw.vert(x + nx, y, z + nz, 0, 1, 0, W, 0, k * len / steps / 2), b = dw.vert(x - nx, y, z - nz, 0, 1, 0, W, 1, k * len / steps / 2);
        if (pl >= 0) dw.quadTo(pl, a, b, pl + 1, 0, 1, 0); pl = a;
      }
      const yaw = Math.atan2(ex - sx, ez - sz);
      // mailbox beside the end of the driveway: right side first, then left; never in a road, a house or another driveway
      let mx = ex, mz = ez, my = 0, mok = false;
      for (const [sd, lat] of [[1, .8], [-1, .8], [1, 1.8], [-1, 1.8]]) {
        const cx2 = ex + nx / (width / 2) * (width / 2 + lat) * sd - dx * .5, cz2 = ez + nz / (width / 2) * (width / 2 + lat) * sd - dz * .5;
        const rn = R.nearest(cx2, cz2, 25, e2 => !e2.way.sv); if (rn && rn.d - rn.e.way.w / 2 < .35) continue;
        if (this.nearBuilding(cx2, cz2, .4)) continue;
        let clash = false; for (const o of recs) { const [dd] = distSeg(cx2, cz2, o.sx, o.sz, o.ex, o.ez); if (dd < o.width / 2 + .3) { clash = true; break; } } if (clash) continue;
        mx = cx2; mz = cz2; mok = true; break;
      }
      my = this.height(mx, mz);
      if (mok) { det.box(mx, my + .55, mz, .1, 1.1, .1, post); det.box(mx, my + 1.15, mz, .24, .26, .5, mailCol, yaw); }
      // front door and garage door on the wall facing the road
      const fy = h.ymin + 0.45;
      const dxp = best.px + wx * (-off * .9) + dx * 0.06, dzp = best.pz + wz * (-off * .9) + dz * 0.06;
      det.box(dxp, fy + 1.05, dzp, .95, 2.1, .12, door, Math.atan2(wx, wz) + Math.PI / 2);
      det.box(dxp + dx * .7, fy - .05, dzp + dz * .7, 1.4, .3, 1.2, new THREE.Color('#9d978c'), Math.atan2(wx, wz) + Math.PI / 2); // stoop
      if (gk !== undefined ? gk > 0 && wl > 6 : h.b.h < 4 && wl > 11 && h.r > .35) det.box(sx + dx * .07, fy + 1.1, sz + dz * .07, width * .78, 2.2, .1, gar, Math.atan2(wx, wz) + Math.PI / 2);
      h.door = { x: dxp, z: dzp, ox: dx, oz: dz, wx, wz, y: fy };
      h.drive = { sx, sz, ex, ez, width, yaw };
      // foundation plantings along the front wall (mulch bed + clipped shrubs), skipping the door and the driveway
      const shrubCol = new THREE.Color('#4f6e34'), mulch = new THREE.Color('#5a3e2b');
      for (let u = .8; u < wl - .8; u += 1.3) {
        const px2 = best.ax + wx * u + dx * .9, pz2 = best.az + wz * u + dz * .9;
        if (Math.hypot(px2 - dxp, pz2 - dzp) < 1.3 || Math.hypot(px2 - sx, pz2 - sz) < width / 2 + .6) continue;
        const sh = .55 + hash((px2 * 97) ^ (pz2 * 31)) * .5; const yy = this.height(px2, pz2);
        det.box(px2, yy + .03, pz2, 1.3, .06, 1.2, mulch, Math.atan2(wx, wz));
        det.box(px2, yy + sh / 2, pz2, .85, sh, .8, shrubCol.clone().multiplyScalar(.85 + hash(u * 7) * .3), Math.atan2(wx, wz) + hash(u) * .4);
      }
      recs.push({ sx, sz, ex, ez, yaw, width, len, house: h, mail: mok ? [mx, mz] : null, addr: h.b.a || '', car: h.r < .62 });
    }
    // above-ground pools (OSM swimming_pool areas in back yards are almost all the round above-ground kind here)
    for (const a of t.d.areas) {
      if (a.k !== 'pool') continue;
      const P = []; for (let q = 0; q < a.p.length; q += 2) P.push(a.p[q] / 10, a.p[q + 1] / 10);
      const ar = Math.abs(polyArea(P)); if (ar > 80 || ar < 8) continue;
      let cx = 0, cz = 0; for (let q = 0; q < P.length; q += 2) { cx += P[q]; cz += P[q + 1]; } cx /= P.length / 2; cz /= P.length / 2;
      const rad = Math.sqrt(ar / Math.PI), y = this.height(cx, cz);
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 1.25, 20, 1, true), new THREE.MeshLambertMaterial({ color: '#d9dcd8', side: THREE.DoubleSide })); wall.position.set(cx, y + .62, cz); wall.material._own = true;
      const water = new THREE.Mesh(new THREE.CircleGeometry(rad - .05, 20).rotateX(-Math.PI / 2), MAT.water); water.position.set(cx, y + 1.08, cz);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rad, .07, 4, 24).rotateX(Math.PI / 2), MAT.white); rim.position.set(cx, y + 1.25, cz);
      t.g.add(wall, water, rim);
    }
    if (dw.count) { const m = new THREE.Mesh(dw.build(), MAT.driveway); m.receiveShadow = true; t.g.add(m); }
    if (det.count) { const m = new THREE.Mesh(det.build(), MAT.vc); m.castShadow = true; t.g.add(m); }
    this.drives.set(t.k, recs);
  }
  buildTrees(t) {
    const by = [[], [], [], []];
    const drs = this.drives.get(t.k) || []; t.treeList = [];
    for (const [x0, z0, sp] of t.d.trees) {
      const x = x0 / 10, z = z0 / 10;
      let bad = false; for (const d of drs) { const [dd] = distSeg(x, z, d.sx, d.sz, d.ex, d.ez); if (dd < d.width / 2 + 1.4) { bad = true; break; } } // not in a driveway
      if (!bad) { const n = this.roads.nearest(x, z, 20, e => !e.way.sv); if (n && n.d - n.e.way.w / 2 < 1.5) bad = true; } // trunk at least 1.5 m from the carriageway
      if (!bad && this.nearBuilding(x, z, 1.6)) bad = true; // and 1.6 m from any wall
      if (bad) continue; by[sp].push([x, z]); t.treeList.push([x, z]);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    for (let sp = 1; sp <= 3; sp++) {
      const list = by[sp]; if (!list.length) continue;
      const im = new THREE.InstancedMesh(this.treeGeo[sp], MAT.vcFlat, list.length);
      list.forEach(([x, z], i) => {
        const h = hash((x * 73856093) ^ (z * 19349663));
        const sc = sp === 1 ? .8 + h * .55 : sp === 2 ? .75 + h * .6 : .6 + h * .7;
        q.setFromAxisAngle(Y, h * 6.283); s.set(sc, sc * (0.9 + hash(i + 7) * .25), sc); p.set(x, this.height(x, z) - .1, z);
        im.setMatrixAt(i, m4.compose(p, q, s));
      });
      im.castShadow = true; im.receiveShadow = true; t.g.add(im);
    }
  }
  buildProps(t) {
    const by = new Map();
    for (const pr of t.d.props) { const k = pr[0]; if (!this.propGeo[k]) continue; if (!by.has(k)) by.set(k, []); by.get(k).push(pr); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    t.props = [];
    for (const [k, list] of by) {
      const im = new THREE.InstancedMesh(this.propGeo[k], MAT.vcFlat, list.length);
      list.forEach((pr, i) => {
        let x = pr[1] / 10, z = pr[2] / 10;
        let yaw = 0; const n = this.roads.nearest(x, z, 30);
        if (n && ['pole', 'lamp', 'stop', 'yield', 'sign', 'speed'].includes(k)) { // posts stand beside the road, never on it (audit: post_in_road)
          for (let it = 0; it < 3; it++) { const n3 = this.roads.nearest(x, z, 30, e => !e.way.sv); if (!n3) break; const lim = n3.e.way.w / 2 + .7; if (n3.d >= lim) break; let ux = x - n3.qx, uz = z - n3.qz; const L = Math.hypot(ux, uz); if (L < .05) { const a2 = this.roads.at(n3.e, n3.s); ux = -a2.hz; uz = a2.hx; } else { ux /= L; uz /= L; } x = n3.qx + ux * lim; z = n3.qz + uz * lim; }
        }
        if (n) { const a = this.roads.at(n.e, n.s); yaw = Math.atan2(a.hx, a.hz); if (k === 'stop' || k === 'yield') yaw += Math.PI; }
        q.setFromAxisAngle(Y, yaw); p.set(x, this.height(x, z), z); im.setMatrixAt(i, m4.compose(p, q, s));
        t.props.push({ k, x, z, yaw, name: pr[3] });
      });
      im.castShadow = true; t.g.add(im);
    }
    // street lights: mapped lamps plus the cobra-heads that sit on about a third of the utility poles
    const lamps = [];
    for (const o of t.props) { if (o.k === 'lamp') lamps.push([o.x + Math.sin(o.yaw) * 0 + Math.cos(o.yaw) * 0, o.z, o.yaw, 8.3, 2.1]); else if (o.k === 'pole' && hash((o.x * 991) ^ (o.z * 313)) < .38) lamps.push([o.x, o.z, o.yaw, 9.2, 1.6]); }
    if (lamps.length) {
      const heads = new THREE.InstancedMesh(LAMP.headGeo, LAMP.headMat, lamps.length), pools = new THREE.InstancedMesh(LAMP.poolGeo, LAMP.poolMat, lamps.length), arms = new THREE.InstancedMesh(LAMP.armGeo, MAT.vcFlat, lamps.length);
      lamps.forEach(([x, z, yaw, hgt, reach], i) => {
        // arm points towards the road: the nearest road centre
        const n = this.roads.nearest(x, z, 30); let ax = 0, az = 1; if (n) { const L = Math.hypot(n.qx - x, n.qz - z) || 1; ax = (n.qx - x) / L; az = (n.qz - z) / L; }
        const y = this.height(x, z); const hx = x + ax * reach, hz = z + az * reach; const ya = Math.atan2(ax, az);
        q.setFromAxisAngle(Y, ya); p.set(hx, y + hgt, hz); heads.setMatrixAt(i, m4.compose(p, q, s));
        p.set(x, y + hgt + .1, z); arms.setMatrixAt(i, m4.compose(p, q, new THREE.Vector3(1, 1, reach)));
        p.set(hx, this.height(hx, hz) + .09, hz); pools.setMatrixAt(i, m4.compose(p, q.identity(), s));
      });
      pools.renderOrder = 2; t.g.add(heads, pools, arms); t.lamps = lamps;
    }
  }
  buildLines(t) {
    const fence = new GeoBuilder(); const wire = []; const rail = new GeoBuilder();
    const FC = { fence: '#e9e6dc', wall: '#9a948a', hedge: '#4f6b34', guard_rail: '#b8bbbe', retaining_wall: '#8f8a80', jersey_barrier: '#c8c3b8', kerb: '#c9c3b8' };
    const FH = { fence: 1.8, wall: 1.4, hedge: 1.6, guard_rail: .75, retaining_wall: .9, jersey_barrier: .82, kerb: .15 };
    const FW = { fence: .06, wall: .3, hedge: .9, guard_rail: .12, retaining_wall: .35, jersey_barrier: .5, kerb: .15 };
    for (const [k, p] of t.d.lines) {
      const P = []; for (let q = 0; q < p.length; q += 2) P.push([p[q] / 10, p[q + 1] / 10]);
      if (k === 'power') { for (let q = 1; q < P.length; q++) { const [ax, az] = P[q - 1], [bx, bz] = P[q]; const ya = this.height(ax, az) + 10.4, yb = this.height(bx, bz) + 10.4; const L = Math.hypot(bx - ax, bz - az); for (const off of [-.6, .6]) { const ox = -(bz - az) / L * off, oz = (bx - ax) / L * off; let px = ax + ox, py = ya, pz = az + oz; for (let u = 1; u <= 8; u++) { const f = u / 8; const x = ax + (bx - ax) * f + ox, z = az + (bz - az) * f + oz, y = ya + (yb - ya) * f - Math.sin(Math.PI * f) * L * .012; wire.push(px, py, pz, x, y, z); px = x; py = y; pz = z; } } } continue; }
      if (k === 'rail') { const c = new THREE.Color('#6b5a48'); for (let q = 1; q < P.length; q++) { const [ax, az] = P[q - 1], [bx, bz] = P[q]; const L = Math.hypot(bx - ax, bz - az), a = -Math.atan2(bz - az, bx - ax); rail.box((ax + bx) / 2, this.height(ax, az) + .15, (az + bz) / 2, L, .3, 2.8, c, a); } continue; }
      if (!FC[k]) continue; const col = new THREE.Color(FC[k]);
      for (let q = 1; q < P.length; q++) {
        const [ax, az] = P[q - 1], [bx, bz] = P[q]; const L = Math.hypot(bx - ax, bz - az); if (L < .1) continue;
        const a = -Math.atan2(bz - az, bx - ax); const y = this.height((ax + bx) / 2, (az + bz) / 2);
        fence.box((ax + bx) / 2, y + FH[k] / 2, (az + bz) / 2, L, FH[k], FW[k], col, a);
        if (k === 'fence') for (let u = 0; u < L; u += 2.4) fence.box(ax + (bx - ax) * u / L, y + FH[k] / 2 + .05, az + (bz - az) * u / L, .12, FH[k] + .1, .12, col, a);
      }
    }
    if (fence.count) { const m = new THREE.Mesh(fence.build(), MAT.vc); m.castShadow = true; t.g.add(m); }
    if (rail.count) t.g.add(new THREE.Mesh(rail.build(), MAT.vc));
    if (wire.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)); t.g.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#222' }))); }
  }
  // green street-name blades at junctions and speed-limit signs along the way
  buildSigns(t) {
    const R = this.roads, x0 = t.i * TS, z0 = t.j * TS; const seen = new Set();
    const posts = new GeoBuilder(); const pc = new THREE.Color('#8a8f94');
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 1024; const g = canvas.getContext('2d');
    let slot = 0; const quads = [];
    const blade = (txt, kind) => { // returns uv rect in an atlas of 32 slots (512x32 each)
      if (slot >= 32) return null; const y = slot * 32; slot++;
      if (kind === 'speed') { g.fillStyle = '#fff'; g.fillRect(0, y, 128, 32); g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(2, y + 2, 124, 28); g.fillStyle = '#111'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText('SPEED LIMIT', 64, y + 12); g.font = 'bold 15px sans-serif'; g.fillText(txt, 64, y + 28); return [0, y, 128, 32]; }
      g.fillStyle = '#1f6b45'; g.fillRect(0, y, 512, 32); g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(2, y + 2, 508, 28);
      g.fillStyle = '#fff'; g.font = 'bold 20px Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt.replace(/\bAvenue\b/, 'AVE').replace(/\bStreet\b/, 'ST').replace(/\bRoad\b/, 'RD').replace(/\bDrive\b/, 'DR').replace(/\bLane\b/, 'LN').replace(/\bCourt\b/, 'CT').replace(/\bBoulevard\b/, 'BLVD').replace(/\bPlace\b/, 'PL').replace(/\bParkway\b/, 'PKWY').replace(/\bTerrace\b/, 'TER').toUpperCase(), 256, y + 17, 490);
      return [0, y, 512, 32];
    };
    for (const ei of t.d.roads) for (const ni of [R.edges[ei].a, R.edges[ei].b]) {
      if (seen.has(ni)) continue; seen.add(ni); const nd = R.nodes[ni];
      if (nd.x < x0 || nd.x >= x0 + TS || nd.z < z0 || nd.z >= z0 + TS || nd.deg < 3) continue;
      const names = [...new Set(nd.inc.map(i => R.edges[i].way.n).filter(Boolean))]; if (!names.length) continue;
      // the post stands at the corner between the first two approaches
      const e0 = R.edges[nd.inc[0]]; const [dx, dz] = R.leaveDir(e0, ni);
      const off = nd.r + 1.2; const px = nd.x + dx * off - dz * (e0.way.w / 2 + 1.2), pz = nd.z + dz * off + dx * (e0.way.w / 2 + 1.2);
      const y = this.height(px, pz);
      posts.box(px, y + 1.4, pz, .07, 2.8, .07, pc);
      names.slice(0, 2).forEach((nm, k) => {
        const uv = blade(nm); if (!uv) return;
        const e = R.edges[nd.inc.find(i => R.edges[i].way.n === nm)]; const [hx, hz] = R.leaveDir(e, ni);
        quads.push({ x: px, y: y + 2.55 + k * .2, z: pz, yaw: Math.atan2(hx, hz) + Math.PI / 2, w: Math.min(1.2, .35 + nm.length * .045), h: .17, uv });
      });
    }
    for (const ei of t.d.roads) { // speed limits on the bigger roads, once per edge long enough
      const e = R.edges[ei]; if (e.cls < 4 || e.len < 180) continue;
      const p = R.at(e, e.len * .5); const side = e.way.w / 2 + 1.5; const sx = p.x - p.hz * -side, sz = p.z + p.hx * -side;
      const uv = blade(String(e.way.s), 'speed'); if (!uv) continue;
      const y = this.height(sx, sz); posts.box(sx, y + 1.1, sz, .06, 2.2, .06, pc);
      quads.push({ x: sx, y: y + 2.1, z: sz, yaw: Math.atan2(p.hx, p.hz) + Math.PI, w: .6, h: .75, uv, two: false });
    }
    if (posts.count) t.g.add(new THREE.Mesh(posts.build(), MAT.vc));
    if (!quads.length) return;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const pos = [], uvs = [], idx = [];
    for (const q of quads) {
      const c = Math.cos(q.yaw), s = Math.sin(q.yaw); const hw = q.w / 2;
      const [ux, uy, uw, uh] = q.uv; const u0 = ux / 512, u1 = (ux + uw) / 512, v0 = 1 - (uy + uh) / 1024, v1 = 1 - uy / 1024;
      const b = pos.length / 3;
      for (const [dx, dy, u, v] of [[-hw, -q.h / 2, u0, v0], [hw, -q.h / 2, u1, v0], [hw, q.h / 2, u1, v1], [-hw, q.h / 2, u0, v1]]) { pos.push(q.x + dx * c, q.y + dy, q.z - dx * s); uvs.push(u, v); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); m._own = true; t.g.add(new THREE.Mesh(geo, m));
  }
  // ---------------------------------------------------------------- queries
  // is (x, z) inside a footprint or within r metres of one? (this tile and its neighbours)
  nearBuilding(x, z, r) {
    const [i, j] = this.key(x, z).split('_').map(Number);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const cs = this.colliders.get((i + a) + '_' + (j + b)); if (!cs) continue; for (const c of cs) { if (x < c.minx - r || x > c.maxx + r || z < c.minz - r || z > c.maxz + r) continue; if (pointInPoly(x, z, c.P)) return c; const P = c.P; for (let q = 0; q < P.length; q += 2) if (distSeg(x, z, P[q], P[q + 1], P[(q + 2) % P.length], P[(q + 3) % P.length])[0] < r) return c; } }
    return null;
  }
  buildingAt(x, z, pad = 0) {
    const k = this.key(x, z); const out = [];
    for (const kk of [k]) { const cs = this.colliders.get(kk); if (!cs) continue; for (const c of cs) if (x > c.minx - pad && x < c.maxx + pad && z > c.minz - pad && z < c.maxz + pad && pointInPoly(x, z, c.P)) return c; }
    // neighbours (footprints can straddle a tile edge)
    const [i, j] = k.split('_').map(Number);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { if (!a && !b) continue; const cs = this.colliders.get((i + a) + '_' + (j + b)); if (!cs) continue; for (const c of cs) if (x > c.minx && x < c.maxx && z > c.minz && z < c.maxz && pointInPoly(x, z, c.P)) return c; }
    return null;
  }
  // what is under the wheels: road / sidewalk / driveway / grass, with heights for curb physics
  surface(x, z) {
    const h = this.height(x, z);
    const r = this.roads.onRoad(x, z);
    if (r && r.on) return { kind: 'road', y: this.edgeY(r.e, x, z, r.s), hit: r, grip: 1 };
    const t = this.tiles.get(this.key(x, z));
    if (t && t.walks) for (const w of t.walks) {
      for (let q = 1; q < w.P.length; q++) { const [d] = distSeg(x, z, w.P[q - 1][0], w.P[q - 1][1], w.P[q][0], w.P[q][1]); if (d < w.w / 2) return { kind: w.k === 'sw' ? 'sidewalk' : 'path', y: h + w.raise, grip: 1, hit: r }; }
    }
    const dr = this.drives.get(this.key(x, z));
    if (dr) for (const d of dr) { const [dd, tt] = distSeg(x, z, d.sx, d.sz, d.ex, d.ez); if (dd < d.width / 2) return { kind: 'driveway', y: h + 0.05, grip: 1, hit: r, cut: tt > .85 }; }
    // curb lip: just off a curbed road we are up on the lawn
    const curbed = r && !['service', 'track', 'motorway', 'motorway_link'].includes(r.e.way.t) && !r.e.way.br;
    return { kind: 'grass', y: h + (curbed && r.d < r.e.way.w / 2 + 2.5 ? 0.15 : 0.04), grip: 0.55, hit: r };
  }
}

function stalls(c, p, x0, z0, s) {
  // parking stripes aligned to the lot's longest edge, 2.75 m pitch, with aisles every 2 rows
  let best = 0, ang = 0;
  for (let q = 0; q < p.length; q += 2) { const ax = p[q], az = p[q + 1], bx = p[(q + 2) % p.length], bz = p[(q + 3) % p.length]; const L = Math.hypot(bx - ax, bz - az); if (L > best) { best = L; ang = Math.atan2(bz - az, bx - ax); } }
  let cx = 0, cz = 0; for (let q = 0; q < p.length; q += 2) { cx += p[q] / 10; cz += p[q + 1] / 10; } cx /= p.length / 2; cz /= p.length / 2;
  c.save(); c.translate((cx - x0) * s, (cz - z0) * s); c.rotate(ang); c.strokeStyle = 'rgba(240,238,228,.75)'; c.lineWidth = Math.max(1, .12 * s);
  const span = 400 * s;
  for (let row = -span; row < span; row += 23 * s) { // stall row depth 5.5 m, aisle 7.5 m, row pair = 23 m
    for (let x = -span; x < span; x += 2.75 * s) { c.beginPath(); c.moveTo(x, row); c.lineTo(x, row + 5.5 * s); c.moveTo(x, row + 5.5 * s); c.lineTo(x, row + 11 * s); c.stroke(); }
    c.beginPath(); c.moveTo(-span, row + 5.5 * s); c.lineTo(span, row + 5.5 * s); c.stroke();
  }
  c.restore();
}
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}

// ----- tree geometry: blocky low-poly, flat shaded, vertex coloured -----
function jitterIco(r, detail, seed, sx = 1, sy = 1, sz = 1, col, oy = 0) {
  const g = new THREE.IcosahedronGeometry(r, detail).toNonIndexed(); const p = g.attributes.position; const R = rng(seed);
  const map = new Map();
  for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3); if (!map.has(k)) map.set(k, .82 + R() * .36); const f = map.get(k); p.setXYZ(i, p.getX(i) * f * sx, p.getY(i) * f * sy + oy, p.getZ(i) * f * sz); }
  const c = []; for (let i = 0; i < p.count; i++) { const v = .85 + R() * .3; c.push(col.r * v, col.g * v, col.b * v); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.computeVertexNormals(); return g;
}
function cyl(r0, r1, h, col, oy = 0, seg = 6) { const g = new THREE.CylinderGeometry(r1, r0, h, seg).toNonIndexed(); g.translate(0, h / 2 + oy, 0); const c = []; for (let i = 0; i < g.attributes.position.count; i++) c.push(col.r, col.g, col.b); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g; }
function boxG(sx, sy, sz, col, x = 0, y = 0, z = 0) { const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(); g.translate(x, y, z); const c = []; for (let i = 0; i < g.attributes.position.count; i++) c.push(col.r, col.g, col.b); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g; }
function makeTreeGeos() {
  const bark = new THREE.Color('#6b4f3a'), pine = new THREE.Color('#4c6a3a'), oak = new THREE.Color('#5d7d3a'), shrub = new THREE.Color('#5f7f3f');
  const out = [];
  // pitch pine: tall bare trunk, a few irregular clumps up top (the Pine Barrens look)
  out[1] = mergeGeometries([cyl(.22, .14, 11, bark), jitterIco(1.9, 0, 1, 1.3, .8, 1.1, pine, 11.2), jitterIco(1.4, 0, 2, 1, .7, 1, pine, 9.4).translate(1.1, 0, .4), jitterIco(1.3, 0, 3, 1, .7, 1, pine, 10).translate(-1, 0, -.6), jitterIco(1.1, 0, 4, 1, .8, 1, pine, 12.4).translate(.2, 0, -.4)]);
  // oak / maple: stout trunk, broad lumpy crown
  out[2] = mergeGeometries([cyl(.3, .2, 4.2, bark), jitterIco(3.4, 1, 5, 1.15, .85, 1.1, oak, 6.6), jitterIco(2.2, 0, 6, 1, .8, 1, oak, 5.6).translate(2, 0, .6), jitterIco(2, 0, 7, 1, .8, 1, oak, 6).translate(-1.8, 0, -.9)]);
  // small ornamental / shrub tree
  out[3] = mergeGeometries([cyl(.12, .08, 1.4, bark), jitterIco(1.4, 0, 8, 1, .9, 1, shrub, 2.3)]);
  return out;
}
function makePropGeos() {
  const wood = new THREE.Color('#6e5a46'), steel = new THREE.Color('#8b9094'), red = new THREE.Color('#c0262d'), white = new THREE.Color('#f0eee8'), black = new THREE.Color('#222'), yel = new THREE.Color('#e3b53b'), grn = new THREE.Color('#2f6b3c'), blue = new THREE.Color('#2a4f8c');
  const G = {};
  G.pole = mergeGeometries([cyl(.16, .12, 11.5, wood, 0, 8), boxG(2.4, .12, .12, wood, 0, 10.4, 0), boxG(.12, .4, .12, steel, -1, 10.6, 0), boxG(.12, .4, .12, steel, 1, 10.6, 0)]);
  G.lamp = mergeGeometries([cyl(.09, .07, 8.5, steel), boxG(.08, .08, 2.2, steel, 0, 8.4, 1.1), boxG(.35, .15, .7, new THREE.Color('#cfd2d4'), 0, 8.3, 2.1)]);
  const oct = new THREE.CylinderGeometry(.38, .38, .03, 8).toNonIndexed(); oct.rotateX(Math.PI / 2); oct.rotateZ(Math.PI / 8); oct.translate(0, 2.2, 0); { const c = []; for (let i = 0; i < oct.attributes.position.count; i++) c.push(red.r, red.g, red.b); oct.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); }
  G.stop = mergeGeometries([cyl(.035, .035, 2.2, steel), oct, boxG(.5, .07, .035, white, 0, 2.2, .02)]);
  G.yield = mergeGeometries([cyl(.035, .035, 2.2, steel), boxG(.75, .65, .03, red, 0, 2.25, 0), boxG(.5, .4, .035, white, 0, 2.3, .01)]);
  G.hydrant = mergeGeometries([cyl(.13, .12, .55, red, 0, 8), cyl(.15, .1, .12, red, .55, 8), boxG(.4, .09, .09, red, 0, .38, 0)]);
  G.bench = mergeGeometries([boxG(1.6, .06, .42, wood, 0, .45, 0), boxG(1.6, .4, .05, wood, 0, .75, -.2), boxG(.06, .45, .4, black, -.7, .22, 0), boxG(.06, .45, .4, black, .7, .22, 0)]);
  G.bin = mergeGeometries([cyl(.28, .3, .9, grn, 0, 8)]);
  G.busstop = mergeGeometries([cyl(.04, .04, 2.6, steel), boxG(.45, .6, .03, blue, 0, 2.4, 0), boxG(.3, .12, .035, white, 0, 2.55, .01)]);
  G.bollard = cyl(.1, .1, .95, yel, 0, 8);
  G.flag = mergeGeometries([cyl(.06, .04, 9, white), boxG(1.6, 1, .02, red, .8, 8.4, 0), boxG(.7, .55, .03, blue, .35, 8.65, 0)]);
  G.postbox = mergeGeometries([boxG(.5, 1.1, .5, blue, 0, .55, 0)]);
  G.bikerack = mergeGeometries([boxG(.05, .8, .05, steel, -.6, .4, 0), boxG(.05, .8, .05, steel, .6, .4, 0), boxG(1.25, .05, .05, steel, 0, .8, 0), boxG(.05, .8, .05, steel, -.2, .4, 0), boxG(.05, .8, .05, steel, .2, .4, 0)]);
  G.crosswalk = null; G.signal = null; // signals are drawn by the traffic controller
  return G;
}
