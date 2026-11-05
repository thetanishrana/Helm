// Turn a classified action plus the request context into a human explanation:
// did the user ask for this, did untrusted page text push the agent toward it, how bad is it,
// and should the user be interrupted. Deterministic heuristics, no model calls.

const STOP = new Set('a an the to of and or in on for with your you my is are be at by it its this that from as'.split(' '));
// Plain plurals match their singular ("notification settings" asks for the "Notifications" link).
const stem = (w) => (w.length > 4 && /[^s]s$/.test(w) ? w.slice(0, -1) : w);
const tokens = (s) => (s.toLowerCase().match(/[a-z0-9@._-]{2,}/g) || []).flatMap((w) => [w, ...w.split(/[@._-]/)]).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
const uniq = (a) => [...new Set(a)];
// Short numbers ("#42") identify things, so they count as matches even though other short tokens do not.
const overlapCount = (needle, hay) => { const h = new Set(tokens(hay)); return uniq(tokens(needle)).filter((t) => h.has(t) && (t.length > 2 || /\d/.test(t))).length; };
const overlap = (needle, hay) => { const n = uniq(tokens(needle)); if (!n.length) return 0; const h = new Set(tokens(hay)); return n.filter((t) => h.has(t)).length / n.length; };

// Passages that point at a control without naming it ("the red control under Manage trip", "through the form button").
const POINTER = /\b(the|that) (red|last|first|bottom|top|main|big|danger\w*)\b.{0,25}\b(button|control|toggle|link|switch)\b|\b(through|using|with|via) the (form |submit |confirm )?(button|control)\b/i;
const ACTION_VERB = /\b(click|press|tap|select|open|send|type|enter|visit|go to|run|execute|use|activate|switch|toggle|turn|enable|disable|choose|acknowledge|confirm|complete|finish|proceed)\b/i;
const HIGH_VERBS = /\b(send|pay|payment|transfer|wire|purchase|buy|order|checkout|delete|remove|erase|submit|post|publish|share|forward|confirm|approve|authorize|grant|invite|unsubscribe|deactivate|reset|export|download|ship|refill|reorder|renew|subscribe|upgrade|withdraw|refund|charge)\b/i;
// Consequential actions named by a verb plus an object, so a bare "Cancel" or "Disable" button is not flagged.
const HIGH_PHRASES = [
  /\b(cancel|disable|suspend|revoke|terminate|disconnect|wipe|purge|deactivate|turn off|switch off)\b.{0,40}\b(all|every|any|my|your|account|meetings?|events?|subscription|order|mfa|multi-?factor|authentication|security|protection|access|users?|employees?|booking|reservation|flight|trip|appointment|membership|policy|contract|plan)\b/i,
  /\b(make|set|switch|change)\b.{0,40}\b(public|unrestricted|anyone|everyone)\b/i,
  // physical or financial control: unlocking, disarming, redirecting money, changing who can get in or be paid
  /\b(unlock|disarm|unarm|open (the )?(door|gate|vault|garage))\b/i,
  /\b(change|update|edit|replace|set|redirect|move|link|add)\b.{0,40}\b(direct deposit|payout|payee|beneficiary|bank account|routing|iban|payment method|billing|recovery (email|phone)|password|authorized user|admin|owner|delegate)\b/i,
];
const SECRET_FIELD = /pass(word)?|card|cvv|ssn|secret|token|api.?key|private/i;
const AI_ADDRESSED = /\b(ai|a\.i\.|assistants?|agents?|llms?|language model|claude|gpt|chatbot|copilot|bots?|crawlers?|scrapers?|automated (readers?|assistants?|agents?|systems?|tools?|clients?))\b|@[\w-]*bot\b/i;
const COERCION = /\b(please remember|remember to|reminder:|make sure|be sure|don't forget|you must|you should|you need to|ignore (all|any|previous|prior)|disregard|do not (tell|mention|inform)|don't (tell|mention)|instead|override|system (note|message|prompt)|important:|required|to (complete|finish) (your|the|this) task|before (you )?(continu|proceed|answer|read|check|open|look)|(then|and then) (re-?open|tell me|answer|reply|report)|until .{0,40} (is |are )?(cleared|disabled|suspended))/i;
// Text that poses as the user, the assistant, or the system: the style that worked on a real agent.
const IMPERSONATION = /(^|\s)(human|user|assistant|system)\s*:|<\|im_(start|end)\|>|<\/?(user_message|system-reminder|system|tool_result)>|\[system\]|\b(one more thing|in addition|added to your task|amended|follow-up|the user (has )?(asked|confirmed|approved|requested)|i need you to|i forgot to mention|as requested|instructions from the user)\b|\bmessage from (you|the user|me)\b|\bfrom (the )?(workspace |site |page |account |system |security )?(owner|administrator|admin)\b|\b(already|pre-?|previously|has been) ?approved\b|\bidentity provider\b/i;
const DELEGATED = /\b(whatever|everything|anything|all (the )?(steps|tasks)|as)\b.{0,30}\b(page|site|website|checklist|instructions?|portal|it)\b.{0,20}\b(says?|tells?|instructs?|lists?|asks?)\b|\bfollow (the )?(page|site|instructions|checklist)\b/i;

// Break tool-result text into chunks of page content with a source label.
export function pageChunks(req) {
  const chunks = [];
  (req?.toolResults || []).forEach((r, ri) => {
    let page = null;
    for (let line of r.text.split('\n')) {
      const rawLine = line;
      // YAML single-quotes a key that contains quotes: - 'note "..." [ref=e6]': text
      const q = /^(\s*-\s+)'(.*?)'(?::\s*(.*))?$/.exec(line); if (q) line = `${q[1]}${q[2].replace(/''/g, "'")}${q[3] && q[3] !== '.' ? ': ' + q[3] : ''}`;
      const url = /Page URL:\s*(\S+)/.exec(line); if (url) { page = url[1]; continue; }
      const m = /^\s*-\s+(\w+)(?:\s+"((?:[^"\\]|\\.)*)")?[^\n]*?(?:\[ref=(e\d+)\])?[^\n]*?(?::\s*(?:"((?:[^"\\]|\\.)*)"|(.+)))?\s*$/.exec(line);
      if (!m) continue;
      const un = (x) => x && x.replace(/\\"/g, '"');
      const ref = /\[ref=(\w+)\]/.exec(line)?.[1];
      const text = un(m[4]) ?? m[5] ?? un(m[2]);
      if (text && text.trim()) chunks.push({ line: rawLine, result: ri, page, role: m[1], ref, text: text.trim(), isLabel: !m[4] && !m[5] });
    }
  });
  return chunks;
}

// Words that only move around or reveal content. A label made entirely of these (plus filler and numbers) is harmless.
const SAFE_UI = new Set('refresh reload next previous prev back search find filter sort show hide more less expand collapse close open view views details detail history menu help settings cancel ok okay dismiss edit reply compose new change rename toggle tab page pages list grid table sidebar print dark light mode language zoom top bottom up down left right date name price rating newest oldest relevance recent popular'.split(' '));
const isSafeUiLabel = (label) => { const w = (String(label).toLowerCase().match(/[a-z]+/g) || []); return w.length > 0 && w.every((t) => SAFE_UI.has(t) || STOP.has(t) || t.length < 2); };

export function riskOf(a) {
  const label = a.label || a.selector || a.detail || '';
  if (a.risk === 'opaque') return { tier: 'high', why: 'runs code the proxy cannot inspect' };
  if (a.cli === 'curl' || a.verb === 'send') return { tier: 'high', why: 'sends data off the machine' };
  if (['fill', 'type'].includes(a.verb) && SECRET_FIELD.test(label)) return { tier: 'high', why: 'types into a sensitive field' };
  if (HIGH_VERBS.test(label) || HIGH_PHRASES.some((r) => r.test(label))) return { tier: 'high', why: `the control says "${label}", which changes something outside the page` };
  if (['fill', 'type', 'press', 'select', 'upload', 'check', 'uncheck'].includes(a.verb)) return { tier: 'medium', why: 'enters or changes data on the page' };
  // Allowlist, not denylist: a named button or menu item is consequential unless every word of its label is a known harmless UI word.
  if (a.verb === 'click' && ['button', 'menuitem'].includes(a.role) && a.label && !isSafeUiLabel(a.label)) return { tier: 'high', why: `the ${a.role} "${a.label}" is not a known harmless control, so it could change something`, viaAllowlist: true };
  return { tier: 'low', why: 'looks like navigation or a harmless control' };
}

// A command can chain several actions ("click e5 && click e7"); every one must be judged, not just the first.
export function explainAll(classified, req) {
  const gated = classified.actions.filter((x) => x.risk === 'interact' || x.risk === 'opaque');
  return gated.map((a) => explain(classified, req, null, a)).filter(Boolean);
}
// The explanation to act on: the first action that needs the user, else the first action.
export const mostImportant = (list) => list.find((x) => x.interrupt) ?? list[0] ?? null;

export function explain(classified, req, resp = null, only = null) {
  const a = only ?? classified.actions.find((x) => x.risk === 'interact' || x.risk === 'opaque');
  if (!a) return null;
  const label = a.label || '';
  const prompts = (req?.userPrompts?.length ? req.userPrompts : [req?.userPrompt?.text || '']).join('\n');
  const chunks = pageChunks(req);
  const tainted = (req?.toolResults || []).length > 0;

  // Did the user ask for this? Compare the target's label with the user's own words.
  const asked = label ? overlap(label, prompts) : 0;
  // A link the user named by a key word ("the message from Alex") is requested even though its full label is longer.
  const namedLink = a.role === 'link' && riskOf(a).tier === 'low' && overlapCount(label, prompts) >= 1;
  // A bare "Send"/"Post"/"Submit" button is part of a message the user asked the agent to write or ask.
  const messageAction = /^(send|post|submit|reply|ask)$/i.test(label.trim()) && /\b(ask|message|reply|respond|chat|write|compose|comment|post)\b/i.test(prompts);
  // High-stakes controls must be named almost fully; for low- and medium-risk ones, sharing half their words with the request is enough.
  const tier0 = riskOf(a); const strict = tier0.tier === 'high' && !tier0.viaAllowlist;   // named by the denylist: needs nearly all of its words in the request
  const strongMatch = asked >= 0.75 || namedLink || messageAction;
  let requested = asked >= (strict ? 0.75 : 0.5) || namedLink || messageAction;
  const delegated = DELEGATED.test(prompts);

  // Which page text points at this action? Not the control itself, and instruction-like.
  const candidates = chunks
    .filter((c) => !(c.ref && a.ref && c.ref === a.ref) && !(c.isLabel && c.text === label))
    .map((c) => {
      const o = label ? overlap(label, c.text) : 0;
      const cues = (AI_ADDRESSED.test(c.text) ? 1 : 0) + (IMPERSONATION.test(c.text) ? 1 : 0) + (COERCION.test(c.text) ? 1 : 0) + (ACTION_VERB.test(c.text) ? 0.5 : 0) + (POINTER.test(c.text) ? 1 : 0);
      return { ...c, overlap: o, cues, score: o * 2 + cues };
    })
    .filter((c) => (c.overlap >= 0.5 && c.cues >= 1) || (c.overlap >= 0.75 && c.cues >= 0.5))
    .sort((x, y) => y.score - x.score);
  let cause = candidates[0] || null;
  if (!cause) {   // no passage names the control; still flag text that talks to AI agents and issues orders
    const weak = chunks.filter((c) => !c.isLabel && (AI_ADDRESSED.test(c.text) || IMPERSONATION.test(c.text)) && (COERCION.test(c.text) || ACTION_VERB.test(c.text) || /\bforward\b/i.test(c.text)))
      .sort((x, y) => y.text.length - x.text.length)[0];
    if (weak) cause = { ...weak, overlap: 0, cues: 1, score: 1, weak: true };
  }

  // A half match for an unknown button is not enough once page text names (most of the words of) that button.
  if (requested && !strongMatch && tier0.viaAllowlist && cause && !cause.weak && cause.overlap >= 0.75) requested = false;
  if (cause?.weak && requested) cause = null;   // an unnamed order to AI is not about something the user asked for
  const risk = riskOf(a);
  // An unnamed order to AI on the page (a weak cause) is not about this particular action, so it cannot by itself pause a low-risk one.
  const influenced = Boolean(cause) && !(cause.weak && risk.tier === 'low');
  // Interrupt budget: stay quiet unless the user did not ask AND (it is high stakes OR the page pushed it).
  let interrupt = false; let reason;
  if (requested && !influenced) reason = 'you asked for this';
  else if (requested && influenced) reason = 'you asked for this, though page text also mentions it';
  else if (risk.tier === 'high') { interrupt = true; reason = 'you did not ask for this and it has real consequences'; }
  else if (influenced) { interrupt = true; reason = 'page text told the agent to do this'; }
  else reason = 'low stakes and not influenced by page instructions';
  if (delegated && !influenced && !interrupt) reason += ' (you told it to follow the page)';
  if (delegated && risk.tier === 'high' && !requested) { interrupt = true; reason = 'you told the agent to follow the page, but this has real consequences'; }

  const emails = uniq([...(label.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []), ...((cause?.text || '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [])]);
  const what = `${a.verb} ${a.role || 'control'}${label ? ` "${label}"` : ''}`;
  const lines = [];
  lines.push(`${interrupt ? 'PAUSED' : 'ALLOWED'}: ${what}`);
  lines.push(requested ? `You asked for this (your request mentions "${label}").` : `You did not ask for this.`);
  if (cause?.weak) lines.push(`Text on ${cause.page || 'the page'} is addressed to AI agents and gives orders (it does not name this control):\n    "${cause.text.length > 200 ? cause.text.slice(0, 197) + '...' : cause.text}"`);
  else if (cause) lines.push(`Text on ${cause.page || 'the page'} pointed the agent at it:\n    "${cause.text.length > 200 ? cause.text.slice(0, 197) + '...' : cause.text}"`);
  else if (!requested && tainted) lines.push('The agent had read page content, but no single passage clearly told it to do this.');
  if (emails.length) lines.push(`Involves: ${emails.join(', ')}`);
  lines.push(`Risk: ${risk.tier} - ${risk.why}.`);
  lines.push(`Why ${interrupt ? 'you are being asked' : 'no prompt'}: ${reason}.`);

  return {
    action: { ...a, what }, tainted, requested, requestedOverlap: asked, delegated, influenced,
    cause: cause && { text: cause.text, page: cause.page, role: cause.role, score: cause.score, weak: Boolean(cause.weak) },
    risk, interrupt, reason, emails, card: lines.join('\n'),
  };
}
