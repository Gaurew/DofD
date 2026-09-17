import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number(process.env.FRONTEND_PORT || 5177);
const root = resolve('frontend');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const requestedPath = resolve(join(root, safePath === '/' ? 'index.html' : safePath));

  if (!requestedPath.startsWith(root) || !existsSync(requestedPath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const fileStat = await stat(requestedPath);
  const filePath = fileStat.isDirectory() ? join(requestedPath, 'index.html') : requestedPath;
  const type = contentTypes.get(extname(filePath)) || 'application/octet-stream';

  response.writeHead(200, { 'Content-Type': type });
  createReadStream(filePath).pipe(response);
});

server.listen(port, () => {
  console.log(`DofD form running at http://localhost:${port}`);
});
