// A whole participant session: consent, a practice task, three condition blocks, debrief.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRunner } from './runner.mjs';
import { consent as consentText, debrief as debriefText, BLOCK_HELP } from './texts.mjs';

export async function runStudySession({ plan, participant, scenarios, store, approvals, outDir = 'study-data', stopWindowMs, sleep, tlxWaitMs, hooks = {}, contact, consentWaitMs = 30 * 60_000 }) {
  mkdirSync(outDir, { recursive: true });
  // Consent first. Nothing is recorded or replayed before the person agrees.
  let agree; const consent = new Promise((ok) => (agree = ok));
  hooks.consent = (a) => { if (a?.agree === true) { agree(true); return true; } return false; };
  store.meta = { mode: 'replay', phase: 'consent', participant };
  store.add('study.consent', { text: consentText(contact) });
  const agreed = await Promise.race([consent, new Promise((ok) => setTimeout(() => ok(false), consentWaitMs))]);
  if (!agreed) { store.add('study.declined', {}); return { declined: true, results: [] }; }
  writeFileSync(join(outDir, `${participant}-consent.json`), JSON.stringify({ participant, agreedAt: new Date(store.now()).toISOString(), plan }, null, 1));

  const results = [];
  const run = async (list, condition, block, help) => {
    const r = makeRunner({ scenarios: list, condition, participant, store, approvals, outDir, stopWindowMs, sleep, tlxWaitMs, block, help, hooks, emitDone: false });
    results.push(...await r.run());
  };
  // Practice in the first block's condition, so the first interface they meet is the one they practise on.
  if (plan.practice) await run([scenarios[plan.practice]], plan.blocks[0].condition, { n: 0, of: plan.blocks.length }, BLOCK_HELP[plan.blocks[0].condition]);
  for (const [i, b] of plan.blocks.entries()) await run(b.scenarios.map((id) => scenarios[id]), b.condition, { n: i + 1, of: plan.blocks.length }, BLOCK_HELP[b.condition]);
  store.add('study.debrief', { text: debriefText(contact) });
  store.add('study.done', {});
  return { declined: false, results };
}
