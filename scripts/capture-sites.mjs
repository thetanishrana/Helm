// Render every page in scenarios-src/sites.mjs in Chrome and save what the agent's snapshot command
// returns (fixtures for scripts/make-scenarios.mjs). Needs spikes/agent-e2e installed for playwright-cli.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { renderAll } from '../scenarios-src/sites.mjs';

const execP = promisify(execFile);
const outDir = new URL('../test/fixtures/sites/', import.meta.url).pathname; mkdirSync(outDir, { recursive: true });
const pages = Object.fromEntries(renderAll().map((p) => [p.name, p.html]));
const server = http.createServer((q, r) => { const n = decodeURIComponent(q.url.slice(1)); pages[n] ? r.writeHead(200, { 'content-type': 'text/html' }).end(pages[n]) : r.writeHead(404).end(); });
await new Promise((ok) => server.listen(8898, '127.0.0.1', ok));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9222', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'helm-'))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await fetch('http://127.0.0.1:9222/json/version'); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
const cli = new URL('../spikes/agent-e2e/node_modules/.bin/playwright-cli', import.meta.url).pathname;
const run = async (...a) => (await execP(cli, a, { timeout: 60000 })).stdout;
await run('attach', '--cdp=http://127.0.0.1:9222');
for (const name of Object.keys(pages)) { await run('goto', `http://127.0.0.1:8898/${encodeURIComponent(name)}`); writeFileSync(join(outDir, `${name}.txt`), await run('snapshot')); console.log('saved', name); }
try { await run('detach'); } catch {}
chrome.kill(); server.close(); process.exit(0);
