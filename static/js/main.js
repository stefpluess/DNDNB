// Boot: load reference lists and saved state, wire up the four views and the keyboard shortcuts.

import * as combat from './combat.js';
import { initBestiary, showBestiary } from './bestiary.js';
import { registerView, switchView } from './nav.js';
import { initParty, showParty } from './party.js';
import { S, api, ctx } from './store.js';
import { initCombat, showCombat, stepTurn, undo } from './tracker.js';
import { logEntries } from './ui.js';
import { $, toast } from './util.js';
import { initWiki, openWikiPage, showWiki } from './wiki.js';

async function loadState() {
  S.meta = await api('/api/meta');
  const status = await api('/api/status');
  S.srdCounts = status.counts || {};
  const n = k => S.srdCounts[k] || 0;
  const el = $('#dbStatus');
  if (!Object.keys(S.srdCounts).length) {
    el.textContent = 'No SRD data. Run python import_srd.py';
    el.classList.add('warn');
  } else {
    el.textContent = `${status.info?.ruleset || 'SRD'} · ${n('monster')} monsters · ${n('spell')} spells · ${n('equipment') + n('magic-item')} items`;
  }
  for (const c of await api('/api/characters')) S.chars.set(c.id, c);
  const saved = await api('/api/encounter');
  if (saved && Array.isArray(saved.c)) {
    // older saves: a UI flag stored here, fields that didn't exist yet
    saved.c.forEach(c => { delete c._editSlots; c.exh ??= 0; c.conds ??= []; c.ds ??= { s: 0, f: 0 }; c.slots ??= []; });
    saved.ticks ??= [];
    saved.prompts ??= [];
    S.enc = saved;
  }
}

function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (S.view !== 'combat') return;
    // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo fight changes; inside a text box they keep their usual meaning
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 'z' || k === 'y') && !e.target.closest('input:not([type=checkbox]),textarea')) {
      e.preventDefault();
      return undo(k === 'y' || e.shiftKey ? 1 : -1);
    }
    if (e.target.closest('input,textarea,select') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); stepTurn(1); }
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); stepTurn(-1); }
    if (e.key === '/') { e.preventDefault(); $('#libSearch').focus(); }
  });
}

async function boot() {
  try {
    await loadState();
  } catch (e) {
    toast('Could not reach the server. Is server.py running?');
    $('#dbStatus').textContent = 'Server not reachable';
    return;
  }
  initCombat();
  initParty();
  initBestiary();
  initWiki();
  initKeyboard();
  registerView('combat', showCombat);
  registerView('party', showParty);
  registerView('bestiary', showBestiary);
  registerView('wiki', showWiki);
  // "In the wiki" links on sheets and stat blocks open the page in the Wiki view
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-wikipage]');
    if (a) { e.preventDefault(); openWikiPage(+a.dataset.wikipage); }
  });
  document.querySelector('.views').addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (b) switchView(b.dataset.view);
  });
  switchView('combat');
  // handy from the browser console when something looks wrong: ledger.S, ledger.combat, ledger.log()
  window.ledger = { S, ctx, combat, log: logEntries };
}

boot();
