// Everything shown here can contain text from untrusted web pages: always set text with textContent
// and never build markup from it.
const token = document.querySelector('meta[name=helm-token]').content;
const $ = (id) => document.getElementById(id);
let events = []; let confirmed = new Map(); let decided = new Set(); let meta = {}; let studyDone = false;
const ALLOW_DELAY_MS = 1200;   // hypothesis: a short delay on Allow for high-risk cards discourages reflexive approval
const TLX = [['mental', 'Mental demand', 'How much thinking and attention did watching require?'], ['physical', 'Physical demand', 'How much physical activity did it take?'], ['temporal', 'Time pressure', 'How hurried or rushed did it feel?'], ['performance', 'Performance', 'How successful were you at catching problems? (0 = perfect, 100 = failure)'], ['effort', 'Effort', 'How hard did you have to work?'], ['frustration', 'Frustration', 'How irritated, stressed or annoyed were you?']];

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids) n.append(k); return n; };
const clock = (t) => new Date(t).toLocaleTimeString([], { hour12: false });
const cond = () => (meta.mode === 'replay' ? meta.condition : 'C');   // live runs behave like condition C
const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-helm-token': token }, body: JSON.stringify(body || {}) });

function setStatus() {
  const pending = events.filter((e) => e.type === 'gate.pending' && !decided.has(e.id));
  const ended = events.some((e) => e.type === 'task.end');
  const untrusted = events.some((e) => e.type === 'model.turn' && e.untrustedChunks > 0);
  const h = $('status'); let level = 'ok', text = 'On task';
  if (cond() !== 'C') { level = ended ? 'done' : 'ok'; text = ended ? 'The agent has finished' : 'The agent is working'; }   // the ambient line is part of Helm only
  else if (pending.length) { level = 'paused'; text = `Paused: ${pending.length} decision${pending.length > 1 ? 's' : ''} waiting`; }
  else if (ended) { level = 'done'; text = 'Task finished'; }
  else if (untrusted) { level = 'untrusted'; text = 'Agent has read untrusted content'; }
  if (studyDone) { level = 'done'; text = 'All tasks finished. Thank you.'; }
  h.className = level; $('status-text').textContent = text;
  $('receipt-btn').hidden = cond() !== 'C';
  document.title = (pending.length ? `(${pending.length}) ` : '') + 'Helm';
}

function renderCard(p) {
  const x = p.explanation || {};
  const card = el('div', { className: 'card' + (x.commandOnly ? ' plain' : ''), id: `card-${p.id}`, role: 'group' });
  card.setAttribute('aria-label', `Decision needed: ${p.what}`);
  const block = el('button', { className: 'block', textContent: x.commandOnly ? 'Deny' : 'Block' });
  const allow = el('button', { className: 'allow', textContent: x.commandOnly ? 'Approve' : 'Allow once' });
  block.onclick = () => decide(p.id, false); allow.onclick = () => decide(p.id, true);
  if (x.commandOnly) {   // the standard prompt: the command and nothing else
    card.append(el('h3', { textContent: 'The agent wants to run a command' }), el('code', { textContent: x.command }), el('div', { className: 'actions' }, allow, block));
    return card;
  }
  card.append(el('h3', { textContent: `Paused: ${p.what}` }));
  card.append(el('div', { className: 'line', textContent: x.requested ? `You asked for this (your request mentions "${x.action?.label ?? ''}").` : 'You did not ask for this.' }));
  if (x.cause) {
    const label = x.cause.weak ? `Text on ${x.cause.page || 'the page'} is addressed to AI agents and gives orders:` : `Text on ${x.cause.page || 'the page'} pointed the agent at it:`;
    card.append(el('div', { className: 'line', textContent: label }), el('blockquote', { textContent: x.cause.text }));
  } else if (!x.requested) card.append(el('div', { className: 'line', textContent: 'The agent had read page content, but no single passage clearly told it to do this.' }));
  if (x.emails?.length) card.append(el('div', { className: 'line', textContent: `Involves: ${x.emails.join(', ')}` }));
  card.append(el('div', { className: 'line', textContent: `Risk: ${x.risk?.tier ?? '?'} - ${x.risk?.why ?? ''}.` }));
  const conf = el('span', { className: 'tag', id: `conf-${p.id}`, textContent: meta.mode === 'replay' ? '' : 'checking by re-run…' });
  card.append(el('div', { className: 'why' }, `Why you are being asked: ${x.reason ?? p.reason ?? ''}.`, conf));
  if (x.risk?.tier === 'high') { allow.disabled = true; allow.textContent = 'Allow once…'; setTimeout(() => { allow.disabled = false; allow.textContent = 'Allow once'; }, ALLOW_DELAY_MS); }
  card.append(el('div', { className: 'actions' }, block, allow));
  applyConfirmation(card, p.id);
  setTimeout(() => block.focus(), 0);
  return card;
}

function applyConfirmation(root, id) {
  const c = confirmed.get(id); const tag = root.querySelector?.(`#conf-${id}`); if (!tag || !c) return;
  tag.className = 'tag ' + (c.verdict === 'confirmed' ? 'confirmed' : 'unconfirmed');
  tag.textContent = c.verdict === 'confirmed' ? 'confirmed by re-run' : c.verdict === 'skipped' ? 're-run check off' : 'could not confirm';
}

async function decide(id, allow) {
  document.querySelectorAll(`#card-${id} button`).forEach((b) => (b.disabled = true));
  const r = await post('/api/decide', { id, allow });
  if (!r.ok) document.querySelector(`#card-${id}`)?.append(el('div', { className: 'why', textContent: 'That decision was no longer pending.' }));
}

function renderPending() {
  const box = $('pending');
  const pending = events.filter((e) => e.type === 'gate.pending' && !decided.has(e.id));
  const have = new Set([...box.querySelectorAll('.card')].map((c) => c.id));
  for (const p of pending) if (!have.has(`card-${p.id}`)) { if (box.classList.contains('empty')) { box.textContent = ''; box.classList.remove('empty'); } box.append(renderCard(p)); }
  for (const c of box.querySelectorAll('.card')) if (!pending.some((p) => `card-${p.id}` === c.id)) c.remove();
  if (!box.querySelector('.card')) { box.className = 'empty'; box.textContent = cond() === 'A' ? '' : 'Nothing is waiting on you.'; }
  $('h-pending').hidden = cond() === 'A';
}

function line(e) {
  const raw = cond() !== 'C'; const A = cond() === 'A';
  switch (e.type) {
    case 'task.start': return ['', 'Task started'];
    case 'navigate': return ['', `Opened ${e.url}`];
    case 'model.turn': return e.tools?.length ? [raw ? 'cmd' : 'quiet', raw ? `$ ${e.tools.join('\n$ ')}` : `Agent decided: ${e.tools.join('; ')}`] : (e.say ? ['', `Agent: ${e.say}`] : null);
    case 'agent.say': return ['', `Agent: ${e.text}`];
    case 'agent.command': return A ? ['cmd', `$ ${e.command}`] : null;
    case 'agent.stopped': return ['blocked', 'You stopped the agent'];
    case 'model.error': return ['blocked', `Model request failed${e.status ? ` (HTTP ${e.status})` : ''}${e.error ? `: ${e.error}` : ''}`];
    case 'gate.allowed': return raw ? null : ['quiet', `Allowed without asking: ${e.what} (${e.reason})`];
    case 'gate.pending': return raw ? null : ['blocked', `Held for your decision: ${e.what}`];
    case 'gate.decided': return [e.allow ? '' : 'blocked', `${e.allow ? (raw ? 'You approved it' : 'You allowed') : e.by === 'timeout' ? 'Blocked (no decision in time)' : (raw ? 'You denied it' : 'Blocked')}${e.reflexive && !raw ? ' - answered in under a second' : ''}`];
    case 'gate.repeat-blocked': return ['blocked', `Agent tried again after you declined: ${e.what} (blocked without asking)`];
    case 'action': return raw ? null : ['', `Browser did: ${e.what}`];
    case 'task.end': return ['', 'Task finished'];
    default: return null;
  }
}
function renderTimeline() {
  const ol = $('timeline'); ol.textContent = '';
  for (const e of events) {
    if (e.type === 'agent.output') {   // what the command printed, as an agent transcript would show it (collapsed)
      const lines = e.text.split('\n').length;
      ol.append(el('li', {}, el('time', { textContent: clock(e.t) }), el('details', {}, el('summary', { textContent: `output (${lines} lines)` }), el('pre', { className: 'out', textContent: e.text }))));
      continue;
    }
    const l = line(e); if (!l) continue; ol.append(el('li', {}, el('time', { textContent: clock(e.t) }), el('span', { className: l[0], textContent: l[1] })));
  }
}

// ---- condition A: a visible window in which the person can stop the agent
let stopTimer = null;
function openStopWindow(e) {
  const bar = $('stopbar'); const cmd = events.slice().reverse().find((x) => x.type === 'agent.command');
  $('stop-cmd').textContent = cmd?.command ?? ''; bar.hidden = false;
  const fill = $('stop-fill'); fill.style.transition = 'none'; fill.style.transform = 'scaleX(1)';
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.transition = `transform ${e.ms}ms linear`; fill.style.transform = 'scaleX(0)'; }));
  const t0 = Date.now(); clearInterval(stopTimer);
  stopTimer = setInterval(() => { const left = Math.max(0, e.ms - (Date.now() - t0)); $('stop-count').textContent = `${Math.ceil(left / 1000)} s`; if (left <= 0) closeStopWindow(); }, 200);
}
function closeStopWindow() { clearInterval(stopTimer); $('stopbar').hidden = true; }
$('stop-btn').onclick = () => { closeStopWindow(); post('/api/stop'); };

// ---- study screens
function showIntro(e) {
  $('intro-title').textContent = meta.scenario?.title ?? 'Next task';
  $('intro-task').textContent = e.userTask;
  $('intro-help').textContent = ({ A: 'Watch what the agent does. If it starts to do something the person did not ask for, press Stop.', B: 'The agent will ask before each command. Approve or deny each one.', C: 'Helm will stay quiet unless something needs your decision.' })[meta.condition] ?? '';
  $('intro').showModal();
}
$('intro-start').onclick = async () => { await post('/api/start'); $('intro').close(); };
function showTlx() {
  const box = $('tlx-items'); box.textContent = '';
  for (const [k, name, hint] of TLX) box.append(el('div', { className: 'tlxrow' }, el('label', { htmlFor: `tlx-${k}`, textContent: name }), el('small', { textContent: hint }), Object.assign(el('input', { type: 'range', min: 0, max: 100, value: 50, id: `tlx-${k}`, name: k }), {})));
  $('tlx').showModal();
}
$('tlx-form').onsubmit = async (ev) => {
  ev.preventDefault(); const a = {}; for (const [k] of TLX) a[k] = Number($(`tlx-${k}`).value);
  await post('/api/tlx', a); $('tlx').close();
};
function setTask() {
  const t = $('task'); if (meta.mode !== 'replay' || !meta.scenario) { t.hidden = true; return; }
  t.hidden = false; t.textContent = ''; t.append(el('b', { textContent: 'The agent was asked: ' }), meta.scenario.userTask);
}

async function showReceipt() {
  const r = await (await fetch('/api/receipt')).json(); const b = $('receipt-body'); b.textContent = '';
  const ul = (items, empty) => { const u = el('ul'); if (!items.length) u.append(el('li', { textContent: empty })); for (const i of items) u.append(el('li', { textContent: i })); return u; };
  b.append(el('h3', { textContent: 'Receipt' }),
    el('p', { textContent: `${r.modelTurns} agent steps${r.modelErrors ? ` (${r.modelErrors} model requests failed)` : ''}. ${r.held.length} held for you, ${r.blocked} blocked.` }),
    el('h4', { textContent: 'Blocked or held' }), ul(r.held.map((h) => `${h.what} - ${h.outcome}${h.cause ? ` (page text: "${h.cause.slice(0, 120)}")` : ''}`), 'Nothing was held.'),
    el('h4', { textContent: 'Done in the browser' }), ul(r.actionsExecuted.map((a) => a.what), 'No browser actions recorded.'),
    el('h4', { textContent: 'Allowed without asking' }), ul(r.allowedWithoutAsking.map((a) => `${a.what} (${a.reason})`), 'None.'),
    el('h4', { textContent: 'Pages visited' }), ul(r.pagesVisited, 'None recorded.'),
    el('p', { className: 'why', textContent: `Not tracked in this version: ${r.notTracked.join(', ')}.` }));
  $('receipt').showModal();
}
$('receipt-btn').onclick = showReceipt;

async function refreshMeta() { try { meta = (await (await fetch('/api/state')).json()).meta || {}; } catch {} setTask(); }
async function onEvent(e) {
  if (e.type === 'study.ready') { await refreshMeta(); showIntro(e); }
  if (e.type === 'task.start') { studyDone = false; events = []; confirmed = new Map(); decided = new Set(); closeStopWindow(); $('pending').textContent = ''; }
  events.push(e);
  if (e.type === 'gate.decided') decided.add(e.id);
  if (e.type === 'gate.confirmed') { confirmed.set(e.id, e); applyConfirmation(document, e.id); }
  if (e.type === 'stop.window') openStopWindow(e);
  if (e.type === 'agent.stopped' || e.type === 'task.end') closeStopWindow();
  if (e.type === 'study.questionnaire') showTlx();
  if (e.type === 'study.done') studyDone = true;
  setStatus(); renderPending(); renderTimeline();
}
await refreshMeta();
const es = new EventSource('/api/events');
let chain = Promise.resolve();
es.onmessage = (m) => { const ev = JSON.parse(m.data); chain = chain.then(() => onEvent(ev)); };
es.onerror = () => { $('status-text').textContent = 'Connection lost - reload to reconnect'; };
