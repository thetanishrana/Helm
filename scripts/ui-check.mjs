#!/usr/bin/env node
// Drives the real interface in Chrome and checks behaviour that screenshots cannot: the content-security-policy is not
// violated, nothing overflows at phone width, hold-to-confirm needs a real hold (pointer and keyboard), a script's click
// still works (the simulated participant relies on it), Block works, and the receipt opens.  Needs Chrome and
// spikes/agent-e2e installed (playwright-core).   node scripts/ui-check.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../spikes/agent-e2e/', import.meta.url));
const { chromium } = require('playwright-core');
const CHROME = process.env.HELM_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const results = []; const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
let port = 7800;
async function withPreview(state, fn) {
  const p = port++; const srv = spawn('node', ['scripts/ui-preview.mjs', state, '--port', String(p)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  try { await fn(`http://127.0.0.1:${p}/`); } finally { srv.kill(); }
}
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const open = async (url, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, ...opts }); const page = await ctx.newPage(); const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); }); page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
  await page.goto(url); await page.waitForSelector('.card', { timeout: 8000 }); await page.waitForTimeout(300);
  return { ctx, page, problems };
};
const pending = (page) => page.locator('.card').count();
try {
  await withPreview('paused', async (url) => {
    const { ctx, page, problems } = await open(url);
    ok('no console errors or CSP violations on load', problems.length === 0, problems.join(' | '));
    ok('tab title shows the pending count', (await page.title()) === '(1) Helm', await page.title());
    ok('block is the focused default', await page.evaluate(() => document.activeElement?.classList.contains('block')));
    const box = await page.locator('.card .allow').boundingBox();
    // an early release must not approve
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(450); await page.mouse.up(); await page.waitForTimeout(400);
    ok('releasing the hold early does not approve', (await pending(page)) === 1);
    // a full hold approves
    await page.mouse.down(); await page.waitForTimeout(1500); await page.mouse.up(); await page.waitForTimeout(600);
    ok('holding for the full time approves', (await pending(page)) === 0 && (await page.locator('li.rejoin').count()) === 1);
    ok('the course shows what the person allowed', /You allowed it/.test(await page.locator('li.rejoin').innerText()));
    await page.locator('#receipt-btn').click(); await page.waitForTimeout(300);
    ok('an allowed step is one row, even when a model turn is logged between "allowed" and "did"', (await page.locator('#timeline li', { hasText: 'Refresh' }).count()) === 1, String(await page.locator('#timeline li', { hasText: 'Refresh' }).count()));
    ok('the receipt opens with a summary', await page.locator('#receipt[open] .receipt-summary').count() === 1);
    await ctx.close();
  });
  await withPreview('paused', async (url) => {
    const { ctx, page } = await open(url);
    await page.locator('.card .allow').focus();
    await page.keyboard.down('Space'); await page.waitForTimeout(450); await page.keyboard.up('Space'); await page.waitForTimeout(300);
    ok('releasing Space early does not approve', (await pending(page)) === 1);
    await page.keyboard.down('Enter'); await page.waitForTimeout(1500); await page.keyboard.up('Enter'); await page.waitForTimeout(500);
    ok('holding Enter for the full time approves (keyboard path)', (await pending(page)) === 0);
    await ctx.close();
  });
  await withPreview('paused', async (url) => {
    const { ctx, page } = await open(url);
    await page.evaluate(() => document.querySelector('.card .allow').click());   // what scripts/simulate-participant.mjs does
    await page.waitForTimeout(500);
    ok('a script click approves at once (simulated participant)', (await pending(page)) === 0);
    await ctx.close();
  });
  await withPreview('paused', async (url) => {
    const { ctx, page } = await open(url);
    await page.locator('.card .block').click(); await page.waitForTimeout(500);
    ok('block resolves the decision and the course shows it', (await pending(page)) === 0 && (await page.locator('li.blocked').count()) === 1);
    ok('the status leaves the paused state', !/Needs your decision/.test(await page.locator('#status-text').innerText()), await page.locator('#status-text').innerText());
    await ctx.close();
  });
  for (const [state, w] of [['paused', 320], ['multi', 375], ['long', 768], ['long', 1280]]) await withPreview(state, async (url) => {
    const { ctx, page } = await open(url, { viewport: { width: w, height: 800 } });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`no horizontal overflow: ${state} at ${w}px`, over <= 0, `${over}px`); await ctx.close();
  });
  await withPreview('paused', async (url) => {
    const { ctx, page } = await open(url, { colorScheme: 'dark', reducedMotion: 'reduce' });
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('header .dot')).animationName);
    ok('reduced motion stops the pulsing dot', anim === 'none', anim);
    ok('dark mode applies', await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(10, 18, 26)');
    const names = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).length);
    ok('every button has a visible name', names === 0);
    await ctx.close();
  });
  await withPreview('idle', async (url) => {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.goto(url); await page.waitForTimeout(800);
    ok('idle: says it is waiting and shows how to start', /Waiting for the agent/.test(await page.locator('#status-text').innerText()) && (await page.locator('#timeline-empty code').count()) === 1);
    await ctx.close();
  });
} finally { await browser.close(); }
const failed = results.filter((r) => !r.pass).length; console.log(`\n${results.length - failed}/${results.length} checks passed`); process.exit(failed ? 1 : 0);
