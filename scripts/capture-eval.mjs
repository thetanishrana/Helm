// Render each eval-pages/<set>/<id>/page.html in Chrome and save the agent-style snapshot next to it.
// node scripts/capture-eval.mjs eval-pages/heldout
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import http from 'node:http';

const dir = resolve(process.argv[2] || 'eval-pages/heldout');
const ids = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(dir, d.name, 'page.html'))).map((d) => d.name);
if (!ids.length) { console.error(`no <id>/page.html found under ${dir}`); process.exit(1); }
const execP = promisify(execFile);
const server = http.createServer((q, r) => { const id = decodeURIComponent(q.url.split('?')[0].slice(1)); const f = join(dir, id, 'page.html'); ids.includes(id) ? r.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync(f)) : r.writeHead(404).end(); });
await new Promise((ok) => server.listen(8897, '127.0.0.1', ok));
const chrome = spawn(process.env.HELM_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9222', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'helm-'))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await fetch('http://127.0.0.1:9222/json/version'); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
const cli = resolve('spikes/agent-e2e/node_modules/.bin/playwright-cli');
const run = async (...a) => (await execP(cli, a, { timeout: 60000 })).stdout;
await run('attach', '--cdp=http://127.0.0.1:9222');
for (const id of ids) { await run('goto', `http://127.0.0.1:8897/${encodeURIComponent(id)}`); writeFileSync(join(dir, id, 'snapshot.txt'), await run('snapshot')); console.log('snapshot saved:', id); }
try { await run('detach'); } catch {}
chrome.kill(); server.close(); process.exit(0);
