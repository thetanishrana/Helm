#!/usr/bin/env node
// Does a model judge name the injected passage when the heuristics do not?
//   node src/eval/judge-eval.mjs <eval-pages dir>... [--model claude-haiku-5-5] [--out DIR]
// For each attack page: the heuristic explanation first; where it names no cause (or only a weak one) and would
// interrupt, the judge is asked. A cause counts as correct when it matches the injected text (same test as detect).
// Uses the owner's Claude login through the CLI: one request per page that needs it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEvalDir } from './manifest.mjs';
import { run, causeMatches } from './detect.mjs';
import { judgeCause, claudeAsk } from '../model/judge.mjs';
import { pageChunks } from '../model/explain.mjs';
import { wilson } from '../replay/analyze.mjs';

const args = process.argv.slice(2); const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const dirs = args.filter((a, i) => !a.startsWith('--') && !(i && ['--model', '--out'].includes(args[i - 1])));
const model = opt('--model', 'claude-haiku-5-5'); const out = opt('--out', 'eval-results/judge');
if (!dirs.length) { console.error('usage: node src/eval/judge-eval.mjs <eval-pages dir>... [--model M] [--out DIR]'); process.exit(2); }
const ask = claudeAsk(model); const rows = [];
for (const dir of dirs) {
  const { entries } = loadEvalDir(dir, { set: 'heldout' });
  for (const e of entries.filter((x) => x.kind === 'attack')) {
    const r = run(e, e.goal); if (!r.found) { rows.push({ dir, id: e.id, problem: 'goal not found' }); continue; }
    const { ex, req } = r; const heur = Boolean(ex.cause && !ex.cause.weak && causeMatches(ex.cause.text, e.injection.text)) || Boolean(ex.cause && ex.cause.weak && causeMatches(ex.cause.text, e.injection.text));
    const row = { dir, id: e.id, interrupt: ex.interrupt, heuristicNamed: Boolean(ex.cause), heuristicCorrect: heur, judged: false, judgeNamed: false, judgeCorrect: false, finalCorrect: heur, judgeText: null };
    if (ex.interrupt && (!ex.cause || ex.cause.weak) && !heur) {
      const j = await judgeCause({ what: ex.action.what, label: ex.action.label, userPrompts: req.userPrompts, chunks: pageChunks(req), ask });
      row.judged = true; if (j) { row.judgeNamed = true; row.judgeText = j.passage.text.slice(0, 160); row.judgeCorrect = causeMatches(j.passage.text, e.injection.text); row.finalCorrect = row.judgeCorrect; }
    }
    rows.push(row); console.error(`${dir.split('/').pop()}/${e.id}: heuristic ${row.heuristicCorrect ? 'right' : row.heuristicNamed ? 'wrong/weak' : 'none'}${row.judged ? `, judge ${row.judgeNamed ? (row.judgeCorrect ? 'right' : 'WRONG') : 'none'}` : ''}`);
  }
}
const n = rows.filter((r) => !r.problem).length; const k = (f) => rows.filter(f).length;
const w = (x) => { const c = wilson(x, n); return `${x}/${n} = ${Math.round(100 * x / n)}% (95% CI ${Math.round(100 * c.lo)}%-${Math.round(100 * c.hi)}%)`; };
const summary = { model, dirs, attackPages: n, heuristicCorrect: k((r) => r.heuristicCorrect), withJudgeCorrect: k((r) => r.finalCorrect), judgeCalls: k((r) => r.judged), judgeNamedWrong: k((r) => r.judged && r.judgeNamed && !r.judgeCorrect), judgeNone: k((r) => r.judged && !r.judgeNamed) };
const md = `| Cause named correctly | Heuristics alone | With judge (${model}) | Judge calls | Judge named a wrong passage | Judge named none |\n| --- | --- | --- | --- | --- | --- |\n| ${n} attack pages | ${w(summary.heuristicCorrect)} | ${w(summary.withJudgeCorrect)} | ${summary.judgeCalls} | ${summary.judgeNamedWrong} | ${summary.judgeNone} |\n`;
mkdirSync(out, { recursive: true }); const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(join(out, `judge-${stamp}.json`), JSON.stringify({ summary, rows }, null, 1)); writeFileSync(join(out, `judge-${stamp}.md`), md);
console.log(md);
