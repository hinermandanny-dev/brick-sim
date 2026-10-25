// Headless vehicle check: drives Dan's Pathfinder and rides the E2 Pro in the real game code and fails when the
// numbers leave the real-world envelope (2005 Pathfinder 4.0: 0-60 mph ≈ 7.5-8.5 s, 60-0 ≈ 40-45 m; E2 Pro: modes
// top out at 9.3 / 12.4 / 18.6 mph). Also saves screenshots of the cabin, the car and the scooter dashboard.
// Usage: node tools/vehicle-check.mjs [site] [--shots dir]
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2); const site = args.find(a => !a.startsWith('--')) || 'site'; const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; fs.readFile(path.join(site, u), (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
let bad = 0; const fail = (m) => { console.log('FAIL ' + m); bad++; }, ok = (m) => console.log('ok   ' + m);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(`http://127.0.0.1:${srv.address().port}/?low`);
await page.waitForFunction(() => window.game && !document.getElementById('play').disabled, null, { timeout: 240000 });
const R = await page.evaluate(async () => {
  const G = window.game, P = G.player, out = {}; G.running = false; const K = P.keys; const dt = 1 / 60;
  const shot = () => { G.renderer.render(G.scene, G.camera); P.pose(0); G.renderer.render(G.scene, G.camera); return G.renderer.domElement.toDataURL('image/jpeg', .85); };
  // put the car on a long straight arterial
  const n = G.roads.nearest(P.x, P.z, 3000, e => e.cls >= 5 && e.len > 400); const a = G.roads.at(n.e, 30);
  const yaw = Math.atan2(a.hx, a.hz); P.placeCar(a.x, a.z, yaw); P.x = a.x + Math.cos(yaw) * 1.4; P.z = a.z - Math.sin(yaw) * 1.4;
  await G.world.loadAround(a.x, a.z, 450); P.enterCar(); P.fp = true;
  const run = (sec, keys, f) => { for (const k in K) K[k] = false; Object.assign(K, keys); for (let t = 0; t < sec; t += dt) { P.update(dt); if (f && f(t)) return t; } return sec; };
  run(.5, {}); out.shotCabinIdle = shot();
  let t60 = run(20, { KeyW: true }, () => Math.abs(P.car.v) >= 26.82); out.t60 = t60; out.gearAt60 = P.car.dyn.gear; out.rpmAt60 = P.car.dyn.rpm;
  out.shotCabin60 = (P.update(dt), shot());
  const x0 = P.car.x, z0 = P.car.z; run(10, { KeyS: true }, () => Math.abs(P.car.v) < .1); out.stop60 = Math.hypot(P.car.x - x0, P.car.z - z0); out.stillFwd = !P.car.dyn.rev;
  // steering: turn at 30 mph, let go -> wheel returns to centre within 2 s
  P.car.dyn.v = 13.4; run(1.5, { KeyW: true, KeyA: true }); out.handTurn = P.car.dyn.hand; out.roll = P.car.dyn.roll; out.lat = P.car.dyn.latA;
  run(2, { KeyW: true }); out.handBack = P.car.dyn.hand;
  P.fp = false; P.lookYaw = P.car.yaw + 2.4; P.update(dt); out.shotOutside = shot(); P.fp = true;
  P.car.dyn.v = 0; P.update(dt); P.enterCar();
  // E2 Pro: top speed in each mode
  P.placeCar(a.x + 400, a.z + 400, 0); out.top = {};
  for (const m of [1, 2, 3]) { // each mode from the same spot in the travel lane, down the straight
    const b = G.roads.at(n.e, 40, 0), y2 = Math.atan2(b.hx, b.hz); const ox = -b.hz * 1.8, oz = b.hx * 1.8;
    P.place(b.x + ox, b.z + oz, y2); P.sc.x = P.x; P.sc.z = P.z; P.sc.yaw = y2; if (!P.riding) P.mount(); P.yaw = y2; P.mode = m; P.v = 2; P.state = 'ride';
    let top = 0; run(9, { KeyW: true }, () => { top = Math.max(top, P.v); return !P.riding; }); out.top[m] = top / 0.44704; }
  P.v = 6; P.mode = 2; run(.3, { KeyW: true }); P.pitch = -1.1; P.update(dt); out.shotScooter = shot();
  out.nan = [P.x, P.z, P.car.x, P.car.z, P.car.dyn.rpm].some(v => !isFinite(v));
  return out;
});
const fmt = (x) => Math.round(x * 10) / 10;
(R.t60 >= 7 && R.t60 <= 8.8 ? ok : fail)(`Pathfinder 0-60 mph in ${fmt(R.t60)} s (real ≈ 7.5-8.5), in gear ${R.gearAt60} at ${Math.round(R.rpmAt60)} rpm`);
(R.stop60 >= 38 && R.stop60 <= 47 ? ok : fail)(`60-0 mph in ${fmt(R.stop60)} m (real ≈ 40-45)`);
(R.stillFwd ? ok : fail)('holding the brake to a stop does not drop it into reverse while still moving');
(Math.abs(R.handTurn) > 1 && Math.abs(R.handBack) < .3 ? ok : fail)(`steering wheel turned ${fmt(R.handTurn)} rad and returned to ${fmt(R.handBack)} rad on release`);
(Math.abs(R.roll) > .005 && Math.abs(R.roll) < .12 ? ok : fail)(`body roll ${fmt(R.roll * 57.3)}° at ${fmt(R.lat / 9.81)} g`);
for (const [m, want] of [[1, 9.3], [2, 12.4], [3, 18.6]]) (Math.abs(R.top[m] - want) < .9 ? ok : fail)(`E2 Pro mode ${m}: top ${fmt(R.top[m])} mph (spec ${want})`);
(R.nan ? fail : ok)('no NaN in vehicle state');
for (const e of errs) fail('page error: ' + e.slice(0, 200));
if (shots) { fs.mkdirSync(shots, { recursive: true }); for (const k of Object.keys(R).filter(k => k.startsWith('shot'))) fs.writeFileSync(path.join(shots, k.slice(4) + '.jpg'), Buffer.from(R[k].split(',')[1], 'base64')); }
await browser.close(); srv.close();
if (bad) { console.log(bad + ' vehicle check(s) failed'); process.exit(1); } else console.log('vehicle checks passed');
