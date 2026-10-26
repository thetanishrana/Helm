// Model tap: logging passthrough for the Anthropic Messages API with an optional
// pre-execution gate. A gated tool_use block is withheld from the client (with
// keepalive pings) until the policy resolves, so the agent cannot run it yet.
// Throwaway spike. Never persists credential headers. Localhost only.
import http from 'node:http';
import https from 'node:https';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseSse, analyzeRequest } from './turns.mjs';

const UPSTREAM = 'api.anthropic.com';
const SECRET = /^(authorization|x-api-key|cookie|proxy-authorization)$/i;
const redact = (h) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, SECRET.test(k) ? '[redacted]' : v]));
const frameOf = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

// policy(toolUse, req) -> { action: 'allow' } | { action: 'hold', wait: Promise<{allow:boolean,message?:string}> }
export function startTap({ port = 8787, log = () => {}, policy = null, pingMs = 5000, pings = true, onGate = () => {} } = {}) {
  const server = http.createServer((req, res) => {
    const t0 = Date.now();
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const headers = { ...req.headers, host: UPSTREAM, 'accept-encoding': 'identity' };
      const rec = {
        t: new Date(t0).toISOString(), reqStartMs: t0, method: req.method, path: req.url,
        reqHeaders: redact(req.headers), hasAuth: Boolean(req.headers.authorization || req.headers['x-api-key']),
        betaHeader: req.headers['anthropic-beta'] || null, reqBytes: body.length,
      };
      try {
        const j = JSON.parse(body.toString('utf8'));
        rec.model = j.model; rec.stream = j.stream;
        rec.nMessages = Array.isArray(j.messages) ? j.messages.length : undefined;
        rec.req = analyzeRequest(j);
      } catch {}

      const up = https.request({ host: UPSTREAM, port: 443, method: req.method, path: req.url, headers }, (ur) => {
        rec.status = ur.statusCode; rec.contentType = ur.headers['content-type']; rec.respHeaders = redact(ur.headers);
        const isSse = /event-stream/.test(rec.contentType || '');
        res.writeHead(ur.statusCode, ur.headers);
        let first = null, bytes = 0, events = 0, sse = '';
        const gating = Boolean(policy) && isSse && ur.statusCode === 200;

        // --- frame-level gate -------------------------------------------------
        let pending = ''; let held = null; let chain = Promise.resolve(); let denied = false; let allowedToolUses = 0;
        const send = (s) => res.write(s);
        const process1 = async (frame) => {
          const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
          let e = null; try { e = dataLine && JSON.parse(dataLine.slice(6)); } catch {}
          if (!e) return send(frame + '\n\n');
          if (e.type === 'content_block_start' && e.content_block.type === 'tool_use') {
            held = { index: e.index, frames: [frame + '\n\n'], json: '', block: e.content_block }; return;
          }
          if (held) {
            held.frames.push(frame + '\n\n');
            if (e.type === 'content_block_delta' && e.index === held.index && e.delta.type === 'input_json_delta') held.json += e.delta.partial_json;
            if (e.type === 'content_block_stop' && e.index === held.index) {
              let input = {}; try { input = JSON.parse(held.json || '{}'); } catch {}
              const toolUse = { id: held.block.id, name: held.block.name, input };
              const verdict = (await policy(toolUse, rec.req)) || { action: 'allow' };
              let allow = verdict.action !== 'hold' && verdict.action !== 'deny';
              let message = verdict.message;
              if (verdict.action === 'hold') {
                const t = Date.now(); onGate({ phase: 'hold', toolUse, at: t });
                const timer = pings ? setInterval(() => send(frameOf('ping', { type: 'ping' })), pingMs) : null;
                const r = await verdict.wait; if (timer) clearInterval(timer);
                allow = r.allow; message = r.message; onGate({ phase: 'resolved', toolUse, allow, heldMs: Date.now() - t, at: Date.now() });
              } else if (verdict.action === 'deny') { allow = false; onGate({ phase: 'deny', toolUse, at: Date.now() }); }
              if (allow) { allowedToolUses++; for (const f of held.frames) send(f); }
              else {
                denied = true;
                const text = message || 'Helm: the user declined this action.';
                send(frameOf('content_block_start', { type: 'content_block_start', index: held.index, content_block: { type: 'text', text: '' } }));
                send(frameOf('content_block_delta', { type: 'content_block_delta', index: held.index, delta: { type: 'text_delta', text } }));
                send(frameOf('content_block_stop', { type: 'content_block_stop', index: held.index }));
              }
              held = null;
            }
            return;
          }
          if (e.type === 'message_delta' && denied && allowedToolUses === 0 && e.delta?.stop_reason === 'tool_use') {
            e.delta.stop_reason = 'end_turn'; return send(frameOf('message_delta', e));
          }
          send(frame + '\n\n');
        };
        const feed = (s) => {
          pending += s;
          let i; while ((i = pending.indexOf('\n\n')) >= 0) { const f = pending.slice(0, i); pending = pending.slice(i + 2); if (f) chain = chain.then(() => process1(f)); }
        };

        ur.on('data', (c) => {
          if (first === null) first = Date.now() - t0;
          bytes += c.length;
          const s = c.toString('utf8'); sse += s; events += (s.match(/^event: /gm) || []).length;
          if (gating) feed(s); else res.write(c);
        });
        ur.on('end', () => {
          const finish = () => {
            res.end(); rec.respEndMs = Date.now();
            if (isSse) rec.resp = parseSse(sse);
            Object.assign(rec, { respBytes: bytes, sseEvents: events, ttfbMs: first, totalMs: Date.now() - t0, gated: gating, denied });
            log(rec);
          };
          if (gating) chain.then(finish); else finish();
        });
      });
      up.on('error', (e) => { rec.error = String(e); log(rec); res.writeHead(502).end(); });
      up.end(body);
    });
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const LOG = process.env.LOG || new URL('./tap.jsonl', import.meta.url).pathname;
  const PORT = Number(process.env.PORT || 8787);
  await startTap({ port: PORT, log: (r) => appendFileSync(LOG, JSON.stringify(r) + '\n') });
  console.log(`tap on 127.0.0.1:${PORT} -> ${UPSTREAM}, log ${LOG}`);
}
