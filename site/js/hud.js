// HUD: green street-name sign, speedometer, battery, rotating minimap, full map, GPS with turn-by-turn.
import * as THREE from '../vendor/three.module.js';
import { clamp, angDiff, toast } from './util.js';

const MPH = 0.44704;
const RC = { motorway: '#e8a33a', trunk: '#eab04a', primary: '#f1c25a', secondary: '#f7da7a', tertiary: '#fbeaa6', residential: '#ffffff', unclassified: '#ffffff', living_street: '#ffffff', service: '#efe9df' };
const RW = { motorway: 7, trunk: 6.5, primary: 6, secondary: 5, tertiary: 4.5, residential: 3, unclassified: 3, living_street: 2.5, service: 1.6 };

export class HUD {
  constructor(game) {
    this.g = game; this.R = game.roads;
    this.el = { street: $('street'), clock: $('clock'), spd: $('spd'), mode: $('mode'), battbar: $('battbar'), battpct: $('battpct'), bl: $('bl'), br: $('br'), wp: $('wp'), compass: $('compass') };
    this.mini = $('mini').getContext('2d');
    this.route = this.route.bind(this);
    this.path = null; this.mapOpen = false; this.mapView = { x: 0, z: 0, s: .25 };
    this.ribbon = null;
    this.bake();
    this.mapSetup();
  }
  // pre-render all roads into an offscreen canvas (1 px = 2 m) for the minimap/map
  bake() {
    const m = this.g.meta; const W = Math.ceil((m.gx1 - m.gx0) / 2), H = Math.ceil((m.gz1 - m.gz0) / 2);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#e9e2d4'; g.fillRect(0, 0, W, H);
    const X = (x) => (x - m.gx0) / 2, Z = (z) => (z - m.gz0) / 2;
    // water + parks from the meta areas are not shipped globally; draw roads only, by class
    const order = ['service', 'living_street', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
    for (const pass of [0, 1]) for (const t of order) {
      g.strokeStyle = pass ? (RC[t] || '#fff') : '#b8ad99'; g.lineCap = 'round'; g.lineJoin = 'round';
      g.lineWidth = (RW[t] || 2) / 2 + (pass ? 0 : 1.2);
      g.beginPath();
      for (const e of this.R.edges) { if (e.way.t.replace('_link', '') !== t) continue; const p = e.pts; g.moveTo(X(p[0]), Z(p[1])); for (let k = 2; k < p.length; k += 2) g.lineTo(X(p[k]), Z(p[k + 1])); }
      g.stroke();
    }
    this.base = c; this.bx0 = m.gx0; this.bz0 = m.gz0;
  }
  update(dt) {
    const p = this.g.player, e = this.el;
    // the street you are on (or nearest), as a green NJ street sign
    const n = this.R.nearest(p.x, p.z, 25);
    const nm = n ? (n.e.way.n || (n.e.way.r ? n.e.way.r : '')) : '';
    const sign = (nm || '').replace(/^NJ (\d+)/, 'Route $1');
    if (e.street.textContent !== sign) e.street.textContent = sign;
    e.clock.textContent = this.g.clockStr() + '  ' + this.g.weekday();
    const mph = p.speed / MPH;
    e.spd.textContent = Math.round(mph);
    e.mode.textContent = p.driving ? (p.car.v < -.1 ? 'R' : 'CAR') : p.riding ? ({ 1: 'ECO', 2: 'D', 3: 'S' })[p.mode] : 'WALK';
    e.battbar.style.width = (p.batt * 100).toFixed(0) + '%'; e.battpct.textContent = Math.round(p.batt * 100) + '%';
    e.battbar.style.background = p.batt < .15 ? '#d9534f' : p.batt < .35 ? '#e0a23a' : '#5b8c5a';
    const on = (performance.now() % 760) < 400;
    e.bl.className = p.blink < 0 && on ? 'on' : ''; e.br.className = p.blink > 0 && on ? 'on' : '';
    const deg = ((-p.lookYaw * 180 / Math.PI + 180) % 360 + 360) % 360; // 0 = north
    e.compass.textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8] + ' ' + Math.round(deg) + '°';
    this.drawMini(p);
    this.gps(p);
    if (this.mapOpen) this.drawMap();
  }
  drawMini(p) {
    const g = this.mini, W = 220, s = 2.2; // px per metre... minimap shows ~200 m radius
    const scale = 0.55; // canvas px per metre
    g.save(); g.clearRect(0, 0, W, W); g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#e9e2d4'; g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2); g.rotate(Math.PI + p.lookYaw); // heading up
    g.scale(scale * 2, scale * 2); g.translate(-(p.x - this.bx0) / 2, -(p.z - this.bz0) / 2);
    g.drawImage(this.base, 0, 0);
    if (this.path) { g.strokeStyle = '#3b82f6'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); this.path.pts.forEach(([x, z], i) => { const X = (x - this.bx0) / 2, Z = (z - this.bz0) / 2; i ? g.lineTo(X, Z) : g.moveTo(X, Z); }); g.stroke(); }
    const mark = (x, z, col, r = 4) => { g.fillStyle = col; g.beginPath(); g.arc((x - this.bx0) / 2, (z - this.bz0) / 2, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); };
    if (this.g.home && this.g.home.hx !== undefined) mark(this.g.home.hx, this.g.home.hz, '#d97757', 5);
    if (this.g.store.cx) mark(this.g.store.cx, this.g.store.cz, '#0b4fa8', 5);
    if (!p.riding) mark(p.sc.x, p.sc.z, '#333', 3);
    for (const c of this.g.traffic.cars) if (c.x !== undefined && Math.abs(c.x - p.x) < 260 && Math.abs(c.z - p.z) < 260) { g.fillStyle = '#777'; g.fillRect((c.x - this.bx0) / 2 - 1, (c.z - this.bz0) / 2 - 1, 2, 2); }
    g.restore();
    // you
    g.fillStyle = '#d97757'; g.beginPath(); g.moveTo(W / 2, W / 2 - 9); g.lineTo(W / 2 + 6, W / 2 + 6); g.lineTo(W / 2, W / 2 + 3); g.lineTo(W / 2 - 6, W / 2 + 6); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#2a2622'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
    const th = Math.PI + p.lookYaw; g.fillText('N', W / 2 + Math.sin(th) * 96, W / 2 - Math.cos(th) * 96 + 4);
  }
  // ---------- routing ----------
  nearestNode(x, z) { const h = this.R.nearest(x, z, 300, e => e.cls >= 2); if (!h) return null; return h.t < .5 ? h.e.a : h.e.b; }
  route(dest) {
    const p = this.g.player; const a = this.nearestNode(p.x, p.z), b = this.nearestNode(dest.x, dest.z);
    if (a === null || b === null) { toast('No route.'); return; }
    // A*: cost = length / speed factor (scooters avoid big highways a bit)
    const R = this.R, N = R.nodes;
    const open = new Map([[a, 0]]), came = new Map(), gS = new Map([[a, 0]]);
    const hf = (n) => Math.hypot(N[n].x - N[b].x, N[n].z - N[b].z);
    let it = 0;
    while (open.size && it++ < 60000) {
      let cur = -1, bf = 1e18; for (const [n, f] of open) if (f < bf) { bf = f; cur = n; }
      if (cur === b) break; open.delete(cur);
      for (const ei of N[cur].inc) {
        const e = R.edges[ei]; const dir = e.a === cur ? 0 : 1; if (p.riding && !R.canDrive(e, dir)) continue; // on the scooter you obey one-ways; on foot you don't have to
        const to = dir ? e.a : e.b; const w = e.len * (e.cls >= 8 ? 2.2 : e.cls >= 6 ? 1.15 : e.way.sv === 'driveway' ? 6 : 1);
        const ng = gS.get(cur) + w; if (ng < (gS.get(to) ?? 1e18)) { gS.set(to, ng); came.set(to, [cur, ei, dir]); open.set(to, ng + hf(to)); }
      }
    }
    if (!came.has(b) && a !== b) { toast('No route found.'); return; }
    const steps = []; let n = b; while (n !== a) { const [pr, ei, dir] = came.get(n); steps.unshift({ e: R.edges[ei], dir, node: n }); n = pr; }
    const pts = []; for (const s of steps) { const P = s.e.pts; const L = P.length / 2; for (let k = 0; k < L; k++) { const q = s.dir ? L - 1 - k : k; pts.push([P[2 * q], P[2 * q + 1]]); } }
    pts.push([dest.x, dest.z]);
    this.path = { dest, steps, pts, len: steps.reduce((s, x) => s + x.e.len, 0) };
    toast(`Route to ${dest.name}: ${(this.path.len / 1609.34).toFixed(1)} mi`);
    this.makeRibbon();
  }
  makeRibbon() {
    if (this.ribbon) { this.g.scene.remove(this.ribbon); this.ribbon.geometry.dispose(); }
    const pos = []; const W = this.g.world;
    for (const [x, z] of this.path.pts) pos.push(x, W.height(x, z) + .25, z);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.ribbon = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#3b82f6', transparent: true, opacity: .8 })); this.g.scene.add(this.ribbon);
  }
  gps(p) {
    if (!this.path) { this.el.wp.textContent = this.g.goal || ''; return; }
    const d = Math.hypot(this.path.dest.x - p.x, this.path.dest.z - p.z);
    if (d < 25) { toast('You have arrived: ' + this.path.dest.name); this.path = null; if (this.ribbon) { this.g.scene.remove(this.ribbon); this.ribbon = null; } return; }
    // next turn: find the closest step, then the next junction with a heading change
    let bi = 0, bd = 1e9; this.path.steps.forEach((s, i) => { const n = this.R.nodes[s.node]; const dd = Math.hypot(n.x - p.x, n.z - p.z); if (dd < bd) { bd = dd; bi = i; } });
    let msg = '';
    for (let i = bi; i < this.path.steps.length - 1; i++) {
      const a = this.path.steps[i], b = this.path.steps[i + 1];
      if (a.e.way.n === b.e.way.n && a.e.way.n) continue;
      const n = this.R.nodes[a.node]; const [ix, iz] = this.R.leaveDir(a.e, a.node), [ox, oz] = this.R.leaveDir(b.e, a.node);
      const turn = angDiff(Math.atan2(-ix, -iz), Math.atan2(ox, oz)); const k = this.R.turnKind(turn);
      if (k === 'S' && a.e.way.n === b.e.way.n) continue;
      const dist = Math.hypot(n.x - p.x, n.z - p.z) / 0.3048;
      const word = k === 'L' ? 'Turn left' : k === 'R' ? 'Turn right' : 'Continue';
      msg = `➤ In ${dist > 1000 ? (dist / 5280).toFixed(1) + ' mi' : Math.round(dist / 10) * 10 + ' ft'}: ${word} onto ${b.e.way.n || 'the road'}`;
      break;
    }
    this.el.wp.textContent = (msg || '➤ Continue') + ` · ${(d / 1609.34).toFixed(1)} mi to ${this.path.dest.name}`;
  }
  // ---------- full map ----------
  mapSetup() {
    const c = $('mapc'); this.mc = c;
    let drag = null;
    c.onmousedown = (e) => { drag = [e.clientX, e.clientY, this.mapView.x, this.mapView.z, false]; };
    addEventListener('mousemove', (e) => { if (!drag) return; const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; if (Math.abs(dx) + Math.abs(dy) > 4) drag[4] = true; this.mapView.x = drag[2] - dx / this.mapView.s; this.mapView.z = drag[3] - dy / this.mapView.s; });
    addEventListener('mouseup', (e) => { if (drag && !drag[4] && this.mapOpen) { const r = c.getBoundingClientRect(); const x = this.mapView.x + (e.clientX - r.left - r.width / 2) / this.mapView.s, z = this.mapView.z + (e.clientY - r.top - r.height / 2) / this.mapView.s; this.route({ x, z, name: 'the pin' }); } drag = null; });
    c.onwheel = (e) => { this.mapView.s = clamp(this.mapView.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), .05, 3); e.preventDefault(); };
    $('mapclose').onclick = () => this.toggleMap();
  }
  toggleMap() {
    this.mapOpen = !this.mapOpen; $('map').classList.toggle('hidden', !this.mapOpen);
    if (this.mapOpen) {
      document.exitPointerLock?.(); const p = this.g.player; this.mapView.x = p.x; this.mapView.z = p.z;
      const list = $('dests'); list.innerHTML = '';
      const sec = (t) => { const s = document.createElement('div'); s.className = 'map-sec'; s.textContent = t; s.style.background = 'none'; s.style.cursor = 'default'; list.appendChild(s); };
      sec('PLACES IN ' + this.g.region.name.toUpperCase());
      for (const d of this.g.dests()) { const el = document.createElement('div'); el.innerHTML = `<b>${d.name}</b><small>${d.sub}</small>`; el.onclick = () => { this.route(d); this.toggleMap(); }; list.appendChild(el); }
      sec('DRIVE SOMEWHERE ELSE IN NJ');
      for (const r of this.g.regions) { if (r.id === this.g.region.id) continue; const el = document.createElement('div'); el.innerHTML = `<b>🚗 ${r.name}</b><small>${r.sub || 'home'}</small>`; el.onclick = () => { this.toggleMap(); this.g.travel(r); }; list.appendChild(el); }
    }
  }
  drawMap() {
    const c = this.mc; const W = c.clientWidth, H = c.clientHeight; if (c.width !== W) { c.width = W; c.height = H; }
    const g = c.getContext('2d'), v = this.mapView;
    g.fillStyle = '#e9e2d4'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.scale(v.s * 2, v.s * 2); g.translate(-(v.x - this.bx0) / 2, -(v.z - this.bz0) / 2); g.drawImage(this.base, 0, 0);
    if (this.path) { g.strokeStyle = '#3b82f6'; g.lineWidth = 4 / v.s / 2; g.beginPath(); this.path.pts.forEach(([x, z], i) => { const X = (x - this.bx0) / 2, Z = (z - this.bz0) / 2; i ? g.lineTo(X, Z) : g.moveTo(X, Z); }); g.stroke(); }
    g.restore();
    const S = (x, z) => [W / 2 + (x - v.x) * v.s, H / 2 + (z - v.z) * v.s];
    // labels for named places and big roads at this zoom
    g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
    for (const d of this.g.dests()) { const [X, Y] = S(d.x, d.z); g.fillStyle = d.col || '#0b4fa8'; g.beginPath(); g.arc(X, Y, 6, 0, 7); g.fill(); g.fillStyle = '#2a2622'; g.fillText(d.name, X, Y - 10); }
    const p = this.g.player; const [px, py] = S(p.x, p.z); g.fillStyle = '#d97757'; g.beginPath(); g.arc(px, py, 7, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    if (v.s > .6) { g.font = '11px sans-serif'; g.fillStyle = '#5a5246'; const seen = new Set(); for (const e of this.R.edges) { if (!e.way.n || seen.has(e.way.n) || e.cls < 3) continue; const a = this.R.at(e, e.len / 2); const [X, Y] = S(a.x, a.z); if (X < 0 || Y < 0 || X > W || Y > H) continue; seen.add(e.way.n); g.fillText(e.way.n, X, Y); } }
  }
}
function $(id) { return document.getElementById(id); }
