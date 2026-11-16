import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { Approvals } from '../src/approvals.mjs';
import { readSpec } from '../src/fleet.mjs';

const hold = (approvals, agent, what = 'click button "Send"') => { const p = approvals.ask({ agent, key: what, what, risk: 'high', card: '' }); return p; };

test('agents keep separate tasks, pending decisions and receipts', () => {
  const store = new Store(); const approvals = new Approvals({ store });
  store.register({ id: 'a', name: 'Invoices' }); store.register({ id: 'b', name: 'Research' });
  store.add('task.start', { agent: 'a' }); store.add('task.start', { agent: 'b' });
  store.add('model.turn', { agent: 'a', untrustedChunks: 1, tools: [] });
  hold(approvals, 'a');
  assert.equal(store.pending('a').length, 1); assert.equal(store.pending('b').length, 0); assert.equal(store.pending().length, 1);
  assert.equal(store.pending()[0].agent, 'a');
  assert.equal(store.status().level, 'paused');
  assert.equal(store.receipt('a').held.length, 1); assert.equal(store.receipt('b').held.length, 0);
  assert.equal(store.receipt('a').modelTurns, 1); assert.equal(store.receipt('b').modelTurns, 0);
  approvals.closeAll();
});

test('one agent finishing does not finish the fleet; restarting one leaves the others alone', () => {
  const store = new Store(); store.register({ id: 'a' }); store.register({ id: 'b' });
  store.add('task.start', { agent: 'a' }); store.add('task.start', { agent: 'b' });
  store.add('task.end', { agent: 'a' });
  assert.notEqual(store.status().level, 'done');
  store.add('task.end', { agent: 'b' });
  assert.equal(store.status().level, 'done');
  store.add('model.turn', { agent: 'a', untrustedChunks: 2, tools: [] });
  store.add('task.start', { agent: 'b' });   // b starts a new task; a's untrusted flag stays
  assert.ok(store.untrustedBy.has('a')); assert.ok(!store.untrustedBy.has('b'));
});

test('a decline by one agent does not block the same action by another', async () => {
  const store = new Store(); const approvals = new Approvals({ store });
  store.register({ id: 'a' }); store.register({ id: 'b' });
  const first = hold(approvals, 'a'); const id = store.pending('a')[0].id;
  approvals.decide(id, false); assert.equal((await first).allow, false);
  const again = await hold(approvals, 'a');   // same agent: refused without asking
  assert.equal(again.allow, false); assert.equal(store.pending().length, 0);
  const other = hold(approvals, 'b');         // other agent: asked
  assert.equal(store.pending('b').length, 1);
  approvals.decide(store.pending('b')[0].id, true); assert.equal((await other).allow, true);
});

test('closeAll for one agent leaves the other agents\' decisions waiting', async () => {
  const store = new Store(); const approvals = new Approvals({ store });
  store.register({ id: 'a' }); store.register({ id: 'b' });
  const pa = hold(approvals, 'a', 'x'); hold(approvals, 'b', 'y');
  approvals.closeAll('a'); assert.equal((await pa).allow, false);
  assert.equal(store.pending('b').length, 1); assert.equal(store.pending('a').length, 0);
  approvals.closeAll();
});

test('events of a single-agent run carry no agent and behave as before', () => {
  const store = new Store(); const approvals = new Approvals({ store });
  store.add('task.start'); hold(approvals, undefined);
  assert.equal(store.pending().length, 1); assert.equal(store.pending()[0].agent, undefined);
  assert.equal(store.receipt().held.length, 1);
  approvals.closeAll();
});

test('fleet file is validated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-')); const f = join(dir, 'f.json');
  writeFileSync(f, JSON.stringify({ agents: [{ name: 'x', cmd: ['echo'] }] })); assert.equal(readSpec(f).agents.length, 1);
  writeFileSync(f, JSON.stringify({ agents: [] })); assert.throws(() => readSpec(f), /agents/);
  writeFileSync(f, JSON.stringify({ agents: [{ name: 'x' }] })); assert.throws(() => readSpec(f), /cmd/);
});
