// Placement audit: builds real tiles at sampled sites in a region and MEASURES each class of misplaced thing, as the
// player sees it (after every client-side rule ran): driveways through other houses, mailboxes in drives/roads/houses,
// trees in roads/drives/houses, parked cars overlapping houses/each other/the road, posts in the road or in houses.
// Usage: node tools/audit.mjs [site] [--sites N] [--json out.json] [--check]    (--check compares with tools/audit-limits.json)
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright'); import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2); const site = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a) && !a.endsWith('.json')) || 'site';
const opt = (n, d) => args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d; const NS = +opt('sites', 10), outJson = opt('json', null), check = args.includes('--check');
const local = process.env.BS_LOCAL || null; // optional private folder (home.json / house.json) so the audit sees the hand-built house
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.bin': 'application/octet-stream', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = local && u.startsWith('/local/') ? path.join(local, u.slice(7)) : path.join(site, u); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
await new Promise(r => srv.on('listening', r)); const port = srv.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/?low`);
await page.waitForFunction(() => window.game && !document.getElementById('play').disabled, null, { timeout: 300000 });
const res = await page.evaluate(async (NS) => {
  const G = window.game, W = G.world, R = G.roads; G.running = false;
  const { distSeg, pointInPoly } = await import('./js/util.js');
  const cls = {}; const ex = {}; let houses = 0, trees = 0, parked = 0, props = 0, mail = 0, drives = 0;
  const bump = (k, x, z, note) => { cls[k] = (cls[k] || 0) + 1; (ex[k] = ex[k] || []).length < 6 && ex[k].push([Math.round(x), Math.round(z), note || '']); };
  const dPoly = (P, x, z) => { let d = 1e9; for (let q = 0; q < P.length; q += 2) { const r = distSeg(x, z, P[q], P[q + 1], P[(q + 2) % P.length], P[(q + 3) % P.length]); if (r[0] < d) d = r[0]; } return pointInPoly(x, z, P) ? -d : d; };
  const nearBuilding = (x, z, within, skipP) => { for (const [dx, dz] of [[0, 0], [within, 0], [-within, 0], [0, within], [0, -within]]) { const c = W.buildingAt(x + dx, z + dz, within + 1); if (c && c.P !== skipP && !c.store && dPoly(c.P, x, z) < within) return c; } return null; };
  const roadD = (x, z) => { const n = R.nearest(x, z, 25, e => !e.way.sv); return n ? n.d - n.e.way.w / 2 : 99; };
  // sample sites: residential road midpoints spread over the region (seeded, so runs compare)
  const resi = R.edges.filter(e => e.way.t === 'residential' && e.len > 40 && Math.abs(e.pts[0]) < 9000); const sites = [];
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  if (G.world.homeXZ) sites.push(G.world.homeXZ);
  while (sites.length < NS && resi.length) { const e = resi[(rnd() * resi.length) | 0]; const a = R.at(e, e.len / 2); sites.push([a.x, a.z]); }
  const seen = new Set();
  for (const [sx, sz] of sites) {
    await W.loadAround(sx, sz, 380);
    for (const [k, t] of W.tiles) {
      if (seen.has(k)) continue; const cx = (t.i + .5) * 400, cz = (t.j + .5) * 400; if (Math.hypot(cx - sx, cz - sz) > 380) continue; seen.add(k);
      const recs = W.drives.get(k) || [];
      for (const d of recs) {
        houses++; drives++; const own = d.house.P;
        let hit = false; for (let s = 1.8; s < d.len - .3 && !hit; s += 1) { const f = s / d.len, x = d.sx + (d.ex - d.sx) * f, z = d.sz + (d.ez - d.sz) * f; for (const o of [-1, 0, 1]) { const px = x + Math.cos(d.yaw) * o * d.width * .4, pz = z - Math.sin(d.yaw) * o * d.width * .4; const c = W.buildingAt(px, pz); if (c && c.P !== own && !c.store) { hit = true; bump('drive_through_other_house', px, pz); break; } if (c && c.P === own && s > 3.5) { hit = true; bump('drive_through_own_house', px, pz); break; } } }
        if (!d.mail) continue; mail++; const [mx, mz] = d.mail; const mc = W.buildingAt(mx, mz); if (mc) bump('mailbox_in_house', mx, mz); else if (roadD(mx, mz) < .1) bump('mailbox_in_road', mx, mz);
        for (const o of recs) { if (o === d) continue; const [dd] = distSeg(mx, mz, o.sx, o.sz, o.ex, o.ez); if (dd < o.width / 2) { bump('mailbox_in_driveway', mx, mz); break; } }
        const [dd0] = distSeg(mx, mz, d.sx, d.sz, d.ex, d.ez); if (dd0 < d.width / 2 - .05) bump('mailbox_in_driveway', mx, mz);
      }
      const tl = t.treeList || (t.d.trees || []).map(a => [a[0] / 10, a[1] / 10]);
      for (const a of tl) {
        const x = a[0], z = a[1]; trees++;
        if (roadD(x, z) < .4) bump('tree_in_road', x, z);
        if (nearBuilding(x, z, 1.2)) bump('tree_in_house', x, z);
        for (const d of recs) { const [dd] = distSeg(x, z, d.sx, d.sz, d.ex, d.ez); if (dd < d.width / 2 + .6) { bump('tree_in_driveway', x, z); break; } }
      }
      const sp = G.traffic.parked.get(k) || [];
      sp.forEach((s, i) => {
        parked++; const [x, z, yaw] = s; const c = Math.cos(yaw), si = Math.sin(yaw); let inH = false, inR = false;
        for (const [a, b] of [[0, 0], [1, 2.3], [-1, 2.3], [1, -2.3], [-1, -2.3]]) { const px = x + c * a + si * b, pz = z - si * a + c * b; if (!inH && nearBuilding(px, pz, .25)) inH = true; if (!inR && roadD(px, pz) < -.2) inR = true; }
        if (inH) bump('parked_in_house', x, z); if (inR) bump('parked_on_carriageway', x, z);
        for (let j = 0; j < i; j++) if (Math.hypot(sp[j][0] - x, sp[j][1] - z) < 2.0) { bump('parked_overlap_car', x, z); break; }
      });
      for (const p of t.props || []) { props++; if (!['pole', 'lamp', 'stop', 'yield', 'sign', 'speed'].includes(p.k)) continue; if (roadD(p.x, p.z) < -.1) bump('post_in_road', p.x, p.z, p.k); if (W.buildingAt(p.x, p.z)) bump('post_in_house', p.x, p.z, p.k); }
    }
  }
  return { sites: sites.length, tiles: seen.size, houses, drives, trees, parked, props, mail, cls, ex };
}, NS);
await browser.close(); srv.close();
const per = (k) => (res.cls[k] || 0);
const base = { drive_through_other_house: res.drives, drive_through_own_house: res.drives, mailbox_in_house: res.mail, mailbox_in_road: res.mail, mailbox_in_driveway: res.mail, tree_in_road: res.trees, tree_in_house: res.trees, tree_in_driveway: res.trees, parked_in_house: res.parked, parked_on_carriageway: res.parked, parked_overlap_car: res.parked, post_in_road: res.props, post_in_house: res.props };
console.log(`audit: ${res.sites} sites, ${res.tiles} tiles, ${res.drives} driveways, ${res.trees} trees, ${res.parked} parked cars, ${res.props} props`);
const rates = {}; for (const k of Object.keys(base)) { const n = per(k), tot = base[k] || 1; rates[k] = +(n / tot * 100).toFixed(2); console.log(`${(n ? 'MISS ' : 'ok   ')}${k.padEnd(30)} ${String(n).padStart(5)} / ${String(tot).padEnd(6)} = ${rates[k]} %` + (n && res.ex[k] ? '   e.g. ' + JSON.stringify(res.ex[k].slice(0, 3)) : '')); }
if (errs.length) console.log('page errors:', errs.slice(0, 3));
if (outJson) fs.writeFileSync(outJson, JSON.stringify({ counts: res.cls, totals: { drives: res.drives, trees: res.trees, parked: res.parked, props: res.props, mail: res.mail }, rates, examples: res.ex }, null, 1));
if (check) { const lim = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'audit-limits.json'))); let bad = 0; for (const [k, mx] of Object.entries(lim)) if ((rates[k] || 0) > mx) { console.log(`FAIL ${k} ${rates[k]} % > limit ${mx} %`); bad++; } if (bad || errs.length) process.exit(1); console.log('placement audit within limits'); }
