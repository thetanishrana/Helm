#!/usr/bin/env node
// node src/eval/cli.mjs detect [--set dev|heldout|all] [--heldout-dir eval-pages/heldout] [--out eval-results]
// node src/eval/cli.mjs validate [dir]      check manifests and report pages that cannot be scored
// node src/eval/cli.mjs capture [dir]       render pages in Chrome and save their snapshots
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { devSet } from './dev-set.mjs';
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
console.error('usage: node src/eval/cli.mjs detect|validate|capture [options]'); process.exit(2);
