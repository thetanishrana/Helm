// Is a snippet passed to `eval` / `run-code` read-only? Agents often use these just to read page text, and
// treating every snippet as "cannot tell what it does" paused benign runs constantly. This accepts only a
// small grammar: string literals, numbers, a fixed list of property and method names that read, and arrow
// functions over them. Anything else (assignment, calls to unknown names, click/submit/fetch, template
// strings, computed property names, eval/Function) is NOT read-only, so it stays "opaque" and is paused.
// An allowlist is used because a denylist can be dodged ("cl"+"ick"); names that are not listed are refused.

const READ_NAMES = new Set(`document window location href origin pathname hostname title body documentElement head
querySelector querySelectorAll getElementById getElementsByTagName getElementsByClassName closest matches
textContent innerText innerHTML outerHTML getAttribute hasAttribute id name type placeholder value checked disabled className classList contains
tagName children childNodes firstChild lastChild parentElement nextElementSibling previousElementSibling length
map filter forEach find some every join slice substring substr charAt includes indexOf trim toLowerCase toUpperCase split replace match startsWith endsWith at first last
Array from of JSON stringify parse Object keys values entries Math min max String Number Boolean
console log scrollIntoView
page content url allTextContents allInnerTexts count locator getByText getByRole getByLabel innerText textContent isVisible isEnabled inputValue
await async return true false null undefined if else`.split(/\s+/));
// Names that look like reads but can change state or leak data.
const NEVER = new Set(['click', 'submit', 'dispatchEvent', 'fetch', 'XMLHttpRequest', 'eval', 'Function', 'constructor', 'prototype', '__proto__', 'import', 'require', 'open', 'cookie', 'localStorage', 'sessionStorage', 'sendBeacon', 'write', 'remove', 'append', 'appendChild', 'insertAdjacentHTML', 'setAttribute', 'fill', 'type', 'press', 'check', 'hover', 'focus', 'select', 'evaluate', 'evaluateAll', 'setTimeout', 'setInterval', 'WebSocket', 'postMessage', 'assign', 'replaceWith', 'reload', 'goto', 'navigate', 'download', 'dblclick', 'tap']);
// `type` is a property read on inputs (el.type) but also a Playwright write; allow it only after a dot with no call.

export function isReadOnlyJs(code) {
  if (typeof code !== 'string' || !code.trim() || code.length > 2000) return false;
  let s = code;
  if (/`|\$\{|\/\*|\/\/|\\u|\\x/.test(s.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, ''))) return false;   // template strings, comments, escapes outside literals
  if (/\[\s*["']/.test(code)) return false;                                                                     // obj['name']: a name built from a string
  s = s.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, ' 0 ');                                              // string literals carry no code
  if (/["'`]/.test(s)) return false;                                                                            // an unterminated literal
  // arrow-function parameters are local names and may be called/read freely
  const params = new Set();
  for (const m of s.matchAll(/(?:\(([^()]*)\)|\b([A-Za-z_$][\w$]*))\s*=>/g)) for (const p of (m[1] ?? m[2]).split(',')) { const n = p.trim().replace(/^\.\.\./, ''); if (/^[A-Za-z_$][\w$]*$/.test(n)) params.add(n); }
  // assignment, increment, compound operators, computed access, comma-free statement tricks
  const noArrows = s.replace(/=>/g, '  ');
  if (/(^|[^=!<>])=(?!=)|\+\+|--|[-+*/%&|^]=|\?\?=/.test(noArrows)) return false;                                // any assignment
  if (/\[\s*[^\]\d\s][^\]]*\]/.test(s)) return false;                                                           // computed names: only numeric indexes
  const ids = s.match(/[A-Za-z_$][\w$]*/g) || [];
  for (const id of ids) {
    if (params.has(id)) continue;
    if (NEVER.has(id) && !(id === 'type')) return false;
    if (!READ_NAMES.has(id)) return false;
  }
  // `.type(` is a call (Playwright typing), `.type` alone is a property read
  if (/\.\s*type\s*\(/.test(s)) return false;
  return true;   // every name passed the allowlist and nothing assigns or computes
}
