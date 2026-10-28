// Drives the study UI in a real browser as a scripted "participant", to test the whole pipeline.
// The data it produces is SIMULATED and says nothing about people.
// node scripts/simulate-participant.mjs --port 7788 --policy mixed [--seed 1]
import { chromium } from '../spikes/cdp-proxy/node_modules/playwright-core/index.mjs';

const a = process.argv.slice(2); const get = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const port = get('--port', '7788'); const policy = get('--policy', 'mixed'); let seed = Number(get('--seed', '1'));
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const decide = {   // what the simulated person does with: a Helm card, a plain command prompt, a stop window
  helm: { C: () => 'block', B: () => 'approve', A: () => 'wait' },
  mixed: { C: () => 'block', B: () => (rnd() < 0.5 ? 'deny' : 'approve'), A: () => (rnd() < 0.3 ? 'stop' : 'wait') },
  approver: { C: () => 'allow', B: () => 'approve', A: () => 'wait' },
}[policy];

const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(`http://127.0.0.1:${port}/`);
const open = (sel) => p.$eval(sel, (d) => d.open).catch(() => false);
const press = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e || e.disabled) return false; e.click(); return true; }, sel);   // JS click: dialog animations make real clicks flaky
const handledStop = new Set();
const t0 = Date.now(); let debriefSeen = false;
while (Date.now() - t0 < 15 * 60_000) {
  if (await open('#consent')) { await p.evaluate(() => { const c = document.getElementById('consent-ok'); c.checked = true; c.dispatchEvent(new Event('change')); }); await press('#consent-go'); await p.waitForTimeout(200); }
  else if (await open('#intro')) { await press('#intro-start'); await p.waitForTimeout(200); }
  else if (await open('#tlx')) { await press('#tlx-form button[type=submit]'); await p.waitForTimeout(200); }
  else if (await open('#debrief')) { debriefSeen = true; break; }
  else {
    const card = await p.$('.card');
    if (card) {
      const plain = await p.$('.card.plain'); const c = plain ? 'B' : 'C'; const act = decide[c]();
      const sel = act === 'block' || act === 'deny' ? '.card .block' : '.card .allow'; for (let k = 0; k < 50 && !(await press(sel)); k++) await p.waitForTimeout(100);
      await p.waitForTimeout(150);
    } else if (await p.$('#stopbar:not([hidden])')) {
      const key = await p.$eval('#stop-cmd', (e) => e.textContent) + (await p.$eval('#timeline', (e) => e.children.length));
      if (!handledStop.has(key)) { handledStop.add(key); if (decide.A() === 'stop') await press('#stop-btn'); }
      await p.waitForTimeout(150);
    } else await p.waitForTimeout(100);
  }
}
console.log(JSON.stringify({ policy, finished: debriefSeen, pageErrors: errors.length, errors: errors.slice(0, 2) }));
await b.close();
