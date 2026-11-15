// SERVE-SPA — a small static server for the app's production build, with the
// single-page-app fallback Vercel gives it (vercel.json rewrites every path to
// /index.html). Used by console-check.mjs (the gate's app check) and by
// review.sh (the review app on 4200). No packages: Node's own http module.
//
//   node ralphloop/serve-spa.mjs <build dir> [port] [host]
//
// A path that names a file serves it; any other path without a file
// extension serves index.html (so /trips/12 loads the app); a missing file
// with an extension is a 404, as on Vercel.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

// serveSpa(root, port, host) → { server, url }. port 0 picks a free one.
export async function serveSpa(rootDir, port = 0, host = '127.0.0.1') {
  const root = resolve(rootDir);
  const index = join(root, 'index.html');
  if (!(await isFile(index))) throw new Error(`serve-spa: no index.html in ${root} (is this a build?)`);

  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = normalize(join(root, path));
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      if (!(await isFile(file))) {
        if (extname(path)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
          return;
        }
        file = index;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(err));
    }
  });
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, ok);
  });
  return { server, url: `http://${host}:${server.address().port}` };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [dir, port = '4200', host = '0.0.0.0'] = process.argv.slice(2);
  if (!dir) {
    console.error('usage: node serve-spa.mjs <build dir> [port] [host]');
    process.exit(2);
  }
  const { url } = await serveSpa(dir, Number(port), host);
  console.log(`serve-spa: ${resolve(dir)} at ${url}`);
}
