// Writes site/manifest.json: every published file with its size and sha1, so PLAY-UPDATE can download only what changed.
// Never lists anything private (local/) or the manifest itself. Usage: node tools/manifest.mjs site
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const site = process.argv[2] || 'site'; const files = [];
const walk = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name), rel = path.relative(site, p).split(path.sep).join('/'); if (n.isDirectory()) { if (n.name === 'local') continue; walk(p); } else if (rel !== 'manifest.json') { const b = fs.readFileSync(p); files.push([rel, b.length, crypto.createHash('sha1').update(b).digest('hex')]); } } };
walk(site); files.sort((a, b) => a[0].localeCompare(b[0]));
fs.writeFileSync(path.join(site, 'manifest.json'), JSON.stringify({ built: new Date().toISOString(), files }));
console.log('manifest: ' + files.length + ' files, ' + (files.reduce((s, f) => s + f[1], 0) / 1e6).toFixed(1) + ' MB');
