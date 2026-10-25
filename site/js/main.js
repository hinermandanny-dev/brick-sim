import * as THREE from '../vendor/three.module.js';
import { Roads } from './roads.js';
import { World, MAT, LAMP } from './world.js';
import { Traffic } from './traffic.js';
import { Player } from './player.js';
import { Sky } from './sky.js';
import { HUD } from './hud.js';
import { Phone } from './phone.js';
import { Store } from './store.js';
import { Home } from './home.js';
import { Audio } from './audio.js';
import { Peds } from './peds.js';
import { SetPieces } from './setpieces.js';
import { travel } from './travel.js';
import { OUTFIT_DEFAULT } from './character.js';
import { toast, prompt, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const bar = (f, msg) => { $('bootbar').style.width = (f * 100).toFixed(0) + '%'; if (msg) $('bootmsg').textContent = msg; };
const store = { get(k, d) { try { const v = localStorage.getItem('bricksim.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('bricksim.' + k, JSON.stringify(v)); } catch (e) { } } };

async function j(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }

class Game {
  async boot() {
    const Q0 = new URLSearchParams(location.search);
    this.regions = await j('regions.json').catch(() => [{ id: 'brick', name: 'Brick', base: 'data/', home: true }]);
    this.region = this.regions.find(r => r.id === Q0.get('region')) || this.regions[0];
    const B = this.region.base;
    let arrive = null; try { arrive = JSON.parse(sessionStorage.getItem('bricksim.arrive') || 'null'); sessionStorage.removeItem('bricksim.arrive'); } catch (e) { }
    bar(.02, 'loading the map of ' + this.region.name + '…');
    this.meta = await j(B + 'meta.json'); bar(.1, 'loading every road in town…');
    this.roads = new Roads(await j(B + 'roads.json')); bar(.25, 'reading addresses…');
    this.addr = await j(B + 'addr.json').catch(() => []);
    const local = this.region.home ? await j('local/home.json').catch(() => null) : null;
    // renderer
    const canvas = $('c');
    const R = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const Q = new URLSearchParams(location.search); this.low = Q.has('low');
    R.setPixelRatio(this.low ? .5 : Math.min(devicePixelRatio, 1.5)); R.setSize(innerWidth, innerHeight); R.shadowMap.enabled = !this.low; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .05, 3500);
    addEventListener('resize', () => { R.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); });
    this.sky = new Sky(this.scene, R);
    this.world = new World(this.scene, this.meta, this.roads, B);
    this.world.dem = new Int16Array(await (await fetch(B + 'dem.bin')).arrayBuffer());
    this.traffic = new Traffic(this.scene, this.world, this.roads);
    this.player = new Player(this.scene, this.world, this.roads, this.traffic, this.camera, (arrive && arrive.outfit) || store.get('outfit', OUTFIT_DEFAULT));
    this.audio = new Audio();
    this.phone = new Phone(this);
    this.store = new Store(this.scene, this.world, this.roads, this.player, this.phone);
    this.home = new Home(this.scene, this.world, this.player, store);
    this.hud = new HUD(this);
    this.peds = new Peds(this.scene, this.world, this.roads); this.traffic.peds = this.peds.list;
    this.traffic.onHorn = (c) => { if (Math.hypot(c.x - this.player.x, c.z - this.player.z) < 40) this.audio.horn(); };
    this.store.onBeep = (ok) => this.audio.beep(ok);
    this.player.onKick = () => this.audio.kick(); this.player.onCrash = () => this.audio.thud(); this.player.onHorn = () => this.audio.horn();
    // time: today's date, 7:25 am (first shift starts at 8)
    const now = new Date(); this.day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()); this.t = arrive ? arrive.t : 7.42 * 3600; this.timeScale = 1;
    // where is home? (a local, git-ignored file, or one you set in game)
    let hp = this.region.home ? store.get('home', null) : null;
    if (!hp && local && local.addr) hp = this.findAddr(local.addr);
    if (hp) this.home.attach(hp.x, hp.z, hp.label);
    // spawn: in your driveway with the scooter, else by the Walmart, else the middle of town
    let sx, sz, syaw = 0;
    if (hp) { sx = hp.x; sz = hp.z; }
    else if (this.region.spawn) { const re = new RegExp(this.region.spawn, 'i'); const p = this.meta.pois.find(p => re.test(p[0])); if (p) { sx = p[1] / 10; sz = p[2] / 10; } else { sx = (this.meta.gx0 + this.meta.gx1) / 2; sz = (this.meta.gz0 + this.meta.gz1) / 2; } }
    else if (this.meta.walmart) { const p = this.meta.walmart.poly; sx = p[0] / 10; sz = p[1] / 10; }
    else { sx = (this.meta.gx0 + this.meta.gx1) / 2; sz = (this.meta.gz0 + this.meta.gz1) / 2; }
    const n = this.roads.nearest(sx, sz, 200, e => e.cls >= 2);
    if (hp) this.world.homeXZ = [hp.x, hp.z]; // your own driveway holds your car, not a random parked one
    bar(.3, 'building the neighbourhood…');
    await this.world.loadAround(sx, sz, 650, (f) => bar(.3 + f * .65, 'building the neighbourhood… ' + Math.round(f * 100) + '%'));
    if (hp) { this.home.tryBuild(); const h = this.home.house; if (h && h.drive) { const d = h.drive; sx = d.sx + (d.ex - d.sx) * .8; sz = d.sz + (d.ez - d.sz) * .8; syaw = Math.atan2(d.ex - d.sx, d.ez - d.sz); } }
    else if (n) { sx = n.qx; sz = n.qz; const a = this.roads.at(n.e, n.s); syaw = Math.atan2(a.hx, a.hz); }
    this.player.place(sx, sz, syaw);
    { const h = this.home.house; if (h && h.drive) { const d = h.drive, f = .42; this.player.placeCar(d.sx + (d.ex - d.sx) * f + Math.cos(d.yaw) * (d.width > 5 ? 1.3 : 0), d.sz + (d.ez - d.sz) * f - Math.sin(d.yaw) * (d.width > 5 ? 1.3 : 0), d.yaw + Math.PI); }
      else this.player.placeCar(sx - Math.sin(syaw) * 6, sz - Math.cos(syaw) * 6, syaw); }
    if (arrive && arrive.car || (!this.region.home)) { const n2 = this.roads.nearest(sx, sz, 400, e => e.cls >= 3); if (n2) { const a = this.roads.at(n2.e, n2.s); const off = n2.e.way.w / 2 - 1.8; this.player.placeCar(n2.qx - a.hz * off, n2.qz + a.hx * off, Math.atan2(a.hx, a.hz)); const C = this.player.car; this.player.x = C.x + Math.cos(C.yaw) * 1.5; this.player.z = C.z - Math.sin(C.yaw) * 1.5; this.player.enterCar(); } }
    this.setpieces = new SetPieces(this);
    bar(1, hp ? 'home: ' + (hp.label || '') : this.region.name);
    $('play').disabled = false;
    $('play').onclick = () => { $('boot').classList.add('hidden'); $('hud').classList.remove('hidden'); this.audio.start(); canvas.requestPointerLock?.(); this.running = true; toast('F: hop on the E2 Pro · Space: kick off · M: map · P: work phone'); };
    canvas.onclick = () => { if (!this.phone.open && !this.hud.mapOpen && !this.closet) canvas.requestPointerLock?.(); };
    this.player.onKey = (k, e) => this.key(k, e);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(.45, .62, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffc220', transparent: true, opacity: .9, depthTest: false })); this.marker.renderOrder = 5; this.scene.add(this.marker);
    this.last = performance.now(); this.loop();
    window.game = this; this.travel = (r) => travel(this, r);
  }
  findAddr(a) {
    const m = String(a).match(/^(\d+)\s+(.+)$/); if (!m) return null;
    const num = m[1], st = norm(m[2]);
    let best = null;
    for (const [n2, s2, x, z] of this.addr) if (n2 === num && norm(s2) === st) { best = { x: x / 10, z: z / 10, label: a }; break; }
    if (!best) { // interpolate along the street from its known numbers
      const list = this.addr.filter(r => norm(r[1]) === st).map(r => [parseInt(r[0]), r[2] / 10, r[3] / 10]).filter(r => r[0] % 2 === +num % 2).sort((p, q) => p[0] - q[0]);
      if (list.length) { let lo = list[0], hi = list[list.length - 1]; for (const r of list) { if (r[0] <= +num) lo = r; if (r[0] >= +num) { hi = r; break; } } const t = hi[0] === lo[0] ? 0 : (+num - lo[0]) / (hi[0] - lo[0]); best = { x: lo[1] + (hi[1] - lo[1]) * t, z: lo[2] + (hi[2] - lo[2]) * t, label: a + ' (approx.)' }; }
      else { // fall back to the middle of the named street
        const e = this.roads.edges.find(e => norm(e.way.n) === st); if (e) { const p = this.roads.at(e, e.len / 2); best = { x: p.x, z: p.z, label: a + ' (street)' }; }
      }
    }
    return best;
  }
  dests() {
    const out = [];
    if (this.home.hx !== undefined) out.push({ name: 'Home', sub: this.home.label || '', x: this.home.hx, z: this.home.hz, col: '#d97757' });
    if (this.store.cx) out.push({ name: 'Walmart #1977', sub: '1872 Route 88 · work', x: this.store.cx, z: this.store.cz, col: '#0b4fa8' });
    const want = [[/township memorial high|brick memorial high/i, 'BMHS'], [/brick township high/i, 'BTHS'], [/veterans memorial middle/i, 'VMMS'], [/lake riviera middle/i, 'Lake Riviera MS'], [/midstreams elementary/i, 'Midstreams Elementary'],
      [/lake rivi?era park/i, 'Lake Riviera park'], [/^lake riviera$/i, 'the lake'], [/midstreams park/i, 'park'], [/frede|windward beach/i, 'park'], [/herbertsville park/i, 'park'], [/brick plaza/i, 'shopping'], [/library/i, 'library'], [/^sedge islands$/i, 'Sedge Island'], [/island beach state park/i, 'state park'],
      [/^caesars atlantic city$/i, 'casino'], [/^resorts/i, 'casino'], [/hard rock hotel/i, 'casino'], [/steel pier/i, 'pier'], [/marine academy of technology/i, 'MATES'], [/boardwalk hall/i, 'arena']];
    const seen = new Set();
    for (const [re, label] of want) {
      const p = this.meta.pois.find(p => re.test(p[0]) && !seen.has(p[0])); if (!p) continue; seen.add(p[0]);
      out.push({ name: p[0], sub: label, x: p[1] / 10, z: p[2] / 10, col: '#5b8c5a' });
    }
    for (const p of this.meta.pois) { if (out.length > 26) break; if (seen.has(p[0]) || !/park|school|beach|library|plaza|mall|marina/i.test(p[0])) continue; seen.add(p[0]); out.push({ name: p[0], sub: p[3], x: p[1] / 10, z: p[2] / 10, col: '#8a8f94' }); }
    return out;
  }
  dateObj() { return new Date(this.day0.getTime() + this.t * 1000); }
  clockStr() { const d = this.dateObj(); let h = d.getHours(), m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; }
  weekday() { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][this.dateObj().getDay()]; }
  dateStr() { return this.dateObj().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  key(k, e) {
    const P = this.player;
    if (this.closet && k !== 'KeyE' && k !== 'Escape') return;
    if (k === 'KeyF') { if (P.driving || (!P.riding && P.nearCar())) P.enterCar(); else P.mount(); }
    else if (k === 'Space' && P.riding && !P.driving) P.kick();
    else if (k === 'Digit1' || k === 'Digit2' || k === 'Digit3') { P.mode = +k.slice(5); toast('Ride mode: ' + ({ 1: 'Eco (9 mph)', 2: 'Drive (12 mph)', 3: 'Sport (18.6 mph)' })[P.mode]); }
    else if (k === 'KeyZ') P.blink = P.blink < 0 ? 0 : -1; else if (k === 'KeyC') P.blink = P.blink > 0 ? 0 : 1;
    else if (k === 'KeyL') { P.light = !P.light; }
    else if (k === 'KeyV') { P.fp = !P.fp; }
    else if (k === 'KeyM') this.hud.toggleMap();
    else if (k === 'KeyP') this.phone.toggle();
    else if (k === 'KeyG') P.fold();
    else if (k === 'KeyH') { const d = this.dests()[0]; if (d) this.hud.route(d); }
    else if (k === 'KeyT') { if (e.shiftKey) { this.t += 3600; toast('+1 hour: ' + this.clockStr()); } else { this.timeScale = this.timeScale === 1 ? 30 : this.timeScale === 30 ? 120 : 1; toast('Time ×' + this.timeScale); } }
    else if (k === 'KeyE') this.use(true);
    else if (k === 'KeyB' && !this.home.built) { store.set('home', { x: P.x, z: P.z, label: 'Home (set here)' }); this.home.attach(P.x, P.z, 'Home (set here)'); toast('Home set here.'); }
  }
  use(press) {
    const P = this.player;
    if (this.closet) { if (press) this.closeCloset(); return 'E: done'; }
    if (this.home.nearMirror() && !P.riding) { if (press) this.openCloset(); return 'E: look in the mirror (change clothes)'; }
    if (this.home.nearCharger() && !P.riding && P.batt < .999) { if (press) { this.charging = !this.charging; toast(this.charging ? 'Charger plugged in (≈4.5 h for a full charge).' : 'Unplugged.'); } return this.charging ? 'E: unplug the charger' : 'E: plug in the charger'; }
    const s = this.store.interact(press); if (s) return s;
    if (!P.riding) { // chain to any pole / sign / rack
      const t = this.world.tiles.get(this.world.key(P.x, P.z));
      const pole = t && t.props && t.props.find(o => ['pole', 'lamp', 'stop', 'bikerack', 'busstop', 'yield'].includes(o.k) && Math.hypot(o.x - P.x, o.z - P.z) < 2);
      if (pole && Math.hypot(P.sc.x - P.x, P.sc.z - P.z) < 2.5) { if (press) { P.sc.locked = !P.sc.locked; toast(P.sc.locked ? 'Locked to the ' + (pole.k === 'pole' ? 'pole' : pole.k) + '.' : 'Unlocked.'); } return P.sc.locked ? 'E: unlock' : 'E: chain the scooter here'; }
    }
    if (!P.riding && Math.hypot(P.sc.x - P.x, P.sc.z - P.z) < 1.8 && !P.sc.locked && !P.sc.carried) return 'F: ride · G: fold & carry';
    return '';
  }
  openCloset() {
    const P = this.player; this.closet = true; P.frozen = true; document.exitPointerLock?.();
    const m = this.home.mirror; const cam = this.camera; const fx = Math.sin(m.rotation.y), fz = Math.cos(m.rotation.y);
    P.yaw = Math.atan2(-fx, -fz) + Math.PI; P.lookYaw = P.yaw;
    P.camOverride = (c) => { c.position.set(P.x + Math.sin(P.yaw) * 1.9 + Math.cos(P.yaw) * .3, P.y + 1.45, P.z + Math.cos(P.yaw) * 1.9 - Math.sin(P.yaw) * .3); c.lookAt(P.x, P.y + 1.0, P.z); P.body.setFirstPerson(false); };
    this.home.openCloset((o) => { P.body.setOutfit(o); store.set('outfit', P.body.o); this.audio.tone(660, .06, 'sine', .05); }, () => this.closeCloset());
  }
  closeCloset() { $('closet').classList.add('hidden'); this.closet = false; this.player.frozen = false; this.player.camOverride = null; }
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now(); let dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    if (!this.running) { this.renderer.render(this.scene, this.camera); return; }
    const P = this.player;
    this.t += dt * this.timeScale;
    const hour = (this.t / 3600) % 24; const doy = Math.floor((this.dateObj() - new Date(this.dateObj().getFullYear(), 0, 0)) / 864e5);
    const sun = this.sky.update(hour, doy, this.camera);
    MAT.uNight.value = sun.night > .45 ? 1 : 0; LAMP.set(sun.night); this.traffic.night = sun.night; this.traffic.time = hour;
    if (!this.hud.mapOpen) P.update(dt);
    this.world.update(P.x, P.z);
    const cd = new THREE.Vector3(); this.camera.getWorldDirection(cd);
    this.traffic.update(dt, { x: P.x, z: P.z, vx: P.vx, vz: P.vz, inside: !!P.inside }, cd);
    this.store.update(dt, hour); this.home.update(dt, sun.night); this.phone.tick(dt);
    this.peds.update(dt, P.x, P.z, hour, this.traffic);
    this.setpieces && this.setpieces.update(dt, sun.night);
    if (this.charging) { P.batt = Math.min(1, P.batt + dt * this.timeScale / (4.5 * 3600)); if (P.riding || !this.home.nearCharger()) this.charging = false; }
    prompt(this.use(false));
    this.hud.update(dt);
    // pick-location marker
    const b = this.store.job.batch, it = b && b.items[b.i];
    if (it && this.store.built) { const [x, z] = this.store.G(it.loc.u, it.loc.v); this.marker.visible = true; this.marker.position.set(x, this.store.floorY + .03, z); this.marker.material.opacity = .6 + Math.sin(now / 200) * .3; } else this.marker.visible = false;
    // sound
    let carNear = 0; for (const c of this.traffic.cars) if (c.x !== undefined) { const d = Math.hypot(c.x - P.x, c.z - P.z); if (d < 60) carNear += c.v / 15 * (1 - d / 60); }
    this.audio.update(dt, { v: P.speed, riding: P.riding, throttle: P.keys.KeyW, grass: P.surf && P.surf.kind === 'grass', carNear, night: sun.night, inside: !!P.inside });
    this.renderer.render(this.scene, this.camera);
  }
}
function norm(s) { return String(s || '').toLowerCase().replace(/\bavenue\b/g, 'ave').replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd').replace(/\bdrive\b/g, 'dr').replace(/\blane\b/g, 'ln').replace(/\bcourt\b/g, 'ct').replace(/\bboulevard\b/g, 'blvd').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); }

new Game().boot().catch(e => { console.error(e); bar(1, 'Could not start: ' + e.message + ' @ ' + (e.stack||'').split('\n').slice(0,3).join(' | ')); });
