import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startProxy } from './proxy.mjs';

const HOLD = Number(process.env.HOLD_MS || 3000);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9222', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'helm-'))}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
const stop = () => chrome.kill();
process.on('exit', stop);

for (let i = 0; i < 50; i++) { try { await fetch('http://127.0.0.1:9222/json/version'); break; } catch { await new Promise(r => setTimeout(r, 200)); } }

const counts = {}; const clicks = []; const lat = [];
const server = await startProxy({ holdMs: HOLD, onEvent: (e) => {
  if (e.dir === 'c2b') counts[e.method] = (counts[e.method] || 0) + 1;
  if (e.semantic !== undefined) clicks.push(e);
} });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = browser.contexts()[0] ?? await browser.newContext();
const page = await ctx.newPage();
await page.setContent('<button id="send" onclick="document.title=\'sent\'">Send invoices</button>');

let t = Date.now();
await page.click('#send', { timeout: 15000 });
const clickMs = Date.now() - t;
const title = await page.title();

t = Date.now();
for (let i = 0; i < 20; i++) await page.evaluate(() => 1);
const evalAvg = (Date.now() - t) / 20;

console.log(JSON.stringify({ connectedOverProxy: true, titleAfterClick: title, clickMsWithHold: clickMs, holdMs: HOLD,
  semantic: clicks.find(c => c.semantic)?.semantic, avgEvalRoundTripMs: evalAvg, commandCounts: counts }, null, 1));
await browser.close(); server.close(); stop(); process.exit(0);
