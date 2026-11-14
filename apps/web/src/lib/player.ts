// Small client helpers for the game player: device class, value formats,
// the stale-deploy check and crash details.
import type { CrashReport } from '@pocketcade/host';
import type { LeaderboardDef } from '@pocketcade/sdk';

/** "Phone": touch-primary pointer and a viewport narrower than 768 CSS px. */
export function isPhone(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(pointer: coarse)').matches &&
    window.innerWidth < 768
  );
}

const numbers = new Intl.NumberFormat('en-US');
const dates = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

export function formatValue(format: LeaderboardDef['format'], value: number): string {
  if (format === 'integer') return numbers.format(value);
  if (format === 'moves') return `${numbers.format(value)} ${value === 1 ? 'move' : 'moves'}`;
  const cs = Math.floor(value / 10); // centiseconds, truncated
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = String(cs % 100).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}.${c}` : `${m}:${ss}.${c}`;
}

export function formatDate(iso: string): string {
  return dates.format(new Date(iso));
}

const PROMPT_KEY = 'pocketcade:v1:p:update-prompted-at';

/** compare the live /version.json with this page's build id. Never throws. */
export async function checkForUpdate(): Promise<'updated' | 'same' | 'unknown'> {
  try {
    const current = document
      .querySelector('meta[name="pocketcade-build"]')
      ?.getAttribute('content');
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok || !current) return 'unknown';
    const info = (await res.json()) as { buildId?: unknown };
    return typeof info.buildId === 'string' && info.buildId !== current ? 'updated' : 'same';
  } catch {
    return 'unknown';
  }
}

/** at most one update prompt per tab per 5 minutes. */
export function claimUpdatePrompt(): boolean {
  try {
    const last = Number(sessionStorage.getItem(PROMPT_KEY) ?? 0);
    if (Date.now() - last < 5 * 60_000) return false;
    sessionStorage.setItem(PROMPT_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

/** Plain-text crash details (Copy details). Never includes saves, scores or anything the player typed. */
export function crashDetails(r: CrashReport): string {
  return [
    `${r.errorName}: ${r.message}`,
    `phase: ${r.phase}`,
    `game: ${r.gameId} ${r.gameVersion ?? '?'} (api ${r.apiVersion ?? '?'})`,
    `host: ${r.hostVersion}  build: ${r.buildId}`,
    `fullscreen: ${r.fullscreenMode}  input: ${r.inputPrimary}  storage: ${r.storagePersistent ? 'persistent' : 'memory'}`,
    `reported errors: ${r.reportedErrors.count}${r.reportedErrors.last.length ? `\n  ${r.reportedErrors.last.join('\n  ')}` : ''}`,
    `at: ${r.occurredAt}  path: ${r.path}`,
    `user agent: ${r.userAgent}`,
    r.stack ? `stack:\n${r.stack.split('\n').slice(0, 30).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** prefilled GitHub issue URL, ≤ 8,000 characters, stack trimmed first. */
export function bugReportUrl(repoUrl: string, r: CrashReport): string {
  const title = `Crash: ${r.gameId} — ${r.errorName}`;
  const body = (stackLines: number) =>
    [
      `**${r.errorName}**: ${r.message}`,
      `- phase: ${r.phase}`,
      `- game: ${r.gameId} ${r.gameVersion ?? '?'} (api ${r.apiVersion ?? '?'}), host ${r.hostVersion}, build ${r.buildId}`,
      `- fullscreen ${r.fullscreenMode}, input ${r.inputPrimary}, storage ${r.storagePersistent ? 'persistent' : 'memory'}`,
      `- reported errors: ${r.reportedErrors.count}`,
      `- at ${r.occurredAt} on ${r.path}`,
      `- ${r.userAgent}`,
      r.stack && stackLines > 0
        ? `\n\`\`\`\n${r.stack.split('\n').slice(0, stackLines).join('\n')}\n\`\`\``
        : '',
    ].join('\n');
  for (const lines of [10, 5, 0]) {
    const url = `${repoUrl}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body(lines))}`;
    if (url.length <= 8000) return url;
  }
  return `${repoUrl}/issues/new?title=${encodeURIComponent(title)}`;
}

/** make everything outside the stage inert while pseudo-fullscreen is on; returns the undo. */
export function inertOutside(el: HTMLElement): () => void {
  const touched: HTMLElement[] = [];
  for (
    let node: HTMLElement | null = el;
    node && node !== document.body;
    node = node.parentElement
  ) {
    for (const sibling of Array.from(node.parentElement?.children ?? [])) {
      if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
        sibling.inert = true;
        touched.push(sibling);
      }
    }
  }
  return () => {
    for (const t of touched) t.inert = false;
  };
}
