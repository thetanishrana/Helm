#!/usr/bin/env node
// helm replay --condition A|B|C --participant ID [--scenarios id,id|injected|benign|all] [options]
// Replays recorded agent runs to a person in one study condition and saves their decisions.
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Store } from '../store.mjs';
import { Approvals } from '../approvals.mjs';
import { startServer } from '../server.mjs';
import { CONDITIONS, loadScenarios } from './scenario.mjs';
import { makeRunner } from './runner.mjs';

const HELP = `usage: helm replay --condition A|B|C --participant ID [options]
  --scenarios LIST    comma-separated scenario ids, or injected | benign | all (default all)
  --order shuffle     shuffle the scenarios (seeded by the participant id)
  --stop-window S     condition A: seconds the person has to press Stop (default 8)
  --timeout S         conditions B/C: seconds before an unanswered prompt is denied (default 120)
  --out-dir DIR       result files (default ./study-data)
  --ui-port N         web UI port (default 7777)
  --fast              shorten the agent's pauses (for trying it out, not for the study)
  --contact TEXT      how participants reach the researcher (shown in the consent and debrief text). Required for a real
                      session: without it only a --fast dry run is allowed
  --open              open the UI in your browser
  --index N           run the whole counterbalanced session for participant number N (consent, practice,
                      three condition blocks, debrief); ignores --condition and --scenarios
conditions (single-block mode): ${Object.entries(CONDITIONS).map(([k, v]) => `${k} = ${v}`).join('\n            ')}`;

const o = { ui: 7777, stopWindow: 8, timeout: 120, outDir: 'study-data', scenarios: 'all' };
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i++) {
  const f = a[i], v = () => a[++i];
  if (f === 'replay') continue;
  else if (f === '--condition') o.condition = v(); else if (f === '--participant') o.participant = v();
  else if (f === '--scenarios') o.scenarios = v(); else if (f === '--order') o.order = v();
  else if (f === '--stop-window') o.stopWindow = Number(v()); else if (f === '--timeout') o.timeout = Number(v());
  else if (f === '--out-dir') o.outDir = v(); else if (f === '--ui-port') o.ui = Number(v());
  else if (f === '--contact') o.contact = v(); else if (f === '--fast') o.fast = true; else if (f === '--open') o.open = true; else if (f === '--index') o.index = Number(v());
  else { console.error(`unknown option ${f}\n${HELP}`); process.exit(2); }
}
if (!o.fast && !o.contact) { console.error('A real session needs --contact "<how participants reach you>" (it appears in the consent text); use --fast for a dry run.'); process.exit(2); }
if (!o.participant || (o.index === undefined && !CONDITIONS[o.condition])) { console.error(HELP); process.exit(2); }

const all = loadScenarios(fileURLToPath(new URL('../../scenarios/', import.meta.url)));
const pick = (id) => all[id] ?? (console.error(`unknown scenario ${id}`), process.exit(2));
const list = o.scenarios === 'all' ? Object.values(all) : o.scenarios === 'injected' ? Object.values(all).filter((s) => s.injected)
  : o.scenarios === 'benign' ? Object.values(all).filter((s) => !s.injected) : o.scenarios.split(',').map(pick);
if (o.order === 'shuffle') {   // deterministic per participant so a session can be resumed
  let h = 0; for (const c of o.participant) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
}

const store = new Store(); const approvals = new Approvals({ store, timeoutMs: o.timeout * 1000 });
import { planFor } from './plan.mjs';
import { runStudySession } from './session.mjs';
const sleepFn = o.fast ? (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 250))) : undefined;
const hooks = {};
const runner = o.index !== undefined ? null : makeRunner({ scenarios: list, condition: o.condition, participant: o.participant, store, approvals, outDir: o.outDir, stopWindowMs: o.stopWindow * 1000,
  sleep: sleepFn, hooks });
const ui = await startServer({ store, approvals, port: o.ui, hooks });
const url = `http://127.0.0.1:${ui.port}/`;
console.error(`helm replay: condition ${o.condition}, participant ${o.participant}, ${list.length} scenarios (${list.map((s) => s.id).join(', ')})\nUI ${url}   results ${o.outDir}/`);
if (o.open) spawn('open', [url], { stdio: 'ignore' });
let results;
if (o.index !== undefined) {
  const plan = planFor(o.index, all); console.error(`plan: conditions ${plan.order.join(' -> ')}; ${plan.blocks.map((b) => `${b.condition}: ${b.scenarios.join(', ')}`).join(' | ')}`);
  const r = await runStudySession({ plan, participant: o.participant, scenarios: all, store, approvals, outDir: o.outDir, stopWindowMs: o.stopWindow * 1000, sleep: sleepFn, hooks, contact: o.contact });
  if (r.declined) { console.error('participant declined consent; nothing recorded.'); process.exit(0); }
  results = r.results.filter((x) => !x.practice);
} else results = await runner.run();
const sum = (k) => results.reduce((n, r) => n + r.metrics[k], 0);
console.error(`done. injected actions ${sum('injectedActions')}: stopped ${sum('injectedStopped')}, approved ${sum('maliciousApprovals')}; benign actions ${sum('benignActions')}: blocked ${sum('benignBlocked')}; prompts shown ${sum('prompts')}`);
setTimeout(() => { ui.close(); process.exit(0); }, 3000);
