// Window-level error attribution: an `error` or `unhandledrejection` belongs to the mounted game
// only if it carries the toolkit marker or comes from one of the game's script URLs.

/** Set by the toolkit on fatal errors it rethrows. */
export const GAME_MARKER = Symbol.for('pocketcade.gameId');

export interface ErrorTarget {
  gameId: string;
  /** an attributed `error` → GameRuntimeError crash */
  fatal(error: unknown): void;
  /** an attributed `unhandledrejection` → non-fatal diagnostic */
  diagnostic(error: unknown): void;
}

export interface ErrorRouter {
  /** Records the script resources fetched since `since` (performance.now()); shared chunks stay attributed for later games. */
  recordScripts(since: number): void;
  setActive(target: ErrorTarget | null): void;
  dispose(): void;
}

function isAttributed(
  error: unknown,
  filename: string | undefined,
  gameId: string,
  scripts: Set<string>,
): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<symbol, unknown>)[GAME_MARKER] === gameId
  )
    return true;
  if (filename && scripts.has(filename)) return true;
  const stack = error instanceof Error ? (error.stack ?? '') : '';
  for (const url of scripts) if (stack.includes(url)) return true;
  return false;
}

export function createErrorRouter(dev: boolean): ErrorRouter {
  /** script URLs fetched while a game was loading */
  const scripts = new Set<string>();
  let active: ErrorTarget | null = null;

  const onError = (e: ErrorEvent) => {
    if (!active) return;
    const hit = isAttributed(e.error, e.filename, active.gameId, scripts);
    if (dev)
      console.info(
        `[pocketcade:${active.gameId}] window error ${hit ? 'attributed to the game' : 'ignored'}: ${e.message}`,
      );
    if (hit) active.fatal(e.error ?? new Error(e.message));
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    if (!active) return;
    if (isAttributed(e.reason, undefined, active.gameId, scripts)) active.diagnostic(e.reason);
  };

  const browser = typeof window !== 'undefined';
  if (browser) {
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
  }

  return {
    recordScripts(since) {
      if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function')
        return;
      for (const r of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
        if (r.initiatorType === 'script' && r.startTime >= since) scripts.add(r.name);
      }
    },
    setActive(target) {
      active = target;
    },
    dispose() {
      if (!browser) return;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    },
  };
}
