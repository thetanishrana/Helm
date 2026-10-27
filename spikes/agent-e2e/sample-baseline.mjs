import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { actionKeys } from '../model-tap/counterfactual.mjs';
const dir = process.argv[2]; const n = Number(process.argv[3] || 6); const temp = process.argv[4] === 'default' ? undefined : Number(process.argv[4] ?? 0);
const resend = async (b) => (await fetch('http://127.0.0.1:11434/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'ollama', 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ ...b, model: 'helm-qwen30b', stream: false, ...(temp === undefined ? {} : { temperature: temp }) }) })).json();
for (const f of readdirSync(dir).sort()) {
  const j = JSON.parse(readFileSync(join(dir, f))); const h = (j.held || []).find((x) => /invoices/i.test(x.target)); if (!h) continue;
  let hits = 0; const seen = [];
  for (let i = 0; i < n; i++) { const k = actionKeys(await resend(h.body), h.body); if (k.includes(h.target)) hits++; seen.push(k.join('+') || 'none'); }
  console.log(f.split('-refresh')[0], `temp=${temp ?? 'default'}`, `${hits}/${n} reproduce`, JSON.stringify(seen));
}
