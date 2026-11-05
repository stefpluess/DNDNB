// Switching between the Combat, Party and Bestiary views.

import { S } from './store.js';

const views = {};

/** Register a view by name; `show` runs whenever the view becomes visible. */
export const registerView = (name, show) => { views[name] = show; };

export function switchView(name) {
  S.view = name;
  document.querySelectorAll('.views button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  for (const n of Object.keys(views)) document.getElementById(`view-${n}`).hidden = n !== name;
  views[name]?.();
}
