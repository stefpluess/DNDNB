import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeLink, imageMarkdown, insertBlock, normTitle, openLink, renderMarkdown, setImageSize } from '../static/js/markdown.js';

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

// ---------- images ----------

const F = '0123456789abcdef.png';

test('an image on its own line is a figure, with caption and size', () => {
  assert.equal(md(`![Map of the <b>city</b>|small](${F})`),
    `<figure class="wimg small"><img src="/api/wiki/images/${F}" alt="Map of the &lt;b&gt;city&lt;/b&gt;" loading="lazy" data-img="${F}"><figcaption>Map of the &lt;b&gt;city&lt;/b&gt;</figcaption></figure>`);
  assert.match(md(`![](${F})`), /^<figure class="wimg full"><img [^>]+><\/figure>$/);
  assert.match(md(`![a|odd](${F})`), /class="wimg full".*alt="a\|odd"/);          // unknown size: part of the caption
});

test('several images on one line sit side by side; images inside text stay inline', () => {
  assert.match(md(`![a](${F}) ![b](${F})`), /^<div class="imgrow"><figure[^]*<\/figure><figure[^]*<\/figure><\/div>$/);
  assert.match(md(`Here ![face](${F}) is Durnan`), /^<p>Here <img class="inline" src="\/api\/wiki\/images\/0123456789abcdef.png" alt="face"/);
  assert.equal(md('text\n![x](' + F + ')'), `<p>text</p>${md('![x](' + F + ')')}`);
});

test('only uploaded files become images: never a web address or a path', () => {
  for (const src of ['https://evil.example/x.png', '../campaign.db', 'javascript:alert(1)', '0123456789abcdef.svg']) {
    assert.ok(!md(`![x](${src})`).includes('<img'), src);
  }
});

test('the preview offers size buttons', () => {
  const html = renderMarkdown(`![Map|medium](${F})`, () => null, { editable: true });
  assert.match(html, /data-imgsize="medium" data-file="0123456789abcdef.png"/);
  assert.match(html, /<button type="button" class="on" data-imgsize="medium"/);
});

test('changing a size, writing a new image, inserting on its own lines', () => {
  assert.equal(setImageSize(`![Map](${F}) and ![Map|small](${F}) ![x](aaaaaaaaaaaaaaaa.jpg)`, F, 'medium'),
    `![Map|medium](${F}) and ![Map|medium](${F}) ![x](aaaaaaaaaaaaaaaa.jpg)`);
  assert.equal(setImageSize(`![Map|small](${F})`, F, 'full'), `![Map](${F})`);
  assert.equal(imageMarkdown(F, 'Tavern [map].png'), `![Tavern map](${F})`);
  assert.equal(imageMarkdown(F, 'image.png'), `![](${F})`);
  assert.deepEqual(insertBlock('ab', 1, 'X'), { text: 'a\nX\nb', caret: 4 });
  assert.deepEqual(insertBlock('a\n', 2, 'X'), { text: 'a\nX\n', caret: 4 });
  assert.deepEqual(insertBlock('', 0, 'X'), { text: 'X\n', caret: 2 });
});
