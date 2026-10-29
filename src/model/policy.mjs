import { isReadOnlyJs } from './jsread.mjs';
// Classify a tool_use: does it act on a page (or on something we cannot see into)?
// Data-driven: add a CLI by adding a row to CLIS.

const CLIS = {
  'playwright-cli': {
    interact: ['click', 'dblclick', 'fill', 'type', 'drag', 'drop', 'select', 'upload', 'check', 'uncheck', 'press', 'keydown', 'keyup', 'mousedown', 'mouseup',
      'cookie-set', 'cookie-delete', 'cookie-clear', 'localstorage-set', 'localstorage-delete', 'localstorage-clear', 'sessionstorage-set', 'sessionstorage-delete',
      'sessionstorage-clear', 'state-load', 'route', 'dialog-accept', 'dialog-dismiss'],
    opaque: ['eval', 'run-code'],
    navigate: ['goto', 'tab-new', 'open', 'reload', 'go-back', 'go-forward'],
  },
  'agent-browser': {
    interact: ['click', 'dblclick', 'fill', 'type', 'press', 'key', 'keydown', 'keyup', 'select', 'check', 'uncheck', 'drag', 'upload', 'keyboard', 'chat', 'webmcp'],
    opaque: ['eval'],
    navigate: ['open', 'goto', 'navigate', 'read'],
  },
};
const BATCHES = { 'agent-browser': ['batch'] };
const OPAQUE_SCRIPT = /\b(playwright|puppeteer|selenium|chromium|connectOverCDP|chrome-remote-interface)\b|--remote-debugging|127\.0\.0\.1:9\d{3}/;
const EGRESS = /\b(curl|wget|http|nc|scp|rsync)\b/;

// Tokenize a shell line into segments of words, honoring quotes.
export function segments(line) {
  const segs = []; let words = []; let cur = ''; let q = null; let has = false;
  const endWord = () => { if (has) words.push(cur); cur = ''; has = false; };
  const endSeg = () => { endWord(); if (words.length) segs.push(words); words = []; };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"' && i + 1 < line.length) cur += line[++i]; else cur += c; continue; }
    if (c === '"' || c === "'") { q = c; has = true; continue; }
    if (c === '\\' && i + 1 < line.length) { cur += line[++i]; has = true; continue; }
    if (/\s/.test(c) && c !== '\n') { endWord(); continue; }
    if (c === '\n' || c === ';' || c === '|' || c === '&') { endSeg(); if ((c === '|' || c === '&') && line[i + 1] === c) i++; continue; }
    cur += c; has = true;
  }
  endSeg();
  return segs;
}

const ROLE_WORD = /^(button|link|textbox|checkbox|combobox|menuitem|tab|radio)$/;
const ROLE_NAME = /^(button|link|textbox|checkbox|combobox|menuitem|tab|radio)\s+["'](.+)["']$/;
const base = (w) => w.split('/').pop();

// A selector the agent invented (instead of a snapshot ref) often still names the control by its text.
export function labelFromSelector(sel) {
  const m = /:(?:text|has-text|text-is)\(\s*(['"])(.*?)\1\s*\)/.exec(sel) || /^(?:text|name)=['"]?(.+?)['"]?$/.exec(sel) || /\[(?:name|aria-label|title)=['"](.+?)['"]\]/.exec(sel);
  if (m) return m[m.length - 1];
  if (/^[\w][\w .,'@:/-]*$/.test(sel) && /[a-z]/i.test(sel) && !/^[.#]/.test(sel) && !/^(f\d+)?e\d+$/.test(sel) && sel.length < 80) return sel;   // plain words: "Refresh"
  return null;
}

// Find the element a ref points at, using snapshots already in the request.
export function resolveRef(ref, req) {
  const id = ref.replace(/^@/, '');
  for (const r of [...(req?.toolResults || [])].reverse()) {
    const m = new RegExp(`(\\w+)\\s+"([^"]*)"[^\\n]*\\[ref=${id}\\]`).exec(r.text);
    if (m) return { role: m[1], label: m[2] };
  }
  return null;
}

function classifySegment(words, req, out) {
  // strip env assignments, npx/exec wrappers and the CLI's global flags
  let i = 0;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
  if (['npx', 'pnpx', 'bunx', 'exec'].includes(base(words[i] || ''))) i++;
  const cli = base(words[i] || '');
  const spec = CLIS[cli];
  if (!spec) {
    const text = words.join(' ');
    if (['node', 'python', 'python3', 'bun', 'deno', 'ruby'].includes(cli) && OPAQUE_SCRIPT.test(text)) out.push({ risk: 'opaque', cli, verb: 'script', detail: text.slice(0, 120) });
    else if (cli === 'curl' || cli === 'wget') {
      const writes = /(^| )(-X *(POST|PUT|PATCH|DELETE)|-d|--data\S*|-F|--form|-T|--upload-file)( |=|$)/i.test(text);
      out.push({ risk: writes ? 'interact' : 'read', cli, verb: writes ? 'send' : 'fetch', detail: text.slice(0, 120) });
    }
    return;
  }
  i++;
  const rest = words.slice(i).filter((w) => !/^(-s=|--session[= ]|--raw$|--json$|--headed$)/.test(w));
  const verb = rest[0]; const args = rest.slice(1).filter((w) => !w.startsWith('--'));
  if (!verb) return;
  if ((BATCHES[cli] || []).includes(verb)) { for (const inner of args) for (const s of segments(inner)) classifySegment([cli, ...s], req, out); return; }
  let risk = spec.interact.includes(verb) ? 'interact' : spec.opaque.includes(verb) ? 'opaque' : spec.navigate.includes(verb) ? 'navigate' : 'read';
  if (risk === 'opaque' && verb !== 'script' && isReadOnlyJs(args.join(' '))) risk = 'read';   // code that only reads the page is not a risk
  const entry = { risk, cli, verb };
  const target = args.find((a) => /^@?(f\d+)?e\d+$/.test(a));
  if (target) Object.assign(entry, { ref: target }, resolveRef(target, req) || {});
  else if (args[0] && risk !== 'read') {
    entry.selector = args[0];
    // role-and-name selectors: `click 'button "Submit ticket"'` or `type textbox "Message" "text"`
    const rn = ROLE_NAME.exec(args[0]);
    if (rn) Object.assign(entry, { role: rn[1], label: rn[2] });
    else if (ROLE_WORD.test(args[0]) && args[1]) Object.assign(entry, { role: args[0], label: args[1] });
    else { const l = labelFromSelector(args[0]); if (l) entry.label = l; }
  }
  // `agent-browser find role button click --name "X"` style
  if (verb === 'find' && rest.includes('click')) { entry.risk = 'interact'; entry.verb = 'find-click'; const n = rest.indexOf('--name'); if (n >= 0) entry.label = rest[n + 1]; }
  out.push(entry);
}

export function classify(toolUse, req) {
  const actions = [];
  const name = toolUse.name || ''; const input = toolUse.input || {};
  if (name === 'Bash' && typeof input.command === 'string') for (const s of segments(input.command)) classifySegment(s, req, actions);
  else if (/browser_(click|type|fill_form|select_option|drag|hover_click|file_upload|press_key|handle_dialog)/.test(name)) {
    const e = { risk: 'interact', cli: 'mcp', verb: name.replace(/^.*browser_/, '') };
    if (input.ref) Object.assign(e, { ref: input.ref }, resolveRef(input.ref, req) || {});
    if (input.element) e.label ??= input.element;
    actions.push(e);
  } else if (/browser_(evaluate|run_code)/.test(name)) actions.push({ risk: 'opaque', cli: 'mcp', verb: name.replace(/^.*browser_/, '') });
  else if (name === 'computer' && /click|type|key|drag/.test(input.action || '')) actions.push({ risk: 'interact', cli: 'computer', verb: input.action, detail: JSON.stringify(input.coordinate || input.text || '') });
  const order = ['none', 'read', 'navigate', 'interact', 'opaque'];
  const risk = actions.reduce((m, a) => (order.indexOf(a.risk) > order.indexOf(m) ? a.risk : m), 'none');
  const gated = actions.filter((a) => a.risk === 'interact' || a.risk === 'opaque');
  const summary = gated.map((a) => a.risk === 'opaque' ? `run ${a.verb} (cannot tell what it does)` : `${a.verb} ${a.role ? `${a.role} ` : ''}${a.label ? `"${a.label}"` : a.ref || a.selector || a.detail || ''}`.trim()).join('; ');
  return { risk, gate: gated.length > 0, actions, summary };
}
