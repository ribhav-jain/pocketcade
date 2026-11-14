// StorageBackend: the key/value surface storage and scores run on. The host adds the localStorage backend.

export interface StorageBackend {
  readonly persistent: boolean;
  /** may throw; callers catch */
  getItem(key: string): string | null;
  /** may throw QuotaExceededError */
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(prefix: string): string[];
}

/** In-memory backend: same semantics, lost on reload. */
export function createMemoryBackend(): StorageBackend {
  const map = new Map<string, string>();
  return {
    persistent: false,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: (prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)),
  };
}
