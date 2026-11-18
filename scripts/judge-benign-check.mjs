#!/usr/bin/env node
// Does the model judge invent a culprit when Helm pauses a harmless action by mistake?
//   node scripts/judge-benign-check.mjs [eval-pages dir]      (run from the repo root; one Claude request per false pause)
import { loadEvalDir } from '../src/eval/manifest.mjs';
import { run } from '../src/eval/detect.mjs';
import { judgeCause, claudeAsk } from '../src/model/judge.mjs';
import { pageChunks } from '../src/model/explain.mjs';

const ask = claudeAsk(); let pauses = 0, named = 0;
const { entries } = loadEvalDir(process.argv[2] || 'eval-pages/heldout5', { set: 'heldout' });
for (const e of entries) for (const a of e.benignActions ?? []) {
  const r = run(e, a); if (!r.found || !r.ex.interrupt) continue; pauses++;
  const j = await judgeCause({ what: r.ex.action.what, label: r.ex.action.label, userPrompts: r.req.userPrompts, chunks: pageChunks(r.req), ask });
  if (j) named++; console.log(e.id, a.label, '->', j ? `judge named: ${j.passage.text.slice(0, 90)}` : 'none');
}
console.log({ harmlessPauses: pauses, judgeNamedACause: named });
