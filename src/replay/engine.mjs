// Plays one scenario into a Store so the normal UI can show it, with the behaviour of one study
// condition. Records what the person decided and how fast, and derives the study metrics.
import { createHash } from 'node:crypto';

const BLOCKED = new Set(['blocked', 'stopped', 'timeout']);

export class ReplayEngine {
  constructor({ scenario, condition, store, approvals, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), stopWindowMs = 8000, participant = null }) {
    Object.assign(this, { scenario, condition, store, approvals, sleep, stopWindowMs, participant });
    this.decisions = []; this.tlx = null; this.stopped = false; this.finished = false;
    this._begin = new Promise((ok) => (this.begin = () => { ok(); return true; }));
    this._stopWaiter = null;
  }

  // The person pressed Stop (condition A). Returns whether it did anything.
  stop() {
    if (this._stopWaiter) { this._stopWaiter(); return true; }
    return false;
  }

  submitTlx(a) {
    const keys = ['mental', 'physical', 'temporal', 'performance', 'effort', 'frustration'];
    if (!a || keys.some((k) => !Number.isFinite(a[k]) || a[k] < 0 || a[k] > 100)) return false;
    this.tlx = Object.fromEntries(keys.map((k) => [k, a[k]]));
    this.store.add('study.tlx', { tlx: this.tlx });
    this._tlxDone?.(); return true;
  }

  async run() {
    const { scenario: sc, store } = this;
    store.meta = { mode: 'replay', condition: this.condition, participant: this.participant, scenario: { id: sc.id, title: sc.title, userTask: sc.userTask }, stopWindowMs: this.condition === 'A' ? this.stopWindowMs : null };
    store.add('study.ready', { scenario: sc.id, userTask: sc.userTask });
    await this._begin;
    store.add('task.start', { scenario: sc.id, condition: this.condition });
    for (const [i, st] of sc.steps.entries()) {
      if (this.stopped) break;
      await this.play(st, i);
    }
    store.add('task.end', {}); this.finished = true;
    store.add('study.questionnaire', {});
    return this.result();
  }

  async waitTlx(ms) { return new Promise((ok) => { this._tlxDone = ok; setTimeout(ok, ms); }); }

  async play(st, i) {
    const { store } = this;
    if (st.delayMs) await this.sleep(st.delayMs);
    switch (st.type) {
      case 'navigate': { let host = ''; try { host = new URL(st.url).host; } catch {} store.add('navigate', { url: st.url, host }); break; }
      case 'model': store.add('model.turn', { untrustedChunks: st.untrusted ?? 0, tools: st.command ? [st.command] : [], say: st.say ?? '' }); if (st.output) store.add('agent.output', { text: st.output }); break;
      case 'action': store.add('action', { what: st.what, command: st.command ?? null }); break;
      case 'say': store.add('agent.say', { text: st.text }); break;
      case 'gate': await this.gate(st, i); break;
    }
  }

  async gate(st, i) {
    const { store, condition } = this; const x = st.explanation;
    const t0 = store.now(); let decision; let shown;
    store.add('agent.command', { gate: i, command: st.command });

    if (condition === 'A') {
      shown = 'log-window';
      store.add('stop.window', { gate: i, ms: this.stopWindowMs });
      const stoppedByUser = await new Promise((ok) => {
        const timer = setTimeout(() => { this._stopWaiter = null; ok(false); }, this.stopWindowMs);
        this._stopWaiter = () => { clearTimeout(timer); this._stopWaiter = null; ok(true); };
      });
      decision = stoppedByUser ? 'stopped' : 'allowed';
      if (stoppedByUser) { store.add('agent.stopped', { gate: i }); this.stopped = true; }
    } else if (condition === 'B') {
      shown = 'prompt';
      const r = await this.approvals.ask({ key: st.command, what: st.command, risk: x.risk.tier, reason: null, card: st.command,
        explanation: { commandOnly: true, command: st.command } });
      decision = r.allow ? 'allowed' : this.lastBy() === 'timeout' ? 'timeout' : 'blocked';
    } else if (x.interrupt) {
      shown = 'prompt';
      const r = await this.approvals.ask({ key: st.what, what: st.what, cause: x.cause ?? null, risk: x.risk.tier, reason: x.reason,
        card: `PAUSED: ${st.what}`, explanation: { action: x.action ?? { verb: 'click', label: null }, requested: x.requested, cause: x.cause ?? null, risk: x.risk, reason: x.reason, emails: x.emails ?? [] } });
      decision = r.allow ? 'allowed' : this.lastBy() === 'timeout' ? 'timeout' : 'blocked';
    } else {
      shown = 'quiet'; store.add('gate.allowed', { what: st.what, reason: x.reason }); decision = 'allowed';
    }

    const latencyMs = store.now() - t0;
    this.decisions.push({ gate: i, what: st.what, command: st.command, injected: st.injected, shown, decision, latencyMs, risk: x.risk.tier });
    for (const ev of (decision === 'allowed' ? st.onAllow : st.onBlock) || []) await this.play(ev, `${i}.${decision}`);
  }

  lastBy() { return [...this.store.events].reverse().find((e) => e.type === 'gate.decided')?.by; }

  result() {
    const inj = this.decisions.filter((d) => d.injected), ben = this.decisions.filter((d) => !d.injected);
    const stopped = inj.filter((d) => BLOCKED.has(d.decision)).length;
    const reflexive = this.store.events.filter((e) => e.type === 'gate.decided' && e.reflexive).length;
    return {
      participant: this.participant, condition: this.condition, scenario: this.scenario.id, injectedScenario: inj.length > 0,
      decisions: this.decisions, tlx: this.tlx,
      metrics: {
        injectedActions: inj.length, injectedStopped: stopped, maliciousApprovals: inj.length - stopped,
        benignActions: ben.length, benignBlocked: ben.filter((d) => BLOCKED.has(d.decision)).length,
        prompts: this.decisions.filter((d) => d.shown === 'prompt').length, reflexiveApprovals: reflexive,
        medianPromptLatencyMs: median(this.decisions.filter((d) => d.shown === 'prompt').map((d) => d.latencyMs)),
        stoppedAgent: this.stopped,
      },
    };
  }
}

function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
export const scenarioHash = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 10);
