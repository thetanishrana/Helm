// Silent captioned clip of the several-agent interface, from the SCRIPTED preview (`ui-preview.mjs fleet`), not a live run:
// three agents, one waiting on a decision. The first caption says so. Output: demo/out/helm-fleet-preview.webm
// Needs Chrome and spikes/agent-e2e installed.  node scripts/record-fleet-preview.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../spikes/agent-e2e/', import.meta.url));
const { chromium } = require('playwright-core');
const ROOT = fileURLToPath(new URL('..', import.meta.url)); const OUT = ROOT + 'demo/out'; const PORT = 7995;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true }); rmSync(OUT + '/raw-fleet', { recursive: true, force: true });
const srv = spawn('node', [ROOT + 'scripts/ui-preview.mjs', 'fleet', '--port', String(PORT)], { stdio: 'ignore' }); await sleep(1500);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1040 }, bypassCSP: true, recordVideo: { dir: OUT + '/raw-fleet', size: { width: 1280, height: 1040 } } });
const page = await ctx.newPage(); await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForSelector('.card');
await page.evaluate(() => {
  const bar = document.createElement('div'); bar.id = 'rec-caption';
  Object.assign(bar.style, { position: 'fixed', left: '0', right: '0', bottom: '0', padding: '18px 48px', zIndex: '2147483647', background: 'rgba(14,22,32,.94)', color: '#fff', font: '600 24px/1.35 system-ui, sans-serif', textAlign: 'center', transition: 'opacity .3s', opacity: '0', pointerEvents: 'none' });
  document.body.append(bar);
});
const caption = (t) => page.evaluate((x) => { const b = document.getElementById('rec-caption'); b.textContent = x; b.style.opacity = x ? '1' : '0'; }, t);
await caption('Scripted preview, not a live run: three agents supervised in one interface.'); await sleep(5000);
await caption('One chip per agent. The one that needs a decision is marked; the others keep working.'); await sleep(5500);
await caption('The decision names its agent and that agent’s request, and quotes the page text that pushed it.'); await sleep(6500);
await page.locator('#fleet [data-agent="research-agent"]').click();
await caption('Choosing an agent shows just its course. The decision stays visible.'); await sleep(5000);
await page.locator('#fleet [data-agent=""]').click(); await caption('I press “No, block it”.'); await sleep(2500);
await page.locator('.card .block').click(); await caption('Blocked: only the Invoice agent’s course shows it. The other agents are untouched.'); await sleep(6000);
await page.locator('#receipt-btn').click(); await caption('One receipt, with a section for each agent.'); await sleep(5000);
await caption(''); await sleep(600);
const video = page.video(); await ctx.close(); await browser.close(); srv.kill();
renameSync(await video.path(), OUT + '/helm-fleet-preview.webm'); rmSync(OUT + '/raw-fleet', { recursive: true, force: true });
console.error('record: wrote demo/out/helm-fleet-preview.webm');
