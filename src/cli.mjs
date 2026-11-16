#!/usr/bin/env node
// helm run [options] -- <agent command...>      (one agent)
// helm fleet <fleet.json>                          (several agents in one interface; see src/fleet.mjs)
// Starts Chrome (or attaches), both taps and the UI, then runs the agent with its model API and
// browser pointed at Helm. Nothing about the agent changes except two environment variables.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.mjs';
import { Approvals } from './approvals.mjs';
import { startSession } from './session.mjs';
import { startServer } from './server.mjs';

const CHROME = process.env.HELM_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HELP = `usage: helm run [options] -- <agent command...>
  --ui-port N         web UI port (default 7777)
  --tap-port N        model proxy port (default 8787)
  --cdp-port N        browser proxy port (default 9333)
  --chrome-port N     Chrome debugging port (default 9222)
  --attach            use a Chrome already listening on --chrome-port instead of starting one
  --headless          start Chrome headless
  --ollama MODEL      send the agent's model requests to Ollama's Anthropic-compatible endpoint
  --confirm           re-run held requests without each suspect passage (extra model calls)
  --timeout S         seconds before an unanswered decision is blocked (default 300)
  --data-dir DIR      where the event log is written (default ./.helm)
  --open              open the UI in your browser
  --exit              exit when the agent exits (default: keep the UI up for review)
The agent gets ANTHROPIC_BASE_URL, HELM_CDP_URL and PLAYWRIGHT_MCP_TIMEOUT_ACTION in its environment.`;

function parse(argv) {
  const o = { ui: 7777, tap: 8787, cdp: 9333, chrome: 9222, timeout: 300, dir: '.helm', cmd: [] };
  const i = argv.indexOf('--'); const flags = i >= 0 ? argv.slice(0, i) : argv; o.cmd = i >= 0 ? argv.slice(i + 1) : [];
  for (let k = 0; k < flags.length; k++) {
    const f = flags[k], v = () => flags[++k];
    if (f === 'run') continue;
    else if (f === '--ui-port') o.ui = Number(v()); else if (f === '--tap-port') o.tap = Number(v());
    else if (f === '--cdp-port') o.cdp = Number(v()); else if (f === '--chrome-port') o.chrome = Number(v());
    else if (f === '--timeout') o.timeout = Number(v()); else if (f === '--data-dir') o.dir = v();
    else if (f === '--ollama') o.ollama = v(); else if (f === '--attach') o.attach = true;
    else if (f === '--headless') o.headless = true; else if (f === '--confirm') o.confirm = true;
    else if (f === '--open') o.open = true; else if (f === '--exit') o.exit = true;
    else { console.error(`unknown option ${f}\n${HELP}`); process.exit(2); }
  }
  return o;
}

if (process.argv[2] === 'fleet') { await import('./fleet.mjs'); await new Promise(() => {}); }
const o = parse(process.argv.slice(2));
if (!o.cmd.length) { console.log(HELP); process.exit(2); }

let chrome = null;
if (!o.attach) {
  chrome = spawn(CHROME, [...(o.headless ? ['--headless=new'] : []), `--remote-debugging-port=${o.chrome}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'helm-chrome-'))}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
}
for (let i = 0; i < 75; i++) { try { await fetch(`http://127.0.0.1:${o.chrome}/json/version`); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }

const store = new Store({ dir: o.dir });
const approvals = new Approvals({ store, timeoutMs: o.timeout * 1000 });
const session = await startSession({ store, approvals, tapPort: o.tap, cdpPort: o.cdp, chromePort: o.chrome, confirm: o.confirm, upstream: o.ollama ? { host: '127.0.0.1', port: 11434 } : null });
const ui = await startServer({ store, approvals, port: o.ui });
const url = `http://127.0.0.1:${ui.port}/`;
console.error(`helm: UI ${url}   model tap :${o.tap}   browser tap :${o.cdp}   log ${store.file}`);
if (o.open) spawn('open', [url], { stdio: 'ignore' });

const env = { ...process.env, ANTHROPIC_BASE_URL: `http://127.0.0.1:${o.tap}`, HELM_CDP_URL: `http://127.0.0.1:${o.cdp}`, PLAYWRIGHT_MCP_TIMEOUT_ACTION: process.env.PLAYWRIGHT_MCP_TIMEOUT_ACTION || '600000' };
if (o.ollama) Object.assign(env, { ANTHROPIC_AUTH_TOKEN: 'ollama', ANTHROPIC_DEFAULT_HAIKU_MODEL: o.ollama, ANTHROPIC_DEFAULT_SONNET_MODEL: o.ollama, ANTHROPIC_DEFAULT_OPUS_MODEL: o.ollama, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
const agent = spawn(o.cmd[0], o.cmd.slice(1), { stdio: 'inherit', env });
const stop = () => { chrome?.kill(); session.close(); ui.close(); };
agent.on('exit', (code) => {
  session.end();
  const r = store.receipt();
  console.error(`\nhelm: agent exited (${code}). ${r.modelTurns} steps${r.modelErrors ? ` (${r.modelErrors} model requests failed)` : ''}, ${r.held.length} held, ${r.blocked} blocked, ${r.actionsExecuted.length} browser actions. Receipt: ${url}`);
  if (o.exit) { stop(); setTimeout(() => process.exit(code ?? 0), 200); } else console.error('helm: UI still running for review; Ctrl-C to quit.');
});
process.on('SIGINT', () => { agent.kill(); stop(); process.exit(130); });
