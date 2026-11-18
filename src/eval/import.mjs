// Split a pasted reply (from an outside author such as ChatGPT) into eval pages.
// Format: marker lines `=== FILE: <id>/manifest.json ===` and `=== FILE: <id>/page.html ===`, each followed by the file's
// contents. Markdown code fences around the contents are removed. Only those two file names in a plain folder name are
// accepted, so a reply cannot write anywhere else. A line `=== NOTES ===` ends the last file (the author's own remarks follow).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateManifest } from './manifest.mjs';

const MARKER = /^\s*={2,}\s*FILE:\s*([\w-]+)\/(manifest\.json|page\.html)\s*={2,}\s*$/;

export function parseBundle(text) {
  const files = new Map(); const problems = []; let cur = null;
  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    const m = MARKER.exec(line);
    if (m) { cur = { id: m[1], name: m[2], lines: [] }; files.set(`${m[1]}/${m[2]}`, cur); continue; }
    if (/^\s*={2,}\s*NOTES\s*={2,}\s*$/i.test(line)) { cur = null; continue; }   // the author's closing remarks
    if (/^\s*={2,}\s*FILE:/i.test(line)) { problems.push(`unrecognised file marker: ${line.trim().slice(0, 80)}`); cur = null; continue; }
    if (cur) cur.lines.push(line);
  }
  const out = [];
  for (const [path, f] of files) {
    let body = f.lines.join('\n').trim();
    const fenced = /^```[\w-]*\n([\s\S]*?)\n```/.exec(body); if (fenced) body = fenced[1].trim();   // contents inside a code fence; anything after it ("Hope this helps") is dropped
    if (!body) { problems.push(`${path}: empty`); continue; }
    out.push({ path, id: f.id, name: f.name, body: `${body}\n` });
  }
  const ids = [...new Set(out.map((f) => f.id))];
  for (const id of ids) {
    const m = out.find((f) => f.id === id && f.name === 'manifest.json'); const h = out.find((f) => f.id === id && f.name === 'page.html');
    if (!m) { problems.push(`${id}: no manifest.json`); continue; } if (!h) { problems.push(`${id}: no page.html`); continue; }
    let j; try { j = JSON.parse(m.body); } catch { problems.push(`${id}: manifest.json is not valid JSON`); continue; }
    if (j.id !== id) problems.push(`${id}: manifest id "${j.id}" does not match the folder name`);
    for (const e of validateManifest(j)) problems.push(`${id}: ${e}`);
    if (j.kind === 'attack' && j.injection?.text && !h.body.includes(j.injection.text.slice(0, 40))) problems.push(`${id}: the injection text does not appear in page.html (the manifest must quote it exactly)`);
    if (j.kind === 'attack' && j.goal?.label && !h.body.includes(j.goal.label)) problems.push(`${id}: the goal control label "${j.goal.label}" does not appear in page.html`);
  }
  return { files: out, ids, problems };
}

export function writeBundle(bundle, dir) {
  for (const f of bundle.files) { mkdirSync(join(dir, f.id), { recursive: true }); writeFileSync(join(dir, f.id, f.name), f.body); }
  return bundle.files.length;
}
