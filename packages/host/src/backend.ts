// The only module that touches localStorage. Interface and memory backend: @pocketcade/sdk/rules.
import { createMemoryBackend, type StorageBackend } from '@pocketcade/sdk/rules';

export { createMemoryBackend, type StorageBackend };

/** Wraps a Web Storage object (normally window.localStorage). */
function createWebStorageBackend(ls: Storage): StorageBackend {
  return {
    persistent: true,
    getItem: (k) => ls.getItem(k),
    setItem: (k, v) => ls.setItem(k, v),
    removeItem: (k) => ls.removeItem(k),
    keys(prefix) {
      const out: string[] = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k !== null && k.startsWith(prefix)) out.push(k);
      }
      return out;
    },
  };
}

const PROBE_KEY = 'pocketcade:v1:p:__probe';

/** Probes localStorage once; falls back to memory for the page's lifetime if it is unusable. */
export function probeBackend(): StorageBackend {
  try {
    const ls = globalThis.localStorage;
    ls.setItem(PROBE_KEY, '1');
    const ok = ls.getItem(PROBE_KEY) === '1';
    ls.removeItem(PROBE_KEY);
    if (ok) return createWebStorageBackend(ls);
  } catch {
    // SecurityError, blocked storage, no window: use memory.
  }
  return createMemoryBackend();
}
