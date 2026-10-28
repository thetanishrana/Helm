import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { Approvals } from '../src/approvals.mjs';

function setup(opts = {}) {
  let now = 0; const timers = [];
  const store = new Store({ now: () => now });
  const a = new Approvals({ store, setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: (t) => { t.cleared = true; }, ...opts });
  return { store, a, timers, advance: (ms) => { now += ms; } };
}
const item = (over = {}) => ({ key: 'click Send', what: 'click button "Send"', risk: 'high', ...over });
const pendingId = (store) => store.events.find((e) => e.type === 'gate.pending').id;

test('allow resolves the waiting promise and records latency', async () => {
  const { a, store, advance } = setup(); const p = a.ask(item()); advance(3000);
  assert.equal(a.decide(pendingId(store), true), true);
  assert.deepEqual(await p, { allow: true });
  const d = store.events.find((e) => e.type === 'gate.decided'); assert.equal(d.latencyMs, 3000); assert.equal(d.reflexive, false);
});
test('a sub-second approval of a high-risk card is flagged reflexive', async () => {
  const { a, store, advance } = setup(); const p = a.ask(item()); advance(300); a.decide(pendingId(store), true); await p;
  assert.equal(store.events.find((e) => e.type === 'gate.decided').reflexive, true);
});
test('a fast answer on a low-risk card is not reflexive', async () => {
  const { a, store, advance } = setup(); const p = a.ask(item({ risk: 'low' })); advance(100); a.decide(pendingId(store), true); await p;
  assert.equal(store.events.find((e) => e.type === 'gate.decided').reflexive, false);
});
test('block returns a message the agent can relay, and remembers the decline', async () => {
  const { a, store } = setup(); const p = a.ask(item()); a.decide(pendingId(store), false);
  const r = await p; assert.equal(r.allow, false); assert.match(r.message, /declined/); assert.match(r.message, /NOT done/);
  const again = await a.ask(item());   // the agent tries again: answered without asking
  assert.equal(again.allow, false); assert.match(again.message, /already declined/);
  assert.equal(store.events.filter((e) => e.type === 'gate.pending').length, 1);
  assert.ok(store.events.some((e) => e.type === 'gate.repeat-blocked'));
});
test('an unanswered card is blocked on timeout', async () => {
  const { a, store, timers } = setup({ timeoutMs: 1000 }); const p = a.ask(item());
  timers[0].fn(); const r = await p;
  assert.equal(r.allow, false); assert.match(r.message, /no decision/); assert.equal(store.events.find((e) => e.type === 'gate.decided').by, 'timeout');
});
test('deciding twice, or an unknown id, does nothing', async () => {
  const { a, store } = setup(); const p = a.ask(item()); const id = pendingId(store);
  assert.equal(a.decide('nope', true), false); assert.equal(a.decide(id, true), true); assert.equal(a.decide(id, false), false); await p;
  assert.equal(store.events.filter((e) => e.type === 'gate.decided').length, 1);
});
test('closeAll blocks everything still waiting', async () => {
  const { a } = setup(); const p1 = a.ask(item({ key: 'a' })); const p2 = a.ask(item({ key: 'b' })); a.closeAll();
  assert.equal((await p1).allow, false); assert.equal((await p2).allow, false);
});
