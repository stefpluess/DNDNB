// Ordered, debounced saving. DOM-free so it can be tested in Node.
//
// Every resource (the encounter, one character, one homebrew creature) gets an autosaver.
// Saves for the same key run strictly one after another, so an older save can never land
// after a newer one, and each save reads the current state when it runs.

const chains = new Map();

/** Run `task` after every earlier task with the same key has finished (success or not). */
export function enqueue(key, task) {
  const next = (chains.get(key) || Promise.resolve()).catch(() => {}).then(task);
  chains.set(key, next);
  return next;
}

/**
 * createAutosave({ key, delay, save, onSaved, onError })
 *  - save(arg) sends the current state and resolves with the server's response
 *  - onSaved(res, latest, arg) runs after each save; `latest` is false when more edits
 *    arrived while the save was in flight (a newer save is then already queued)
 * Returns { schedule(), flush(arg) }: schedule() debounces, flush() saves now and resolves
 * with { res, latest }.
 */
export function createAutosave({ key, delay = 350, save, onSaved, onError }) {
  let timer = null;
  let edits = 0;

  function flush(arg) {
    clearTimeout(timer);
    timer = null;
    return enqueue(key, async () => {
      const seen = edits;
      try {
        const res = await save(arg);
        const latest = seen === edits;
        onSaved?.(res, latest, arg);
        return { res, latest };
      } catch (e) {
        onError?.(e);
        throw e;
      }
    });
  }

  function schedule() {
    edits++;
    clearTimeout(timer);
    timer = setTimeout(() => flush().catch(() => {}), delay);
  }

  return { schedule, flush };
}
