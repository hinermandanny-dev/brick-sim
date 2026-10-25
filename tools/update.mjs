// Brick Sim updater (PLAY-UPDATE.cmd runs this): downloads the latest game code and baked map from the published site
// into ./site, only the files that changed (size + sha1 from manifest.json). Never touches ./local (your home address
// and house spec). Needs Node 18+. Usage: node tools/update.mjs [baseUrl] [siteDir]
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || process.env.BRICKSIM_URL || 'https://hinermandanny-dev.github.io/brick-sim/').replace(/\/?$/, '/');
const site = path.resolve(process.argv[3] || path.join(here, '..', 'site'));
const get = async (u, tries = 4) => { for (let i = 0; i < tries; i++) { try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) return Buffer.from(await r.arrayBuffer()); if (r.status === 404) throw new Error('404 ' + u); } catch (e) { if (i === tries - 1 || /404/.test(String(e))) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); } } };
const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');
console.log('Updating from ' + base);
const man = JSON.parse((await get(base + 'manifest.json')).toString());
const todo = []; let same = 0;
for (const [rel, size, h] of man.files) { const p = path.join(site, rel); let ok = false; try { const st = fs.statSync(p); if (st.size === size) ok = sha(fs.readFileSync(p)) === h; } catch (e) { } if (ok) same++; else todo.push([rel, size, h]); }
console.log(`${man.files.length} files published (${man.built}); ${same} already current, ${todo.length} to download (${(todo.reduce((s, f) => s + f[1], 0) / 1e6).toFixed(1)} MB)`);
let done = 0, bad = 0; const q = todo.slice();
await Promise.all(Array.from({ length: 8 }, async () => { while (q.length) { const [rel, size, h] = q.shift(); try { const b = await get(base + rel.split('/').map(encodeURIComponent).join('/')); if (b.length !== size || sha(b) !== h) throw new Error('checksum mismatch'); const p = path.join(site, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p + '.part', b); fs.renameSync(p + '.part', p); done++; if (done % 100 === 0) console.log('  ' + done + ' / ' + todo.length); } catch (e) { bad++; console.log('FAILED ' + rel + ': ' + e.message); } } }));
console.log(bad ? `Updated with ${bad} failed file(s): run PLAY-UPDATE again.` : `Up to date (${done} file(s) downloaded).`);
process.exit(bad ? 1 : 0);
