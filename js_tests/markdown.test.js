import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeLink, normTitle, openLink, renderMarkdown } from '../static/js/markdown.js';

const pages = { durnan: { id: 3 }, 'the yawning portal': { id: 7 } };
const md = text => renderMarkdown(text, t => pages[normTitle(t)] || null);

test('everything typed is escaped', () => {
  const html = md('<script>alert(1)</script> & "x" [[<img src=x onerror=1>]] [a](javascript:alert(1))');
  assert.ok(!html.includes('<script') && !html.includes('<img'));
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('href="javascript'), 'only http(s) links become links');
});

test('wiki links: existing pages, labels, missing pages', () => {
  assert.equal(md('Ask [[ durnan ]].'), '<p>Ask <a class="wl" href="#" data-page="3">durnan</a>.</p>');
  assert.equal(md('[[The Yawning Portal|the Portal]]'), '<p><a class="wl" href="#" data-page="7">the Portal</a></p>');
  assert.match(md('[[Mirt]]'), /class="wl missing" href="#" data-new="Mirt"/);
});

test('bold and italic never reach into links or code', () => {
  assert.equal(md('**[[Durnan]]** and *quiet* `**x**`'),
    '<p><b><a class="wl" href="#" data-page="3">Durnan</a></b> and <i>quiet</i> <code>**x**</code></p>');
  assert.equal(md('snake_case_name stays'), '<p>snake_case_name stays</p>');
  assert.equal(md('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
});

test('blocks: headings, lists, tasks, quotes, rules, line breaks', () => {
  assert.equal(md('# Places\nline one\nline two'), '<h2>Places</h2><p>line one<br>line two</p>');
  assert.equal(md('- one\n- two\n  more\n\n1. first'), '<ul><li>one</li><li>two<br>more</li></ul><ol><li>first</li></ol>');
  assert.match(md('- [ ] find the map\n- [x] meet [[Durnan]]'), /<li class="task"><span class="box" aria-hidden="true">☐<\/span> find the map<\/li><li class="task done">/);
  assert.equal(md('> said\n> twice\n\n---'), '<blockquote><p>said<br>twice</p></blockquote><hr>');
  assert.equal(md('**bold** start'), '<p><b>bold</b> start</p>');      // not a list
});

test('tables, with [[a|b]] links inside cells', () => {
  const html = md('| Who | Where |\n|---|:-:|\n| [[Durnan|Barkeep]] | Portal |\n| Mirt |');
  assert.equal(html, '<table><thead><tr><th>Who</th><th>Where</th></tr></thead><tbody>'
    + '<tr><td><a class="wl" href="#" data-page="3">Barkeep</a></td><td>Portal</td></tr><tr><td>Mirt</td><td></td></tr></tbody></table>');
});

test('the link being typed, and completing it', () => {
  assert.deepEqual(openLink('Met [[Dur', 9), { start: 6, query: 'Dur' });
  assert.equal(openLink('Met [[Durnan]] and', 18), null);
  assert.equal(openLink('[[Durnan|the', 12), null);
  assert.deepEqual(completeLink('Met [[Dur and', 9, 'Durnan'), { text: 'Met [[Durnan]] and', caret: 14 });
  assert.deepEqual(completeLink('Met [[Dur]]', 9, 'Durnan'), { text: 'Met [[Durnan]]', caret: 14 });
});
