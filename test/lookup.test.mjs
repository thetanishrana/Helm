import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { isPlainCss, lookupSelector, resolveSelectors } from '../src/cdp/lookup.mjs';

// A fake Chrome: /json/list names one page, and its socket answers Runtime.evaluate with a canned element.
async function fakeChrome(answer) {
  const server = http.createServer(); const wss = new WebSocketServer({ server }); const seen = [];
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  server.on('request', (req, res) => res.end(JSON.stringify([{ type: 'page', url: 'http://x/', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/p` }])));
  wss.on('connection', (ws) => ws.on('message', (m) => { const j = JSON.parse(m); seen.push(j.params.expression); ws.send(JSON.stringify({ id: j.id, result: { result: { value: answer === null ? null : JSON.stringify(answer) } } })); }));
  return { port, seen, close: () => { wss.close(); server.closeAllConnections(); server.close(); } };
}

test('only plain CSS selectors are looked up', () => {
  for (const s of ['#send', '.btn.primary', 'button[type=submit]', 'css=#send', 'a.link']) assert.ok(isPlainCss(s), s);
  for (const s of ['text=Send', 'role=button', 'button >> text=Send', 'xpath=//a', 'button:has-text("x")', 42]) assert.ok(!isPlainCss(s), String(s));
});

test('a selector is resolved to the element\'s role and label', async () => {
  const c = await fakeChrome({ role: 'button', label: 'Send all invoices', tag: 'button' });
  try {
    assert.deepEqual(await lookupSelector('#go', c.port), { role: 'button', label: 'Send all invoices', tag: 'button' });
    assert.match(c.seen[0], /querySelector\("#go"\)/);
  } finally { c.close(); }
});

test('resolveSelectors fills in only unlabelled interact actions', async () => {
  const c = await fakeChrome({ role: 'button', label: 'Delete account', tag: 'button' });
  try {
    const acts = [{ risk: 'interact', selector: '#x' }, { risk: 'interact', selector: '#y', label: 'Keep' }, { risk: 'read', selector: '#z' }];
    await resolveSelectors(acts, c.port);
    assert.equal(acts[0].label, 'Delete account'); assert.equal(acts[0].role, 'button');
    assert.equal(acts[1].label, 'Keep'); assert.equal(acts[2].label, undefined);
    assert.equal(c.seen.length, 1);
  } finally { c.close(); }
});

test('no element, no Chrome, or a bad answer leaves the action as it was', async () => {
  const c = await fakeChrome(null);
  try { assert.equal(await lookupSelector('#nope', c.port), null); } finally { c.close(); }
  assert.equal(await lookupSelector('#x', 1, { timeoutMs: 300 }), null);   // nothing listening
});
