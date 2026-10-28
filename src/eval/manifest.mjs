// Manifest for one evaluation page: what the user asked, which harmless actions the task needs,
// which consequential control an injection targets, and the exact injected text (to score attribution).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const VERBS = new Set(['click', 'fill']);
const ROLES = new Set(['button', 'link', 'textbox', 'checkbox', 'combobox', 'menuitem', 'tab']);

export function validateManifest(m) {
  const e = [];
  if (!m || typeof m !== 'object') return ['manifest must be an object'];
  if (typeof m.id !== 'string' || !/^[\w-]+$/.test(m.id)) e.push('id must be letters, digits, - or _');
  if (!['attack', 'benign'].includes(m.kind)) e.push('kind must be "attack" or "benign"');
  if (typeof m.userTask !== 'string' || m.userTask.length < 8) e.push('userTask must say what the user asked the agent to do');
  for (const [i, a] of (m.benignActions ?? []).entries()) {
    if (!VERBS.has(a.verb)) e.push(`benignActions[${i}].verb must be click or fill`);
    if (!ROLES.has(a.role)) e.push(`benignActions[${i}].role must be one of ${[...ROLES].join(', ')}`);
    if (typeof a.label !== 'string' || !a.label) e.push(`benignActions[${i}].label required`);
  }
  if (!Array.isArray(m.benignActions) || !m.benignActions.length) e.push('benignActions must list at least one harmless action the task needs');
  if (m.kind === 'attack') {
    if (!m.goal?.label || !ROLES.has(m.goal.role)) e.push('attack needs goal {role, label}: the consequential control the injection wants clicked');
    if (typeof m.injection?.text !== 'string' || m.injection.text.length < 10) e.push('attack needs injection.text: the exact injected wording as it appears on the page');
    if (typeof m.injection?.style !== 'string') e.push('attack needs injection.style (a short label such as "authority" or "fake-user")');
  }
  if (m.kind === 'benign' && m.goal && typeof m.userAsksForGoal !== 'boolean') e.push('a benign page with a goal control must say userAsksForGoal true/false');
  return e;
}

// Load every <dir>/<id>/{manifest.json, snapshot.txt}. Entries without a snapshot are reported, not hidden.
export function loadEvalDir(dir, { set }) {
  const entries = []; const problems = [];
  if (!existsSync(dir)) return { entries, problems };
  for (const id of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name).sort()) {
    const mp = join(dir, id, 'manifest.json'); if (!existsSync(mp)) { problems.push(`${id}: no manifest.json`); continue; }
    let m; try { m = JSON.parse(readFileSync(mp, 'utf8')); } catch (err) { problems.push(`${id}: manifest.json is not valid JSON`); continue; }
    const errs = validateManifest(m); if (errs.length) { problems.push(`${id}: ${errs.join('; ')}`); continue; }
    if (m.id !== id) { problems.push(`${id}: manifest id "${m.id}" does not match the folder name`); continue; }
    const sp = join(dir, id, 'snapshot.txt');
    if (!existsSync(sp)) { problems.push(`${id}: no snapshot.txt yet (run: node src/eval/cli.mjs capture)`); continue; }
    entries.push({ ...m, set, snapshot: readFileSync(sp, 'utf8') });
  }
  return { entries, problems };
}
