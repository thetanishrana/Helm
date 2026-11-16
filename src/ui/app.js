// Everything shown here can contain text from untrusted web pages: always set text with textContent
// and never build markup from it. Icons come from <template> elements in index.html, never from strings.
const token = document.querySelector('meta[name=helm-token]').content;
const $ = (id) => document.getElementById(id);
let agents = []; let focus = null;   // several agents: [{ id, name, hue }], and the one whose lane is shown (null = all)
let events = []; let confirmed = new Map(); let decided = new Set(); let meta = {}; let studyDone = false; let connection = 'connecting';
const openKeys = new Set();   // <details> the person opened, kept across redraws
const HOLD_MS = 1200;         // hypothesis: pressing and holding to say "yes, I asked for this" discourages reflexive approval
const TLX = [['mental', 'Mental demand', 'How much thinking and attention did watching require?'], ['physical', 'Physical demand', 'How much physical activity did it take?'], ['temporal', 'Time pressure', 'How hurried or rushed did it feel?'], ['performance', 'Performance', 'How successful were you in watching for problems?'], ['effort', 'Effort', 'How hard did you have to work to stay on top of it?'], ['frustration', 'Frustration', 'How irritated, stressed or annoyed did you feel?']];

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids) n.append(k); return n; };
const icon = (id) => $(id).content.firstElementChild.cloneNode(true);
const clock = (t) => new Date(t).toLocaleTimeString([], { hour12: false });
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const curly = (s) => String(s ?? '').replace(/"([^"]*)"/g, '\u201c$1\u201d');
const sentence = (s) => { const t = curly(s).trim().replace(/[.\s]+$/, ''); return t ? `${cap(t)}.` : ''; };
const multi = () => agents.length > 1;
const agentOf = (id) => agents.find((a) => a.id === id);
const evsOf = (id) => events.filter((e) => (e.agent ?? null) === (id ?? null));
const cond = () => (meta.mode === 'replay' ? meta.condition : 'C');   // live runs behave like condition C
const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-helm-token': token }, body: JSON.stringify(body || {}) });

// `click button "Refresh"` -> { verb: 'Click button', label: 'Refresh' }; anything else is shown as it is.
function parseWhat(what) {
  const m = /^([\w-]+)(?: ([\w-]+))? "((?:[^"\\]|\\.)*)"$/.exec(String(what ?? ''));
  return m ? { verb: `${cap(m[1])}${m[2] ? ` ${m[2]}` : ''}`, label: m[3].replace(/\\"/g, '"') } : { verb: cap(String(what ?? '')), label: null };
}
function whatNodes(what) {
  const w = parseWhat(what); const out = [el('span', { className: 'verb', textContent: w.verb })];
  if (w.label !== null) out.push(' ', el('span', { className: 'target', textContent: `“${w.label}”` }));
  return out;
}
const hostOf = (page) => { try { return new URL(page).host || page; } catch { return page || 'the page'; } };

// ---- several agents: one chip per agent, in a fixed hue so a card, a lane and a chip are recognisably the same agent
const chipEl = (id) => { const a = agentOf(id); if (!a) return null; const c = el('span', { className: 'chip' }); c.dataset.hue = String(a.hue); c.append(el('span', { className: 'chip-dot', ariaHidden: 'true' }), el('span', { className: 'chip-name', textContent: a.name })); return c; };
function agentState(id) {
  const mine = evsOf(id); const waiting = mine.filter((e) => e.type === 'gate.pending' && !decided.has(e.id)).length;
  if (waiting) return { key: 'needs', text: waiting === 1 ? 'Needs you' : `${waiting} need you`, n: waiting };
  if (mine.some((e) => e.type === 'task.end')) return { key: 'done', text: 'Finished', n: 0 };
  if (mine.some((e) => e.type === 'model.turn' && e.untrustedChunks > 0)) return { key: 'untrusted', text: 'Reading untrusted content', n: 0 };
  return { key: 'ok', text: mine.some((e) => e.type === 'task.start') ? 'Working' : 'Waiting', n: 0 };
}
let fleetSig = '';
function renderFleet() {
  const nav = $('fleet'); nav.hidden = !multi(); if (!multi()) return;
  const states = agents.map((a) => agentState(a.id)); const sig = JSON.stringify([agents.map((a) => a.id), states, focus]);
  if (sig === fleetSig) return; fleetSig = sig;
  const had = document.activeElement?.closest?.('#fleet') ? document.activeElement.dataset.agent ?? '' : null;
  nav.textContent = '';
  const mk = (id, label, st) => {
    const b = el('button', { type: 'button', className: `fleet-item${(focus ?? '') === id ? ' on' : ''}`, onclick: () => { focus = id || null; fleetSig = ''; renderFleet(); renderTimeline(); } });
    b.dataset.agent = id; b.setAttribute('aria-pressed', String((focus ?? '') === id));
    if (id) { b.dataset.hue = String(agentOf(id).hue); b.dataset.state = st.key; b.append(el('span', { className: 'chip-dot', ariaHidden: 'true' }), el('span', { className: 'fleet-name', textContent: label }), el('span', { className: 'fleet-state', textContent: st.text })); if (st.n) b.append(el('span', { className: 'count', textContent: String(st.n) })); }
    else b.append(el('span', { className: 'fleet-name', textContent: label }));
    nav.append(b); return b;
  };
  mk('', 'All agents', null);
  agents.forEach((a, i) => mk(a.id, a.name, states[i]));
  if (had !== null) nav.querySelector(`[data-agent="${CSS.escape(had)}"]`)?.focus();
}

// ---- what the person asked
const request = (agent) => meta.mode === 'replay' ? (meta.scenario?.userTask ?? '') : ([...events].reverse().find((e) => e.type === 'model.turn' && e.request && (!agent || e.agent === agent))?.request ?? '');
function setTask() {
  const text = request(); const box = $('task');
  box.hidden = multi() || !text || Boolean(document.querySelector('#pending .card:not(.plain)'));   // with several agents each lane and card carries its own request   // a pending decision already sets the request beside what the agent wants
  if (!text) return;
  const p = $('task-text'); p.textContent = text; p.className = 'request';
  box.querySelector('.more')?.remove();
  if (text.length > 220) {
    p.classList.add('clamp');
    const more = el('button', { className: 'more', type: 'button', textContent: 'Show all' });
    more.onclick = () => { const open = p.classList.toggle('clamp'); more.textContent = open ? 'Show all' : 'Show less'; };
    box.append(more);
  }
}

// ---- status line, tab title and tab icon
const FAVICON = { idle: '#8fa2b2', ok: '#2d6ea6', untrusted: '#c58a12', paused: '#b3301b', done: '#8fa2b2', lost: '#8fa2b2' };
function setFavicon(level) {
  const c = FAVICON[level] ?? FAVICON.ok; const ring = level === 'idle' || level === 'lost';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='${ring ? 6 : 7}' fill='${ring ? 'none' : c}' stroke='${c}' stroke-width='2'/></svg>`;
  $('favicon').href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function setStatus() {
  const pending = events.filter((e) => e.type === 'gate.pending' && !decided.has(e.id));
  const ended = multi() ? agents.every((a) => evsOf(a.id).some((e) => e.type === 'task.end')) : events.some((e) => e.type === 'task.end');
  const untrusted = events.some((e) => e.type === 'model.turn' && e.untrustedChunks > 0);
  const started = events.some((e) => e.type !== 'agent.register');
  let level = 'ok', text = 'On task';
  if (connection === 'lost') { level = 'lost'; text = 'Connection lost. Reload to reconnect.'; }
  else if (studyDone) { level = 'done'; text = 'All tasks finished. Thank you.'; }
  else if (cond() !== 'C') { level = ended ? 'done' : 'ok'; text = ended ? 'The agent has finished' : 'The agent is working'; }   // the ambient line is part of Helm only
  else if (pending.length) { level = 'paused'; text = 'Needs your decision'; }
  else if (ended) { level = 'done'; text = 'Task finished'; }
  else if (untrusted) { level = 'untrusted'; text = 'Reading untrusted content'; }
  else if (!started) { level = 'idle'; text = 'Waiting for the agent'; }
  $('status').className = level; $('status-text').textContent = text;
  const n = level === 'paused' ? pending.length : 0; $('status-count').hidden = n < 1; $('status-count').textContent = String(n);
  $('receipt-btn').hidden = cond() !== 'C' || !started;
  document.title = `${n ? `(${n}) ` : ''}Helm`; setFavicon(level);
}

// ---- the decision panel
function holdButton(btn, ms, done) {
  const fill = btn.querySelector('.fill'); const hint = btn.closest('.card').querySelector('.hint-main'); const rest = hint.textContent; let timer = null;
  const start = () => { if (btn.disabled || timer) return; fill.style.transition = `transform ${ms}ms linear`; fill.style.transform = 'scaleX(1)'; hint.textContent = 'Keep holding…'; timer = setTimeout(() => { timer = null; done(); }, ms); };
  const cancel = () => { if (!timer) return; clearTimeout(timer); timer = null; fill.style.transition = 'transform 160ms ease-out'; fill.style.transform = 'scaleX(0)'; hint.textContent = rest; };
  btn.addEventListener('pointerdown', (e) => { if (e.button === 0) start(); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) btn.addEventListener(ev, cancel);
  btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) start(); } });
  btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cancel(); } });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => { e.preventDefault(); if (!e.isTrusted) done(); });   // a script's click (the simulated participant) skips the hold; a person's does not
}

function renderCard(p) {
  const x = p.explanation || {};
  const card = el('section', { className: `card${x.commandOnly ? ' plain' : ''}`, id: `card-${p.id}` });
  card.setAttribute('aria-label', `Decision needed: ${p.what}`);
  const block = el('button', { className: 'block', type: 'button', textContent: x.commandOnly ? 'Deny' : 'No, block it' });
  const allow = el('button', { className: 'allow', type: 'button' });
  block.onclick = () => decide(p.id, false);

  if (x.commandOnly) {   // the standard prompt: the command and nothing else
    allow.textContent = 'Approve'; allow.onclick = () => decide(p.id, true);
    card.append(el('h3', { textContent: 'The agent wants to run a command' }), el('code', { textContent: x.command }), el('div', { className: 'actions' }, block, allow));
    return card;
  }

  const tier = x.risk?.tier ?? 'high';
  if (multi() && p.agent) card.append(el('div', { className: 'card-agent' }, chipEl(p.agent)));
  card.append(el('div', { className: 'card-head' }, el('h3', { textContent: x.requested ? 'Check this before it runs' : 'Did you ask for this?' }), el('span', { className: `risk ${tier}`, textContent: `${cap(tier)} risk` })));

  const gap = el('dl', { className: 'gap' });
  const asked = request(p.agent);
  if (asked) gap.append(el('div', {}, el('dt', { textContent: 'You asked' }), el('dd', { textContent: asked.length > 160 ? `${asked.slice(0, 157)}…` : asked })));
  gap.append(el('div', { className: 'wants' }, el('dt', { textContent: 'Agent wants' }), el('dd', {}, ...whatNodes(p.what))));
  card.append(gap, el('p', { className: 'verdict', textContent: x.requested ? 'Your request mentions this control.' : 'That isn’t part of what you asked.' }));

  const reasons = el('ul', { className: 'reasons' }); card.append(el('h4', { className: 'why-h', textContent: 'Why Helm held it' }));
  if (x.cause) {
    const host = hostOf(x.cause.page);
    reasons.append(el('li', {}, x.cause.weak ? `Text on ${host} is addressed to AI agents and gives orders, though it doesn’t name this control:` : `Text on ${host} told the agent to do this:`,
      el('figure', { className: 'page-text' }, el('figcaption', { textContent: 'Quoted from the page' }), el('blockquote', { textContent: x.cause.text }))));
  } else if (!x.requested) reasons.append(el('li', { textContent: 'The agent had read page content, but no single passage clearly told it to do this.' }));
  if (x.risk?.why) reasons.append(el('li', { textContent: sentence(x.risk.why) }));
  if (x.emails?.length) reasons.append(el('li', { textContent: `Involves ${x.emails.join(', ')}.` }));
  card.append(reasons);

  card.append(el('p', { className: 'check', id: `conf-${p.id}` }));
  const high = tier === 'high';
  const hint = el('p', { className: 'hint' }, el('span', { className: 'hint-main', textContent: high ? 'Press and hold “Yes” to confirm.' : '' }), ' ', el('span', { className: 'hint-time' }));
  countdown(hint.querySelector('.hint-time'), p);
  if (high) { allow.classList.add('hold'); allow.append(el('span', { className: 'fill' }), el('span', { className: 'label', textContent: 'Yes, I asked for this' })); allow.setAttribute('aria-describedby', `hint-${p.id}`); }
  else { allow.textContent = 'Yes, I asked for this'; allow.onclick = () => decide(p.id, true); }
  hint.id = `hint-${p.id}`;
  card.append(el('div', { className: 'actions' }, block, allow), hint);
  if (high) holdButton(allow, HOLD_MS, () => decide(p.id, true));
  setConfirmation(card.querySelector('.check'), p.id);
  setTimeout(() => block.focus({ preventScroll: true }), 0);
  return card;
}

// "If you don't decide, Helm blocks it in 4:58." Recorded replays have no live clock, so they say it without a time.
function countdown(span, p) {
  if (meta.mode === 'replay' || !p.timeoutMs) { span.textContent = 'If you don’t decide, Helm blocks it.'; return; }
  let seen = false;   // stop ticking once the card has been shown and then removed
  const draw = () => {
    if (span.isConnected) seen = true; else if (seen) { clearInterval(timer); return; }
    const left = Math.max(0, Math.round((p.t + p.timeoutMs - Date.now()) / 1000));
    span.textContent = `If you don’t decide, Helm blocks it in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}.`;
  };
  const timer = setInterval(draw, 1000); draw();
}

const CHECK_TEXT = {
  pending: 'Checking by re-run…',
  confirmed: 'Confirmed by re-run: without this text, the agent did not try this action.',
  distributed: 'Re-run check: several passages share the push, and none alone explains it.',
  'not-from-page-text': 'Re-run check: the agent still tried it without any page text, so the page may not be the cause.',
  'not-reproducible': 'Re-run check: the agent did not repeat the action, so this could not be tested.',
  skipped: 'Re-run check is off.',
};
function setConfirmation(box, id) {
  if (!box) return; const c = confirmed.get(id);
  const state = c ? (c.verdict === 'confirmed' ? 'confirmed' : c.verdict === 'skipped' ? 'skipped' : 'unconfirmed') : (meta.mode === 'replay' ? 'none' : 'pending');
  box.dataset.state = state; box.textContent = ''; box.hidden = state === 'none';
  if (state === 'none') return;
  box.append(icon(state === 'pending' ? 'ico-wait' : state === 'confirmed' ? 'ico-check' : 'ico-note'), el('span', { textContent: CHECK_TEXT[c?.verdict ?? 'pending'] ?? 'Re-run check: inconclusive.' }));
}

async function decide(id, allow) {
  document.querySelectorAll(`#card-${id} button`).forEach((b) => (b.disabled = true));
  const r = await post('/api/decide', { id, allow });
  if (!r.ok) document.querySelector(`#card-${id}`)?.append(el('p', { className: 'hint', textContent: 'That decision was no longer pending.' }));
}

function renderPending() {
  const box = $('pending'); const A = cond() === 'A';
  box.parentElement.hidden = A;
  const pending = events.filter((e) => e.type === 'gate.pending' && !decided.has(e.id));
  const have = new Set([...box.querySelectorAll('.card')].map((c) => c.id));
  for (const p of pending) if (!have.has(`card-${p.id}`)) { if (!box.querySelector('.card')) { box.className = ''; box.textContent = ''; } box.append(renderCard(p)); $('announce').textContent = `Decision needed: ${p.what}`; }
  for (const c of box.querySelectorAll('.card')) if (!pending.some((p) => `card-${p.id}` === c.id)) c.remove();
  if (!box.querySelector('.card')) {
    box.className = 'empty'; box.textContent = '';
    if (!A) box.append(icon('ico-check'), el('span', { className: 'none', textContent: events.length ? 'Nothing needs your decision. Helm stops here if the agent does something you didn’t ask for.' : 'Nothing needs your decision yet.' }));
  }
  setTask();
}

// ---- the course
// Each entry: { kind, t, parts, sub, key }. Kinds: milestone, step, thought, cmd, say, held, blocked, rejoin, stopped, error, output.
function buildRows(events) {
  const raw = cond() !== 'C'; const A = cond() === 'A'; const rows = []; const open = new Set(); let allowed = null;
  const flush = () => { if (allowed) { rows.push({ kind: 'step', t: allowed.t, parts: whatNodes(allowed.what), sub: sentence(allowed.reason) }); allowed = null; } };
  events.forEach((e, i) => {
    // An allowed step waits for the browser action it allowed; in real sessions a model-turn event can arrive in between.
    if (['gate.allowed', 'gate.pending', 'gate.decided', 'task.end'].includes(e.type)) flush();
    const add = (r) => rows.push({ key: `${e.agent ?? ''}:${i}`, t: e.t, lane: open.size > 0, ...r });
    switch (e.type) {
      case 'task.start': add({ kind: 'milestone', parts: ['Task started'] }); break;
      case 'navigate': add({ kind: 'step', parts: [el('span', { className: 'verb', textContent: 'Opened ' }), el('span', { className: 'target', textContent: hostOf(e.url) })] }); break;
      case 'model.turn':
        if (e.tools?.length) add(raw ? { kind: 'cmd', parts: [e.tools.map((c) => `$ ${c}`).join('\n')] } : { kind: 'thought', parts: [e.tools.join('\n')] });
        else if (e.say) add({ kind: 'say', parts: [`Agent: ${e.say}`] });
        break;
      case 'agent.say': add({ kind: 'say', parts: [`Agent: ${e.text}`] }); break;
      case 'agent.command': if (A) add({ kind: 'cmd', parts: [`$ ${e.command}`] }); break;
      case 'agent.output': add({ kind: 'output', text: e.text }); break;
      case 'agent.stopped': add({ kind: 'stopped', parts: [el('span', { className: 'state', textContent: 'You stopped the agent' })] }); break;
      case 'model.error': add({ kind: 'error', parts: [`Model request failed${e.status ? ` (HTTP ${e.status})` : ''}${e.error ? `: ${e.error}` : ''}`] }); break;
      case 'gate.allowed': if (!raw) allowed = { t: e.t, what: e.what, reason: e.reason }; break;
      case 'action':
        if (raw) break;
        if (allowed && allowed.what === e.what) { rows.push({ kind: 'step', t: e.t, parts: whatNodes(e.what), sub: sentence(allowed.reason), lane: open.size > 0 }); allowed = null; }
        else { flush(); add({ kind: 'step', parts: whatNodes(e.what) }); }
        break;
      case 'gate.pending': if (!raw) { open.add(e.id); rows.push({ kind: 'held', t: e.t, key: `${e.agent ?? ''}:${i}`, parts: [el('span', { className: 'state', textContent: 'Held for your decision ' }), ...whatNodes(e.what)] }); } break;
      case 'gate.decided': {
        open.delete(e.id);
        const note = e.reflexive && !raw ? ' (answered in under a second)' : '';
        if (e.allow) add({ kind: raw ? 'step' : 'rejoin', lane: false, parts: [raw ? 'You approved it' : `You allowed it${note}`] });
        else add({ kind: raw ? 'step' : 'blocked', lane: false, parts: [el('span', { className: 'state', textContent: raw ? 'You denied it' : e.by === 'timeout' ? 'Blocked: no decision in time' : 'Blocked' }), note] });
        break;
      }
      case 'gate.repeat-blocked': add({ kind: 'blocked', parts: [el('span', { className: 'state', textContent: 'Blocked without asking ' }), `The agent tried again after you declined: ${e.what}`] }); break;
      case 'task.end': add({ kind: 'milestone', parts: ['Task finished'] }); break;
    }
  });
  flush();
  return rows;
}
function drawRows(ol, rows) {
  ol.textContent = '';
  for (const r of rows) {
    const li = el('li', { className: [r.kind, r.lane ? 'lane' : ''].filter(Boolean).join(' ') });
    li.append(el('time', { textContent: clock(r.t) }), el('span', { className: 'track' }));
    li.append(el('span', { className: 'node', ariaHidden: 'true' }));
    if (['held', 'blocked', 'stopped', 'rejoin'].includes(r.kind)) li.append(el('span', { className: 'branch', ariaHidden: 'true' }));
    const body = el('div', { className: 'body' });
    if (r.kind === 'output') {
      const lines = r.text.split('\n').length; const d = el('details', { className: 'out-row' }, el('summary', { textContent: `Output (${lines} line${lines === 1 ? '' : 's'})` }), el('pre', { className: 'out', textContent: r.text }));
      body.append(d); li.className = 'output';
    } else if (r.kind === 'thought') {
      const d = el('details', {}, el('summary', { textContent: r.parts[0] }));   // collapsed: one truncated line; open: every command, wrapped
      const k = `d${r.key}`; d.open = openKeys.has(k); d.ontoggle = () => (d.open ? openKeys.add(k) : openKeys.delete(k)); body.append(d);
    } else { body.append(...r.parts); if (r.sub) body.append(el('span', { className: 'sub', textContent: r.sub })); }
    li.append(body); ol.append(li);
  }
}
function renderTimeline() {
  const empty = $('timeline-empty'); empty.textContent = '';
  if (multi()) {   // one lane per agent, each its own course
    $('timeline').hidden = true; const box = $('lanes'); box.hidden = false; box.textContent = '';
    const shown = agents.filter((a) => !focus || a.id === focus);
    box.className = `lanes${shown.length > 1 ? ' side' : ''}`;
    for (const a of shown) {
      const st = agentState(a.id); const lane = el('section', { className: 'agent-lane' }); lane.dataset.hue = String(a.hue); lane.dataset.state = st.key; lane.dataset.agent = a.id;
      const ask = request(a.id);
      lane.append(el('header', { className: 'lane-head' }, chipEl(a.id), el('span', { className: 'lane-state', textContent: st.text }), ...(ask ? [el('p', { className: 'lane-ask', textContent: ask.length > 140 ? `${ask.slice(0, 137)}…` : ask })] : [])));
      const ol = el('ol'); drawRows(ol, buildRows(evsOf(a.id))); lane.append(ol); box.append(lane);
    }
    if (!shown.length) empty.append(el('p', { textContent: 'Waiting for the agents. Their steps appear here as they work.' }));
    return;
  }
  $('lanes').hidden = true; $('timeline').hidden = false;
  const rows = buildRows(events); drawRows($('timeline'), rows);
  if (!rows.length) {
    empty.append(el('p', { textContent: meta.mode === 'replay' ? 'The recorded session begins when you press Start.' : 'Waiting for the agent. Its steps appear here as it works.' }));
    if (meta.mode !== 'replay') empty.append(el('code', { textContent: 'node src/cli.mjs run -- <your agent command>' }));
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
let lastBlock = null;
function showIntro(e) {
  const b = e.block; const firstOfBlock = !b || b.n !== lastBlock; lastBlock = b?.n ?? null;
  $('intro-block').textContent = b ? (b.n === 0 ? 'Practice (not scored)' : `Block ${b.n} of ${b.of}`) : '';
  $('intro-title').textContent = e.practice ? 'Practice task' : 'The next task';
  $('intro-task').textContent = e.userTask;
  $('intro-help').textContent = firstOfBlock ? (e.help ?? ({ A: 'Watch what the agent does. If it starts to do something the person did not ask for, press Stop.', B: 'The agent will ask before each command. Approve or deny each one.', C: 'Helm will stay quiet unless something needs your decision.' }[cond()] ?? '')) : '';
  $('intro').showModal();
}
$('intro-start').onclick = async () => { await post('/api/start'); $('intro').close(); };
$('consent-ok').onchange = () => { $('consent-go').disabled = !$('consent-ok').checked; };
$('consent-go').onclick = async () => { await post('/api/consent', { agree: true }); $('consent').close(); };
function showTlx() {
  const box = $('tlx-items'); box.textContent = '';
  for (const [k, name, hint] of TLX) box.append(el('div', { className: 'tlxrow' }, el('label', { htmlFor: `tlx-${k}`, textContent: name }), el('small', { textContent: hint }), el('input', { type: 'range', min: 0, max: 100, value: 50, id: `tlx-${k}`, name: k })));
  $('tlx').showModal();
}
$('tlx-form').onsubmit = async (ev) => {
  ev.preventDefault(); const a = {}; for (const [k] of TLX) a[k] = Number($(`tlx-${k}`).value);
  await post('/api/tlx', a); $('tlx').close();
};

// ---- receipt
async function showReceipt() {
  const all = await (await fetch('/api/receipt')).json(); const b = $('receipt-body'); b.textContent = '';
  if (all.agents) {   // several agents: one section each (or just the one in focus)
    b.append(el('h3', { id: 'receipt-h', textContent: 'Run receipt' }));
    for (const a of all.agents.filter((x) => !focus || x.id === focus)) { const sec = el('section', { className: 'receipt-agent' }, el('h4', { className: 'receipt-agent-h' }, chipEl(a.id))); receiptBody(sec, a.receipt); b.append(sec); }
    b.append(el('p', { className: 'why-note', textContent: `Not tracked in this version: ${all.agents[0]?.receipt.notTracked.join(', ')}.` }));
    $('receipt').showModal(); return;
  }
  b.append(el('h3', { id: 'receipt-h', textContent: 'Run receipt' }));
  receiptBody(b, all, true); $('receipt').showModal();
}
function receiptBody(b, r, solo = false) {
  const list = (items, empty) => { items = items.filter(Boolean); const u = el('ul'); if (!items.length) u.append(el('li', { textContent: empty })); for (const i of items) u.append(el('li', {}, ...(Array.isArray(i) ? i : [i]))); return u; };
  const num = (n) => el('b', { textContent: String(n) });
  const heldItems = r.held.map((h) => { const li = el('span', {}, ...whatNodes(h.what), ` – ${h.outcome}`); if (h.cause) li.append(el('span', { className: 'receipt-cause', textContent: `Page text: “${h.cause.slice(0, 120)}${h.cause.length > 120 ? '…' : ''}”` })); return li; });
  b.append(
    el('p', { className: 'receipt-summary' }, num(r.modelTurns), ` agent step${r.modelTurns === 1 ? '' : 's'}${r.modelErrors ? ` (${r.modelErrors} model request${r.modelErrors === 1 ? '' : 's'} failed)` : ''}. `, num(r.held.length), ' held for you, ', num(r.blocked), ' blocked.'),
    el('h4', { textContent: 'Blocked or held' }), list(heldItems, 'Nothing was held.'),
    el('h4', { textContent: 'Done in the browser' }), list(r.actionsExecuted.map((a) => whatNodes(a.what)), 'No browser actions recorded.'),
    el('h4', { textContent: 'Allowed without asking' }), list(r.allowedWithoutAsking.map((a) => [...whatNodes(a.what), ` – ${String(a.reason ?? '').toLowerCase()}`]), 'None.'),
    el('h4', { textContent: 'Pages visited' }), list(r.pagesVisited, 'None recorded.'),
    ...(solo ? [el('p', { className: 'why-note', textContent: `Not tracked in this version: ${r.notTracked.join(', ')}.` })] : []));
}
$('receipt-btn').onclick = showReceipt;

async function refreshMeta() { try { meta = (await (await fetch('/api/state')).json()).meta || {}; } catch {} setTask(); }
async function onEvent(e) {
  if (e.type === 'study.consent') { $('status-text').textContent = 'Before we start'; $('status').className = 'done'; $('consent-text').textContent = e.text; $('consent-ok').checked = false; $('consent-go').disabled = true; $('consent').showModal(); }
  if (e.type === 'study.declined') $('status-text').textContent = 'Session ended.';
  if (e.type === 'study.debrief') { $('debrief-text').textContent = e.text; $('debrief').showModal(); }
  if (e.type === 'study.ready') { await refreshMeta(); showIntro(e); }
  if (e.type === 'agent.register') { if (!agentOf(e.agent)) agents.push({ id: e.agent, name: e.name, hue: e.hue }); }
  if (e.type === 'task.start' && e.agent) events = events.filter((x) => (x.agent ?? null) !== e.agent || x.type === 'agent.register');   // one agent restarting leaves the others as they were
  else if (e.type === 'task.start') { studyDone = false; events = []; confirmed = new Map(); decided = new Set(); openKeys.clear(); closeStopWindow(); $('pending').textContent = ''; }
  events.push(e);
  if (e.type === 'gate.decided') decided.add(e.id);
  if (e.type === 'gate.confirmed') { confirmed.set(e.id, e); setConfirmation(document.getElementById(`conf-${e.id}`), e.id); }
  if (e.type === 'stop.window') openStopWindow(e);
  if (e.type === 'agent.stopped' || e.type === 'task.end') closeStopWindow();
  if (e.type === 'study.questionnaire') showTlx();
  if (e.type === 'study.done') studyDone = true;
  if (e.type === 'model.turn') setTask();
  setStatus(); renderPending(); renderFleet(); renderTimeline();
}
await refreshMeta();
setStatus(); renderPending(); renderFleet(); renderTimeline();
const es = new EventSource('/api/events');
let chain = Promise.resolve();
es.onopen = () => { connection = 'open'; setStatus(); };
es.onmessage = (m) => { const ev = JSON.parse(m.data); chain = chain.then(() => onEvent(ev)); };
es.onerror = () => { connection = 'lost'; setStatus(); };
