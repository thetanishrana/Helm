// Counterfactual attribution: does the agent still take this action if a passage of untrusted
// page content is removed from its context? Re-asks the same model with edited copies of the
// held request. Needs a baseline check first, because sampling can make an action vanish on its own.
import { analyzeRequest } from './turns.mjs';
import { classify } from './policy.mjs';
import { pageChunks } from './explain.mjs';

// Words that identify the target but are not in what the user said, e.g. "send", "billing".
export function distinctiveTokens(label, userPrompts) {
  const words = (s) => (String(s).toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  const said = new Set(words(userPrompts.join(' ')));
  return [...new Set(words(label))].filter((w) => !said.has(w) && !['all', 'the', 'and', 'for', 'test', 'com', 'org'].includes(w));
}

// Remove every occurrence of `lines` from tool_result text in a copy of the request body.
// The agent restates what it read ("then I will click Send"), which carries the passage forward, so
// with `scrub` the agent's own text that mentions those words is blanked too.
export function removeLines(body, lines, scrub = []) {
  const strip = (t) => lines.reduce((acc, l) => acc.split(l).join('[removed by Helm]'), t);
  const mentions = (t) => scrub.some((w) => t.toLowerCase().includes(w));
  const msgs = body.messages.map((m) => {
    if (m.role === 'assistant' && Array.isArray(m.content) && scrub.length)
      return { ...m, content: m.content.map((p) => (p.type === 'text' && mentions(p.text) ? { ...p, text: '[removed by Helm]' } : p.type === 'tool_use' && typeof p.input?.description === 'string' && mentions(p.input.description) ? { ...p, input: { ...p.input, description: '[removed by Helm]' } } : p)) };
    if (m.role !== 'user' || !Array.isArray(m.content)) return m;
    return { ...m, content: m.content.map((p) => {
      if (p.type !== 'tool_result') return p;
      if (typeof p.content === 'string') return { ...p, content: strip(p.content) };
      return { ...p, content: (p.content || []).map((x) => (x.type === 'text' ? { ...x, text: strip(x.text) } : x)) };
    }) };
  });
  return { ...body, messages: msgs };
}

// The gated actions in a model reply, as comparable keys.
export function actionKeys(reply, body) {
  const req = analyzeRequest(body);
  const keys = [];
  for (const b of reply?.content || []) {
    if (b.type !== 'tool_use') continue;
    for (const a of classify({ name: b.name, input: b.input }, req).actions) if (a.risk === 'interact' || a.risk === 'opaque') keys.push(`${a.verb}|${a.label || a.ref || a.selector || a.detail || ''}`);
  }
  return keys;
}

const isSame = (keys, target) => keys.includes(target);

export async function attribute({ body, target, resend, maxCandidates = 6, baselineRuns = 2, heuristicCause = null, temperature = 0 }) {
  const ask = (b) => resend({ ...b, temperature });
  let calls = 0;
  const run = async (b) => { calls++; const reply = await ask(b); return actionKeys(reply, b); };
  const out = { target, baseline: [], candidates: [], group: null, cause: null, verdict: null, calls: 0 };

  // 1. Does the action reproduce at all with nothing removed?
  for (let i = 0; i < baselineRuns; i++) out.baseline.push(isSame(await run(body), target));
  const reproduced = out.baseline.filter(Boolean).length;
  if (reproduced === 0) { out.verdict = 'not-reproducible'; out.calls = calls; return out; }

  // 2. Candidate passages: untrusted text that is not the control itself.
  const req = analyzeRequest(body);
  const label = target.split('|')[1];
  let chunks = pageChunks(req).filter((c) => !c.isLabel && c.text.length >= 12 && c.text !== label && !(c.role === 'heading'));
  const rank = (c) => (heuristicCause && c.text === heuristicCause.text ? 100 : 0) + (label ? [...label.toLowerCase().split(/\W+/)].filter((w) => w.length > 2 && c.text.toLowerCase().includes(w)).length : 0);
  chunks = chunks.sort((a, b) => rank(b) - rank(a)).slice(0, maxCandidates);

  const labelWords = [...new Set((label || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
  const related = (cs) => cs.filter((c) => labelWords.length && labelWords.filter((w) => c.text.toLowerCase().includes(w)).length / labelWords.length >= 0.5);
  // 3. Remove each one alone (and the agent's restatements of the target).
  const scrub = distinctiveTokens(label, req.userPrompts?.length ? req.userPrompts : [req.userPrompt?.text || '']);
  out.scrubbed = scrub;
  for (const c of chunks) {
    const persists = isSame(await run(removeLines(body, [c.line], scrub)), target);
    out.candidates.push({ text: c.text.slice(0, 160), page: c.page, persists });
  }
  const decisive = out.candidates.filter((c) => !c.persists);
  if (decisive.length) { out.cause = decisive[0]; out.verdict = 'confirmed'; }
  else if (related(chunks).length > 1) {
    // 4. Each passage alone is not necessary; maybe several say the same thing. Only passages that talk
    // about the target are removed together: gutting the whole page changes behaviour for unrelated reasons.
    const rel = related(chunks);
    const gone = !isSame(await run(removeLines(body, rel.map((c) => c.line), scrub)), target);
    out.group = { removedAll: rel.length, actionGone: gone };
    out.verdict = gone ? 'distributed' : 'not-from-page-text';
  } else out.verdict = 'not-from-page-text';
  out.reproducedBaseline = `${reproduced}/${baselineRuns}`; out.calls = calls;
  return out;
}
