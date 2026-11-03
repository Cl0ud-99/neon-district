import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlPath = path.join(root, 'site', 'standalone.html');
const outDir = path.join(root, 'docs');
const outPath = path.join(outDir, 'neon-district-trailer.webm');
const port = Number(process.env.PORT || 8765);

const server = http.createServer((req, res) => {
  console.log('REQ ' + req.method + ' ' + req.url);
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url === '/standalone.html')) {
    fs.readFile(htmlPath, (err, data) => {
      if (err) { res.statusCode = 500; res.end(String(err)); return; }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(data);
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/save-trailer') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outPath, Buffer.concat(chunks));
        res.setHeader('Content-Type', 'text/plain');
        res.end('saved ' + Buffer.concat(chunks).length);
        console.log('TRAILER_SAVED ' + outPath + ' ' + Buffer.concat(chunks).length);
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e));
      }
    });
    return;
  }
  res.statusCode = 404;
  res.end('not found');
});
server.listen(port, '127.0.0.1', () => console.log('RECORD_SERVER http://127.0.0.1:' + port + '/?record=1'));
