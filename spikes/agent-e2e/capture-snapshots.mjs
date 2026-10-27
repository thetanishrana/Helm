// Render each attack page in Chrome and save what the agent's snapshot command returns,
// so the explainer can be evaluated on real snapshots without running any model.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { PAGES } from './attack-pages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../model-tap/fixtures/snapshots'); mkdirSync(outDir, { recursive: true });
let current = 'clean';
const page = http.createServer((q, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGES[q.url === '/faq' ? 'faq' : current].html()));
await new Promise((ok) => page.listen(8899, '127.0.0.1', ok));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9222', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'helm-'))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await fetch('http://127.0.0.1:9222/json/version'); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
const cli = join(here, 'node_modules/.bin/playwright-cli');
const run = async (...a) => (await execFileP(cli, a, { encoding: 'utf8', timeout: 60000 })).stdout;   // async: the page server lives in this process
await run('attach', '--cdp=http://127.0.0.1:9222');
for (const t of Object.keys(PAGES).filter((k) => k !== 'faq')) {
  current = t; await run('goto', 'http://127.0.0.1:8899/');
  writeFileSync(join(outDir, `${t}.txt`), await run('snapshot')); console.log('saved', t);
}
try { await run('detach'); } catch {}
chrome.kill(); page.close(); process.exit(0);
