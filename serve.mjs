// Local server for Brick Sim: serves site/ plus your private local/ folder (home address), then opens the browser.
// Double-click PLAY.cmd instead of running this by hand.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { exec } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, 'site'), LOCAL = path.join(here, 'local');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const port = +(process.env.PORT || 8977);
http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  const base = u.startsWith('/local/') ? LOCAL : SITE; const rel = u.startsWith('/local/') ? u.slice(7) : u.slice(1);
  const f = path.normalize(path.join(base, rel)); if (!f.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const type = TYPES[path.extname(f)] || 'application/octet-stream';
    if (/gzip/.test(req.headers['accept-encoding'] || '') && buf.length > 2048 && !type.startsWith('image')) { res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip', 'Cache-Control': 'no-cache' }); return res.end(zlib.gzipSync(buf, { level: 4 })); }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(buf);
  });
}).listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`; console.log('Brick Sim running at ' + url + '  (close this window to stop)');
  if (!process.env.NO_OPEN) exec(process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`);
});
