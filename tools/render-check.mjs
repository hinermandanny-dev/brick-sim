// Headless render check (run by CI and before a push): boots the game in Chromium, loads fixed viewpoints and fails on
//  - flicker: two renders from cameras 2 mm apart must be (nearly) identical; z-fighting layers flip pixels between them
//  - holes: every tile that exists near the viewpoint must be loaded and textured
// Usage: node tools/render-check.mjs [site] [--shots dir] [--nolog]   (--nolog turns off the fix, to prove the check bites)
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright'); import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2); const site = args.find(a => !a.startsWith('--')) || 'site';
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null; const nolog = args.includes('--nolog');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.bin': 'application/octet-stream' };
const srv = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; fs.readFile(path.join(site, u), (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
const port = srv.address().port; let bad = 0; const fail = (m) => { console.log('FAIL ' + m); bad++; }, ok = (m) => console.log('ok   ' + m);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/?low${nolog ? '&nolog' : ''}`);
await page.waitForFunction(() => window.game && !document.getElementById('play').disabled, null, { timeout: 240000 });
const res = await page.evaluate(async () => {
  const G = window.game, T = window.THREE_ || null; G.running = false;
  const THREE = await import('./vendor/three.module.js');
  const R = G.renderer, S = G.scene, W = G.world, out = [];
  const rt = new THREE.WebGLRenderTarget(480, 270); rt.depthTexture = new THREE.DepthTexture(480, 270, THREE.UnsignedIntType); /* 24-bit fixed depth like most real GPUs: SwiftShader defaults to float, which hides z-fighting */ const buf = new Uint8Array(480 * 270 * 4), buf2 = new Uint8Array(480 * 270 * 4);
  const cam = new THREE.PerspectiveCamera(72, 480 / 270, .05, 3500);
  if (G.traffic?.group) G.traffic.group.visible = false;
  const views = [];
  const wm = G.meta.walmart; if (wm) { let cx = 0, cz = 0; const p = wm.poly; for (let i = 0; i < p.length; i += 2) { cx += p[i] / 10; cz += p[i + 1] / 10; } cx /= p.length / 2; cz /= p.length / 2; views.push({ name: 'walmart-lot', x: cx + 120, z: cz + 90, tx: cx, tz: cz, h: 1.7 }); }
  const n = G.roads.nearest(views[0]?.x ?? 0, views[0]?.z ?? 0, 600, e => e.cls >= 5);
  if (n) { const a = G.roads.at(n.e, Math.min(n.e.len, 5)); views.push({ name: 'arterial', x: a.x, z: a.z, tx: a.x + a.hx * 300, tz: a.z + a.hz * 300, h: 1.6 }); }
  const hn = G.roads.nearest(G.player?.pos?.x ?? 0, G.player?.pos?.z ?? 0, 800, e => e.way.t === 'residential');
  if (hn) { const a = G.roads.at(hn.e, hn.e.len / 2); views.push({ name: 'side-street', x: a.x, z: a.z, tx: a.x + a.hx * 200, tz: a.z + a.hz * 200, h: 1.65 }); }
  if (wm) views.push({ name: 'walmart-aerial', x: views[0].x - 120, z: views[0].z - 90 + 0.5, tx: views[0].x - 120, tz: views[0].z - 90, h: 260, aerial: true });
  for (const v of views) {
    await W.loadAround(v.x, v.z, 500);
    const y = W.height(v.x, v.z) + v.h; cam.near = v.aerial ? 1 : .05; cam.updateProjectionMatrix();
    const shoot = (dx, b) => { cam.position.set(v.x + dx, y, v.z); cam.lookAt(v.tx, W.height(v.tx, v.tz), v.tz); cam.updateMatrixWorld(); R.setRenderTarget(rt); R.render(S, cam); R.readRenderTargetPixels(rt, 0, 0, 480, 270, b); R.setRenderTarget(null); };
    shoot(0, buf); shoot(0.002, buf2);
    let diff = 0; for (let i = 0; i < buf.length; i += 4) if (Math.abs(buf[i] - buf2[i]) + Math.abs(buf[i + 1] - buf2[i + 1]) + Math.abs(buf[i + 2] - buf2[i + 2]) > 40) diff++;
    // holes: tiles that exist in the bake within 450 m but are not loaded, or loaded without a ground texture
    let holes = 0, untex = 0;
    for (const k of G.meta.tiles) { const [i, j] = k.split('_').map(Number); if (Math.hypot((i + .5) * 400 - v.x, (j + .5) * 400 - v.z) > 450) continue; const t = W.tiles.get(k); if (!t) holes++; else if (!t.ground?.material?.map?.image) untex++; }
    R.render(S, cam);
    out.push({ name: v.name, flicker: diff / (480 * 270), holes, untex, png: R.domElement.toDataURL('image/png') });
  }
  return out;
});
for (const v of res) {
  if (v.name.includes('aerial')) { ok(`${v.name}: screenshot only`); } else (v.flicker > 0.004 ? fail : ok)(`${v.name}: ${(v.flicker * 100).toFixed(2)}% of pixels flip between two renders 2 mm apart (limit 0.4%)`);
  (v.holes || v.untex ? fail : ok)(`${v.name}: ${v.holes} missing tiles, ${v.untex} untextured`);
  if (shots) { fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(path.join(shots, v.name + '.png'), Buffer.from(v.png.split(',')[1], 'base64')); }
}
if (!res.length) fail('no viewpoints');
for (const e of errs) fail('page error: ' + e.slice(0, 200));
await browser.close(); srv.close();
if (bad) { console.log(bad + ' render check(s) failed'); process.exit(1); } else console.log('render checks passed');
