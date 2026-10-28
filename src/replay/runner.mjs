// Runs a list of scenarios in one condition for one participant, one after the other, writing a
// result file per scenario. The server's hooks always talk to whichever scenario is current.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReplayEngine, scenarioHash } from './engine.mjs';

export function makeRunner({ scenarios, condition, participant, store, approvals, outDir = 'study-data', stopWindowMs, sleep, tlxWaitMs = 5 * 60_000 }) {
  let current = null;
  const hooks = {
    start: () => current?.begin() ?? false,
    stop: () => current?.stop() ?? false,
    tlx: (a) => current?.submitTlx(a) ?? false,
  };
  async function run() {
    mkdirSync(outDir, { recursive: true }); const results = [];
    for (const sc of scenarios) {
      current = new ReplayEngine({ scenario: sc, condition, store, approvals, participant, stopWindowMs, sleep });
      const r = await current.run();
      await current.waitTlx(tlxWaitMs);
      r.tlx = current.tlx; r.scenarioHash = scenarioHash(sc); r.finishedAt = new Date(store.now()).toISOString();
      approvals.closeAll();
      writeFileSync(join(outDir, `${participant}-${condition}-${sc.id}.json`), JSON.stringify(r, null, 1));
      results.push(r);
    }
    store.add('study.done', {});
    return results;
  }
  return { run, hooks };
}
