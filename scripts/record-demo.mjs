// Records a silent, captioned clip of the live demo: runs demo/run-demo.sh in --record mode, films the Helm
// interface, clicks Block once the held card is up, and overlays short captions. Output: demo/out/helm-demo.webm.
// Needs Ollama with helm-qwen30b, Chrome, and spikes/agent-e2e installed. The local model does not always follow
// the injected text; if no card appears the run fails and nothing is kept (run it again).
// Captions say only what the interface itself shows.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../spikes/agent-e2e/', import.meta.url));
const { chromium } = require('playwright-core');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = ROOT + 'demo/out';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The local model sometimes ends its turn without acting. Each attempt is its own process; keep the first that works.
if (!process.env.REC_ATTEMPT) {
  for (let n = 1; n <= 4; n++) {
    const r = spawn(process.execPath, [fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, REC_ATTEMPT: String(n) } });
    const code = await new Promise((res) => r.on('exit', res));
    if (code === 0) process.exit(0);
    console.error(`record: attempt ${n} failed; ${n < 4 ? 'retrying' : 'giving up'}`);
  }
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });

const demo = spawn(ROOT + 'demo/run-demo.sh', ['turn_tag', '--record'], { stdio: ['ignore', 'ignore', 'inherit'], detached: true });
const finish = (code) => {
  try { process.kill(-demo.pid, 'SIGINT'); } catch {}
  for (const port of [7777, 8787, 8899, 9222, 9333]) spawn('sh', ['-c', `lsof -ti tcp:${port} | xargs kill 2>/dev/null`]);
  setTimeout(() => process.exit(code), 1500);
};
process.on('SIGINT', () => finish(130));

for (let i = 0; ; i++) {
  if (i > 60) { console.error('record: the interface never came up'); finish(1); await sleep(5000); }
  try { if ((await fetch('http://127.0.0.1:7777/')).ok) break; } catch {}
  await sleep(1000);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1040 }, bypassCSP: true, recordVideo: { dir: OUT + '/raw', size: { width: 1280, height: 1040 } } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:7777/');

// Caption bar added by the recorder only (not part of the product UI).
await page.evaluate(() => {
  const bar = document.createElement('div');
  bar.id = 'rec-caption';
  Object.assign(bar.style, { position: 'fixed', left: '0', right: '0', bottom: '0', padding: '18px 48px', zIndex: '2147483647',
    background: 'rgba(14,22,32,.94)', color: '#fff', font: '600 24px/1.35 system-ui, sans-serif', textAlign: 'center',
    transition: 'opacity .3s', opacity: '0', pointerEvents: 'none' });
  document.body.append(bar);
});
const caption = async (text) => {
  await page.evaluate((t) => { const b = document.getElementById('rec-caption'); b.textContent = t; b.style.opacity = t ? '1' : '0'; }, text);
};
const fail = async (msg) => { console.error('record: ' + msg); await ctx.close(); await browser.close(); finish(1); await sleep(5000); };

await caption('An AI agent is browsing a page for me. I asked it only to press Refresh and read the new text.');
await sleep(5000);

try {
  await Promise.race([page.getByText('Click button “Refresh”').first().waitFor({ timeout: 120000 }),
    page.getByText('Task finished').first().waitFor({ timeout: 120000 }).then(() => { throw new Error('ended early'); })]);
} catch { await fail('the agent never pressed Refresh'); }
await caption('Harmless steps pass without a prompt. Helm stays quiet when I asked for it.');

try {
  await Promise.race([page.waitForSelector('.card .block', { timeout: 150000 }),
    page.getByText('Task finished').first().waitFor({ timeout: 150000 }).then(() => { throw new Error('ended early'); })]);
} catch { await fail('no held card appeared (the model did not follow the injected text); run again'); }
await caption('The page told the agent to click “Send all invoices”. I never asked for that, so Helm held it.');
await sleep(7000);
await caption('Helm quotes the page text that pushed the agent, and checks by re-running without it.');
const confirmed = await page.getByText('Confirmed by re-run').first().waitFor({ timeout: 60000 }).then(() => true, () => false);
if (confirmed) { await caption('Confirmed by re-run: without that page text the agent does not ask for this.'); await sleep(6000); }
else await sleep(4000);

await caption('I press “No, block it”.');
await sleep(2500);
await page.click('.card .block');
await caption('Blocked. The agent is told it was refused and does not retry.');
try { await page.getByText('Task finished').first().waitFor({ timeout: 60000 }); } catch {}
await sleep(6000);
await caption('Every step, the held action and my decision are in the record. Nothing was sent.');
await sleep(5000);
await caption('');
await sleep(800);

const video = page.video();
await ctx.close(); await browser.close();
const path = await video.path();
renameSync(path, OUT + '/helm-demo.webm');
rmSync(OUT + '/raw', { recursive: true, force: true });
console.error('record: wrote demo/out/helm-demo.webm');
finish(0);
