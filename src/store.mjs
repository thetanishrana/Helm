// Append-only event log for one task, with a small derived state for the UI.
// Credential headers never reach here: callers pass analysed data, not raw requests.
import { EventEmitter } from 'node:events';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export class Store extends EventEmitter {
  constructor({ dir = null, now = Date.now } = {}) {
    super();
    this.now = now;
    this.events = [];
    this.id = `${new Date(now()).toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
    this.file = null;
    if (dir) { mkdirSync(dir, { recursive: true }); this.file = join(dir, `${this.id}.jsonl`); }
    this.untrusted = false;   // untrusted tool output has entered the agent's context (any agent)
    this.untrustedBy = new Set();   // agent keys that have read untrusted content
    this.agents = [];          // registered agents: { id, name, hue }. Empty for an ordinary single-agent run.
    this.meta = {};            // e.g. { mode: 'replay', condition: 'C', participant: 'p1' }
  }

  // An agent that supervises several at once registers first; its events then carry `agent: id`.
  register({ id, name }) {
    const hue = this.agents.length % 6;
    const a = { id, name: name || id, hue }; this.agents.push(a);
    this.add('agent.register', { agent: id, name: a.name, hue });
    return a;
  }

  // Events of one agent's current task: everything since that agent's last task.start. With no argument and
  // no registered agents this is the whole log, as in a single-agent run.
  current(agent = null) {
    const mine = this.agents.length || agent ? this.events.filter((e) => (e.agent ?? null) === agent) : this.events;
    let i = mine.length - 1;
    while (i >= 0 && mine[i].type !== 'task.start') i--;
    return i >= 0 ? mine.slice(i) : mine;
  }
  agentKeys() { return this.agents.length ? this.agents.map((a) => a.id) : [null]; }

  add(type, data = {}) {
    const ev = { seq: this.events.length + 1, t: this.now(), type, ...data };
    this.events.push(ev);
    if (this.file) appendFileSync(this.file, JSON.stringify(ev) + '\n');
    const key = data.agent ?? null;
    if (type === 'task.start') { this.untrustedBy.delete(key); this.untrusted = this.untrustedBy.size > 0; }
    if (type === 'model.turn' && data.untrustedChunks > 0) { this.untrustedBy.add(key); this.untrusted = true; }
    this.emit('event', ev);
    return ev;
  }

  // What the ambient status line shows.
  status() {
    const pending = this.pending();
    if (pending.length) return { level: 'paused', text: `Paused: ${pending.length} decision${pending.length > 1 ? 's' : ''} waiting` };
    if (this.agentKeys().every((k) => this.current(k).some((e) => e.type === 'task.end'))) return { level: 'done', text: 'Task finished' };
    if (this.untrusted) return { level: 'untrusted', text: 'Agent has read untrusted content' };
    return { level: 'ok', text: 'On task' };
  }

  // Decisions still waiting, for one agent or (no argument) for all of them.
  pending(agent) {
    const keys = agent === undefined ? this.agentKeys() : [agent];
    return keys.flatMap((k) => {
      const cur = this.current(k);
      const decided = new Set(cur.filter((e) => e.type === 'gate.decided').map((e) => e.id));
      return cur.filter((e) => e.type === 'gate.pending' && !decided.has(e.id));
    }).sort((a, b) => a.seq - b.seq);
  }

  // Everything the receipt needs, from the log alone.
  receipt(agent = null) {
    const ev = this.current(agent);
    const start = ev.find((e) => e.type === 'task.start');
    const end = ev.find((e) => e.type === 'task.end');
    const decided = new Map(ev.filter((e) => e.type === 'gate.decided').map((e) => [e.id, e]));
    const held = ev.filter((e) => e.type === 'gate.pending').map((p) => {
      const d = decided.get(p.id);
      return { id: p.id, what: p.what, cause: p.cause?.text ?? null, risk: p.risk, outcome: d ? (d.allow ? 'allowed' : 'blocked') : 'undecided', by: d?.by ?? null, latencyMs: d?.latencyMs ?? null, reflexive: Boolean(d?.reflexive), confirmed: ev.find((e) => e.type === 'gate.confirmed' && e.id === p.id)?.verdict ?? null };
    });
    const executed = ev.filter((e) => e.type === 'action');
    const navs = [...new Set(ev.filter((e) => e.type === 'navigate').map((e) => e.host))];
    const allowedQuietly = ev.filter((e) => e.type === 'gate.allowed');
    return {
      task: this.id, agent: agent ?? undefined, startedAt: start?.t ?? null, endedAt: end?.t ?? null,
      modelTurns: ev.filter((e) => e.type === 'model.turn').length,
      modelErrors: ev.filter((e) => e.type === 'model.error').length,
      actionsExecuted: executed.map((a) => ({ t: a.t, what: a.what, turn: a.turn })),
      allowedWithoutAsking: allowedQuietly.map((a) => ({ what: a.what, reason: a.reason })),
      held,
      blocked: held.filter((h) => h.outcome === 'blocked').length,
      pagesVisited: navs,
      // Not measured by this version: data sent to servers, downloads, clipboard.
      notTracked: ['network requests and the data they carry', 'downloads', 'clipboard'],
    };
  }
}
