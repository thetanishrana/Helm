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
    this.untrusted = false;   // untrusted tool output has entered the agent's context
    this.meta = {};            // e.g. { mode: 'replay', condition: 'C', participant: 'p1' }
  }

  // Events of the current task: everything since the last task.start.
  current() {
    let i = this.events.length - 1;
    while (i >= 0 && this.events[i].type !== 'task.start') i--;
    return i >= 0 ? this.events.slice(i) : this.events;
  }

  add(type, data = {}) {
    const ev = { seq: this.events.length + 1, t: this.now(), type, ...data };
    this.events.push(ev);
    if (this.file) appendFileSync(this.file, JSON.stringify(ev) + '\n');
    if (type === 'task.start') this.untrusted = false;
    if (type === 'model.turn' && data.untrustedChunks > 0) this.untrusted = true;
    this.emit('event', ev);
    return ev;
  }

  // What the ambient status line shows.
  status() {
    const pending = this.pending();
    if (pending.length) return { level: 'paused', text: `Paused: ${pending.length} decision${pending.length > 1 ? 's' : ''} waiting` };
    if (this.current().some((e) => e.type === 'task.end')) return { level: 'done', text: 'Task finished' };
    if (this.untrusted) return { level: 'untrusted', text: 'Agent has read untrusted content' };
    return { level: 'ok', text: 'On task' };
  }

  pending() {
    const cur = this.current();
    const decided = new Set(cur.filter((e) => e.type === 'gate.decided').map((e) => e.id));
    return cur.filter((e) => e.type === 'gate.pending' && !decided.has(e.id));
  }

  // Everything the receipt needs, from the log alone.
  receipt() {
    const ev = this.current();
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
      task: this.id, startedAt: start?.t ?? null, endedAt: end?.t ?? null,
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
