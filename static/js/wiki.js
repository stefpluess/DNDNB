// The Wiki view: categories and pages (left), the page or its editor (middle), links and page info (right).
// Pages are Markdown with [[Page title]] links (markdown.js); the server (wiki.py) stores them, keeps the
// links for "Linked from", rewrites links when a page is renamed, and keeps deleted pages in a trash.
// Images are uploaded (button, paste or drag and drop), written into the text as ![Caption|size](file),
// open full-screen when clicked, and one can be the page's portrait.

import { bindForm } from './forms.js';
import { completeLink, imageMarkdown, imageUrl, insertBlock, normTitle, openLink, renderMarkdown, setImageSize } from './markdown.js';
import { S, api, onWikiError, onWikiSaved, saveWikiNow, scheduleWikiSave, uploadImage } from './store.js';
import { $, esc, toast } from './util.js';

const W = S.wiki;
const catName = key => W.categories.find(c => c.key === key)?.name || 'Unsorted';
const byTitle = new Map();                   // normalized title -> page, for resolving [[links]]
const resolve = title => byTitle.get(normTitle(title)) || null;

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
    Object.assign(W, { pages: res.pages, categories: res.categories, trash: res.trash });
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
  Object.assign(W, { cur: page, editing: edit, trashOpen: false });
  S.confirm.delPage = null;
  renderWiki();
  $('#wikiPage').scrollTop = 0;
  if (edit) $(page.body ? '#wikiBody' : '#wikiTitle')?.focus();
}

/** A new page: from a missing [[link]] (its title), or the New page button (in the category being viewed). */
async function newPage(title) {
  const cat = W.categories.some(c => c.key === W.cat) ? W.cat : 'unsorted';
  const body = { category: cat };
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
  $('#wikiTrash').textContent = W.trash ? `Trash (${W.trash})` : 'Trash';
  $('#wikiTrash').classList.toggle('on', W.trashOpen);

  let list;
  if (W.results) list = W.results;
  else if (W.cat === 'recent') list = [...W.pages].sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 15);
  else if (W.cat === 'session') list = W.pages.filter(p => p.category === 'session').sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  else list = W.cat === 'all' ? W.pages : W.pages.filter(p => p.category === W.cat);
  const sub = p => W.results ? p.snippet || catName(p.category) : W.cat === 'recent' ? `${catName(p.category)} · ${when(p.updated)}`
    : W.cat === 'all' ? catName(p.category) : when(p.updated);
  const thumb = p => { const f = p.portrait || W.pages.find(x => x.id === p.id)?.portrait; return f ? `<img class="thumb" src="${imageUrl(f)}" alt="" loading="lazy">` : ''; };
  $('#wikiList').innerHTML = list.map(p => `<li><button class="${W.cur?.id === p.id ? 'on' : ''}" data-page="${p.id}">
      ${thumb(p)}<span class="txt"><b>${esc(p.title)}</b><span>${esc(sub(p))}</span></span></button></li>`).join('')
    || `<li class="hint">${W.results ? `Nothing matches "${esc(W.q)}".` : W.pages.length ? 'No pages here yet.' : 'No pages yet. Start with New page.'}</li>`;
}

// ---------- middle column: the page, its editor, or the trash ----------

function pageHtml(p) {
  const html = renderMarkdown(p.body, resolve);
  return `<header class="wikihead">
      <div class="titles">${W.back.length ? '<button class="link" data-w="back" title="Back to the previous page (Alt+←)">← Back</button>' : ''}
        <h1>${esc(p.title)}</h1><p class="hint">${esc(catName(p.category))} · edited ${esc(when(p.updated))}</p></div>
      <div class="line"><button class="btn primary" data-w="edit" title="Edit (E)">Edit</button>
        <button class="btn sm bad" data-w="delete">${S.confirm.delPage === p.id ? 'Click again to move to trash' : 'Move to trash'}</button></div>
    </header>
    <article class="wikitext" title="Double-click to edit">${html || '<p class="hint">This page is empty. Click Edit (or double-click here) to write it. You can also drop images here.</p>'}</article>`;
}

function editorHtml(p) {
  return `<header class="wikihead editing">
      <div class="titles grow">
        <input class="field wtitle" id="wikiTitle" data-path="title" data-required data-commit value="${esc(p.title)}" aria-label="Page title" autocomplete="off">
        <label class="hint">Category <select class="field" data-path="category" id="wikiCat">${W.categories.map(c =>
          `<option value="${c.key}"${c.key === p.category ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      </div>
      <div class="line"><span class="hint" id="wikiSaved"></span>
        <button class="btn" data-w="addimage" title="Add images (or paste them, or drag them onto the text)">Add image</button>
        <button class="btn primary" data-w="done" title="Done (Esc)">Done</button></div>
    </header>
    <div class="wikiedit">
      <div class="pane"><textarea class="field" id="wikiBody" data-path="body" spellcheck="true"
        placeholder="Write anything. Link pages with [[Page title]]: a page that doesn't exist yet can be created from its link.">${esc(p.body)}</textarea>
        <ul class="suggest" id="wikiSuggest" hidden></ul></div>
      <div class="pane"><div class="wikitext preview" id="wikiPreview"></div></div>
    </div>
    <p class="hint mdhelp"><code>[[Page]]</code> or <code>[[Page|text]]</code> link · <code># Heading</code> · <code>**bold**</code> · <code>*italic*</code>
      · <code>- list</code> · <code>- [ ] task</code> · <code>&gt; quote</code> · <code>| table |</code> · <code>---</code> line
      · images: paste or drop them, <code>![Caption|small](…)</code> (small, medium or full)</p>`;
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
  if (el && W.cur) el.innerHTML = renderMarkdown(W.cur.body, resolve, { editable: true }) || '<p class="hint">The preview shows here.</p>';
}

// ---------- right column: links and page info ----------

function renderSide() {
  const box = $('#wikiSide'), p = W.cur;
  if (!p || W.trashOpen) { box.innerHTML = ''; return; }
  const link = x => `<li><a class="wl" href="#" data-page="${x.id}">${esc(x.title)}</a> <small class="hint">${esc(catName(x.category))}</small></li>`;
  const out = p.links.map(l => (l.id ? `<li><a class="wl" href="#" data-page="${l.id}">${esc(l.title)}</a></li>`
    : `<li><a class="wl missing" href="#" data-new="${esc(l.text || l.target)}" title="No page yet: click to create it">${esc(l.text || l.target)}</a> <small class="hint">not written yet</small></li>`)).join('');
  const portrait = p.portrait
    ? `<div class="portraitblk"><button class="portrait" data-lbopen="${p.portrait}" title="Open full-screen"><img src="${imageUrl(p.portrait)}" alt="Portrait of ${esc(p.title)}"></button>
        <div class="line"><button class="link" data-w="portrait-upload">Change</button><button class="link" data-w="portrait-clear">Remove</button></div></div>`
    : `<button class="portrait empty" data-w="portrait-upload">Add a portrait<small>a face, a map, a crest… (or open an image on the page and use it)</small></button>`;
  box.innerHTML = `${portrait}<div class="blk"><h4>Linked from <span class="hint">${p.backlinks.length}</span></h4>
      ${p.backlinks.length ? `<ul class="linklist">${p.backlinks.map(link).join('')}</ul>` : '<p class="hint">No page links here yet. Link to it with [[' + esc(p.title) + ']].</p>'}</div>
    <div class="blk"><h4>Links to <span class="hint">${p.links.length}</span></h4>
      ${out ? `<ul class="linklist">${out}</ul>` : '<p class="hint">This page doesn\'t link anywhere yet.</p>'}</div>
    <div class="blk"><h4>Page</h4><div class="props">
      <div><b>Category</b> ${esc(catName(p.category))}</div>
      <div><b>Created</b> ${esc(when(p.created))}</div><div><b>Edited</b> ${esc(when(p.updated))}</div></div></div>`;
}

export function renderWiki() { renderNav(); renderMain(); renderSide(); }

// ---------- [[ suggestions while writing ----------

let sugg = { list: [], i: 0 };

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
  const q = normTitle(open.query);
  const all = W.pages.filter(p => p.id !== W.cur?.id);
  sugg.list = [...all.filter(p => normTitle(p.title).startsWith(q)), ...all.filter(p => !normTitle(p.title).startsWith(q) && normTitle(p.title).includes(q))]
    .slice(0, 8).map(p => p.title);
  if (q && !byTitle.has(q)) sugg.list.push({ create: open.query.trim() });
  sugg.i = Math.min(sugg.i, Math.max(0, sugg.list.length - 1));
  if (!sugg.list.length) { ul.hidden = true; return; }
  ul.innerHTML = sugg.list.map((t, i) => `<li class="${i === sugg.i ? 'on' : ''}" data-sug="${i}">${typeof t === 'string'
    ? esc(t) : `<span class="hint">New page:</span> ${esc(t.create)}`}</li>`).join('');
  const { x, y } = caretXY(ta);
  Object.assign(ul.style, { left: `${Math.min(x, ta.clientWidth - 200)}px`, top: `${y + 4}px` });
  ul.hidden = false;
}

function acceptSuggest(i = sugg.i) {
  const ta = $('#wikiBody'), t = sugg.list[i];
  if (!ta || t === undefined) return;
  const title = typeof t === 'string' ? t : t.create;
  const done = completeLink(ta.value, ta.selectionStart, title);
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

/** Open the viewer on `file`, with the open page's portrait and images to step through. */
function openViewer(file) {
  const files = [W.cur?.portrait, ...[...document.querySelectorAll('#wikiPage img[data-img]')].map(x => x.dataset.img)].filter(Boolean);
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
  img.src = imageUrl(file);
  img.alt = shown?.alt || '';
  dlg.querySelector('.lb-cap').textContent = shown?.alt || (file === W.cur?.portrait ? `${W.cur.title}: portrait` : '');
  dlg.querySelector('.lb-count').textContent = LB.list.length > 1 ? `${LB.i + 1} of ${LB.list.length}` : '';
  dlg.querySelectorAll('.lb-nav').forEach(b => { b.hidden = LB.list.length < 2; });
  const isPortrait = file === W.cur?.portrait;
  Object.assign(dlg.querySelector('[data-lb="portrait"]'), { disabled: isPortrait || !W.cur, textContent: isPortrait ? 'Page portrait' : 'Use as page portrait' });
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
  const a = e.target.closest('[data-w]')?.dataset.w;
  if (!a || !W.cur) return;
  if (a !== 'delete') S.confirm.delPage = null;
  if (a === 'edit') { W.editing = true; renderMain(); return $('#wikiBody')?.focus(); }
  if (a === 'done') return finishEditing();
  if (a === 'addimage') return pickFiles('text');
  if (a === 'portrait-upload') return pickFiles('portrait');
  if (a === 'portrait-clear') return setPortrait(null);
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
    W.editing = false;
    renderWiki();
  };
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
      if (path === 'body') { updatePreview(); updateSuggest(); }
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
        ...(latest && !W.editing ? { body: res.body } : {}) });
      const s = $('#wikiSaved');
      if (s && latest) s.textContent = 'Saved';
    }
    if (titleChanged || res.relinked) {
      await loadList();
      if (res.relinked) toast(`Renamed: updated the links in ${res.relinked} other page${res.relinked > 1 ? 's' : ''}.`);
      if (W.editing) updatePreview();
    } else {
      const li = W.pages.find(p => p.id === res.id);
      if (li) Object.assign(li, { category: res.category, updated: res.updated, portrait: res.portrait });
    }
    renderNav(); renderSide();
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
  });
}

export async function showWiki() {
  await loadList();
  if (W.cur && !W.pages.some(p => p.id === W.cur.id)) W.cur = null;
  renderWiki();
}
