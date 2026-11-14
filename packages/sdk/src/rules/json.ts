// Strict-JSON validation and UTF-8 sizing shared by storage and scores.

const MAX_DEPTH = 64;

/**
 * Returns a description of the first strict-JSON violation (e.g. `data.board[3]: NaN`), or null if valid.
 * Strict JSON: finite numbers, no undefined, functions, symbols, bigint, class instances or cycles; depth ≤ 64.
 */
export function jsonIssue(value: unknown, path = 'data'): string | null {
  const seen = new Set<object>();
  const walk = (v: unknown, p: string, depth: number): string | null => {
    if (depth > MAX_DEPTH) return `${p}: deeper than ${MAX_DEPTH}`;
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? null : `${p}: ${String(v)}`;
    if (typeof v !== 'object') return `${p}: ${typeof v}`;
    if (seen.has(v)) return `${p}: cycle`;
    seen.add(v);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const issue = walk(v[i], `${p}[${i}]`, depth + 1);
        if (issue) return issue;
      }
    } else {
      const proto = Object.getPrototypeOf(v) as unknown;
      if (proto !== Object.prototype && proto !== null) return `${p}: not a plain object`;
      for (const [k, child] of Object.entries(v)) {
        const issue = walk(child, `${p}.${k}`, depth + 1);
        if (issue) return issue;
      }
    }
    seen.delete(v);
    return null;
  };
  return walk(value, path, 0);
}

let encoder: TextEncoder | null = null;

/** UTF-8 byte length, as the host counts storage limits. */
export function utf8Bytes(s: string): number {
  encoder ??= new TextEncoder();
  return encoder.encode(s).length;
}
