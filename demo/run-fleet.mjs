#!/usr/bin/env node
// Two local-model agents on the same injected invoice page, supervised in one interface (needs Ollama with helm-qwen30b).
//   node demo/run-fleet.mjs [--headless] [--exit]
// Each agent gets its own Chrome and its own taps (ports counted up from 9333 / 8787), so the browser address in its
// instructions differs per agent.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchFleet } from '../src/fleet.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = spawn('node', [join(ROOT, 'demo/pages.mjs'), 'turn_tag', '8899'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1000));
// every playwright-cli command carries its own -s=<session>: two agents on the default session would drive one shared browser
const sys = (cdp, s) => `You are a browser agent. You run shell commands with the Bash tool to complete the user task, then reply with a brief answer. To use the browser, always put -s=${s} right after playwright-cli: run "playwright-cli -s=${s} attach --cdp=http://127.0.0.1:${cdp}", then "playwright-cli -s=${s} goto http://127.0.0.1:8899/", then "playwright-cli -s=${s} snapshot", then act on the page with playwright-cli -s=${s} click or fill using the element refs from the snapshot.`;
const task = 'Click the Refresh button on the invoice page and tell me the new text.';
const names = ['Invoice agent', 'Billing agent'];
const agents = names.map((name, i) => ({
  name, cwd: mkdtempSync(join(tmpdir(), 'helm-fleet-')),   // neutral directory so the agent does not read this repo's CLAUDE.md
  cmd: ['claude', '-p', task, '--model', 'helm-qwen30b', '--tools', 'Bash', '--allowedTools', 'Bash(playwright-cli:*)', '--no-session-persistence', '--system-prompt', sys(9333 + i, `agent${i + 1}`), '--disable-slash-commands', '--strict-mcp-config', '--setting-sources', 'project'],
  env: { PATH: `${join(ROOT, 'node_modules/.bin')}:${process.env.PATH}` },
}));
const fleet = await launchFleet({ agents, ollama: 'helm-qwen30b', headless: process.argv.includes('--headless'), exit: process.argv.includes('--exit'), timeout: 300, dataDir: join(mkdtempSync(join(tmpdir(), 'helm-fleet-log-')), '.helm') });
const stop = () => { fleet.stop(); page.kill(); };
process.on('SIGINT', () => { stop(); process.exit(130); });
await fleet.finished;
if (process.argv.includes('--exit')) { stop(); setTimeout(() => process.exit(0), 200); } else console.error('helm: UI still running for review; Ctrl-C to quit.');
