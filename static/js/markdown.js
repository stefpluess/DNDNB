// Markdown for wiki pages. DOM-free so it can be tested in Node.
//
// Supported: # headings, paragraphs, **bold**, *italic*, `code`, - lists, 1. lists, - [ ] tasks, > quotes,
// --- rules, | tables |, [text](https://...), wiki links [[Page title]] / [[Page title|shown text]] and uploaded
// images ![Caption|size](file) (size: small, medium or full; a line of only images shows them as figures).
// Everything the DM typed is escaped; only the tags made here reach the page.

import { esc } from './util.js';

const WIKI = /\[\[([^[\]|\n]+?)(\|[^[\]\n]*)?\]\]/g;          // the same syntax as wiki.LINK in wiki.py
const URL_LINK = /\[([^[\]\n]+)\]\((https?:\/\/[^\s()<>]+)\)/g;
const SLOT = /\u0000(\d+)\u0000/g;
// uploaded images only (named by the server: 16 hex + type), so a page never loads anything from the web
const IMAGE = /!\[([^\]\n]*)\]\(([0-9a-f]{16}\.(?:png|jpg|gif|webp))\)/g;
const IMAGE_LINE = /^\s*(?:!\[[^\]\n]*\]\([0-9a-f]{16}\.(?:png|jpg|gif|webp)\)\s*)+$/;
export const IMAGE_SIZES = ['small', 'medium', 'full'];
export const imageUrl = file => `/api/wiki/images/${file}`;

/** "Map of the city|small" -> { caption: 'Map of the city', size: 'small' }. No size given: full. */
export function imageAlt(alt) {
  const i = String(alt).lastIndexOf('|'), size = i >= 0 ? alt.slice(i + 1).trim().toLowerCase() : '';
  return IMAGE_SIZES.includes(size) ? { caption: alt.slice(0, i).trim(), size } : { caption: String(alt).trim(), size: 'full' };
}

/** A figure for an image on its own line. editable: size buttons for the editor's preview. */
function figure(file, alt, editable) {
  const { caption, size } = imageAlt(alt);
  const sizes = editable ? `<span class="imgsizes">${IMAGE_SIZES.map(z => `<button type="button" class="${z === size ? 'on' : ''}" data-imgsize="${z}" data-file="${file}" title="Show it ${z === 'full' ? 'at full width' : z}">${z[0].toUpperCase() + z.slice(1)}</button>`).join('')}</span>` : '';
  return `<figure class="wimg ${size}"><img src="${imageUrl(file)}" alt="${esc(caption)}" loading="lazy" data-img="${file}">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}${sizes}</figure>`;
}

/** The form titles are compared in (as wiki.norm): case and extra spaces don't matter. */
export const normTitle = t => String(t ?? '').split(/\s+/).filter(Boolean).join(' ').toLowerCase();

function wikiLink(target, label, resolve) {
  const page = resolve(target);
  const text = esc(label || target);
  return page
    ? `<a class="wl" href="#" data-page="${+page.id}">${text}</a>`
    : `<a class="wl missing" href="#" data-new="${esc(target)}" title="No page yet: click to create it">${text}</a>`;
}

/** One line of text: links and code are set aside first so bold and italic never reach into them. */
function inline(text, resolve) {
  const slots = [];
  const keep = html => `\u0000${slots.push(html) - 1}\u0000`;
  const s = String(text)
    .replace(/`([^`\n]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`))
    .replace(IMAGE, (_, alt, file) => keep(`<img class="inline" src="${imageUrl(file)}" alt="${esc(imageAlt(alt).caption)}" loading="lazy" data-img="${file}">`))
    .replace(WIKI, (_, target, label) => keep(wikiLink(target.trim(), label ? label.slice(1).trim() : '', resolve)))
    .replace(URL_LINK, (_, t, href) => keep(`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`));
  return esc(s)
    .replace(/\*\*(?!\s)(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^\w*])\*(?![\s*])(.+?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|[^\w])_(?![\s_])(.+?)_(?!\w)/g, '$1<i>$2</i>')
    .replace(SLOT, (_, i) => slots[+i]);
}

/** Table cells, split on | except inside [[a|b]] links. */
function cells(line) {
  const out = [];
  let cur = '', depth = 0;
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith('[[', i)) { depth++; cur += '[['; i++; continue; }
    if (s.startsWith(']]', i) && depth) { depth--; cur += ']]'; i++; continue; }
    if (s[i] === '|' && !depth) { out.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  out.push(cur.trim());
  return out;
}

const HEADING = /^(#{1,4})\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,})\s*$/;
const QUOTE = /^\s*>/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const isTable = (line, next) => /^\s*\|/.test(line) && next !== undefined && TABLE_SEP.test(next);
const startsBlock = (line, next) => IMAGE_LINE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line)
  || BULLET.test(line) || NUMBER.test(line) || isTable(line, next);

/**
 * A page's Markdown as HTML. resolve(title) returns the page ({ id }) a [[link]] points to, or null when
 * no page has that title yet (the link is shown as missing and creates the page when clicked).
 */
export function renderMarkdown(text, resolve = () => null, { editable = false } = {}) {
  const lines = String(text ?? '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').split('\n');
  const inl = t => inline(t, resolve);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }
    if (IMAGE_LINE.test(line)) {
      const figs = [...line.matchAll(IMAGE)].map(x => figure(x[2], x[1], editable));
      out.push(figs.length > 1 ? `<div class="imgrow">${figs.join('')}</div>` : figs[0]); i++; continue;
    }
    if ((m = line.match(HEADING))) {
      const lv = m[1].length + 1;                         // # is a section of the page: the title is the h1
      out.push(`<h${lv}>${inl(m[2])}</h${lv}>`); i++; continue;
    }
    if (RULE.test(line)) { out.push('<hr>'); i++; continue; }
    if (QUOTE.test(line)) {
      const q = [];
      while (i < lines.length && QUOTE.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(q.join('\n'), resolve, { editable })}</blockquote>`); continue;
    }
    if (BULLET.test(line) || NUMBER.test(line)) {
      const re = BULLET.test(line) ? BULLET : NUMBER, tag = re === BULLET ? 'ul' : 'ol';
      const items = [];
      while (i < lines.length && lines[i].trim()) {
        const it = lines[i].match(re);
        if (it) items.push(it[1]);
        else if (/^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1] += '\n' + lines[i].trim();   // continued item
        else break;
        i++;
      }
      out.push(`<${tag}>${items.map(t => {
        const task = t.match(/^\[([ xX])\]\s+(.*)$/s);
        const body = (task ? task[2] : t).split('\n').map(inl).join('<br>');
        return task ? `<li class="task${task[1] === ' ' ? '' : ' done'}"><span class="box" aria-hidden="true">${task[1] === ' ' ? '☐' : '☑'}</span> ${body}</li>` : `<li>${body}</li>`;
      }).join('')}</${tag}>`);
      continue;
    }
    if (isTable(line, lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map(c => `<th>${inl(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r =>
        `<tr>${head.map((_, k) => `<td>${inl(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const para = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) para.push(lines[i++]);
    out.push(`<p>${para.map(inl).join('<br>')}</p>`);
  }
  return out.join('');
}

/**
 * The [[link being typed at the caret: { start, query } (start: where the title begins), or null when
 * the caret isn't inside an unfinished link. Used to suggest page titles while writing.
 */
export function openLink(text, caret) {
  const before = String(text).slice(0, caret);
  const at = before.lastIndexOf('[[');
  if (at < 0) return null;
  const query = before.slice(at + 2);
  return /[\]|\n]/.test(query) ? null : { start: at + 2, query };
}

/** Text with the link at the caret completed to `title`. Returns { text, caret } (the caret after "]]"). */
export function completeLink(text, caret, title) {
  const open = openLink(text, caret);
  if (!open) return { text, caret };
  const after = text.slice(caret);
  const close = after.startsWith(']]') ? '' : ']]';
  const head = text.slice(0, open.start) + title + close;
  return { text: head + after, caret: head.length + (close ? 0 : 2) };
}

// ---------- images in the text ----------

/** Markdown for a newly uploaded image: its file name (without the extension) as the caption. */
export function imageMarkdown(file, name = '') {
  let caption = String(name).replace(/\.[a-z0-9]+$/i, '').replace(/[[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(image|blob|untitled|pasted.*)$/i.test(caption)) caption = '';      // pasted screenshots have no real name
  return `![${caption}](${file})`;
}

/** Every ![...](file) in the text shown at `size` (full: no size written). Captions are kept. */
export function setImageSize(text, file, size) {
  return String(text).replace(IMAGE, (all, alt, f) => {
    if (f !== file) return all;
    const { caption } = imageAlt(alt);
    return `![${caption}${size && size !== 'full' ? `|${size}` : ''}](${f})`;
  });
}

/** Insert `snippet` at the caret on lines of its own. Returns { text, caret } (the caret after it). */
export function insertBlock(text, caret, snippet) {
  const before = String(text).slice(0, caret), after = String(text).slice(caret);
  const lead = !before || before.endsWith('\n') ? '' : '\n';
  const trail = after.startsWith('\n') ? '' : '\n';
  const head = before + lead + snippet + trail;
  return { text: head + after, caret: head.length };
}
