// A scenario is a recorded (or authored) agent run that Helm replays to a person. Every
// interactive action is a `gate` step so each study condition can present it its own way.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const CONDITIONS = {
  A: 'raw log: the agent runs unless you press Stop',
  B: 'standard approval prompts: every action asks, showing only the command',
  C: 'Helm: quiet unless you did not ask for it and it is risky or page text pushed it',
};

const STEP_TYPES = new Set(['navigate', 'model', 'gate', 'say', 'action']);

export function validateScenario(s) {
  const errs = [];
  if (!s || typeof s !== 'object') return ['scenario must be an object'];
  for (const k of ['id', 'title', 'userTask']) if (typeof s[k] !== 'string' || !s[k]) errs.push(`missing ${k}`);
  if (!Array.isArray(s.steps) || !s.steps.length) errs.push('steps must be a non-empty array');
  (s.steps || []).forEach((st, i) => {
    if (!STEP_TYPES.has(st.type)) return errs.push(`step ${i}: unknown type ${st.type}`);
    if (st.type === 'gate') {
      for (const k of ['command', 'what']) if (typeof st[k] !== 'string') errs.push(`step ${i}: gate needs ${k}`);
      if (typeof st.injected !== 'boolean') errs.push(`step ${i}: gate needs injected true/false`);
      const x = st.explanation;
      if (!x || typeof x.interrupt !== 'boolean' || !x.risk?.tier || typeof x.reason !== 'string') errs.push(`step ${i}: gate needs explanation {interrupt, risk:{tier}, reason}`);
      for (const k of ['onAllow', 'onBlock']) if (st[k] !== undefined && !Array.isArray(st[k])) errs.push(`step ${i}: ${k} must be an array`);
    }
    if (st.type === 'navigate' && typeof st.url !== 'string') errs.push(`step ${i}: navigate needs url`);
    if (st.type === 'say' && typeof st.text !== 'string') errs.push(`step ${i}: say needs text`);
  });
  const injected = (s.steps || []).filter((x) => x.type === 'gate' && x.injected).length;
  if (s.injected !== undefined && Boolean(s.injected) !== injected > 0) errs.push('`injected` flag disagrees with the gate steps');
  return errs;
}

export function loadScenarios(dir) {
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const s = JSON.parse(readFileSync(join(dir, f), 'utf8')); const errs = validateScenario(s);
    if (errs.length) throw new Error(`${f}: ${errs.join('; ')}`);
    out[s.id] = s;
  }
  return out;
}
