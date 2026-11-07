// The Wiki view: categories and pages (left), the page or its editor (middle), links and page info (right).
// Pages are Markdown with [[Page title]] links (markdown.js); the server (wiki.py) stores them, keeps the
// links for "Linked from", rewrites links when a page is renamed, and keeps deleted pages in a trash.
// Images are uploaded (button, paste or drag and drop), written into the text as ![Caption|size](file),
// open full-screen when clicked, and one can be the page's portrait. Each category has an info box (fields
// from wiki.FIELDS; "page" fields are links), pages carry tags and can sit inside another page.
// [[char:Mira]], [[monster:Goblin Warrior]] and [[fight:Ambush]] (and char / monster fields) link to the rest of
// the app: the page lists them under "In the game" with Add to combat, and sheets and creatures list their pages.
// The gallery shows every uploaded image and where it's used; the whole wiki exports as Markdown.

import { bindForm } from './forms.js';
import { REF_KINDS, completeLink, imageMarkdown, imageUrl, insertBlock, normTitle, openLink, renderMarkdown, setImageSize, splitRef } from './markdown.js';
import { switchView } from './nav.js';
import { classLine } from './sheetview.js';
import { monsterLine, statBlock } from './statblock.js';
import { S, api, getEntry, onWikiError, onWikiSaved, saveWikiNow, scheduleWikiSave, uploadImage } from './store.js';
import { addChar, addFight, addMonster } from './tracker.js';
import { handleRollClick } from './ui.js';
import { $, esc, toast } from './util.js';

const W = S.wiki;
const catName = key => W.categories.find(c => c.key === key)?.name || 'Unsorted';
const catFields = key => W.categories.find(c => c.key === key)?.fields || [];
const pageById = id => W.pages.find(p => p.id === id);
const byTitle = new Map();                   // normalized title -> page, for resolving [[links]]
const resolve = title => byTitle.get(normTitle(title)) || null;
/** A game link on the open page, as the server resolved it ({ kind, name, found, id | idx, title, meta }), or null. */
const refKey = (kind, name) => `${kind}:${normTitle(name)}`;
const findRef = (kind, name) => (W.cur?.refs || []).find(r => refKey(r.kind, r.name) === refKey(kind, name)) || null;
const resolveRef = (kind, name) => { const r = findRef(kind, name); return r?.found ? r : null; };
const md = (text, opts = {}) => renderMarkdown(text, resolve, { resolveRef, ...opts });

/** "just now", "12 min ago", "3 h ago", "yesterday", or the date. Timestamps are stored in UTC. */
function when(ts) {
  if (!ts) return '';
  const d = new Date(ts.replace(' ', 'T') + 'Z'), s = (Date.now() - d) / 1000;
  if (!(s >= 0)) return d.toLocaleDateString();
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- loading ----------

async function loadList() {
  try {
    const res = await api('/api/wiki');
    Object.assign(W, { pages: res.pages, categories: res.categories, trash: res.trash, tags: res.tags });
  } catch (e) { toast(`Could not load the wiki: ${e.message}`); }
  byTitle.clear();
  for (const p of W.pages) byTitle.set(normTitle(p.title), p);
}

/** Open page `id`. The open page is saved first, so switching pages never loses typing. */
async function openPage(id, { edit = false, back = true } = {}) {
  if (W.cur) await saveWikiNow().catch(() => {});
  let page;
  try { page = await api(`/api/wiki/${id}`); } catch (e) { toast(e.message); await loadList(); return renderWiki(); }
  if (back && W.cur && W.cur.id !== page.id) W.back = [...W.back.filter(x => x !== W.cur.id), W.cur.id].slice(-30);
  Object.assign(W, { cur: withDrafts(page), editing: edit, trashOpen: false, galleryOpen: false });
  S.confirm.delPage = null;
  renderWiki();
  $('#wikiPage').scrollTop = 0;
  if (edit) $(page.body ? '#wikiBody' : '#wikiTitle')?.focus();
}

/** The editor's text versions of the tags and the page it's inside (they're saved when you leave the field). */
function withDrafts(page) {
  return Object.assign(page, { tagsText: (page.tags || []).join(', '), parentTitle: pageById(page.parent_id)?.title || '' });
}

/**
 * A new page: from a missing [[link]] (its title), the New page button (in the category or under the tag being
 * viewed), or "New page inside" (parent: a page, whose category it takes).
 */
async function newPage(title, parent = null) {
  const cat = parent ? parent.category : W.categories.some(c => c.key === W.cat) ? W.cat : 'unsorted';
  const body = { category: cat };
  if (parent) body.parent_id = parent.id;
  if (W.cat.startsWith('tag:') && !parent) body.tags = [W.cat.slice(4)];
  if (title) body.title = title;
  else if (cat === 'session') body.title = `Session ${W.pages.filter(p => p.category === 'session').length + 1}`;
  let page;
  try { page = await api('/api/wiki', { method: 'POST', body }); } catch (e) { return toast(e.message); }
  await loadList();
  await openPage(page.id, { edit: true });
  if (!title) $('#wikiTitle')?.select();
}

// ---------- left column: categories and the page list ----------

function renderNav() {
  const count = key => W.pages.filter(p => p.category === key).length;
  const cats = [{ key: 'all', name: 'All pages', n: W.pages.length }, { key: 'recent', name: 'Recently edited', n: null },
    ...W.categories.map(c => ({ ...c, n: count(c.key) }))];
  $('#wikiCats').innerHTML = cats.map(c => `<button class="${W.cat === c.key && !W.results ? 'on' : ''}${c.key === 'unsorted' && c.n ? ' todo' : ''}" data-cat="${c.key}">
      <span>${esc(c.name)}</span>${c.n != null ? `<small>${c.n}</small>` : ''}</button>`).join('');
  $('#wikiTags').innerHTML = (W.tags || []).length ? `<h4>Tags</h4><div class="chips">${W.tags.map(t =>
    `<button class="chip wtag${W.cat === `tag:${t.tag}` && !W.results ? ' on' : ''}" data-tag="${esc(t.tag)}">#${esc(t.tag)} <b>${t.n}</b></button>`).join('')}</div>` : '';
  $('#wikiTrash').textContent = W.trash ? `Trash (${W.trash})` : 'Trash';
  $('#wikiTrash').classList.toggle('on', W.trashOpen);
  $('#wikiImages').classList.toggle('on', W.galleryOpen);

  let list;
  if (W.results) list = W.results;
  else if (W.cat === 'recent') list = [...W.pages].sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 15);
  else if (W.cat === 'session') list = W.pages.filter(p => p.category === 'session').sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  else if (W.cat.startsWith('tag:')) list = W.pages.filter(p => p.tags.includes(W.cat.slice(4)));
  else list = W.cat === 'all' ? W.pages : W.pages.filter(p => p.category === W.cat);
  const sub = p => W.results ? p.snippet || catName(p.category) : W.cat === 'recent' ? `${catName(p.category)} · ${when(p.updated)}`
    : W.cat === 'all' || W.cat.startsWith('tag:') ? catName(p.category) : when(p.updated);
  const thumb = p => { const f = p.portrait || pageById(p.id)?.portrait; return f ? `<img class="thumb" src="${imageUrl(f)}" alt="" loading="lazy">` : ''; };
  const item = (p, depth = 0, kids = []) => {
    const fold = kids.length ? `<button class="fold" data-fold="${p.id}" aria-label="${W.collapsed.has(p.id) ? 'Show' : 'Hide'} the pages inside" title="${kids.length} inside">${W.collapsed.has(p.id) ? '▸' : '▾'}</button>` : '';
    return `<li style="--depth:${depth}"${kids.length ? ' class="has-kids"' : ''}>${fold}<button class="${W.cur?.id === p.id ? 'on' : ''}" data-page="${p.id}">
      ${thumb(p)}<span class="txt"><b>${esc(p.title)}</b><span>${esc(sub(p))}</span></span></button></li>`;
  };
  let html;
  if (W.results || ['recent', 'session'].includes(W.cat)) html = list.map(p => item(p)).join('');
  else {
    // a tree: pages inside another listed page sit under it (one whose parent isn't listed stays at the top)
    const shown = new Set(list.map(p => p.id));
    const kidsOf = id => list.filter(p => p.parent_id === id);
    const branch = (p, depth, seen) => {
      if (seen.has(p.id)) return '';
      seen.add(p.id);
      const kids = kidsOf(p.id);
      return item(p, depth, kids) + (W.collapsed.has(p.id) ? '' : kids.map(k => branch(k, depth + 1, seen)).join(''));
    };
    const seen = new Set();
    html = list.filter(p => !shown.has(p.parent_id)).map(p => branch(p, 0, seen)).join('');
  }
  $('#wikiList').innerHTML = html
    || `<li class="hint">${W.results ? `Nothing matches "${esc(W.q)}".` : W.pages.length ? 'No pages here yet.' : 'No pages yet. Start with New page.'}</li>`;
}

// ---------- middle column: the page, its editor, or the trash ----------

function pageHtml(p) {
  const html = md(p.body);
  return `<header class="wikihead">
      <div class="titles"><div class="crumbs">${W.back.length ? '<button class="link" data-w="back" title="Back to the previous page (Alt+←)">← Back</button>' : ''}
          ${p.breadcrumbs.length ? `<nav class="trail" aria-label="Inside">${p.breadcrumbs.map(b => `<a class="wl" href="#" data-page="${b.id}">${esc(b.title)}</a>`).join('<span aria-hidden="true">›</span>')}</nav>` : ''}</div>
        <h1>${esc(p.title)}</h1><p class="hint">${esc(catName(p.category))} · edited ${esc(when(p.updated))}</p>
        ${p.tags.length ? `<div class="chips">${p.tags.map(t => `<button class="chip wtag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}</div>
      <div class="line"><button class="btn primary" data-w="edit" title="Edit (E)">Edit</button>
        <button class="btn sm bad" data-w="delete">${S.confirm.delPage === p.id ? 'Click again to move to trash' : 'Move to trash'}</button></div>
    </header>
    <article class="wikitext" title="Double-click to edit">${html || '<p class="hint">This page is empty. Click Edit (or double-click here) to write it. You can also drop images here.</p>'}</article>`;
}

function editorHtml(p) {
  return `<header class="wikihead editing">
      <div class="titles grow">
        <input class="field wtitle" id="wikiTitle" data-path="title" data-required data-commit value="${esc(p.title)}" aria-label="Page title" autocomplete="off">
        <div class="metarow">
          <label class="hint">Category <select class="field" data-path="category" id="wikiCat">${W.categories.map(c =>
            `<option value="${c.key}"${c.key === p.category ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label class="hint">Inside <input class="field" id="wikiParent" data-path="parentTitle" data-commit list="wikiTitles" value="${esc(p.parentTitle)}"
            placeholder="no page (top level)" autocomplete="off" title="The page this one belongs to, like a tavern inside a town"></label>
          <label class="hint grow">Tags <input class="field" id="wikiTagsIn" data-path="tagsText" data-commit value="${esc(p.tagsText)}"
            placeholder="act-2, dungeon" autocomplete="off" title="Separate tags with commas"></label>
        </div>
        ${infoEditHtml(p)}
      </div>
      <div class="line"><span class="hint" id="wikiSaved"></span>
        <button class="btn" data-w="addimage" title="Upload images (or paste them, or drag them onto the text)">Add image</button>
        <button class="btn" data-w="fromgallery" title="Use an image you uploaded before">From gallery</button>
        <button class="btn primary" data-w="done" title="Done (Esc)">Done</button></div>
    </header>
    <datalist id="wikiTitles">${W.pages.filter(x => x.id !== p.id).map(x => `<option value="${esc(x.title)}">`).join('')}</datalist>
    <datalist id="wikiChars">${[...S.chars.values()].map(c => `<option value="${esc(c.sheet.name)}">`).join('')}</datalist>
    <datalist id="wikiMonsters"></datalist>
    <div class="wikiedit">
      <div class="pane"><textarea class="field" id="wikiBody" data-path="body" spellcheck="true"
        placeholder="Write anything. Link pages with [[Page title]]: a page that doesn't exist yet can be created from its link.">${esc(p.body)}</textarea>
        <ul class="suggest" id="wikiSuggest" hidden></ul></div>
      <div class="pane"><div class="wikitext preview" id="wikiPreview"></div></div>
    </div>
    <p class="hint mdhelp"><code>[[Page]]</code> or <code>[[Page|text]]</code> link · <code># Heading</code> · <code>**bold**</code> · <code>*italic*</code>
      · <code>- list</code> · <code>- [ ] task</code> · <code>&gt; quote</code> · <code>| table |</code> · <code>---</code> line
      · images: paste or drop them, <code>![Caption|small](…)</code> (small, medium or full)
      · the game: <code>[[char:Mira]]</code> <code>[[monster:Goblin Warrior]]</code> <code>[[fight:Ambush]]</code></p>`;
}

/** The info box fields of the page's category, to fill in. Page fields suggest titles and save when you leave them. */
function infoEditHtml(p) {
  const defs = catFields(p.category);
  if (!defs.length) return '';
  const v = (p.fields || {})[p.category] || {};
  const path = k => `fields.${p.category}.${k}`;
  return `<div class="infoedit">${defs.map(f => {
    const val = v[f.key] || '';
    const input = f.type === 'choice'
      ? `<select class="field" data-path="${path(f.key)}">${f.choices.map(c => `<option value="${esc(c)}"${c === val ? ' selected' : ''}>${esc(c || '—')}</option>`).join('')}</select>`
      : f.type === 'date' ? `<input class="field" type="date" data-path="${path(f.key)}" value="${esc(val)}">`
        : `<input class="field" data-path="${path(f.key)}" value="${esc(val)}" autocomplete="off"${{
          page: ' data-commit list="wikiTitles" placeholder="a page"', char: ' data-commit list="wikiChars" placeholder="a character in Party"',
          monster: ' data-commit list="wikiMonsters" data-monsters placeholder="SRD or homebrew creature"' }[f.type] || ''}>`;
    return `<label class="lbl-f">${esc(f.label)}${input}</label>`;
  }).join('')}</div>`;
}

async function trashHtml() {
  let list = [];
  try { list = await api('/api/wiki/trash'); } catch (e) { toast(e.message); }
  return `<header class="wikihead"><div class="titles"><h1>Trash</h1><p class="hint">Pages moved to the trash. Restoring one puts it back with its links.</p></div></header>
    <ul class="trashlist">${list.map(p => `<li><div><b>${esc(p.title)}</b><span class="hint">${esc(catName(p.category))} · moved to the trash ${esc(when(p.deleted))}</span></div>
      <button class="btn sm" data-restore="${p.id}">Restore</button></li>`).join('') || '<li class="hint">The trash is empty.</li>'}</ul>`;
}

async function renderMain() {
  const box = $('#wikiPage');
  if (W.trashOpen) { box.innerHTML = await trashHtml(); return; }
  if (W.galleryOpen) { box.innerHTML = await galleryHtml(); return; }
  const p = W.cur;
  if (!p) {
    box.innerHTML = `<div class="empty-list">${W.pages.length ? 'Pick a page on the left, or search.' : 'Your campaign wiki is empty.'}<br>
      <span class="hint">NPCs, places, factions, quests, session notes: anything you want to keep. Link pages with [[Page title]].</span></div>`;
    return;
  }
  box.innerHTML = W.editing ? editorHtml(p) : pageHtml(p);
  if (W.editing) updatePreview();
}

function updatePreview() {
  const el = $('#wikiPreview');
  if (el && W.cur) el.innerHTML = md(W.cur.body, { editable: true }) || '<p class="hint">The preview shows here.</p>';
}

// ---------- right column: links and page info ----------

function renderSide() {
  const box = $('#wikiSide'), p = W.cur;
  if (!p || W.trashOpen || W.galleryOpen) { box.innerHTML = ''; return; }
  const link = x => `<li><a class="wl" href="#" data-page="${x.id}">${esc(x.title)}</a> <small class="hint">${esc(catName(x.category))}</small></li>`;
  const out = p.links.map(l => (l.id ? `<li><a class="wl" href="#" data-page="${l.id}">${esc(l.title)}</a></li>`
    : `<li><a class="wl missing" href="#" data-new="${esc(l.text || l.target)}" title="No page yet: click to create it">${esc(l.text || l.target)}</a> <small class="hint">not written yet</small></li>`)).join('');
  const portrait = p.portrait
    ? `<div class="portraitblk"><button class="portrait" data-lbopen="${p.portrait}" title="Open full-screen"><img src="${imageUrl(p.portrait)}" alt="Portrait of ${esc(p.title)}"></button>
        <div class="line"><button class="link" data-w="portrait-upload">Change</button><button class="link" data-w="portrait-clear">Remove</button></div></div>`
    : `<button class="portrait empty" data-w="portrait-upload">Add a portrait<small>a face, a map, a crest… (or open an image on the page and use it)</small></button>`;
  const defs = catFields(p.category), vals = (p.fields || {})[p.category] || {};
  const pageVal = t => { const hit = resolve(t); return hit ? `<a class="wl" href="#" data-page="${hit.id}">${esc(t)}</a>` : `<a class="wl missing" href="#" data-new="${esc(t)}" title="No page yet: click to create it">${esc(t)}</a>`; };
  const filled = defs.filter(f => vals[f.key]);
  const refVal = (kind, name) => refLink(kind, name, findRef(kind, name));
  const info = defs.length ? `<div class="blk infobox"><h4>${esc(catName(p.category).replace(/s$/, '').replace(/^Session log$/, 'Session'))}</h4>${filled.length
    ? `<dl>${filled.map(f => `<dt>${esc(f.label)}</dt><dd class="${f.type === 'choice' ? `v-${esc(vals[f.key].toLowerCase().replace(/\s+/g, '-'))}` : ''}">${f.type === 'page' ? pageVal(vals[f.key]) : f.type === 'char' || f.type === 'monster' ? refVal(f.type, vals[f.key])
      : f.type === 'date' ? esc(new Date(vals[f.key] + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })) : esc(vals[f.key])}</dd>`).join('')}</dl>`
    : `<p class="hint">Nothing filled in yet. ${W.editing ? 'Fill it in at the top of the editor.' : 'Click Edit to add details.'}</p>`}</div>` : '';
  const inside = `<div class="blk"><h4>Inside this page <span class="hint">${p.children.length || ''}</span></h4>
      ${p.children.length ? `<ul class="linklist">${p.children.map(link).join('')}</ul>` : ''}
      <button class="link" data-w="newchild">+ New page inside ${esc(p.title)}</button></div>`;
  box.innerHTML = `${portrait}${info}${gameHtml(p)}${inside}<div class="blk"><h4>Linked from <span class="hint">${p.backlinks.length}</span></h4>
      ${p.backlinks.length ? `<ul class="linklist">${p.backlinks.map(link).join('')}</ul>` : '<p class="hint">No page links here yet. Link to it with [[' + esc(p.title) + ']].</p>'}</div>
    <div class="blk"><h4>Links to <span class="hint">${p.links.length}</span></h4>
      ${out ? `<ul class="linklist">${out}</ul>` : '<p class="hint">This page doesn\'t link anywhere yet.</p>'}</div>
    <div class="blk"><h4>Page</h4><div class="props">
      <div><b>Category</b> ${esc(catName(p.category))}</div>
      <div><b>Created</b> ${esc(when(p.created))}</div><div><b>Edited</b> ${esc(when(p.updated))}</div></div></div>`;
}

export function renderWiki() { renderNav(); renderMain(); renderSide(); }

// ---------- links to the game: characters, creatures, saved fights ----------

/** A game link (as the text renders it): opens the sheet, the stat block or the fight. */
function refLink(kind, name, ref) {
  const what = REF_KINDS[kind];
  return `<a class="wl ref r-${kind}${ref?.found ? '' : ' missing'}" href="#" data-ref="${esc(`${kind}:${name}`)}" title="${esc(ref?.found
    ? `${what}: ${ref.title}` : `No ${what.toLowerCase()} called "${name}" in the app yet`)}">${esc(ref?.title || name)}</a>`;
}

/** "In the game": the characters, creatures and fights the page names, with what can be done with them. */
function gameHtml(p) {
  if (!p.refs?.length) return '';
  const card = r => {
    const ref = `${r.kind}:${r.name}`, ch = r.kind === 'char' && r.found ? S.chars.get(r.id) : null;
    const meta = !r.found ? `not in the app: ${r.kind === 'char' ? 'no character' : r.kind === 'fight' ? 'no saved fight' : 'no SRD or homebrew creature'} with this name`
      : ch ? `${classLine(ch.sheet)} · AC ${ch.derived.ac} · HP ${ch.sheet.hp}/${ch.sheet.max_hp}` : `${REF_KINDS[r.kind]}${r.meta ? ` · ${r.meta}` : ''}`;
    const btn = (act, label) => `<button class="btn sm" data-refact="${act}" data-ref="${esc(ref)}">${label}</button>`;
    const acts = !r.found ? '' : r.kind === 'char' ? btn('sheet', 'Open sheet') + btn('add', 'Add to combat')
      : r.kind === 'monster' ? btn('stat', 'Stat block') + btn('add', 'Add to combat') : btn('stat', 'Who\'s in it') + btn('add', 'Add to combat');
    return `<li class="refcard r-${r.kind}"><div>${refLink(r.kind, r.name, r)}<small class="hint">${esc(meta)}</small></div>${acts ? `<div class="line">${acts}</div>` : ''}</li>`;
  };
  return `<div class="blk"><h4>In the game <span class="hint">${p.refs.length}</span></h4><ul class="refcards">${p.refs.map(card).join('')}</ul></div>`;
}

/** Act on a game link: 'open' (a click on the link), 'sheet', 'stat' or 'add'. */
async function refAction(refText, act) {
  const parts = splitRef(refText);
  const r = parts && findRef(parts.kind, parts.name);
  if (!r?.found) {
    const what = REF_KINDS[parts?.kind] || 'thing';
    return toast(`There's no ${what.toLowerCase()} called "${parts?.name}" in the app. Links to the game match by name${W.editing ? '' : ' (check the spelling, or create it first)'}.`);
  }
  if (act === 'add') {
    if (r.kind === 'monster') return addMonster(r.idx);
    if (r.kind === 'fight') return addFight(r.id);
    const added = addChar(r.id);
    return added && toast(`Added to combat: ${added}.`);
  }
  if (r.kind === 'char' && (act === 'open' || act === 'sheet')) {
    if (W.cur) await saveWikiNow().catch(() => {});
    S.currentChar = r.id;
    return switchView('party');
  }
  return openRefDialog(r);
}

/** A creature's stat block, or a saved fight's creatures, in a dialog with Add to combat. */
async function openRefDialog(r) {
  const dlg = $('#refDlg');
  let body;
  if (r.kind === 'monster') {
    let m;
    try { m = await getEntry('monster', r.idx); } catch (e) { return toast(e.message); }
    body = `<div class="ins-head"><h2>${esc(m.name)}</h2><p>${esc(monsterLine(m))}</p></div>${statBlock(m)}`;
  } else {
    W.fights = await api('/api/saved-encounters').catch(() => W.fights);
    const f = W.fights.find(x => x.id === r.id);
    const counts = {};
    for (const c of f?.creatures || []) { const n = String(c.name).replace(/\s+\d+$/, ''); counts[n] = (counts[n] || 0) + 1; }
    body = `<div class="ins-head"><h2>${esc(r.title)}</h2><p>Saved fight</p></div>
      <ul class="linklist">${Object.entries(counts).map(([n, k]) => `<li>${k > 1 ? `${k}× ` : ''}${esc(n)}</li>`).join('') || '<li class="hint">No creatures.</li>'}</ul>
      ${f?.notes ? `<p class="prose fightnotes">${esc(f.notes)}</p>` : ''}`;
  }
  dlg.innerHTML = `<div class="refbody">${body}</div>
    <div class="line"><span class="hint">${r.kind === 'monster' ? 'Uses the count and HP setting in the combat library.' : 'Adds them to the tracker.'}</span><span class="spacer"></span>
      <button class="btn primary" data-refdlg="add">Add to combat</button><button class="btn" data-refdlg="close" autofocus>Close</button></div>`;
  dlg.dataset.ref = `${r.kind}:${r.name}`;
  if (!dlg.open) dlg.showModal();
}

/** "In the wiki": the pages that mention a character or creature (for the Party view and the combat inspector). */
export async function showMentions(host, kind, name) {
  if (!host || !name) return;
  let list;
  try { list = await api(`/api/wiki/mentions?kind=${kind}&name=${encodeURIComponent(name)}`); } catch { return; }
  if (!host.isConnected) return;
  host.innerHTML = list.length ? `<div class="blk"><h4>In the wiki <span class="hint">${list.length}</span></h4><ul class="linklist">${list.map(p =>
    `<li><a class="wl" href="#" data-wikipage="${p.id}">${esc(p.title)}</a>${W.categories.length ? ` <small class="hint">${esc(catName(p.category))}</small>` : ''}</li>`).join('')}</ul></div>` : '';
}

/** Open a wiki page from another view. */
export function openWikiPage(id) {
  W.pendingOpen = id;
  switchView('wiki');
}

// ---------- the image gallery ----------

const kb = n => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const isUnused = i => !i.pages.length && !i.trashed;

/** The gallery's cards. mode 'manage' (the Images view: open, delete unused) or 'pick' (choose one for a page). */
function galleryGrid(list, mode) {
  return list.length ? `<ul class="gallery">${list.map(i => {
    const used = i.pages.length ? `Used on ${i.pages.map(p => `<a class="wl" href="#" data-page="${p.id}">${esc(p.title)}</a>`).join(', ')}`
      : i.trashed ? `Only on ${i.trashed} page${i.trashed > 1 ? 's' : ''} in the trash` : '<span class="unused">Not used on any page</span>';
    const del = mode === 'manage' && isUnused(i) ? `<button class="link bad" data-imgdel="${i.file}">${S.confirm.delImg === i.file ? 'Click again to delete' : 'Delete'}</button>` : '';
    return `<li><button class="gthumb" ${mode === 'pick' ? `data-pickimg="${i.file}"` : `data-lbopen="${i.file}"`} title="${mode === 'pick' ? 'Put this image in the page' : 'Open full-screen'}">
        <img src="${imageUrl(i.file)}" alt="${esc(i.name)}" loading="lazy"></button>
      <div class="gmeta"><b title="${esc(i.name)}">${esc(i.name)}</b><span class="hint">${kb(i.bytes)}</span>${mode === 'manage' ? `<span class="hint">${used}</span>` : ''}${del}</div></li>`;
  }).join('')}</ul>` : '<p class="hint">No images here.</p>';
}

async function loadGallery() {
  try { W.gallery = await api('/api/wiki/gallery'); } catch (e) { toast(e.message); W.gallery = []; }
  return W.gallery;
}

async function galleryHtml() {
  const all = await loadGallery(), unused = all.filter(isUnused);
  const list = W.galleryFilter === 'unused' ? unused : all;
  const tab = (k, label) => `<button class="${W.galleryFilter === k ? 'on' : ''}" data-gfilter="${k}">${label}</button>`;
  return `<header class="wikihead"><div class="titles"><h1>Images</h1>
      <p class="hint">Every image you added to the wiki. ${all.length} image${all.length === 1 ? '' : 's'}, ${kb(all.reduce((n, i) => n + i.bytes, 0))} in data/wiki_images.</p></div>
      <div class="tabs">${tab('all', 'All')}${tab('unused', `Not used (${unused.length})`)}</div></header>
    ${galleryGrid(list, 'manage')}
    ${unused.length ? '<p class="hint">Images no page uses (not even one in the trash) can be deleted. Images in use are kept.</p>' : ''}`;
}

/** Choose an image from the gallery for the page being edited. */
async function openPicker() {
  const dlg = $('#galleryDlg'), caretAt = $('#wikiBody')?.selectionStart;
  dlg.dataset.caret = caretAt ?? '';
  dlg.innerHTML = '<p class="hint">Loading…</p>';
  if (!dlg.open) dlg.showModal();
  const list = await loadGallery();
  dlg.innerHTML = `<div class="line"><h2>Pick an image</h2><span class="spacer"></span><button class="btn" data-gdlg="close">Close</button></div>
    ${list.length ? galleryGrid(list, 'pick') : '<p class="hint">No images yet: upload one with Add image, or paste or drop one into the text.</p>'}`;
}

function insertPicked(file) {
  const dlg = $('#galleryDlg'), ta = $('#wikiBody');
  dlg.close();
  const img = (W.gallery || []).find(i => i.file === file);
  if (!ta || !img) return;
  const at = insertBlock(ta.value, dlg.dataset.caret === '' ? ta.value.length : +dlg.dataset.caret, imageMarkdown(file, img.name));
  ta.value = at.text;
  ta.setSelectionRange(at.caret, at.caret);
  ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---------- [[ suggestions while writing ----------

// each suggestion: { insert: the link target to write, html: how it's listed }
let sugg = { list: [], i: 0, monsters: new Map() };
let monsterTimer;

/** Where the caret is in the textarea, in pixels (a hidden copy of the text up to the caret is measured). */
function caretXY(ta) {
  const div = document.createElement('div'), cs = getComputedStyle(ta);
  for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'padding', 'border', 'boxSizing', 'whiteSpace', 'wordWrap', 'tabSize'])
    div.style[k] = cs[k];
  Object.assign(div.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${ta.clientWidth}px` });
  div.textContent = ta.value.slice(0, ta.selectionStart);
  const mark = document.createElement('span');
  mark.textContent = '​';
  div.appendChild(mark);
  document.body.appendChild(div);
  const xy = { x: mark.offsetLeft, y: mark.offsetTop + mark.offsetHeight - ta.scrollTop };
  div.remove();
  return xy;
}

function updateSuggest() {
  const ta = $('#wikiBody'), ul = $('#wikiSuggest');
  if (!ta || !ul) return;
  const open = openLink(ta.value, ta.selectionStart);
  if (!open) { ul.hidden = true; sugg.list = []; return; }
  // "monster:gob" looks only for creatures; plain text looks at pages first, then the game
  const pre = open.query.match(/^\s*(char|monster|fight)\s*:\s*(.*)$/i);
  const only = pre?.[1].toLowerCase(), q = normTitle(pre ? pre[2] : open.query);
  const rank = names => [...names.filter(n => normTitle(n).startsWith(q)), ...names.filter(n => !normTitle(n).startsWith(q) && normTitle(n).includes(q))];
  const tag = kind => ` <small class="hint">${REF_KINDS[kind].toLowerCase()}</small>`;
  const list = [];
  if (!only) list.push(...rank(W.pages.filter(p => p.id !== W.cur?.id).map(p => p.title)).slice(0, 6).map(t => ({ insert: t, html: esc(t) })));
  if (q || only) {
    if (!only || only === 'char') list.push(...rank([...S.chars.values()].map(c => c.sheet.name)).slice(0, 3).map(n => ({ insert: `char:${n}`, html: esc(n) + tag('char') })));
    if (!only || only === 'fight') list.push(...rank((W.fights || []).map(f => f.name)).slice(0, 3).map(n => ({ insert: `fight:${n}`, html: esc(n) + tag('fight') })));
    if (!only || only === 'monster') {
      const found = sugg.monsters.get(q);
      if (found) list.push(...found.slice(0, 4).map(n => ({ insert: `monster:${n}`, html: esc(n) + tag('monster') })));
      else if (q.length >= 2) {                         // creatures come from the server: ask, then list them
        clearTimeout(monsterTimer);
        monsterTimer = setTimeout(async () => {
          const rows = await api(`/api/search?kind=monster&q=${encodeURIComponent(q)}&limit=6`).catch(() => []);
          sugg.monsters.set(q, rows.map(r => r.name));
          updateSuggest();                              // still typing that link? (it checks the caret again)
        }, 150);
      }
    }
  }
  if (q && !only && !byTitle.has(q)) list.push({ insert: open.query.trim(), html: `<span class="hint">New page:</span> ${esc(open.query.trim())}` });
  sugg.list = list;
  sugg.i = Math.min(sugg.i, Math.max(0, sugg.list.length - 1));
  if (!sugg.list.length) { ul.hidden = true; return; }
  ul.innerHTML = sugg.list.map((t, i) => `<li class="${i === sugg.i ? 'on' : ''}" data-sug="${i}">${t.html}</li>`).join('');
  const { x, y } = caretXY(ta);
  Object.assign(ul.style, { left: `${Math.min(x, ta.clientWidth - 200)}px`, top: `${y + 4}px` });
  ul.hidden = false;
}

function acceptSuggest(i = sugg.i) {
  const ta = $('#wikiBody'), t = sugg.list[i];
  if (!ta || t === undefined) return;
  const done = completeLink(ta.value, ta.selectionStart, t.insert);
  ta.value = done.text;
  ta.setSelectionRange(done.caret, done.caret);
  ta.dispatchEvent(new Event('input', { bubbles: true }));       // saves and updates the preview like typing
  $('#wikiSuggest').hidden = true;
  sugg.list = [];
  ta.focus();
}

// ---------- images: upload, sizes, portrait ----------

const MAX_MB = 20;
let picking = 'text';                        // what the file picker is for: 'text' or 'portrait'

/** Upload image files; returns the uploaded ones ({ file, name }). Errors are shown, the rest still upload. */
async function uploadAll(files) {
  // the server checks the bytes too; this just skips uploads it would refuse (SVG, PDF, ...)
  const list = [...files].filter(f => /^image\/(png|jpeg|gif|webp)$/.test(f.type) || (!f.type && /\.(png|jpe?g|gif|webp)$/i.test(f.name)));
  if (!list.length) { toast('Only images can be added: PNG, JPEG, GIF or WebP.'); return []; }
  const status = $('#wikiSaved');
  if (status) status.textContent = `Uploading ${list.length > 1 ? `${list.length} images` : 'the image'}…`;
  const done = [];
  for (const f of list) {
    if (f.size > MAX_MB * 1024 * 1024) { toast(`${f.name} is larger than ${MAX_MB} MB.`); continue; }
    try { done.push({ ...(await uploadImage(f)), name: f.name }); } catch (e) { toast(`${f.name || 'Image'}: ${e.message}`); }
  }
  if (status) status.textContent = done.length ? '' : 'Not uploaded';
  return done;
}

/** Put uploaded images into the open page: at the caret while editing, at the end otherwise. */
async function addImages(files) {
  const page = W.cur;
  if (!page) return;
  const caretAt = $('#wikiBody')?.selectionStart;
  const done = await uploadAll(files);
  if (!done.length || W.cur !== page) return;
  const snippet = done.map(d => imageMarkdown(d.file, d.name)).join('\n');
  const ta = W.editing && $('#wikiBody');
  if (ta) {
    const at = insertBlock(ta.value, caretAt ?? ta.value.length, snippet);
    ta.value = at.text;
    ta.setSelectionRange(at.caret, at.caret);
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));       // saves and redraws the preview like typing
  } else {
    page.body = insertBlock(page.body, page.body.length, snippet).text;
    renderMain();
    scheduleWikiSave();
    toast(`Added ${done.length > 1 ? `${done.length} images` : 'the image'} at the end of the page.`);
  }
}

async function setPortrait(file) {
  if (!W.cur) return;
  W.cur.portrait = file || null;
  renderSide();
  try { await saveWikiNow(); } catch { /* shown by onWikiError */ }
}

function pickFiles(what) {
  picking = what;
  const input = $('#wikiFile');
  input.multiple = what === 'text';
  input.value = '';
  input.click();
}

// ---------- full-screen viewer ----------

const LB = { list: [], i: 0, zoom: false };

/** Open the viewer on `file`, stepping through the open page's portrait and images (or the gallery's). */
function openViewer(file) {
  const files = W.galleryOpen ? (W.gallery || []).map(i => i.file)
    : [W.cur?.portrait, ...[...document.querySelectorAll('#wikiPage img[data-img]')].map(x => x.dataset.img)].filter(Boolean);
  LB.list = [...new Set(files)];
  if (!LB.list.includes(file)) LB.list.unshift(file);
  LB.i = LB.list.indexOf(file);
  LB.zoom = false;
  showViewer();
  const dlg = $('#lightbox');
  if (!dlg.open) dlg.showModal();
}

function showViewer() {
  const file = LB.list[LB.i], dlg = $('#lightbox');
  const img = dlg.querySelector('.lb-stage img');
  const shown = document.querySelector(`#wikiPage img[data-img="${file}"]`);
  const caption = W.galleryOpen ? (W.gallery || []).find(i => i.file === file)?.name : shown?.alt;
  img.src = imageUrl(file);
  img.alt = caption || '';
  dlg.querySelector('.lb-cap').textContent = caption || (file === W.cur?.portrait ? `${W.cur.title}: portrait` : '');
  dlg.querySelector('.lb-count').textContent = LB.list.length > 1 ? `${LB.i + 1} of ${LB.list.length}` : '';
  dlg.querySelectorAll('.lb-nav').forEach(b => { b.hidden = LB.list.length < 2; });
  const isPortrait = file === W.cur?.portrait;
  const pb = dlg.querySelector('[data-lb="portrait"]');
  pb.hidden = W.galleryOpen;                       // the gallery isn't about one page
  Object.assign(pb, { disabled: isPortrait || !W.cur, textContent: isPortrait ? 'Page portrait' : 'Use as page portrait' });
  setZoom(LB.zoom);
}

function setZoom(on, at) {
  LB.zoom = on;
  const dlg = $('#lightbox'), stage = dlg.querySelector('.lb-stage'), img = stage.querySelector('img');
  stage.classList.toggle('zoomed', on);
  dlg.querySelector('[data-lb="zoom"]').textContent = on ? 'Fit to screen' : 'Actual size';
  if (on && at) {           // keep the clicked spot under the pointer
    stage.scrollLeft = at.x * img.naturalWidth - at.cx;
    stage.scrollTop = at.y * img.naturalHeight - at.cy;
  }
}

function initViewer() {
  const dlg = $('#lightbox'), stage = dlg.querySelector('.lb-stage'), img = stage.querySelector('img');
  let drag = null, moved = false;
  dlg.addEventListener('click', e => {
    const a = e.target.closest('[data-lb]')?.dataset.lb;
    if (a === 'close') dlg.close();
    else if (a === 'prev' || a === 'next') { LB.i = (LB.i + (a === 'next' ? 1 : -1) + LB.list.length) % LB.list.length; LB.zoom = false; showViewer(); }
    else if (a === 'zoom') setZoom(!LB.zoom);
    else if (a === 'portrait') { setPortrait(LB.list[LB.i]); showViewer(); toast('Set as the page portrait.'); }
    else if (e.target === img && !moved) {
      const r = img.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      setZoom(!LB.zoom, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, cx: e.clientX - sr.left, cy: e.clientY - sr.top });
    } else if (e.target === stage && !LB.zoom) dlg.close();       // a click beside the picture closes it
  });
  dlg.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); dlg.querySelector(`[data-lb="${e.key === 'ArrowRight' ? 'next' : 'prev'}"]`).click(); }
    if (e.key === 'z' || e.key === 'Z') setZoom(!LB.zoom);
  });
  // drag to look around a zoomed map
  stage.addEventListener('pointerdown', e => { if (LB.zoom) { drag = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop }; moved = false; } });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    stage.scrollLeft = drag.l - dx; stage.scrollTop = drag.t - dy;
  });
  window.addEventListener('pointerup', () => { drag = null; setTimeout(() => { moved = false; }); });
}

// ---------- events ----------

function onClick(e) {
  const fold = e.target.closest('[data-fold]');
  if (fold) {
    const id = +fold.dataset.fold;
    if (W.collapsed.has(id)) W.collapsed.delete(id); else W.collapsed.add(id);
    return renderNav();
  }
  const tag = e.target.closest('[data-tag]');
  if (tag) {
    W.cat = `tag:${tag.dataset.tag}`;
    W.q = ''; W.results = null; $('#wikiSearch').value = '';
    return renderNav();
  }
  const pg = e.target.closest('[data-page]');
  if (pg) { e.preventDefault(); return openPage(+pg.dataset.page); }
  const nw = e.target.closest('[data-new]');
  if (nw) {
    e.preventDefault();
    const hit = resolve(nw.dataset.new);                 // created meanwhile (e.g. typed in the editor)
    return hit ? openPage(hit.id) : newPage(nw.dataset.new);
  }
  const rs = e.target.closest('[data-restore]');
  if (rs) {
    return api(`/api/wiki/${rs.dataset.restore}/restore`, { method: 'POST' }).then(async p => {
      toast(`Restored "${p.title}".`);
      await loadList();
      openPage(p.id, { back: false });
    }, err => toast(err.message));
  }
  const lb = e.target.closest('[data-lbopen]') || (e.target.matches('#wikiPage img[data-img]') && e.target);
  if (lb) { e.preventDefault(); return openViewer(lb.dataset.lbopen || lb.dataset.img); }
  const sz = e.target.closest('[data-imgsize]');
  if (sz && W.cur && W.editing) {
    const ta = $('#wikiBody'), at = ta.selectionStart;
    ta.value = setImageSize(ta.value, sz.dataset.file, sz.dataset.imgsize);
    ta.setSelectionRange(Math.min(at, ta.value.length), Math.min(at, ta.value.length));
    return ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const sg = e.target.closest('[data-sug]');
  if (sg) { e.preventDefault(); return acceptSuggest(+sg.dataset.sug); }
  const ra = e.target.closest('[data-refact]');
  if (ra) return refAction(ra.dataset.ref, ra.dataset.refact);
  const rl = e.target.closest('a[data-ref]');
  if (rl) { e.preventDefault(); return refAction(rl.dataset.ref, 'open'); }
  const gf = e.target.closest('[data-gfilter]');
  if (gf) { W.galleryFilter = gf.dataset.gfilter; S.confirm.delImg = null; return renderMain(); }
  const del = e.target.closest('[data-imgdel]');
  if (del) {
    const file = del.dataset.imgdel;
    if (S.confirm.delImg !== file) { S.confirm.delImg = file; return renderMain(); }
    S.confirm.delImg = null;
    return api(`/api/wiki/images/${file}`, { method: 'DELETE' }).then(() => { toast('Image deleted.'); renderMain(); }, err => toast(err.message));
  }
  const a = e.target.closest('[data-w]')?.dataset.w;
  if (!a || !W.cur) return;
  if (a !== 'delete') S.confirm.delPage = null;
  if (a === 'edit') { W.editing = true; renderMain(); return $('#wikiBody')?.focus(); }
  if (a === 'done') return finishEditing();
  if (a === 'addimage') return pickFiles('text');
  if (a === 'fromgallery') return openPicker();
  if (a === 'portrait-upload') return pickFiles('portrait');
  if (a === 'portrait-clear') return setPortrait(null);
  if (a === 'newchild') return newPage(null, W.cur);
  if (a === 'back') return goBack();
  if (a === 'delete') {
    if (S.confirm.delPage !== W.cur.id) { S.confirm.delPage = W.cur.id; return renderMain(); }
    const p = W.cur;
    saveWikiNow().catch(() => {}).then(() => api(`/api/wiki/${p.id}`, { method: 'DELETE' })).then(async () => {
      toast(`Moved "${p.title}" to the trash.`);
      Object.assign(W, { cur: null, editing: false, back: W.back.filter(x => x !== p.id) });
      S.confirm.delPage = null;
      await loadList();
      renderWiki();
    }, err => toast(err.message));
  }
}

async function finishEditing() {
  const title = $('#wikiTitle');
  if (title && title.value.trim() && title.value !== W.cur.title) title.dispatchEvent(new Event('change', { bubbles: true }));
  W.editing = false;
  renderMain();
  try { await saveWikiNow(); } catch { /* the error was shown */ }
}

function goBack() {
  const id = W.back.pop();
  if (id) openPage(id, { back: false });
}

export function initWiki() {
  const view = $('#view-wiki');
  view.addEventListener('click', onClick);
  view.addEventListener('dblclick', e => {
    if (W.cur && !W.editing && e.target.closest('#wikiPage .wikitext') && !e.target.closest('a,img')) { W.editing = true; renderMain(); $('#wikiBody')?.focus(); }
  });
  $('#newPage').onclick = () => newPage();
  initViewer();
  $('#wikiFile').addEventListener('change', async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    if (picking === 'portrait') { const [d] = await uploadAll(files.slice(0, 1)); if (d) setPortrait(d.file); }
    else addImages(files);
  });
  // paste a screenshot into the text
  $('#wikiPage').addEventListener('paste', e => {
    if (e.target.id !== 'wikiBody') return;
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addImages(files); }
  });
  // drop images on the page (or its editor); dropping files anywhere else in the wiki does nothing
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  view.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const onPage = !!e.target.closest('#wikiPage') && W.cur && !W.trashOpen;
    e.dataTransfer.dropEffect = onPage ? 'copy' : 'none';
    $('#wikiPage').classList.toggle('dropping', onPage);
  });
  view.addEventListener('dragleave', e => { if (!e.relatedTarget || !view.contains(e.relatedTarget)) $('#wikiPage').classList.remove('dropping'); });
  view.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    $('#wikiPage').classList.remove('dropping');
    if (e.target.closest('#wikiPage') && W.cur && !W.trashOpen) addImages(e.dataTransfer.files);
  });
  $('#wikiTrash').onclick = async () => {
    if (W.cur) await saveWikiNow().catch(() => {});
    W.trashOpen = !W.trashOpen;
    W.galleryOpen = false;
    W.editing = false;
    renderWiki();
  };
  $('#wikiImages').onclick = async () => {
    if (W.cur) await saveWikiNow().catch(() => {});
    W.galleryOpen = !W.galleryOpen;
    W.trashOpen = false;
    W.editing = false;
    S.confirm.delImg = null;
    renderWiki();
  };
  // the stat block / saved fight dialog, and the gallery picker
  $('#refDlg').addEventListener('click', e => {
    if (handleRollClick(e)) return;
    const a = e.target.closest('[data-refdlg]')?.dataset.refdlg;
    if (a === 'add') { refAction($('#refDlg').dataset.ref, 'add'); $('#refDlg').close(); }
    if (a === 'close') $('#refDlg').close();
  });
  $('#galleryDlg').addEventListener('close', () => { $('#galleryDlg').innerHTML = ''; });   // no hidden copy of the grid
  $('#refDlg').addEventListener('close', () => { $('#refDlg').innerHTML = ''; });
  $('#galleryDlg').addEventListener('click', e => {
    const pick = e.target.closest('[data-pickimg]');
    if (pick) return insertPicked(pick.dataset.pickimg);
    if (e.target.closest('[data-gdlg="close"]') || e.target === $('#galleryDlg')) $('#galleryDlg').close();
  });
  // creature fields suggest SRD and homebrew names as you type
  let monTimer;
  $('#wikiPage').addEventListener('input', e => {
    if (!e.target.matches('[data-monsters]')) return;
    clearTimeout(monTimer);
    const q = e.target.value.trim();
    monTimer = setTimeout(async () => {
      const rows = q ? await api(`/api/search?kind=monster&q=${encodeURIComponent(q)}&limit=12`).catch(() => []) : [];
      const dl = $('#wikiMonsters');
      if (dl) dl.innerHTML = rows.map(r => `<option value="${esc(r.name)}">${esc(r.meta)}</option>`).join('');
    }, 150);
  });
  $('#wikiCats').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    W.cat = b.dataset.cat;
    W.q = ''; W.results = null; $('#wikiSearch').value = '';
    renderNav();
  });
  let timer;
  $('#wikiSearch').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      W.q = e.target.value.trim();
      W.results = W.q ? await api(`/api/wiki/search?q=${encodeURIComponent(W.q)}`).catch(() => []) : null;
      renderNav();
    }, 160);
  });
  $('#wikiSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter' && W.results?.length) openPage(W.results[0].id);
    if (e.key === 'Escape') { e.target.value = ''; W.q = ''; W.results = null; renderNav(); }
  });

  // the editor: title (saved when you leave it), category and text (saved as you type)
  bindForm($('#wikiPage'), {
    target: () => (W.editing ? W.cur : null),
    onEdit: path => {
      const p = W.cur;
      if (path === 'body') { updatePreview(); updateSuggest(); }
      if (path === 'category') { renderMain(); renderSide(); $('#wikiCat')?.focus(); }   // its info box changes
      if (path === 'parentTitle') {
        const t = p.parentTitle.trim(), hit = t ? resolve(t) : null;
        const refuse = msg => { toast(msg); p.parentTitle = pageById(p.parent_id)?.title || ''; $('#wikiParent').value = p.parentTitle; };
        if (t && !hit) return refuse(`There's no page called "${t}": pick one from the list, or leave it empty for the top level.`);
        if (hit?.id === p.id) return refuse("A page can't be inside itself.");
        p.parent_id = hit ? hit.id : null;
      }
      $('#wikiSaved').textContent = 'Saving…';
      scheduleWikiSave();
    },
  });
  $('#wikiPage').addEventListener('keydown', e => {
    if (e.target.id === 'wikiTitle' && e.key === 'Enter') { e.preventDefault(); $('#wikiBody')?.focus(); return; }
    if (e.target.id !== 'wikiBody') return;
    const open = !$('#wikiSuggest')?.hidden && sugg.list.length;
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      sugg.i = (sugg.i + (e.key === 'ArrowDown' ? 1 : -1) + sugg.list.length) % sugg.list.length;
      return updateSuggest();
    }
    if (open && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); return acceptSuggest(); }
    if (e.key === 'Escape') { e.preventDefault(); if (open) { $('#wikiSuggest').hidden = true; sugg.list = []; } else finishEditing(); }
  });
  $('#wikiPage').addEventListener('click', e => { if (e.target.id === 'wikiBody') updateSuggest(); });
  $('#wikiPage').addEventListener('focusout', e => { if (e.target.id === 'wikiBody') setTimeout(() => { const ul = $('#wikiSuggest'); if (ul && !ul.matches(':hover')) ul.hidden = true; }, 150); });

  // keys while the wiki is shown: / search, E edit, Alt+← back
  document.addEventListener('keydown', e => {
    if (S.view !== 'wiki') return;
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); return goBack(); }
    if (e.target.closest('input,textarea,select') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); $('#wikiSearch').focus(); }
    if ((e.key === 'e' || e.key === 'E') && W.cur && !W.editing && !W.trashOpen) { e.preventDefault(); W.editing = true; renderMain(); $('#wikiBody')?.focus(); }
  });

  onWikiSaved(async (res, latest) => {
    const titleChanged = !W.pages.some(p => p.id === res.id && p.title === res.title);
    if (W.cur?.id === res.id) {
      // keep what's being typed; take the server's links, dates and (when nothing newer is waiting) the text
      Object.assign(W.cur, { links: res.links, backlinks: res.backlinks, updated: res.updated, title: res.title, portrait: res.portrait,
        tags: res.tags, parent_id: res.parent_id, breadcrumbs: res.breadcrumbs, children: res.children, refs: res.refs,
        ...(latest ? { fields: res.fields } : {}), ...(latest && !W.editing ? { body: res.body } : {}) });
      if (latest) {                       // show the tags as stored ("Act 2" -> act-2), unless they're being typed
        const tagsIn = $('#wikiTagsIn');
        W.cur.tagsText = res.tags.join(', ');
        if (tagsIn && document.activeElement !== tagsIn) tagsIn.value = W.cur.tagsText;
      }
      const s = $('#wikiSaved');
      if (s && latest) s.textContent = 'Saved';
    }
    const li0 = pageById(res.id);
    const listChanged = !li0 || li0.parent_id !== res.parent_id || li0.tags.join() !== res.tags.join();
    if (titleChanged || res.relinked || listChanged) {
      await loadList();
      if (res.relinked) toast(`Renamed: updated the links in ${res.relinked} other page${res.relinked > 1 ? 's' : ''}.`);
      if (W.editing) updatePreview();
    } else {
      const li = W.pages.find(p => p.id === res.id);
      if (li) Object.assign(li, { category: res.category, updated: res.updated, portrait: res.portrait });
    }
    renderNav(); renderSide();
    if (W.editing && W.cur?.id === res.id) updatePreview();       // newly named characters and creatures resolve
    if (!W.editing && W.cur?.id === res.id) renderMain();
  });
  onWikiError(e => {
    toast(`Could not save the page: ${e.message}`);
    const s = $('#wikiSaved');
    if (s) s.textContent = 'Not saved';
    // a title that was refused (taken, or with [ ] |): put back the one that's stored
    const stored = W.pages.find(p => p.id === W.cur?.id);
    if (stored && W.cur.title !== stored.title) {
      W.cur.title = stored.title;
      const t = $('#wikiTitle');
      if (t) t.value = stored.title;
    }
    // the same for where it sits (a loop: inside a page that's inside it)
    if (stored && W.cur.parent_id !== stored.parent_id) {
      W.cur.parent_id = stored.parent_id;
      W.cur.parentTitle = pageById(stored.parent_id)?.title || '';
      const t = $('#wikiParent');
      if (t) t.value = W.cur.parentTitle;
    }
  });
}

export async function showWiki() {
  await loadList();
  W.fights = await api('/api/saved-encounters').catch(() => W.fights || []);
  if (W.cur && !W.pages.some(p => p.id === W.cur.id)) W.cur = null;
  if (W.pendingOpen) {                    // opened from another view ("In the wiki")
    const id = W.pendingOpen;
    W.pendingOpen = null;
    return openPage(id);
  }
  renderWiki();
}
