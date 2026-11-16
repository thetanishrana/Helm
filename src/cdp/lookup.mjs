// Read-only lookup of what a CSS selector points at on the page the agent is driving, so a click on "#btn-3"
// is judged by the control's real label instead of being treated as unreadable. It connects straight to Chrome
// (not through the browser tap), only reads, and returns null on any failure: the caller then behaves as before.
import { WebSocket } from 'ws';

// Only plain CSS is resolved. Playwright's own engines (text=, role=, >>, etc.) are left to the label parser.
const PLAIN_CSS = /^(?:css=)?[#.\[a-zA-Z*][^>]*$/;

export const isPlainCss = (sel) => typeof sel === 'string' && sel.length < 300 && !/^(?:css=)?(text|role|xpath|internal:)/i.test(sel) && !/>>/.test(sel) && !/:(?:text|has-text|text-is|visible)\(/.test(sel) && PLAIN_CSS.test(sel);

const EXPR = (sel) => `(() => { try {
  const el = document.querySelector(${JSON.stringify(sel.replace(/^css=/, ''))}); if (!el) return null;
  const tag = el.tagName.toLowerCase(); const type = (el.getAttribute('type') || '').toLowerCase();
  const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'button' || (tag === 'input' && ['submit', 'button', 'reset', 'image'].includes(type)) ? 'button' : tag === 'input' || tag === 'textarea' ? 'textbox' : tag === 'select' ? 'combobox' : tag);
  const label = (el.getAttribute('aria-label') || (tag === 'input' ? el.value : '') || el.innerText || el.textContent || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.getAttribute('name') || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
  return JSON.stringify({ role, label, tag });
} catch (e) { return null; } })()`;

export async function lookupSelector(selector, chromePort = 9222, { timeoutMs = 1500 } = {}) {
  if (!isPlainCss(selector)) return null;
  try {
    const list = await (await fetch(`http://127.0.0.1:${chromePort}/json/list`, { signal: AbortSignal.timeout(timeoutMs) })).json();
    const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    const target = pages.find((t) => t.url && t.url !== 'about:blank') || pages.at(-1);
    if (!target) return null;
    return await new Promise((resolve) => {
      const ws = new WebSocket(target.webSocketDebuggerUrl); const done = (v) => { clearTimeout(timer); try { ws.close(); } catch {} resolve(v); };
      const timer = setTimeout(() => done(null), timeoutMs);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: EXPR(selector), returnByValue: true } })));
      ws.on('message', (m) => { let j; try { j = JSON.parse(m); } catch { return; } if (j.id !== 1) return; let v = null; try { v = JSON.parse(j.result?.result?.value); } catch {} done(v && v.label ? v : null); });
      ws.on('error', () => done(null));
    });
  } catch { return null; }
}

// Fill in role and label on interact actions that only have a selector.
export async function resolveSelectors(actions, chromePort) {
  await Promise.all(actions.map(async (a) => {
    if (a.risk !== 'interact' || a.label || !a.selector) return;
    const hit = await lookupSelector(a.selector, chromePort);
    if (hit) Object.assign(a, { label: hit.label, role: a.role || hit.role, resolvedByLookup: true });
  }));
}
