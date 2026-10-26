// Spike 1a: logging passthrough proxy for the Anthropic Messages API.
// Throwaway. Never persists credential headers. Localhost only.
import http from 'node:http';
import https from 'node:https';
import { appendFileSync } from 'node:fs';

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = 'api.anthropic.com';
const LOG = process.env.LOG || new URL('./tap.jsonl', import.meta.url).pathname;
const SECRET = /^(authorization|x-api-key|cookie|proxy-authorization)$/i;

const redact = (h) =>
  Object.fromEntries(Object.entries(h).map(([k, v]) => [k, SECRET.test(k) ? '[redacted]' : v]));
const log = (rec) => appendFileSync(LOG, JSON.stringify(rec) + '\n');

http
  .createServer((req, res) => {
    const t0 = Date.now();
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      // Ask upstream for identity encoding so SSE can be counted without a decoder.
      const headers = { ...req.headers, host: UPSTREAM, 'accept-encoding': 'identity' };
      const rec = {
        t: new Date().toISOString(),
        method: req.method,
        path: req.url,
        reqHeaders: redact(req.headers),
        hasAuth: Boolean(req.headers.authorization || req.headers['x-api-key']),
        betaHeader: req.headers['anthropic-beta'] || null,
        reqBytes: body.length,
      };
      try {
        const j = JSON.parse(body.toString('utf8'));
        rec.model = j.model;
        rec.stream = j.stream;
        rec.nMessages = Array.isArray(j.messages) ? j.messages.length : undefined;
      } catch {}

      const up = https.request(
        { host: UPSTREAM, port: 443, method: req.method, path: req.url, headers },
        (ur) => {
          rec.status = ur.statusCode;
          rec.contentType = ur.headers['content-type'];
          rec.respHeaders = redact(ur.headers);
          res.writeHead(ur.statusCode, ur.headers);
          let first = null;
          let bytes = 0;
          let events = 0;
          let pings = 0;
          ur.on('data', (c) => {
            if (first === null) first = Date.now() - t0;
            bytes += c.length;
            const s = c.toString('utf8');
            events += (s.match(/^event: /gm) || []).length;
            pings += (s.match(/^event: ping/gm) || []).length;
            res.write(c); // relay immediately, no buffering
          });
          ur.on('end', () => {
            res.end();
            Object.assign(rec, { respBytes: bytes, sseEvents: events, pings, ttfbMs: first, totalMs: Date.now() - t0 });
            log(rec);
          });
        },
      );
      up.on('error', (e) => {
        rec.error = String(e);
        log(rec);
        res.writeHead(502).end();
      });
      up.end(body);
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`tap on 127.0.0.1:${PORT} -> ${UPSTREAM}, log ${LOG}`));
