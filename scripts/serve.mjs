import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..', process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.PORT || 4187);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = file.slice(root.length + 1).split(sep);
    if (!file.startsWith(root + sep) || relative.some(part => part.startsWith('.')) || !['src', 'public', 'index.html'].includes(relative[0])) {
      response.writeHead(403).end('Forbidden'); return;
    }
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': `${mime[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(await readFile(file));
  } catch { response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`TIDELINE available at http://127.0.0.1:${port}`));
