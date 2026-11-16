// @pocketcade/sdk — the Game/HostAPI contract.
// Zero runtime dependencies; importing this module does no work.

// ───────────────────────────── Game side ─────────────────────────────

export const SDK_API_VERSION = 1 as const;

export type InputKind = 'keyboard' | 'pointer' | 'touch';
export type Orientation = 'landscape' | 'portrait' | 'any';
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** CSS px + devicePixelRatio. */
export interface Size {
  width: number;
  height: number;
  dpr: number;
}

export type AspectRatio = number | 'fill' | { min: number; max: number };

/** The narrowest and widest frame shape a game accepts; null for 'fill' (any shape). */
export function aspectRange(ar: AspectRatio): { min: number; max: number } | null {
  if (ar === 'fill') return null;
  return typeof ar === 'number' ? { min: ar, max: ar } : ar;
}

export interface LeaderboardDef {
  /** /^[a-z0-9-]{1,32}$/, unique within the game */
  id: string;
  /** shown by the portal, e.g. "Best score" */
  label: string;
  /** desc = higher is better; asc = lower is better (times, moves) */
  order: 'desc' | 'asc';
  format: 'integer' | 'duration_ms' | 'moves';
}

export interface GameMeta {
  /** kebab-case slug, == catalog id, == package suffix (@pocketcade/game-<id>) */
  id: string;
  apiVersion: typeof SDK_API_VERSION;
  /** semver of the game package */
  version: string;
  /** at least one */
  inputs: readonly InputKind[];
  /** which way up the game is meant to be played */
  orientation: Orientation;
  /**
   * Frame shape (width / height) the game wants: one ratio, a range the game adapts to (the portal picks the shape
   * in the range that best fills the screen), or 'fill' to use the whole frame.
   */
  aspectRatio: AspectRatio;
  /** CSS px; below this the host shows a "rotate / enlarge" notice */
  minSize: { width: number; height: number };
  /** integer ≥ 1; stamped into storage envelopes */
  saveSchemaVersion: number;
  /** may be empty */
  leaderboards: readonly LeaderboardDef[];
  /** KeyboardEvent.code values the game itself uses to toggle pause; default ['Escape'] */
  pauseKeys?: readonly string[];
}

export type PauseReason = 'visibility' | 'blur' | 'offscreen' | 'overlay' | 'user' | 'host';

export interface MountContext {
  /** aborted if the host cancels mid-mount (fast navigation); game must clean up and reject/resolve promptly */
  signal: AbortSignal;
  /** initial frame size */
  size: Size;
  /** 'attract' = self-playing demo for thumbnails/previews, no input, no storage writes, no scores */
  launch: 'play' | 'restart' | 'attract';
}

export interface Game {
  /** resolves when playable (ready) */
  mount(container: HTMLElement, host: HostAPI, ctx: MountContext): Promise<void>;
  /** must release every loop, listener, timer, worker, audio node, WebGL context and DOM node it created */
  unmount(): Promise<void>;
  /** idempotent; host is the only caller */
  pause(reason: PauseReason): void;
  /** idempotent; host is the only caller */
  resume(): void;
}

export interface GameDefinition {
  meta: GameMeta;
  /** fresh instance per mount; no module-level mutable state */
  create(): Game;
}

// ───────────────────────────── Host side ─────────────────────────────

export type Unsubscribe = () => void;

export interface HostEnv {
  readonly mode: 'direct' | 'iframe';
  /** BCP 47, e.g. 'en-US' */
  readonly locale: string;
  readonly reducedMotion: boolean;
  /** at mount; changes arrive via 'mute' event */
  readonly muted: boolean;
  /** host decides; games must not sniff */
  readonly input: { primary: InputKind; hasKeyboard: boolean; hasTouch: boolean };
  /** 'YYYY-MM-DD' in the player's local time zone; changes arrive via 'dailyrollover' */
  readonly dailyKey: string;
  /** false when localStorage is unavailable (private mode, blocked) → in-memory fallback */
  readonly storagePersistent: boolean;
  readonly dev: boolean;
}

export interface SaveEnvelope<T extends Json = Json> {
  v: number;
  /** ISO 8601 */
  savedAt: string;
  data: T;
}
export type StorageResult =
  { ok: true } | { ok: false; reason: 'quota' | 'too_large' | 'invalid_key' | 'unavailable' };

// Limits: key /^[a-z0-9][a-z0-9._-]{0,63}$/; ≤ 64 KiB serialized per key; ≤ 256 KiB per game total. Never throws; returns StorageResult.
// Physical key: `pocketcade:v1:g:<gameId>:<key>`. Portal-owned keys: `pocketcade:v1:p:<key>`. Leaderboards: `pocketcade:v1:lb:<gameId>:<boardId>`.
export interface StorageAPI {
  get<T extends Json = Json>(key: string): Promise<SaveEnvelope<T> | null>;
  /** host stamps v = meta.saveSchemaVersion, savedAt = now */
  set<T extends Json = Json>(key: string, data: T): Promise<StorageResult>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** meta ≤ 2 KiB, stored, not shown */
export interface ScoreSubmission {
  board: string;
  value: number;
  meta?: Json;
}
export interface SubmitResult {
  accepted: boolean;
  /** 1..10 if it entered the local top 10, else null */
  rank: number | null;
  personalBest: boolean;
  reason?: 'unknown_board' | 'invalid_value' | 'unavailable';
}
export interface ScoreEntry {
  rank: number;
  value: number;
  initials: string;
  achievedAt: string;
  meta?: Json;
}
export interface ScoresAPI {
  /** portal UI asks for initials if rank != null; game never handles initials */
  submit(s: ScoreSubmission): Promise<SubmitResult>;
  /** limit ≤ 10, default 10 */
  top(board: string, limit?: number): Promise<ScoreEntry[]>;
}

export type FullscreenMode = 'native' | 'pseudo' | 'none';
export interface DisplayAPI {
  /** call from a user-gesture handler; 'none' = denied */
  requestFullscreen(): Promise<{ mode: FullscreenMode }>;
  exitFullscreen(): Promise<void>;
}

export interface AudioAPI {
  /** host-owned, shared, created lazily, resumed by the host inside the Play click; games MUST NOT close it */
  readonly context: AudioContext;
  /** host master GainNode → destination. Engine-less (DOM) games and toolkit `sfx` connect here. */
  readonly output: AudioNode;
}

export interface GameplayAPI {
  /** first meaningful player input (host: hide hints, record "recently played") */
  start(): void;
  stop(reason: 'pause' | 'gameover' | 'level_end' | 'menu'): void;
  /** 0..1 during mount; host shows progress bar */
  loading(progress: number): void;
}

export interface HostEvents {
  resize: Size;
  mute: { muted: boolean };
  fullscreenchange: { mode: FullscreenMode };
  inputchange: { primary: InputKind };
  dailyrollover: { dailyKey: string };
}

export interface SerializableError {
  name: string;
  message: string;
  stack?: string;
}

export interface HostAPI {
  readonly apiVersion: typeof SDK_API_VERSION;
  /** feature detection */
  readonly capabilities: ReadonlySet<'storage' | 'scores' | 'fullscreen' | 'audio'>;
  readonly env: HostEnv;
  readonly storage: StorageAPI;
  readonly scores: ScoresAPI;
  readonly display: DisplayAPI;
  readonly audio: AudioAPI;
  readonly gameplay: GameplayAPI;
  on<E extends keyof HostEvents>(event: E, cb: (payload: HostEvents[E]) => void): Unsubscribe;
  /** non-fatal; logged in dev, counted in crash card details */
  reportError(error: SerializableError): void;
}

// ───────────────────────────── Constants ─────────────────────────────

export const STORAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const STORAGE_MAX_VALUE_BYTES = 65536;
export const STORAGE_MAX_GAME_BYTES = 262144;
export const SCORE_META_MAX_BYTES = 2048;
export const LEADERBOARD_SIZE = 10;
export const INITIALS_PATTERN = /^[A-Z0-9]{3}$/;
export const MOUNT_TIMEOUT_MS = 15000;
export const UNMOUNT_TIMEOUT_MS = 2000;
export const ABORT_SETTLE_MS = 2000;
export const OFFSCREEN_THRESHOLD = 0.5;
/** GameMeta.pauseKeys when the game sets none */
export const DEFAULT_PAUSE_KEYS: readonly string[] = ['Escape'];

// ───────────────────────────── defineGame / validateMeta ─────────────────────────────

export interface MetaIssue {
  code: string;
  path: string;
  message: string;
}

const GAME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LEADERBOARD_ID_PATTERN = /^[a-z0-9-]{1,32}$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const INPUT_KINDS: readonly string[] = ['keyboard', 'pointer', 'touch'];
const ORIENTATIONS: readonly string[] = ['landscape', 'portrait', 'any'];
const MAX_LEADERBOARDS = 8;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates a GameMeta (or a GameDefinition's meta) against the metadata rules. An empty array means valid. */
export function validateMeta(meta: unknown): MetaIssue[] {
  const issues: MetaIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (!isObject(meta)) {
    add('id_format', 'meta', 'meta must be an object');
    return issues;
  }
  const m = meta;

  if (typeof m.id !== 'string' || m.id.length > 32 || !GAME_ID_PATTERN.test(m.id)) {
    add('id_format', 'id', 'id must be kebab-case, ≤ 32 chars');
  }
  if (m.apiVersion !== SDK_API_VERSION) {
    add('api_version', 'apiVersion', `apiVersion must be ${SDK_API_VERSION}`);
  }
  if (typeof m.version !== 'string' || !SEMVER_PATTERN.test(m.version)) {
    add('version_semver', 'version', 'version must be SemVer 2.0');
  }

  if (!Array.isArray(m.inputs) || m.inputs.length === 0) {
    add('inputs_empty', 'inputs', 'inputs needs at least one InputKind');
  } else {
    m.inputs.forEach((k, i) => {
      if (typeof k !== 'string' || !INPUT_KINDS.includes(k))
        add('inputs_unknown', `inputs[${i}]`, `unknown input kind ${String(k)}`);
    });
    if (new Set(m.inputs).size !== m.inputs.length)
      add('inputs_duplicate', 'inputs', 'inputs has duplicates');
  }

  if (typeof m.orientation !== 'string' || !ORIENTATIONS.includes(m.orientation)) {
    add('orientation_unknown', 'orientation', 'orientation must be landscape, portrait or any');
  }

  const ar = m.aspectRatio;
  const ratioOk = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0.25 && v <= 4;
  if (!(
    ar === 'fill' ||
    ratioOk(ar) ||
    (isObject(ar) && ratioOk(ar.min) && ratioOk(ar.max) && ar.min <= ar.max)
  )) {
    add(
      'aspect_ratio',
      'aspectRatio',
      "aspectRatio must be 'fill', a number in [0.25, 4] or { min, max } within that range",
    );
  }

  const ms = m.minSize;
  const dimOk = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 4096;
  if (!isObject(ms) || !dimOk(ms.width) || !dimOk(ms.height)) {
    add('min_size', 'minSize', 'minSize width/height must be positive integers ≤ 4096');
  }

  if (
    typeof m.saveSchemaVersion !== 'number' ||
    !Number.isInteger(m.saveSchemaVersion) ||
    m.saveSchemaVersion < 1
  ) {
    add('save_schema_version', 'saveSchemaVersion', 'saveSchemaVersion must be an integer ≥ 1');
  }

  if (!Array.isArray(m.leaderboards)) {
    add('leaderboard_id', 'leaderboards', 'leaderboards must be an array');
  } else {
    if (m.leaderboards.length > MAX_LEADERBOARDS) {
      add('leaderboards_too_many', 'leaderboards', `at most ${MAX_LEADERBOARDS} leaderboards`);
    }
    const seen = new Set<string>();
    m.leaderboards.forEach((b: unknown, i) => {
      const p = `leaderboards[${i}]`;
      if (!isObject(b)) {
        add('leaderboard_id', p, 'leaderboard must be an object');
        return;
      }
      if (typeof b.id !== 'string' || !LEADERBOARD_ID_PATTERN.test(b.id)) {
        add('leaderboard_id', `${p}.id`, 'id must match /^[a-z0-9-]{1,32}$/');
      } else if (seen.has(b.id)) {
        add('leaderboard_duplicate', `${p}.id`, `duplicate leaderboard id ${b.id}`);
      } else {
        seen.add(b.id);
      }
      if (typeof b.label !== 'string' || b.label.length < 1 || b.label.length > 40) {
        add('leaderboard_label', `${p}.label`, 'label must be 1–40 chars');
      }
      if (b.order !== 'asc' && b.order !== 'desc')
        add('leaderboard_order', `${p}.order`, "order must be 'asc' or 'desc'");
      if (b.format !== 'integer' && b.format !== 'duration_ms' && b.format !== 'moves') {
        add('leaderboard_format', `${p}.format`, 'format must be integer, duration_ms or moves');
      }
    });
  }

  if (m.pauseKeys !== undefined) {
    if (
      !Array.isArray(m.pauseKeys) ||
      m.pauseKeys.some((k) => typeof k !== 'string' || k.length === 0)
    ) {
      add('pause_keys', 'pauseKeys', 'pauseKeys must be an array of non-empty strings');
    }
  }
  return issues;
}

declare const process: { env: { NODE_ENV?: string } };

/** Returns `def` unchanged. In non-production builds it validates meta and throws `InvalidGameMeta`. */
export function defineGame(def: GameDefinition): GameDefinition {
  if (process.env.NODE_ENV !== 'production') {
    const issues = validateMeta(def?.meta);
    if (typeof def?.create !== 'function') {
      issues.push({ code: 'create_missing', path: 'create', message: 'create must be a function' });
    }
    if (issues.length > 0) {
      const err = new Error(
        `Invalid game meta:\n${issues.map((i) => `- ${i.path}: ${i.message} (${i.code})`).join('\n')}`,
      );
      err.name = 'InvalidGameMeta';
      throw err;
    }
  }
  return def;
}
