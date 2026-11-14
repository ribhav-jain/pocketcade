// Page-level host state for client components: one HostServices per document, the
// "started in this document" flag, portal settings and the crash-loop counter. Module scope is intentional:
// it lives as long as the document, survives client-side navigation and resets on reload.
import { createHostServices, type HostServices } from '@pocketcade/host';

export type Settings = {
  /** global mute */
  muted: boolean;
  /** last saved initials */
  lastInitials: string | null;
};

/** On-device play history for "Continue playing" / "Your most played". Never leaves the device. */
export type PlayRecord = {
  plays: number;
  /** epoch ms of the last start */
  last: number;
};

const DEFAULTS: Settings = { muted: false, lastInitials: null };

let services: HostServices | null = null;
let started = false;
let settings: Settings = DEFAULTS;
const listeners = new Set<() => void>();
const crashes = new Map<string, number[]>();

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function readSettings(svc: HostServices): Settings {
  const r = svc.storage.portal.get('settings');
  if (!isRecord(r)) return DEFAULTS;
  return {
    muted: r.muted === true,
    lastInitials:
      typeof r.lastInitials === 'string' && /^[A-Z0-9]{3}$/.test(r.lastInitials)
        ? r.lastInitials
        : null,
  };
}

export function getHostServices(buildId: string): HostServices {
  if (!services) {
    services = createHostServices({
      locale: 'en-US',
      reducedMotion: 'system',
      dev: process.env.NODE_ENV !== 'production',
      buildId,
    });
    settings = readSettings(services);
    services.audio.setMuted(settings.muted);
    // entries are stored at once with the prefilled initials; "YOU" until the player saves their own.
    services.scores.setDefaultInitials(settings.lastInitials ?? 'YOU');
    for (const l of listeners) l();
  }
  return services;
}

/** False until the first Play click; later game pages (client-side navigation) auto-mount. */
export function isStartedInDocument(): boolean {
  return started;
}

export function markStartedInDocument(): void {
  started = true;
}

// ─── settings store (useSyncExternalStore) ───
export function subscribeSettings(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}
export const getSettings = (): Settings => settings;
export const getServerSettings = (): Settings => DEFAULTS;

function updateSettings(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch };
  services?.storage.portal.set('settings', settings);
  for (const l of listeners) l();
}

/** one mute state for every toggle; call inside the click so unmuting can resume audio. */
export function setMuted(muted: boolean, buildId: string): void {
  updateSettings({ muted });
  getHostServices(buildId).audio.setMuted(muted);
}

export function saveInitials(initials: string): void {
  updateSettings({ lastInitials: initials });
  services?.scores.setDefaultInitials(initials);
}

export function getHistory(buildId: string): Record<string, PlayRecord> {
  const raw = getHostServices(buildId).storage.portal.get('history');
  const out: Record<string, PlayRecord> = {};
  if (!isRecord(raw)) return out;
  for (const [id, r] of Object.entries(raw)) {
    if (
      isRecord(r) &&
      typeof r.plays === 'number' &&
      typeof r.last === 'number' &&
      /^[a-z0-9-]{1,40}$/.test(id)
    )
      out[id] = { plays: r.plays, last: r.last };
  }
  return out;
}

export function recordPlay(gameId: string, buildId: string): void {
  const h = getHistory(buildId);
  h[gameId] = { plays: (h[gameId]?.plays ?? 0) + 1, last: Date.now() };
  getHostServices(buildId).storage.portal.set('history', h);
}

/** the 3rd crash of a game within 60 s in this tab. */
export function recordCrash(gameId: string): boolean {
  const now = Date.now();
  const recent = (crashes.get(gameId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  crashes.set(gameId, recent);
  return recent.length >= 3;
}
