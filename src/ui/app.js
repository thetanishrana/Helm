// Everything shown here can contain text from untrusted web pages: always set text with textContent and never build markup from it.
const token = document.querySelector('meta[name=helm-token]').content;
const $ = (id) => document.getElementById(id);
const events = []; const confirmed = new Map(); const decided = new Set(); const quietAllowed = [];
const ALLOW_DELAY_MS = 1200;   // hypothesis: a short delay on Allow for high-risk cards discourages reflexive approval

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids) n.append(k); return n; };
const clock = (t) => new Date(t).toLocaleTimeString([], { hour12: false });

function setStatus() {
  const pending = events.filter((e) => e.type === 'gate.pending' && !decided.has(e.id));
  const ended = events.some((e) => e.type === 'task.end');
  const untrusted = events.some((e) => e.type === 'model.turn' && e.untrustedChunks > 0);
  const h = $('status');
  let level = 'ok', text = 'On task';
  if (pending.length) { level = 'paused'; text = `Paused: ${pending.length} decision${pending.length > 1 ? 's' : ''} waiting`; }
  else if (ended) { level = 'done'; text = 'Task finished'; }
  else if (untrusted) { level = 'untrusted'; text = 'Agent has read untrusted content'; }
  h.className = level; $('status-text').textContent = text;
  document.title = (pending.length ? `(${pending.length}) ` : '') + 'Helm';
}

function renderCard(p) {
  const x = p.explanation || {};
  const card = el('div', { className: 'card', id: `card-${p.id}`, role: 'group' });
  card.setAttribute('aria-label', `Decision needed: ${p.what}`);
  card.append(el('h3', { textContent: `Paused: ${p.what}` }));
  card.append(el('div', { className: 'line', textContent: x.requested ? `You asked for this (your request mentions "${x.action?.label ?? ''}").` : 'You did not ask for this.' }));
  if (x.cause) {
    const label = x.cause.weak ? `Text on ${x.cause.page || 'the page'} is addressed to AI agents and gives orders:` : `Text on ${x.cause.page || 'the page'} pointed the agent at it:`;
    card.append(el('div', { className: 'line', textContent: label }), el('blockquote', { textContent: x.cause.text }));
  } else if (!x.requested) card.append(el('div', { className: 'line', textContent: 'The agent had read page content, but no single passage clearly told it to do this.' }));
  if (x.emails?.length) card.append(el('div', { className: 'line', textContent: `Involves: ${x.emails.join(', ')}` }));
  card.append(el('div', { className: 'line', textContent: `Risk: ${x.risk?.tier ?? '?'} - ${x.risk?.why ?? ''}.` }));
  const conf = el('span', { className: 'tag', id: `conf-${p.id}`, textContent: 'checking by re-run…' });
  card.append(el('div', { className: 'why' }, `Why you are being asked: ${x.reason ?? p.reason ?? ''}.`, conf));
  const block = el('button', { className: 'block', textContent: 'Block' });
  const allow = el('button', { className: 'allow', textContent: 'Allow once' });
  const act = el('div', { className: 'actions' }, block, allow);
  block.onclick = () => decide(p.id, false); allow.onclick = () => decide(p.id, true);
  if (x.risk?.tier === 'high') { allow.disabled = true; let n = ALLOW_DELAY_MS; allow.textContent = 'Allow once…'; setTimeout(() => { allow.disabled = false; allow.textContent = 'Allow once'; }, n); }
  card.append(act);
  applyConfirmation(card, p.id);
  setTimeout(() => block.focus(), 0);
  return card;
}

function applyConfirmation(card, id) {
  const c = confirmed.get(id); const tag = (card || document).querySelector?.(`#conf-${id}`); if (!tag) return;
  if (!c) return;
  tag.className = 'tag ' + (c.verdict === 'confirmed' ? 'confirmed' : 'unconfirmed');
  tag.textContent = c.verdict === 'confirmed' ? 'confirmed by re-run' : c.verdict === 'skipped' ? 're-run check off' : 'could not confirm';
}

async function decide(id, allow) {
  document.querySelectorAll(`#card-${id} button`).forEach((b) => (b.disabled = true));
  const r = await fetch('/api/decide', { method: 'POST', headers: { 'content-type': 'application/json', 'x-helm-token': token }, body: JSON.stringify({ id, allow }) });
  if (!r.ok) document.querySelector(`#card-${id}`)?.append(el('div', { className: 'why', textContent: 'That decision was no longer pending.' }));
}

function renderPending() {
  const box = $('pending');
  const pending = events.filter((e) => e.type === 'gate.pending' && !decided.has(e.id));
  const have = new Set([...box.querySelectorAll('.card')].map((c) => c.id));
  for (const p of pending) if (!have.has(`card-${p.id}`)) { if (box.classList.contains('empty')) { box.textContent = ''; box.classList.remove('empty'); } box.append(renderCard(p)); }
  for (const c of box.querySelectorAll('.card')) if (!pending.some((p) => `card-${p.id}` === c.id)) c.remove();
  if (!box.querySelector('.card')) { box.className = 'empty'; box.textContent = 'Nothing is waiting on you.'; }
}

function line(e) {
  switch (e.type) {
    case 'task.start': return ['', 'Task started'];
    case 'navigate': return ['', `Opened ${e.url}`];
    case 'model.turn': return ['quiet', e.tools?.length ? `Agent decided: ${e.tools.join('; ')}` : 'Agent replied'];
    case 'gate.allowed': return ['quiet', `Allowed without asking: ${e.what} (${e.reason})`];
    case 'gate.pending': return ['blocked', `Held for your decision: ${e.what}`];
    case 'gate.decided': return [e.allow ? '' : 'blocked', `${e.allow ? 'You allowed' : e.by === 'timeout' ? 'Blocked (no decision in time)' : 'Blocked'}${e.reflexive ? ' - answered in under a second' : ''}`];
    case 'gate.repeat-blocked': return ['blocked', `Agent tried again after you declined: ${e.what} (blocked without asking)`];
    case 'action': return ['', `Browser did: ${e.what}`];
    case 'task.end': return ['', 'Task finished'];
    default: return null;
  }
}
function renderTimeline() {
  const ol = $('timeline'); ol.textContent = '';
  for (const e of events) { const l = line(e); if (!l) continue; ol.append(el('li', {}, el('time', { textContent: clock(e.t) }), el('span', { className: l[0], textContent: l[1] }))); }
}

async function showReceipt() {
  const r = await (await fetch('/api/receipt')).json(); const b = $('receipt-body'); b.textContent = '';
  const ul = (items, empty) => { const u = el('ul'); if (!items.length) u.append(el('li', { textContent: empty })); for (const i of items) u.append(el('li', { textContent: i })); return u; };
  b.append(el('h3', { textContent: 'Receipt' }),
    el('p', { textContent: `${r.modelTurns} agent steps. ${r.held.length} held for you, ${r.blocked} blocked.` }),
    el('h4', { textContent: 'Blocked or held' }), ul(r.held.map((h) => `${h.what} - ${h.outcome}${h.cause ? ` (page text: "${h.cause.slice(0, 120)}")` : ''}`), 'Nothing was held.'),
    el('h4', { textContent: 'Done in the browser' }), ul(r.actionsExecuted.map((a) => a.what), 'No browser actions recorded.'),
    el('h4', { textContent: 'Allowed without asking' }), ul(r.allowedWithoutAsking.map((a) => `${a.what} (${a.reason})`), 'None.'),
    el('h4', { textContent: 'Pages visited' }), ul(r.pagesVisited, 'None recorded.'),
    el('p', { className: 'why', textContent: `Not tracked in this version: ${r.notTracked.join(', ')}.` }));
  $('receipt').showModal();
}
$('receipt-btn').onclick = showReceipt;

function onEvent(e) {
  events.push(e);
  if (e.type === 'gate.decided') decided.add(e.id);
  if (e.type === 'gate.confirmed') { confirmed.set(e.id, e); applyConfirmation(document, e.id); }
  setStatus(); renderPending(); renderTimeline();
}
const es = new EventSource('/api/events');
es.onmessage = (m) => onEvent(JSON.parse(m.data));
es.onerror = () => { $('status-text').textContent = 'Connection lost - reload to reconnect'; };
