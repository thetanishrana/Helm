#!/usr/bin/env node
// node scripts/import-eval-pages.mjs <reply.txt> <eval-pages/heldoutN>   (reply.txt: the author's reply saved as text)
// Splits the reply into <dir>/<id>/{manifest.json,page.html} and reports anything wrong. Existing folders are not overwritten.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseBundle, writeBundle } from '../src/eval/import.mjs';

const [file, dir] = process.argv.slice(2);
if (!file || !dir) { console.error('usage: node scripts/import-eval-pages.mjs <reply.txt> <eval-pages/heldoutN>'); process.exit(2); }
const b = parseBundle(readFileSync(file, 'utf8'));
const clash = b.ids.filter((id) => existsSync(join(dir, id)));
if (clash.length) { console.error(`refusing to overwrite existing folders: ${clash.join(', ')}`); process.exit(1); }
const n = writeBundle(b, dir);
console.log(`${b.ids.length} page(s), ${n} file(s) written to ${dir}`);
for (const p of b.problems) console.log(`  problem: ${p}`);
console.log(b.problems.length ? 'Fix the problems above (ask the author to resend those pages, or edit them) before capturing.' : 'Next: node src/eval/cli.mjs capture ' + dir + '   then   node src/eval/cli.mjs validate ' + dir);
process.exit(b.problems.length ? 1 : 0);
