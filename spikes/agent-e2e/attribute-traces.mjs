// Run counterfactual attribution on saved held requests (from e2e-attack runs) against the local model.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { attribute } from '../model-tap/counterfactual.mjs';

const dir = process.argv[2]; const outFile = process.argv[3];
const MODEL = process.env.MODEL || 'helm-qwen30b';
const resend = async (b) => {
  const r = await fetch('http://127.0.0.1:11434/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'ollama', 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ ...b, model: MODEL, stream: false }) });
  return r.json();
};
const rows = [];
for (const f of readdirSync(dir).sort()) {
  const j = JSON.parse(readFileSync(join(dir, f)));
  for (const h of (j.held || []).filter((x) => /invoices/i.test(x.target))) {
    const t0 = Date.now();
    const r = await attribute({ body: h.body, target: h.target, resend, heuristicCause: h.heuristicCause });
    const row = { run: f.split('-refresh')[0], target: h.target, verdict: r.verdict, baseline: r.baseline.join('/'), calls: r.calls, secs: Math.round((Date.now() - t0) / 1000),
      confirmedCause: r.cause?.text, heuristicCause: h.heuristicCause?.text?.slice(0, 160), agree: Boolean(r.cause && h.heuristicCause && (r.cause.text.startsWith(h.heuristicCause.text.slice(0, 40)) || h.heuristicCause.text.startsWith(r.cause.text.slice(0, 40)))),
      candidates: r.candidates.map((c) => `${c.persists ? 'keeps' : 'DROPS'}: ${c.text.slice(0, 60)}` ) };
    rows.push(row); console.log(JSON.stringify({ run: row.run, verdict: row.verdict, baseline: row.baseline, agree: row.agree, calls: row.calls, secs: row.secs }));
  }
}
writeFileSync(outFile, JSON.stringify(rows, null, 1));
const n = rows.length; const by = {}; for (const r of rows) by[r.verdict] = (by[r.verdict] || 0) + 1;
console.log('SUMMARY', n, JSON.stringify(by), 'agree with heuristic:', rows.filter((r) => r.agree).length);
