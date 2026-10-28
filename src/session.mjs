// Wires the two taps, the policy, the explainer, approvals and the event store together.
import { createHash } from 'node:crypto';
import { startTap } from './model/tap.mjs';
import { startProxy } from './cdp/proxy.mjs';
import { classify } from './model/policy.mjs';
import { explain } from './model/explain.mjs';
import { attribute } from './model/counterfactual.mjs';

const short = (c) => (c || '').replace(/\s+/g, ' ').slice(0, 140);

export async function startSession({ store, approvals, tapPort = 8787, cdpPort = 9333, chromePort = 9222, upstream = null, confirm = false, log = () => {} }) {
  const turns = [];   // { index, startedAt } for correlating browser actions to model turns
  const ownerTurn = (at) => { let o = null; for (const t of turns) if (t.startedAt <= at) o = t; return o?.index ?? null; };
  store.add('task.start', {});

  const policy = async (tu, req, ctx) => {
    const c = classify(tu, req);
    if (!c.gate) return { action: 'allow' };
    const ex = explain(c, req);
    if (!ex) return { action: 'allow' };
    if (!ex.interrupt) { store.add('gate.allowed', { what: ex.action.what, reason: ex.reason }); return { action: 'allow' }; }
    const lastResult = req.toolResults?.at(-1)?.toolUseId ?? null;
    const key = createHash('sha256').update(JSON.stringify([ex.action.what, lastResult])).digest('hex').slice(0, 12);
    return {
      action: 'hold', key,
      ask: () => approvals.ask({
        key: ex.action.what, what: ex.action.what, cause: ex.cause, risk: ex.risk.tier, reason: ex.reason, card: ex.card,
        explanation: { action: { verb: ex.action.verb, label: ex.action.label, role: ex.action.role }, requested: ex.requested, cause: ex.cause, risk: ex.risk, reason: ex.reason, emails: ex.emails },
        onPending: (id) => {
          if (!confirm || !ctx?.body) { store.add('gate.confirmed', { id, verdict: 'skipped' }); return; }
          const target = `${ex.action.verb}|${ex.action.label || ex.action.ref || ''}`;
          attribute({ body: ctx.body, target, resend: ctx.resend, heuristicCause: ex.cause })
            .then((r) => store.add('gate.confirmed', { id, verdict: r.verdict, cause: r.cause?.text ?? null, calls: r.calls }))
            .catch((e) => store.add('gate.confirmed', { id, verdict: 'error', error: String(e).slice(0, 120) }));
        },
      }),
    };
  };

  const tap = await startTap({
    port: tapPort, upstream, policy,
    onRequest: (rec) => { if (rec.path?.startsWith('/v1/messages')) turns.push({ index: turns.length, startedAt: rec.reqStartMs }); },
    log: (rec) => {
      log(rec);
      if (!rec.req || !rec.path?.startsWith('/v1/messages')) return;
      store.add('model.turn', {
        index: turns.findIndex((t) => t.startedAt === rec.reqStartMs), untrustedChunks: rec.req.toolResults.length,
        tools: (rec.resp?.toolUses || []).map((u) => short(u.input?.command || JSON.stringify(u.input))),
        say: short(rec.resp?.text), ms: rec.totalMs,
      });
    },
  });

  const cdp = await startProxy({
    listen: cdpPort, chrome: chromePort, gate: async () => ({ action: 'allow' }),
    onEvent: (e) => {
      if (e.dir !== 'c2b') return;
      if (e.method === 'Page.navigate' && e.params?.url) { let host = ''; try { host = new URL(e.params.url).host; } catch {} store.add('navigate', { url: e.params.url.slice(0, 200), host, turn: ownerTurn(Date.now()) }); }
      if (e.note === 'GATE start' && e.semantic) store.add('action', { what: `click ${e.semantic.tag.toLowerCase()} "${short(e.semantic.text)}"`, turn: ownerTurn(e.at) });
    },
  });

  return {
    tap, cdp, store,
    end() { approvals.closeAll(); store.add('task.end', {}); },
    close() { tap.close(); cdp.close(); },
  };
}
