// helm fleet <fleet.json>: several agents supervised in one interface. One shared store, approvals and UI;
// each agent gets its own model tap, browser tap and Chrome (ports counted up from the base ports), and every
// event it causes is tagged with its id.
//   { "name"?, "uiPort"?: 7777, "timeout"?: 300, "dataDir"?: ".helm", "confirm"?: bool, "ollama"?: "model", "headless"?: bool,
//     "judge"?: false | "model" (attribution judge, on by default),  "open"?: bool, "exit"?: bool, "agents": [ { "name": "invoice agent", "cmd": ["claude", "-p", "..."], "env"?: {}, "cwd"?: "." } ] }
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.mjs';
import { Approvals } from './approvals.mjs';
import { startSession } from './session.mjs';
import { startServer } from './server.mjs';
import { claudeAsk } from './model/judge.mjs';

const CHROME = process.env.HELM_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = { tap: 8787, cdp: 9333, chrome: 9222 };

export function readSpec(file) {
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(spec.agents) || spec.agents.length < 1) throw new Error('the fleet file needs an "agents" array');
  spec.agents.forEach((a, i) => { if (!Array.isArray(a.cmd) || !a.cmd.length) throw new Error(`agent ${i + 1} needs a "cmd" array`); });
  return spec;
}

// ids are short and url-safe; names are what the person sees
const idOf = (name, i, taken) => { let id = (String(name || `agent-${i + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `agent-${i + 1}`); while (taken.has(id)) id += `-${i + 1}`; taken.add(id); return id; };

export async function launchFleet(spec, { log = (m) => console.error(m) } = {}) {
  const store = new Store({ dir: spec.dataDir ?? '.helm' });
  const approvals = new Approvals({ store, timeoutMs: (spec.timeout ?? 300) * 1000 });
  const ui = await startServer({ store, approvals, port: spec.uiPort ?? 7777 });
  const url = `http://127.0.0.1:${ui.port}/`;
  log(spec.judge === false ? 'helm: attribution judge off' : 'helm: attribution judge ON: page text and the request are sent to Claude when no cause is clear; set "judge": false to turn off');
  log(`helm: UI ${url}   ${spec.agents.length} agent${spec.agents.length === 1 ? '' : 's'}   log ${store.file}`);
  if (spec.open) spawn('open', [url], { stdio: 'ignore' });

  const taken = new Set(); const running = [];
  for (const [i, a] of spec.agents.entries()) {
    const ports = { tap: BASE.tap + i, cdp: BASE.cdp + i, chrome: BASE.chrome + i };
    const agent = store.register({ id: idOf(a.name, i, taken), name: a.name });
    const chrome = spawn(CHROME, [...(spec.headless ? ['--headless=new'] : []), `--remote-debugging-port=${ports.chrome}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'helm-chrome-'))}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
    for (let k = 0; k < 75; k++) { try { await fetch(`http://127.0.0.1:${ports.chrome}/json/version`); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
    const session = await startSession({ store, approvals, agent, tapPort: ports.tap, cdpPort: ports.cdp, chromePort: ports.chrome, confirm: spec.confirm, judge: spec.judge === false ? null : { ask: claudeAsk(typeof spec.judge === 'string' ? spec.judge : undefined) }, upstream: spec.ollama ? { host: '127.0.0.1', port: 11434 } : null });
    const env = { ...process.env, ...(a.env || {}), ANTHROPIC_BASE_URL: `http://127.0.0.1:${ports.tap}`, HELM_CDP_URL: `http://127.0.0.1:${ports.cdp}`, PLAYWRIGHT_MCP_TIMEOUT_ACTION: process.env.PLAYWRIGHT_MCP_TIMEOUT_ACTION || '600000' };
    if (spec.ollama) Object.assign(env, { ANTHROPIC_AUTH_TOKEN: 'ollama', ANTHROPIC_DEFAULT_HAIKU_MODEL: spec.ollama, ANTHROPIC_DEFAULT_SONNET_MODEL: spec.ollama, ANTHROPIC_DEFAULT_OPUS_MODEL: spec.ollama, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
    const proc = spawn(a.cmd[0], a.cmd.slice(1), { stdio: 'inherit', env, cwd: a.cwd || process.cwd() });
    const entry = { agent, ports, chrome, session, proc, done: new Promise((res) => proc.on('exit', (code) => { session.end(); res(code ?? 0); })) };
    running.push(entry);
  }

  const stop = () => { for (const r of running) { r.proc.kill(); r.chrome.kill(); r.session.close(); } ui.close(); };
  const finished = Promise.all(running.map((r) => r.done)).then((codes) => {
    for (const r of running) { const x = store.receipt(r.agent.id); log(`helm: ${r.agent.name}: ${x.modelTurns} steps, ${x.held.length} held, ${x.blocked} blocked, ${x.actionsExecuted.length} browser actions`); }
    return codes;
  });
  return { store, approvals, ui, url, running, finished, stop };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[2] === 'fleet') {
  const file = process.argv[process.argv[2] === 'fleet' ? 3 : 2];
  if (!file) { console.error('usage: node src/cli.mjs fleet <fleet.json>'); process.exit(2); }
  const spec = readSpec(file); const f = await launchFleet(spec);
  process.on('SIGINT', () => { f.stop(); process.exit(130); });
  const codes = await f.finished;
  if (spec.exit) { f.stop(); setTimeout(() => process.exit(Math.max(...codes)), 200); } else console.error('helm: UI still running for review; Ctrl-C to quit.');
}
