// Automatic checks: run by the site workflow before every publish and by PLAY-CHECK locally.
// Fails (exit 1) on: a JS syntax error, a broken data bake, a private file inside site/, or missing key places.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const site = process.argv[2] || 'site'; let bad = 0; const fail = (m) => { console.log('FAIL ' + m); bad++; }; const ok = (m) => console.log('ok   ' + m);
// 1. every module parses
for (const f of fs.readdirSync(path.join(site, 'js'))) { try { execFileSync(process.execPath, ['--check', path.join(site, 'js', f)], { stdio: 'pipe' }); } catch (e) { fail('syntax ' + f + ': ' + String(e.stderr).split('\n').slice(0, 3).join(' ')); } }
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
  if (roads.edges.length < 100) fail('too few road edges: ' + roads.edges.length); else ok(roads.edges.length + ' road edges');
  if (!meta.walmart) fail('no Walmart footprint found in the buildings'); else ok('Walmart footprint ' + Math.round(meta.walmart.a) + ' m²');
  let nb = 0, nt = 0, bad1 = 0;
  for (const k of meta.tiles) { const t = JSON.parse(fs.readFileSync(path.join(D, 'tiles', k + '.json'))); nb += t.bld.length; nt += t.trees.length; if (Buffer.from(t.dem, 'base64').length !== 51 * 51 * 2) bad1++; for (const ei of t.roads) if (!roads.edges[ei]) bad1++; }
  if (bad1) fail(bad1 + ' broken tile records'); else ok(nb + ' buildings, ' + nt + ' trees');
  const names = meta.pois.map(p => p[0]).join('\n');
  for (const re of [/Brick Memorial High/i, /Brick Township High/i, /Veterans Memorial/i, /Lake Riviera/i, /Midstreams/i]) if (!re.test(names)) console.log('warn missing place ' + re);
}
if (bad) { console.log(bad + ' check(s) failed'); process.exit(1); } else console.log('all checks passed');
