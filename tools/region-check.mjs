// Headless check for every NON-home region (Atlantic City, MATES, Island Beach ...): boots ?region=<id>, loads the tiles
// around its start place and fails on page errors, missing/untextured tiles and flicker (two renders 2 mm apart).
// Usage: node tools/region-check.mjs [site] [--shots dir]
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright'); import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2); const site = args.find(a => !a.startsWith('--')) || 'site'; const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.bin': 'application/octet-stream', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; fs.readFile(path.join(site, u), (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
await new Promise(r => srv.on('listening', r)); const port = srv.address().port; let bad = 0; const fail = (m) => { console.log('FAIL ' + m); bad++; }, ok = (m) => console.log('ok   ' + m);
const regs = JSON.parse(fs.readFileSync(path.join(site, 'regions.json'))).filter(r => !r.home && fs.existsSync(path.join(site, r.base, 'meta.json')));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const rg of regs) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/?low&region=${rg.id}`);
  try { await page.waitForFunction(() => window.game && !document.getElementById('play').disabled, null, { timeout: 240000 }); } catch (e) { fail(`${rg.id}: did not boot (${errs.slice(0, 2).join(' | ')})`); await page.close(); continue; }
  const r = await page.evaluate(async () => {
    const G = window.game, W = G.world, R = G.renderer, S = G.scene; G.running = false; const THREE = await import('./vendor/three.module.js');
    const x = G.player.x, z = G.player.z; await W.loadAround(x, z, 450);
    const rt = new THREE.WebGLRenderTarget(320, 180); rt.depthTexture = new THREE.DepthTexture(320, 180, THREE.UnsignedIntType); const a = new Uint8Array(320 * 180 * 4), b = new Uint8Array(320 * 180 * 4);
    const cam = new THREE.PerspectiveCamera(72, 320 / 180, .05, 3500); const y = W.height(x, z) + 8; const shoot = (dx, buf) => { cam.position.set(x + dx, y, z); cam.lookAt(x + 60, W.height(x + 60, z + 60), z + 60); cam.updateMatrixWorld(); R.setRenderTarget(rt); R.render(S, cam); R.readRenderTargetPixels(rt, 0, 0, 320, 180, buf); R.setRenderTarget(null); };
    shoot(0, a); shoot(.002, b); let d = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) d++;
    let holes = 0, untex = 0, n = 0; for (const k of G.meta.tiles) { const [i, j] = k.split('_').map(Number); if (Math.hypot((i + .5) * 400 - x, (j + .5) * 400 - z) > 400) continue; n++; const t = W.tiles.get(k); if (!t) holes++; else if (t.d.g && !t.ground?.material?.map?.image) untex++; }
    R.render(S, G.camera); return { flicker: d / (320 * 180), holes, untex, n, png: R.domElement.toDataURL('image/png') };
  });
  (r.flicker > .004 ? fail : ok)(`${rg.id}: ${(r.flicker * 100).toFixed(2)}% flicker`); (r.holes || r.untex ? fail : ok)(`${rg.id}: ${r.n} tiles near the start, ${r.holes} missing, ${r.untex} untextured`);
  for (const e of errs) fail(`${rg.id}: page error ${e.slice(0, 160)}`);
  if (shots) { fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(path.join(shots, rg.id + '.png'), Buffer.from(r.png.split(',')[1], 'base64')); }
  await page.close();
}
await browser.close(); srv.close(); if (bad) { console.log(bad + ' region check(s) failed'); process.exit(1); } else console.log('region checks passed (' + regs.length + ' regions)');
