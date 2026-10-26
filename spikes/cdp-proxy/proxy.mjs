// Spike 1b: CDP WebSocket proxy that logs commands, maps clicks to DOM elements,
// and can hold an action. Throwaway. Localhost only.
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

// gate(rec) may return a promise for { action: 'allow' } or { action: 'deny', message }.
// Default gate holds a gated action for holdMs, then allows it.
export function startProxy({ listen = 9333, chrome = 9222, holdMs = 0, gate, onEvent = () => {} } = {}) {
  gate ??= async (rec) => {
    if (holdMs) { rec.heldMs = holdMs; await new Promise((ok) => setTimeout(ok, holdMs)); }
    return { action: 'allow' };
  };
  const INTERNAL = 1_000_000_000; // ids we inject ourselves; never forwarded to the client
  const rewrite = (s) => s.replaceAll(`127.0.0.1:${chrome}`, `127.0.0.1:${listen}`);

  const server = http.createServer(async (req, res) => {
    try {
      const r = await fetch(`http://127.0.0.1:${chrome}${req.url}`);
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
      res.end(rewrite(await r.text()));
    } catch (e) {
      res.writeHead(502).end(String(e));
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, sock, head) => {
    wss.handleUpgrade(req, sock, head, (client) => {
      const up = new WebSocket(`ws://127.0.0.1:${chrome}${req.url}`, { perMessageDeflate: false });
      const pendingLookups = new Map(); // internal id -> resolver
      let nextInternal = INTERNAL;
      let chain = Promise.resolve(); // serial: a held command blocks later ones, like a pause
      const opened = new Promise((ok) => up.once('open', ok));

      const lookup = (sessionId, x, y) =>
        new Promise((resolve) => {
          const id = nextInternal++;
          const t = setTimeout(() => { pendingLookups.delete(id); resolve(null); }, 1000);
          pendingLookups.set(id, (m) => { clearTimeout(t); resolve(m); });
          up.send(JSON.stringify({
            id, sessionId, method: 'Runtime.evaluate',
            params: { returnByValue: true, expression:
              `(()=>{const e=document.elementFromPoint(${x},${y});if(!e)return null;` +
              `return{tag:e.tagName,id:e.id||null,text:(e.innerText||e.value||'').trim().slice(0,60),host:location.host}})()` },
          }));
        });

      client.on('message', (data) => {
        chain = chain.then(async () => {
          await opened;
          const raw = data.toString();
          let m; try { m = JSON.parse(raw); } catch { return up.send(raw); }
          const rec = { dir: 'c2b', id: m.id, method: m.method, sessionId: m.sessionId, params: m.params?.type ? { type: m.params.type } : undefined };
          if (m.method === 'Input.dispatchMouseEvent' && m.params?.type === 'mousePressed') {
            const r = await lookup(m.sessionId, m.params.x, m.params.y);
            rec.semantic = r?.result?.result?.value ?? null;
            onEvent({ ...rec, at: Date.now(), note: 'GATE start' });
            const v = await gate(rec);
            rec.verdict = v.action;
            if (v.action === 'deny') {
              onEvent({ ...rec, at: Date.now() });
              return client.send(JSON.stringify({ id: m.id, sessionId: m.sessionId, error: { code: -32000, message: v.message } }));
            }
          }
          onEvent({ ...rec, at: Date.now() });
          up.send(raw);
        });
      });

      up.on('message', (data) => {
        const raw = data.toString();
        let m; try { m = JSON.parse(raw); } catch { return client.send(raw); }
        if (m.id >= INTERNAL) { pendingLookups.get(m.id)?.(m); pendingLookups.delete(m.id); return; }
        onEvent({ dir: 'b2c', id: m.id, method: m.method, error: m.error?.message });
        client.send(raw);
      });
      client.on('close', () => up.close());
      up.on('close', () => client.close());
    });
  });

  return new Promise((ok) => server.listen(listen, '127.0.0.1', () => ok(server)));
}
