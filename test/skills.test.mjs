import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';

const ROOT = new URL('../.claude/skills/', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

test('third-party skills contain only prose: no scripts, no executables, no hook or tool grants', () => {
  assert.ok(existsSync(ROOT), 'skills folder exists');
  const files = walk(ROOT);
  const ALLOWED = new Set(['.md', '.txt']);
  for (const f of files) {
    assert.ok(ALLOWED.has(extname(f)), `${f}: only .md and .txt files are allowed in a vetted skill`);
    assert.equal(statSync(f).mode & 0o111, 0, `${f}: must not be executable`);
  }
  for (const f of files.filter((x) => x.endsWith('SKILL.md'))) {
    const head = readFileSync(f, 'utf8').split('---')[1] ?? '';
    assert.doesNotMatch(head, /allowed-tools|hooks|permission/i, `${f}: frontmatter must not grant tools or hooks`);
  }
});

test('the vendored frontend-design skill is unmodified from the vetted upstream copy', () => {
  const dir = join(ROOT, 'frontend-design'); const prov = readFileSync(join(dir, 'PROVENANCE.md'), 'utf8');
  for (const name of ['SKILL.md', 'LICENSE.txt']) {
    const recorded = new RegExp(`\`${name}\`[^\\n]*?sha256 \`([0-9a-f]{64})\``).exec(prov)?.[1] ?? new RegExp(`${name.replace('.', '\\.')}\` \\(sha256 \`([0-9a-f]{64})\``).exec(prov)?.[1];
    assert.ok(recorded, `${name}: hash recorded in PROVENANCE.md`);
    assert.equal(sha(join(dir, name)), recorded, `${name} changed since it was vetted; re-vet it and update PROVENANCE.md`);
  }
});
