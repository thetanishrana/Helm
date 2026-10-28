import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, wilson, bootstrapMean, markdown } from '../src/replay/analyze.mjs';

const tlx = (v) => ({ mental: v, physical: v, temporal: v, performance: v, effort: v, frustration: v });
const res = (participant, condition, { inj = 1, stopped = 1, ben = 2, blocked = 0, prompts = 0, tl = 30, practice = false } = {}) => ({
  participant, condition, practice, scenario: 's', tlx: tlx(tl),
  decisions: Array.from({ length: prompts }, (_, i) => ({ shown: 'prompt', latencyMs: 2000 + i })),
  metrics: { injectedActions: inj, injectedStopped: stopped, maliciousApprovals: inj - stopped, benignActions: ben, benignBlocked: blocked, prompts, reflexiveApprovals: 0 },
});

test('Wilson interval brackets the rate and handles zero denominators', () => {
  const w = wilson(8, 10); assert.ok(w.lo < 0.8 && w.hi > 0.8 && w.lo > 0.4 && w.hi < 0.97); assert.equal(wilson(0, 0).rate, null);
  assert.ok(wilson(0, 10).lo === 0 || wilson(0, 10).lo < 1e-9);
});
test('bootstrap interval is the mean when all differences agree, and wide when they disagree', () => {
  const same = bootstrapMean([0.5, 0.5, 0.5, 0.5]); assert.equal(same.mean, 0.5); assert.equal(same.lo, 0.5); assert.equal(same.hi, 0.5);
  const mixed = bootstrapMean([1, -1, 1, -1, 1, 0]); assert.ok(mixed.lo < 0 && mixed.hi > 0);
});
test('practice runs are excluded, and conditions are summarised separately', () => {
  const a = analyze([res('p1', 'C', { inj: 2, stopped: 2 }), res('p1', 'B', { inj: 2, stopped: 1, prompts: 3 }), res('p1', 'A', { inj: 2, stopped: 0 }), res('p1', 'C', { inj: 5, stopped: 0, practice: true })]);
  assert.equal(a.perCondition.C.injected.n, 2); assert.equal(a.perCondition.C.injected.stopped, 2);
  assert.equal(a.perCondition.B.injected.stopped, 1); assert.equal(a.perCondition.A.maliciousApprovals, 2);
  assert.equal(a.perCondition.B.promptsPerScenario, 3); assert.equal(a.perCondition.B.medianPromptLatencyMs, 2001);
});
test('paired differences are computed per participant and count who did better or worse', () => {
  const rows = [];
  for (const [p, c, b] of [['p1', 2, 1], ['p2', 2, 0], ['p3', 1, 1], ['p4', 0, 2]]) { rows.push(res(p, 'C', { inj: 2, stopped: c, tl: 20 }), res(p, 'B', { inj: 2, stopped: b, tl: 40 })); }
  const a = analyze(rows); const d = a.paired['C-B'];
  assert.equal(d.participants, 4); assert.equal(d.better, 2); assert.equal(d.worse, 1); assert.equal(d.same, 1);
  assert.ok(Math.abs(d.stopRateDifference.mean - 0.125) < 1e-9, String(d.stopRateDifference.mean)); assert.equal(d.tlxDifference.mean, -20);
});
test('participants missing a condition drop out of that pair only', () => {
  const a = analyze([res('p1', 'C'), res('p1', 'B'), res('p2', 'C')]); assert.equal(a.paired['C-B'].participants, 1); assert.equal(a.paired['C-A'].participants, 0);
});
test('markdown renders without throwing on empty and full data', () => {
  assert.match(markdown(analyze([res('p1', 'C'), res('p1', 'B'), res('p1', 'A')])), /Condition/);
  assert.doesNotThrow(() => markdown(analyze([])));
});
