// Pending decisions: the model tap asks, the UI answers, a timeout denies.
import { randomBytes } from 'node:crypto';

export class Approvals {
  constructor({ store, timeoutMs = 5 * 60_000, reflexiveMs = 1000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.store = store; this.timeoutMs = timeoutMs; this.reflexiveMs = reflexiveMs;
    this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.waiting = new Map();      // id -> { resolve, timer, askedAt }
    this.declined = new Map();     // action key -> how many times the agent tried again
  }

  // `item`: { key, what, cause, risk, card, reason }. Returns { allow, message }.
  ask(item) {
    if (this.declined.has(item.key)) {          // a declined action stays declined; do not ask again
      const n = this.declined.get(item.key) + 1; this.declined.set(item.key, n);
      this.store.add('gate.repeat-blocked', { what: item.what, attempt: n + 1 });
      return Promise.resolve({ allow: false, message: `Helm: the user already declined to ${item.what} (attempt ${n + 1}). It was NOT done and will not be allowed. Stop trying this action and tell the user it was blocked.` });
    }
    const id = randomBytes(4).toString('hex');
    const askedAt = this.store.now();
    this.store.add('gate.pending', { id, key: item.key, what: item.what, cause: item.cause ?? null, risk: item.risk ?? null, explanation: item.explanation ?? null, card: item.card, reason: item.reason ?? null, timeoutMs: this.timeoutMs });
    item.onPending?.(id);
    return new Promise((resolve) => {
      const timer = this.setTimer(() => this.decide(id, false, { by: 'timeout' }), this.timeoutMs);
      this.waiting.set(id, { resolve, timer, askedAt, item });
    });
  }

  decide(id, allow, { by = 'user' } = {}) {
    const w = this.waiting.get(id);
    if (!w) return false;
    this.waiting.delete(id); this.clearTimer(w.timer);
    const latencyMs = this.store.now() - w.askedAt;
    // A decision this fast on a high-risk card was probably not an informed one.
    const reflexive = by === 'user' && latencyMs < this.reflexiveMs && w.item.risk === 'high';
    this.store.add('gate.decided', { id, allow, by, latencyMs, reflexive });
    if (!allow) this.declined.set(w.item.key, 0);
    w.resolve(allow ? { allow: true } : { allow: false, message: by === 'timeout'
      ? `Helm: no decision was made within ${Math.round(this.timeoutMs / 1000)} s, so the action was blocked. It was NOT done. Tell the user it was blocked.`
      : `Helm: the user declined to ${w.item.what}. It was NOT done. Do not try again; tell the user it was blocked and continue with any remaining safe steps.` });
    return true;
  }

  // Cancel everything still waiting (task ended); resolves as blocked.
  closeAll() { for (const id of [...this.waiting.keys()]) this.decide(id, false, { by: 'task-end' }); }
}
