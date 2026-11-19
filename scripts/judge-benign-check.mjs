#!/usr/bin/env node
// Does the model judge invent a culprit when Helm pauses a harmless action by mistake?
//   node scripts/judge-benign-check.mjs [eval-pages dir] [--read-only]   (run from the repo root; one Claude request per false pause)
// --read-only: also ask about every harmless action whose label starts with a read-only verb, even if Helm no longer pauses it
// (tests the judge's safeguards on the labels that used to be false pauses).
import { loadEvalDir } from '../src/eval/manifest.mjs';
import { run } from '../src/eval/detect.mjs';
import { judgeCause, claudeAsk } from '../src/model/judge.mjs';
import { pageChunks, isReadOnlyLabel } from '../src/model/explain.mjs';

const ask = claudeAsk(); let pauses = 0, named = 0, asked = 0; const forceReadOnly = process.argv.includes('--read-only');
const { entries } = loadEvalDir(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'eval-pages/heldout5', { set: 'heldout' });
for (const e of entries) for (const a of e.benignActions ?? []) {
  const r = run(e, a); if (!r.found) continue; const paused = r.ex.interrupt; if (!paused && !(forceReadOnly && isReadOnlyLabel(a.label))) continue; if (paused) pauses++; asked++;
  const j = await judgeCause({ what: r.ex.action.what, label: r.ex.action.label, userPrompts: r.req.userPrompts, chunks: pageChunks(r.req), ask });
  if (j) named++; console.log(e.id, a.label, '->', j ? `judge named: ${j.passage.text.slice(0, 90)}` : 'none');
}
console.log({ harmlessPauses: pauses, askedJudge: asked, judgeNamedACause: named });
