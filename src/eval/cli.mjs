#!/usr/bin/env node
// node src/eval/cli.mjs detect [--set dev|heldout|all] [--heldout-dir eval-pages/heldout] [--out eval-results]
// node src/eval/cli.mjs validate [dir]      check manifests and report pages that cannot be scored
// node src/eval/cli.mjs capture [dir]       render pages in Chrome and save their snapshots
// node src/eval/cli.mjs agent --agent ollama:helm-qwen30b [--set dev|heldout|multistep|all] [--modes measure,block] [--reps 2]
//        [--only id,id] [--limit N] [--out eval-results/agent] [--no-resume] [--dry-run] [--allow-subscription]
// node src/eval/cli.mjs agent-report [dir]  re-print the tables from saved run files
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { devSet } from './dev-set.mjs';
import { multistepSet } from './multistep-set.mjs';
import { loadEvalDir } from './manifest.mjs';
import { evaluateEntry, summarize, report } from './detect.mjs';

const [cmd = 'detect', ...rest] = process.argv.slice(2);
const opt = (k, d) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : d);
const heldoutDir = opt('--heldout-dir', 'eval-pages/heldout');

if (cmd === 'capture') { const r = spawnSync('node', ['scripts/capture-eval.mjs', rest[0] || heldoutDir], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
if (cmd === 'validate') {
  const { entries, problems } = loadEvalDir(rest[0] || heldoutDir, { set: 'heldout' });
  console.log(`${entries.length} page(s) ready`); for (const p of problems) console.log(`  problem: ${p}`); process.exit(problems.length ? 1 : 0);
}
if (cmd === 'detect') {
  const set = opt('--set', 'all'); const entries = []; const notes = [];
  if (set !== 'heldout') entries.push(...devSet());
  if (set !== 'dev') {
    const h = loadEvalDir(heldoutDir, { set: 'heldout' }); entries.push(...h.entries);
    if (!h.entries.length) notes.push(`No held-out pages found in ${heldoutDir}, so only the in-sample dev set was scored. Held-out numbers are the ones to quote.`);
    for (const p of h.problems) notes.push(`held-out problem: ${p}`);
  }
  const results = entries.map(evaluateEntry); const summary = summarize(results);
  const md = report(summary, { notes: [...notes, 'The dev set is what the explainer was built against: its numbers are in-sample. Interception on attack pages is largely driven by the risk rule (an unrequested "Send/Transfer/Share…" click always pauses), so it is not evidence the injected text was understood; attribution is the informative column. Intervals are Wilson 95% and treat pages as independent draws from some population of pages, which these hand-written sets are not.'] });
  const out = opt('--out', 'eval-results'); mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(out, `detect-${stamp}.json`), JSON.stringify({ summary, results }, null, 1)); writeFileSync(join(out, `detect-${stamp}.md`), md + '\n');
  console.log(md); process.exit(0);
}
if (cmd === 'agent' || cmd === 'agent-report') {
  const { parseAgent, runAgentEval, loadRuns, aggregate, agentReport } = await import('./agent.mjs');
  if (cmd === 'agent-report') { const rs = loadRuns(rest[0] || 'eval-results/agent'); console.log(agentReport(aggregate(rs))); process.exit(0); }
  const agent = parseAgent(opt('--agent', 'ollama:helm-qwen30b'));
  if (agent.kind === 'claude' && !rest.includes('--allow-subscription')) { console.error('claude agents use your Claude subscription (about 4 model requests per run). Re-run with --allow-subscription to confirm.'); process.exit(2); }
  const set = opt('--set', 'dev'); const entries = [];
  if (set === 'multistep') entries.push(...multistepSet());
  if (set === 'dev' || set === 'all') entries.push(...devSet());
  if (set === 'heldout' || set === 'all') entries.push(...loadEvalDir(heldoutDir, { set: 'heldout' }).entries);
  let pick = entries.filter((e) => e.html); const only = opt('--only', null);
  if (only) pick = pick.filter((e) => only.split(',').includes(e.id)); const limit = Number(opt('--limit', 0)); if (limit) pick = pick.slice(0, limit);
  const modes = opt('--modes', 'measure').split(','); const reps = Number(opt('--reps', 1));
  if (!pick.length) { console.error('no pages with HTML to run (held-out pages need page.html and snapshot.txt)'); process.exit(1); }
  const runs = pick.length * modes.length * reps;
  console.error(`${pick.length} pages x ${modes.join('+')} x ${reps} rep(s) = ${runs} runs with ${agent.kind}:${agent.model}${agent.kind === 'ollama' ? ' (about 0.5-4 minutes each on this machine)' : ` (about ${runs * 4} subscription requests)`}`);
  if (rest.includes('--dry-run')) process.exit(0);
  const out = opt('--out', 'eval-results/agent'); const results = await runAgentEval({ entries: pick, agent, modes, reps, outDir: out, resume: !rest.includes('--no-resume') });
  const md = agentReport(aggregate(loadRuns(out))); writeFileSync(join(out, 'report.md'), md + '\n'); console.log(md); process.exit(0);
}
console.error('usage: node src/eval/cli.mjs detect|validate|capture|agent|agent-report [options]'); process.exit(2);
