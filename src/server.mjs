// Local web server for the Helm UI. Localhost only. Decisions require a per-run token that is
// embedded in the page, plus a Host check, so a web page in the user's browser cannot approve actions.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const UI = new URL('./ui/', import.meta.url);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.ttf': 'font/ttf' };
// Only these files are served from the UI folder. Everything on the page can contain text from untrusted web pages,
// so the page also refuses to load or run anything that is not one of these files.
const STATIC = new Set(['app.js', 'style.css', 'fonts/AtkinsonHyperlegibleNext.ttf', 'fonts/AtkinsonHyperlegibleMono.ttf']);
export const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cross-origin-opener-policy': 'same-origin',
};

export function startServer({ store, approvals, port = 7777, token = randomBytes(16).toString('hex'), hooks = {} }) {
  const hostOk = (h) => h === `127.0.0.1:${server.address().port}` || h === `localhost:${server.address().port}`;
  const json = (res, code, body) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  const publicEvent = (e) => e;   // events are already free of credentials and raw request bodies

  const server = http.createServer((req, res) => {
    if (!hostOk(req.headers.host)) return res.writeHead(421).end('wrong host');
    const url = new URL(req.url, 'http://x');

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = readFileSync(new URL('index.html', UI), 'utf8').replace('__TOKEN__', token);
      return res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store', ...SECURITY_HEADERS }).end(html);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/ui/') && STATIC.has(url.pathname.slice(4))) {
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      const long = ext === '.ttf';   // fonts never change under one name; code and styles are reloaded on every start
      return res.writeHead(200, { 'content-type': TYPES[ext], 'cache-control': long ? 'max-age=86400' : 'no-store', ...SECURITY_HEADERS }).end(readFileSync(new URL(url.pathname.slice(4), UI)));
    }
    if (req.method === 'GET' && url.pathname === '/favicon.ico') return res.writeHead(204).end();
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, { meta: store.meta, status: store.status(), pending: store.pending(), receipt: store.receipt() });
    if (req.method === 'GET' && url.pathname === '/api/receipt') return json(res, 200, store.receipt());
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      const send = (e) => res.write(`id: ${e.seq}\ndata: ${JSON.stringify(publicEvent(e))}\n\n`);
      const after = Number(req.headers['last-event-id'] || url.searchParams.get('after') || 0);
      for (const e of store.events) if (e.seq > after) send(e);
      store.on('event', send);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => { store.off('event', send); clearInterval(ping); });
      return;
    }
    if (req.method === 'POST' && ['/api/start', '/api/stop', '/api/tlx', '/api/consent'].includes(url.pathname)) {
      if (req.headers['x-helm-token'] !== token) return json(res, 403, { error: 'bad token' });
      if (req.headers.origin && !hostOk(new URL(req.headers.origin).host)) return json(res, 403, { error: 'bad origin' });
      const name = url.pathname.slice(5); const hook = hooks[name];
      if (!hook) return json(res, 404, { error: 'not available' });
      let body = ''; req.on('data', (c) => { body += c; if (body.length > 20_000) req.destroy(); });
      req.on('end', () => { let j = {}; try { j = body ? JSON.parse(body) : {}; } catch { return json(res, 400, { error: 'bad json' }); } json(res, 200, { ok: Boolean(hook(j)) }); });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/decide') {
      if (req.headers['x-helm-token'] !== token) return json(res, 403, { error: 'bad token' });
      if (req.headers.origin && !hostOk(new URL(req.headers.origin).host)) return json(res, 403, { error: 'bad origin' });
      let body = ''; req.on('data', (c) => { body += c; if (body.length > 10_000) req.destroy(); });
      req.on('end', () => {
        let j; try { j = JSON.parse(body); } catch { return json(res, 400, { error: 'bad json' }); }
        if (typeof j.id !== 'string' || typeof j.allow !== 'boolean') return json(res, 400, { error: 'need id and allow' });
        json(res, approvals.decide(j.id, j.allow, { by: 'user' }) ? 200 : 404, { ok: true });
      });
      return;
    }
    res.writeHead(404).end('not found');
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, token, port: server.address().port, close: () => { server.closeAllConnections?.(); server.close(); } })));
}
