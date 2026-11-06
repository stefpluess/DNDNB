// Undo and redo for the combat view. DOM-free so it can be tested in Node.
//
// `capture()` returns a snapshot of everything an action can change, `restore(snap)` puts one back.
// Call remember(label) right before an action changes anything.

export function createHistory({ capture, restore, limit = 50 }) {
  const done = [], undone = [];
  return {
    remember(label) {
      done.push({ label, snap: capture() });
      if (done.length > limit) done.shift();
      undone.length = 0;
    },
    /** Returns the label of what was undone, or null if there was nothing. */
    undo() {
      const e = done.pop();
      if (!e) return null;
      undone.push({ label: e.label, snap: capture() });
      restore(e.snap);
      return e.label;
    },
    redo() {
      const e = undone.pop();
      if (!e) return null;
      done.push({ label: e.label, snap: capture() });
      restore(e.snap);
      return e.label;
    },
    get undoLabel() { return done.length ? done[done.length - 1].label : null; },
    get redoLabel() { return undone.length ? undone[undone.length - 1].label : null; },
    clear() { done.length = 0; undone.length = 0; },
  };
}
