// Gate 1 check: added latency per CDP command, direct vs through the proxy (p50/p95/p99, ms).
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startProxy } from '../../src/cdp/proxy.mjs';

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9222', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'helm-'))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await fetch('http://127.0.0.1:9222/json/version'); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
const proxy = await startProxy({ gate: async () => ({ action: 'allow' }), onEvent: () => {} });
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
async function measure(url, n = 1000) {
  const b = await chromium.connectOverCDP(url); const ctx = b.contexts()[0] ?? await b.newContext(); const page = await ctx.newPage();
  await page.setContent('<button id=b>x</button>');
  for (let i = 0; i < 50; i++) await page.evaluate(() => 1);   // warm up
  const t = [];
  for (let i = 0; i < n; i++) { const s = process.hrtime.bigint(); await page.evaluate(() => document.title); t.push(Number(process.hrtime.bigint() - s) / 1e6); }
  await page.close(); t.sort((a, b) => a - b); await b.close();
  return { p50: q(t, .5), p95: q(t, .95), p99: q(t, .99) };
}
const direct = await measure('http://127.0.0.1:9222'); const via = await measure('http://127.0.0.1:9333');
const f = (x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, +v.toFixed(2)]));
console.log(JSON.stringify({ direct: f(direct), viaProxy: f(via), addedMs: f({ p50: via.p50 - direct.p50, p95: via.p95 - direct.p95, p99: via.p99 - direct.p99 }) }));
proxy.close(); chrome.kill(); process.exit(0);
