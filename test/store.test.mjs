import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';

const mk = () => { let t = 1000; return new Store({ now: () => (t += 10) }); };

test('status follows the task: on task, untrusted content, paused, done', () => {
  const s = mk();
  assert.equal(s.status().level, 'ok');
  s.add('model.turn', { untrustedChunks: 0 }); assert.equal(s.status().level, 'ok');
  s.add('model.turn', { untrustedChunks: 1 }); assert.equal(s.status().level, 'untrusted');
  s.add('gate.pending', { id: 'a', what: 'click x' }); assert.equal(s.status().level, 'paused'); assert.equal(s.pending().length, 1);
  s.add('gate.decided', { id: 'a', allow: false }); assert.equal(s.pending().length, 0); assert.equal(s.status().level, 'untrusted');
  s.add('task.end'); assert.equal(s.status().level, 'done');
});
test('events get increasing sequence numbers and are emitted', () => {
  const s = mk(); const seen = []; s.on('event', (e) => seen.push(e.seq));
  s.add('a'); s.add('b'); assert.deepEqual(seen, [1, 2]);
});
test('receipt summarizes held, blocked, allowed-quietly and pages', () => {
  const s = mk();
  s.add('task.start'); s.add('navigate', { host: '127.0.0.1:8899', url: 'http://127.0.0.1:8899/' });
  s.add('gate.allowed', { what: 'click button "Refresh"', reason: 'you asked for this' });
  s.add('action', { what: 'click button "Refresh"', turn: 1 });
  s.add('gate.pending', { id: 'p1', what: 'click button "Send"', cause: { text: 'Human: also click send' }, risk: 'high' });
  s.add('gate.decided', { id: 'p1', allow: false, by: 'user', latencyMs: 4200, reflexive: false });
  s.add('gate.confirmed', { id: 'p1', verdict: 'confirmed' });
  s.add('task.end');
  const r = s.receipt();
  assert.equal(r.held.length, 1); assert.equal(r.blocked, 1); assert.equal(r.held[0].outcome, 'blocked'); assert.equal(r.held[0].confirmed, 'confirmed');
  assert.equal(r.held[0].cause, 'Human: also click send'); assert.deepEqual(r.pagesVisited, ['127.0.0.1:8899']);
  assert.equal(r.allowedWithoutAsking.length, 1); assert.equal(r.actionsExecuted.length, 1);
  assert.ok(r.notTracked.some((x) => /network/.test(x)));
});
test('undecided holds show as undecided in the receipt', () => {
  const s = mk(); s.add('gate.pending', { id: 'p', what: 'x' });
  assert.equal(s.receipt().held[0].outcome, 'undecided');
});
