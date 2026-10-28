// Summarise study result files. The primary comparison is paired within each participant; the pooled
// rates ignore that one person contributes several actions, so their intervals are optimistic.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadResults(dir) {
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json') || f.endsWith('-consent.json')) continue;
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (r.condition && r.metrics) out.push(r);
  }
  return out;
}

export function wilson(k, n, z = 1.96) {
  if (!n) return { rate: null, lo: null, hi: null };
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { rate: p, lo: (c - m) / d, hi: (c + m) / d };
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const rng = (seed) => { let h = seed >>> 0; return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
const tlxScore = (t) => (t ? mean(Object.values(t)) : null);   // raw (unweighted) NASA-TLX

export function bootstrapMean(diffs, { resamples = 4000, seed = 1 } = {}) {
  if (!diffs.length) return { mean: null, lo: null, hi: null };
  const r = rng(seed); const means = [];
  for (let i = 0; i < resamples; i++) { let s = 0; for (let j = 0; j < diffs.length; j++) s += diffs[Math.floor(r() * diffs.length)]; means.push(s / diffs.length); }
  means.sort((a, b) => a - b);
  return { mean: mean(diffs), lo: means[Math.floor(resamples * 0.025)], hi: means[Math.floor(resamples * 0.975)] };
}

export function analyze(all) {
  const results = all.filter((r) => !r.practice);
  const conds = ['A', 'B', 'C']; const per = {};
  for (const c of conds) {
    const rs = results.filter((r) => r.condition === c);
    const inj = rs.reduce((n, r) => n + r.metrics.injectedActions, 0), stopped = rs.reduce((n, r) => n + r.metrics.injectedStopped, 0);
    const ben = rs.reduce((n, r) => n + r.metrics.benignActions, 0), blocked = rs.reduce((n, r) => n + r.metrics.benignBlocked, 0);
    const prompts = rs.flatMap((r) => r.decisions.filter((d) => d.shown === 'prompt'));
    per[c] = {
      participants: new Set(rs.map((r) => r.participant)).size, scenarios: rs.length,
      injected: { n: inj, stopped, ...wilson(stopped, inj) }, maliciousApprovals: inj - stopped,
      benign: { n: ben, blocked, ...wilson(blocked, ben) },
      promptsPerScenario: rs.length ? rs.reduce((n, r) => n + r.metrics.prompts, 0) / rs.length : null,
      medianPromptLatencyMs: median(prompts.map((d) => d.latencyMs)), reflexiveApprovals: rs.reduce((n, r) => n + r.metrics.reflexiveApprovals, 0),
      tlx: mean(rs.map((r) => tlxScore(r.tlx)).filter((x) => x !== null)),
    };
  }
  // Per-participant stop rate in each condition, then paired differences.
  const byP = {};
  for (const r of results) { const p = (byP[r.participant] ??= {}); const c = (p[r.condition] ??= { inj: 0, stopped: 0, ben: 0, blocked: 0, tlx: [] }); c.inj += r.metrics.injectedActions; c.stopped += r.metrics.injectedStopped; c.ben += r.metrics.benignActions; c.blocked += r.metrics.benignBlocked; const t = tlxScore(r.tlx); if (t !== null) c.tlx.push(t); }
  const rate = (c) => (c && c.inj ? c.stopped / c.inj : null);
  const paired = {};
  for (const [a, b] of [['C', 'B'], ['C', 'A'], ['B', 'A']]) {
    const diffs = [], tl = []; let up = 0, down = 0, same = 0;
    for (const p of Object.values(byP)) { const x = rate(p[a]), y = rate(p[b]); if (x === null || y === null) continue; const d = x - y; diffs.push(d); d > 0 ? up++ : d < 0 ? down++ : same++; if (p[a]?.tlx.length && p[b]?.tlx.length) tl.push(mean(p[a].tlx) - mean(p[b].tlx)); }
    paired[`${a}-${b}`] = { participants: diffs.length, stopRateDifference: bootstrapMean(diffs), better: up, worse: down, same, tlxDifference: bootstrapMean(tl, { seed: 2 }) };
  }
  return { perCondition: per, paired, participantCount: Object.keys(byP).length };
}

const pct = (x) => (x === null ? 'n/a' : `${(100 * x).toFixed(0)}%`);
export function markdown(a) {
  const L = [];
  L.push(`Participants: ${a.participantCount}\n`);
  L.push('| Condition | Injected actions stopped | Malicious approvals | Benign actions blocked | Prompts / task | Median prompt latency | Reflexive approvals | Raw TLX |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [c, x] of Object.entries(a.perCondition)) {
    L.push(`| ${c} | ${x.injected.stopped}/${x.injected.n} = ${pct(x.injected.rate)} (95% CI ${pct(x.injected.lo)}-${pct(x.injected.hi)}) | ${x.maliciousApprovals} | ${x.benign.blocked}/${x.benign.n} = ${pct(x.benign.rate)} | ${x.promptsPerScenario?.toFixed(1) ?? 'n/a'} | ${x.medianPromptLatencyMs === null ? 'n/a' : `${(x.medianPromptLatencyMs / 1000).toFixed(1)} s`} | ${x.reflexiveApprovals} | ${x.tlx?.toFixed(0) ?? 'n/a'} |`);
  }
  L.push('\nPaired within participants (difference in the share of injected actions stopped; bootstrap 95% interval):\n');
  L.push('| Comparison | Participants | Mean difference | 95% interval | Better / worse / same | TLX difference |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  for (const [k, p] of Object.entries(a.paired)) L.push(`| ${k} | ${p.participants} | ${pct(p.stopRateDifference.mean)} | ${pct(p.stopRateDifference.lo)} to ${pct(p.stopRateDifference.hi)} | ${p.better} / ${p.worse} / ${p.same} | ${p.tlxDifference.mean === null ? 'n/a' : p.tlxDifference.mean.toFixed(1)} |`);
  L.push('\nPooled rates treat each action as independent, which overstates certainty; rely on the paired rows. With few participants, report the per-person values too.');
  return L.join('\n');
}
