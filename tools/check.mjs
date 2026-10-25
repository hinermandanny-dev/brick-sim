// Automatic checks: run by the site workflow before every publish and by PLAY-CHECK locally.
// Fails (exit 1) on: a JS syntax error, a broken data bake, a private file inside site/, or missing key places.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const site = process.argv[2] || 'site'; let bad = 0; const fail = (m) => { console.log('FAIL ' + m); bad++; }; const ok = (m) => console.log('ok   ' + m);
// 1. every module parses
import os from 'node:os';
// (checked as ES modules: a plain .js is parsed as CommonJS by --check and misses module-only errors such as a
//  redeclared const, which is exactly what broke boot on 25 Oct)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bschk-'));
for (const f of fs.readdirSync(path.join(site, 'js'))) { const m = path.join(tmp, f.replace(/\.js$/, '.mjs')); fs.copyFileSync(path.join(site, 'js', f), m); try { execFileSync(process.execPath, ['--check', m], { stdio: 'pipe' }); } catch (e) { fail('syntax ' + f + ': ' + String(e.stderr).split('\n').slice(0, 4).join(' ')); } }
ok('js syntax');
// 2. imports resolve to files that exist
for (const f of fs.readdirSync(path.join(site, 'js'))) { const s = fs.readFileSync(path.join(site, 'js', f), 'utf8'); for (const m of s.matchAll(/from '(\.[^']+)'/g)) { const p = path.join(site, 'js', m[1]); if (!fs.existsSync(p)) fail(`${f} imports missing ${m[1]}`); } }
ok('imports');
// 3. nothing private is published
for (const p of ['local', 'data/home.json']) if (fs.existsSync(path.join(site, p))) fail('private file inside site/: ' + p);
// 4. data bake sanity (only when data exists)
const D = path.join(site, 'data');
if (fs.existsSync(path.join(D, 'meta.json'))) {
  const meta = JSON.parse(fs.readFileSync(path.join(D, 'meta.json')));
  const roads = JSON.parse(fs.readFileSync(path.join(D, 'roads.json')));
  if (meta.tiles.length < 4) fail('too few tiles: ' + meta.tiles.length); else ok(meta.tiles.length + ' tiles');
  const dem = fs.statSync(path.join(D, 'dem.bin')).size; if (dem !== meta.demNX * meta.demNZ * 2) fail('dem.bin size ' + dem + ' != ' + meta.demNX * meta.demNZ * 2); else ok('dem ' + meta.demNX + 'x' + meta.demNZ);
  if (roads.edges.length < 100) fail('too few road edges: ' + roads.edges.length); else ok(roads.edges.length + ' road edges');
  if (!meta.walmart) fail('no Walmart footprint found in the buildings'); else ok('Walmart footprint ' + Math.round(meta.walmart.a) + ' m²');
  let nb = 0, nt = 0, bad1 = 0;
  for (const k of meta.tiles) { const t = JSON.parse(fs.readFileSync(path.join(D, 'tiles', k + '.json'))); nb += t.bld.length; nt += t.trees.length; if (Buffer.from(t.dem, 'base64').length !== 51 * 51 * 2) bad1++; for (const ei of t.roads) if (!roads.edges[ei]) bad1++; }
  if (bad1) fail(bad1 + ' broken tile records'); else ok(nb + ' buildings, ' + nt + ' trees');
  const names = meta.pois.map(p => p[0]).join('\n');
  for (const re of [/Memorial High/i, /Brick Township High/i, /Veterans Memorial Middle/i, /Lake Riviera Middle/i, /Midstreams Elementary/i, /Walmart/i]) if (!re.test(names)) fail('missing place ' + re); // Dan named these: they must resolve
}
if (bad) { console.log(bad + ' check(s) failed'); process.exit(1); } else console.log('all checks passed');
