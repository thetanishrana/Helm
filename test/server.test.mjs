import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { Store } from '../src/store.mjs';
import { Approvals } from '../src/approvals.mjs';
import { startServer } from '../src/server.mjs';

async function setup() {
  const store = new Store(); const approvals = new Approvals({ store, timeoutMs: 60_000, setTimer: () => 0, clearTimer: () => {} });
  const ui = await startServer({ store, approvals, port: 0, token: 'tok123' });
  const base = `http://127.0.0.1:${ui.port}`;
  return { store, approvals, ui, base };
}
const rawGet = (port, path, headers = {}) => new Promise((ok) => http.get({ host: '127.0.0.1', port, path, headers }, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => ok({ status: r.statusCode, body: d })); }));

test('page is served with the token substituted', async () => {
  const { ui, base } = await setup(); const html = await (await fetch(base + '/')).text();
  assert.match(html, /name="helm-token" content="tok123"/); assert.ok(!html.includes('__TOKEN__')); ui.close();
});
test('wrong Host header is refused (DNS-rebinding guard)', async () => {
  const { ui } = await setup(); const r = await rawGet(ui.port, '/', { host: 'evil.example' });
  assert.equal(r.status, 421); ui.close();
});
test('decision needs the token and the right origin', async () => {
  const { ui, base, store, approvals } = await setup();
  const p = approvals.ask({ key: 'k', what: 'click x', risk: 'high' }); const id = store.pending()[0].id;
  const post = (headers, body) => fetch(base + '/api/decide', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post({}, { id, allow: true })).status, 403);
  assert.equal((await post({ 'x-helm-token': 'tok123', origin: 'http://evil.example' }, { id, allow: true })).status, 403);
  assert.equal((await post({ 'x-helm-token': 'tok123' }, { id: 5, allow: 'yes' })).status, 400);
  assert.equal(store.pending().length, 1);
  assert.equal((await post({ 'x-helm-token': 'tok123', origin: base }, { id, allow: false })).status, 200);
  assert.equal((await p).allow, false); ui.close();
});
test('deciding an id that is not pending is a 404', async () => {
  const { ui, base } = await setup();
  const r = await fetch(base + '/api/decide', { method: 'POST', headers: { 'content-type': 'application/json', 'x-helm-token': 'tok123' }, body: JSON.stringify({ id: 'gone', allow: true }) });
  assert.equal(r.status, 404); ui.close();
});
test('event stream replays history then streams new events', async () => {
  const { ui, base, store } = await setup(); store.add('task.start');
  const ac = new AbortController();
  try {
    const r = await fetch(base + '/api/events', { signal: ac.signal });
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    const until = async (re) => { while (!re.test(buf)) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value); } };
    await until(/task\.start/); store.add('navigate', { url: 'http://x/', host: 'x' }); await until(/"type":"navigate"/);
    assert.match(buf, /"type":"task.start"/); assert.match(buf, /"type":"navigate"/);
  } finally { ac.abort(); ui.close(); }
});
test('state endpoint reports status and pending cards', async () => {
  const { ui, base, approvals } = await setup(); approvals.ask({ key: 'k', what: 'click x', risk: 'high' });
  const s = await (await fetch(base + '/api/state')).json(); assert.equal(s.status.level, 'paused'); assert.equal(s.pending.length, 1); ui.close();
});
test('the UI never injects page text as HTML', () => {
  const js = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  for (const bad of ['innerHTML', 'insertAdjacentHTML', 'document.write', 'outerHTML', 'eval(']) assert.ok(!js.includes(bad), `app.js must not use ${bad}`);
});
