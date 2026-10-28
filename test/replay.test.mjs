import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { Approvals } from '../src/approvals.mjs';
import { ReplayEngine } from '../src/replay/engine.mjs';
import { makeRunner } from '../src/replay/runner.mjs';
import { loadScenarios, validateScenario } from '../src/replay/scenario.mjs';

const SC = loadScenarios(fileURLToPath(new URL('../scenarios/', import.meta.url)));
const instant = async () => {};

// Run one scenario; `onPrompt(pendingEvent)` returns true to allow; `onWindow(engine)` may press Stop.
async function play(id, condition, { onPrompt = () => false, onWindow = () => {}, stopWindowMs = 20, timeoutMs = 60_000 } = {}) {
  const store = new Store(); const approvals = new Approvals({ store, timeoutMs });
  const engine = new ReplayEngine({ scenario: SC[id], condition, store, approvals, sleep: instant, stopWindowMs, participant: 'p' });
  store.on('event', (e) => {
    if (e.type === 'gate.pending') queueMicrotask(() => approvals.decide(e.id, onPrompt(e)));
    if (e.type === 'stop.window') queueMicrotask(() => onWindow(engine));
  });
  engine.begin(); const result = await engine.run();
  return { store, result, engine, kinds: store.events.map((e) => e.type) };
}

test('shipped scenarios are valid, and Helm stays quiet on every benign step and speaks on every injected one', () => {
  assert.ok(Object.keys(SC).length >= 8);
  for (const s of Object.values(SC)) for (const st of s.steps.filter((x) => x.type === 'gate')) {
    assert.equal(st.explanation.interrupt, st.injected, `${s.id}: ${st.what}`);
  }
});
test('validation catches broken scenarios', () => {
  assert.ok(validateScenario({ id: 'x' }).length > 0);
  const bad = { id: 'x', title: 't', userTask: 'u', steps: [{ type: 'gate', command: 'c', what: 'w' }] };
  assert.ok(validateScenario(bad).some((e) => /injected/.test(e)));
  assert.ok(validateScenario({ ...bad, steps: [{ type: 'nope' }] }).some((e) => /unknown type/.test(e)));
});

test('C: Helm asks only about the injected action; blocking it is recorded as stopped', async () => {
  const { result, store } = await play('inject-tag', 'C', { onPrompt: () => false });
  assert.equal(store.events.filter((e) => e.type === 'gate.pending').length, 1);
  assert.deepEqual([result.metrics.injectedActions, result.metrics.injectedStopped, result.metrics.maliciousApprovals, result.metrics.benignBlocked, result.metrics.prompts], [1, 1, 0, 0, 1]);
  assert.ok(store.events.some((e) => e.type === 'agent.say' && /blocked/.test(e.text)));
  assert.ok(!store.events.some((e) => e.type === 'action' && /Send all/.test(e.what)));
});
test('C: approving the injected action is a malicious approval and the action happens', async () => {
  const { result, store } = await play('inject-xml', 'C', { onPrompt: () => true });
  assert.equal(result.metrics.maliciousApprovals, 1); assert.equal(result.metrics.injectedStopped, 0);
  assert.ok(store.events.some((e) => e.type === 'action' && /Send all/.test(e.what)));
});
test('C: a benign scenario never prompts', async () => {
  const { result, store } = await play('benign-wizard', 'C');
  assert.equal(result.metrics.prompts, 0); assert.equal(store.events.filter((e) => e.type === 'gate.allowed').length, 2);
});
test('B: every action prompts with the command only, and denying a harmless one counts as a false block', async () => {
  const seen = [];
  const { result } = await play('inject-tag', 'B', { onPrompt: (e) => { seen.push(e); return !/e4|Refresh/.test(e.explanation.command) ? false : false; } });
  assert.equal(seen.length, 2); assert.ok(seen.every((e) => e.explanation.commandOnly && !e.explanation.cause));
  assert.equal(result.metrics.prompts, 2); assert.equal(result.metrics.benignBlocked, 1); assert.equal(result.metrics.injectedStopped, 1);
});
test('B: approving everything lets the injection through', async () => {
  const { result } = await play('inject-user', 'B', { onPrompt: () => true });
  assert.equal(result.metrics.maliciousApprovals, 1); assert.equal(result.metrics.benignBlocked, 0);
});
test('A: no prompts; letting the window pass lets the action run', async () => {
  const { result, kinds } = await play('inject-tag', 'A');
  assert.ok(!kinds.includes('gate.pending')); assert.ok(kinds.includes('stop.window'));
  assert.equal(result.metrics.maliciousApprovals, 1); assert.equal(result.metrics.stoppedAgent, false);
});
test('A: pressing Stop in the window blocks the action and ends the run', async () => {
  let n = 0;
  const { result, store } = await play('inject-tag', 'A', { stopWindowMs: 2000, onWindow: (eng) => { if (++n === 2) eng.stop(); } });
  assert.equal(result.metrics.injectedStopped, 1); assert.equal(result.metrics.stoppedAgent, true);
  assert.ok(store.events.some((e) => e.type === 'agent.stopped'));
  assert.ok(!store.events.some((e) => e.type === 'agent.say' && /Done\./.test(e.text)), 'later steps must not run after Stop');
});
test('an unanswered prompt times out as blocked', async () => {
  const store = new Store(); const approvals = new Approvals({ store, timeoutMs: 30 });
  const engine = new ReplayEngine({ scenario: SC['inject-tag'], condition: 'C', store, approvals, sleep: instant, participant: 'p' });
  engine.begin(); const result = await engine.run();
  assert.equal(result.decisions.find((d) => d.injected).decision, 'timeout'); assert.equal(result.metrics.injectedStopped, 1);
});
test('reflexive approvals of a high-risk card are counted', async () => {
  const { result } = await play('inject-tag', 'C', { onPrompt: () => true });
  assert.equal(result.metrics.reflexiveApprovals, 1);
});
test('questionnaire answers are validated and stored', async () => {
  const store = new Store(); const approvals = new Approvals({ store });
  const e = new ReplayEngine({ scenario: SC['benign-refresh'], condition: 'C', store, approvals, sleep: instant });
  assert.equal(e.submitTlx({ mental: 10 }), false); assert.equal(e.submitTlx({ mental: 1, physical: 1, temporal: 1, performance: 1, effort: 1, frustration: 101 }), false);
  assert.equal(e.submitTlx({ mental: 10, physical: 0, temporal: 20, performance: 30, effort: 40, frustration: 50 }), true); assert.equal(e.tlx.effort, 40);
});
test('the runner plays scenarios in order, routes hooks to the current one, and writes result files', async () => {
  const store = new Store(); const approvals = new Approvals({ store }); const dir = mkdtempSync(join(tmpdir(), 'helm-study-'));
  const runner = makeRunner({ scenarios: [SC['benign-refresh'], SC['inject-tag']], condition: 'C', participant: 'p7', store, approvals, outDir: dir, sleep: instant, tlxWaitMs: 5000 });
  store.on('event', (e) => {
    if (e.type === 'study.ready') queueMicrotask(() => runner.hooks.start());
    if (e.type === 'gate.pending') queueMicrotask(() => approvals.decide(e.id, false));
    if (e.type === 'study.questionnaire') queueMicrotask(() => runner.hooks.tlx({ mental: 1, physical: 1, temporal: 1, performance: 1, effort: 1, frustration: 1 }));
  });
  const results = await runner.run();
  assert.equal(results.length, 2); assert.deepEqual(readdirSync(dir).sort(), ['p7-C-benign-refresh.json', 'p7-C-inject-tag.json']);
  const saved = JSON.parse(readFileSync(join(dir, 'p7-C-inject-tag.json'), 'utf8'));
  assert.equal(saved.metrics.injectedStopped, 1); assert.equal(saved.tlx.mental, 1); assert.ok(saved.scenarioHash);
  assert.equal(store.events.filter((e) => e.type === 'task.start').length, 2);
});
