// tools/serve-static: serves a static export and applies a vercel.json
// (headers, trailingSlash, cleanUrls, 404.html) the way Vercel does. Node built-ins only.
// Usage: node tools/serve-static.ts --dir apps/web/out --config apps/web/vercel.json --port 4173 [--host 127.0.0.1] [--encoding auto|gzip|identity]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

export interface VercelConfig {
  trailingSlash?: boolean;
  cleanUrls?: boolean;
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.map': 'application/json; charset=utf-8',
};
const COMPRESSIBLE = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.txt',
  '.svg',
  '.xml',
  '.webmanifest',
  '.map',
]);
const DEFAULT_CACHE = 'public, max-age=0, must-revalidate';

/** Converts a Vercel `source` (path-to-regexp v6 style: `/(.*)`, `/:slug`) to an anchored RegExp. */
export function sourceToRegExp(source: string): RegExp {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === '(') {
      let depth = 0;
      let j = i;
      for (; j < source.length; j++) {
        if (source[j] === '(') depth++;
        else if (source[j] === ')' && --depth === 0) break;
      }
      out += source.slice(i, j + 1);
      i = j;
    } else if (ch === ':' && /\w/.test(source[i + 1] ?? '')) {
      while (/\w/.test(source[i + 1] ?? '')) i++;
      out += '([^/]+?)';
    } else {
      out += ch.replace(/[.*+?^${}|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

export type Resolution =
  { kind: 'redirect'; location: string } | { kind: 'file'; file: string } | { kind: 'missing' };

/** Routing as on Vercel: cleanUrls and trailingSlash 308s, directories serve index.html, misses are 404. */
export function resolvePath(
  dir: string,
  config: VercelConfig,
  pathname: string,
  search: string,
): Resolution {
  if (config.cleanUrls && pathname.endsWith('.html')) {
    const clean = pathname.replace(/(?:\/index)?\.html$/, '') || '/';
    const location = config.trailingSlash && !clean.endsWith('/') ? `${clean}/` : clean;
    return { kind: 'redirect', location: location + search };
  }
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (config.trailingSlash && !pathname.endsWith('/') && !last.includes('.')) {
    return { kind: 'redirect', location: `${pathname}/${search}` };
  }
  const root = resolve(dir);
  const candidates = pathname.endsWith('/')
    ? [join(pathname, 'index.html'), `${pathname.slice(0, -1)}.html`]
    : [pathname];
  for (const c of candidates) {
    const file = resolve(join(root, c));
    if (file !== root && !file.startsWith(root + sep)) return { kind: 'missing' }; // path traversal
    if (existsSync(file) && statSync(file).isFile()) return { kind: 'file', file };
  }
  return { kind: 'missing' };
}

export function headersFor(config: VercelConfig, pathname: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of config.headers ?? []) {
    if (sourceToRegExp(rule.source).test(pathname))
      for (const h of rule.headers) out[h.key] = h.value;
  }
  if (!Object.keys(out).some((k) => k.toLowerCase() === 'cache-control'))
    out['Cache-Control'] = DEFAULT_CACHE;
  return out;
}

export interface ServeOptions {
  dir: string;
  config: VercelConfig;
  encoding: 'auto' | 'gzip' | 'identity';
}

export function createStaticHandler(opts: ServeOptions) {
  const cache = new Map<string, Buffer>();
  const read = (file: string, enc: 'br' | 'gzip' | 'identity'): Buffer => {
    const key = `${enc}:${statSync(file).mtimeMs}:${file}`;
    let buf = cache.get(key);
    if (!buf) {
      const raw = readFileSync(file);
      // Brotli quality 5: on-the-fly CDN level; quality 11 blocks the event loop ~3 s on the Phaser chunk.
      buf =
        enc === 'br'
          ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
          : enc === 'gzip'
            ? gzipSync(raw, { level: 9 })
            : raw;
      cache.set(key, buf);
    }
    return buf;
  };

  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://local');
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const base = headersFor(opts.config, pathname);
    const route = resolvePath(opts.dir, opts.config, pathname, url.search);
    if (route.kind === 'redirect') {
      res.writeHead(308, { ...base, Location: route.location }).end();
      return;
    }
    let status = 200;
    let file = route.kind === 'file' ? route.file : join(opts.dir, '404.html');
    if (route.kind === 'missing') {
      status = 404;
      if (!existsSync(file)) {
        res.writeHead(404, { ...base, 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
    }
    const ext = extname(file).toLowerCase();
    const accept = String(req.headers['accept-encoding'] ?? '');
    let enc: 'br' | 'gzip' | 'identity' = 'identity';
    if (COMPRESSIBLE.has(ext)) {
      if (opts.encoding === 'gzip') enc = /\bgzip\b/.test(accept) ? 'gzip' : 'identity';
      else if (opts.encoding === 'auto')
        enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : 'identity';
    }
    const body = read(file, enc);
    const etag = `"${createHash('sha1').update(read(file, 'identity')).digest('base64url').slice(0, 27)}"`;
    const headers: Record<string, string> = {
      ...base,
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      ETag: etag,
    };
    if (COMPRESSIBLE.has(ext)) headers.Vary = 'Accept-Encoding';
    if (enc !== 'identity') headers['Content-Encoding'] = enc;
    if (status === 200 && req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end();
      return;
    }
    headers['Content-Length'] = String(body.length);
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const dir = resolve(arg('dir', 'apps/web/out')!);
  const configPath = arg('config');
  const config = configPath ? (JSON.parse(readFileSync(configPath, 'utf8')) as VercelConfig) : {};
  const port = Number(arg('port', '4173'));
  const host = arg('host', '127.0.0.1')!;
  const encoding = (arg('encoding', 'auto') as ServeOptions['encoding']) ?? 'auto';
  if (!existsSync(dir)) {
    console.error(`serve-static: ${dir} does not exist; run the build first`);
    process.exit(1);
  }
  createServer(createStaticHandler({ dir, config, encoding })).listen(port, host, () => {
    console.log(`listening on http://${host}:${port}`);
  });
}
