'use client';
// GameHost: poster → Play → running, pause/resume overlay, notices, crash and update cards,
// fullscreen (native/pseudo) with chrome, player bar, initials prompt and leaderboard sheet.
// React never renders into the frame; the runner owns it. Overlays live in the stage subtree.
import {
  createGameRunner,
  type CrashReport,
  type GameRunner,
  type RunnerState,
} from '@pocketcade/host';
import type { RankedScore } from '@pocketcade/sdk/rules';
import {
  aspectRange,
  type FullscreenMode,
  type GameMeta,
  type LeaderboardDef,
  type PauseReason,
} from '@pocketcade/sdk';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
import { gameLoaders, type GameId } from '../games/registry.generated';
import {
  getHostServices,
  getSettings,
  isStartedInDocument,
  markStartedInDocument,
  recordCrash,
  recordPlay,
  saveInitials,
} from '../lib/host-services';
import {
  checkForUpdate,
  claimUpdatePrompt,
  formatValue,
  inertOutside,
  isPhone,
} from '../lib/player';
import { CrashCard, ReloadCard } from './CrashCard';
import { ConfirmDialog, InitialsPrompt, LeaderboardSheet, Toast } from './Dialogs';
import { Icon } from './Icon';
import { MuteButton } from './MuteButton';

export interface GameHostProps {
  gameId: GameId;
  title: string;
  aspectRatio: GameMeta['aspectRatio'];
  minSize: { width: number; height: number };
  orientation: GameMeta['orientation'];
  leaderboards: readonly LeaderboardDef[];
  buildId: string;
  /** GitHub repository for "Report a bug"; hidden when null */
  repoUrl: string | null;
  /** key art for the poster */
  cover?: string;
  tagline?: string;
}

/** Keys that never resume from the overlay. */
const NON_RESUME_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape']);
let storageNoticeShown = false; // once per page view

/** warm the game chunk after load + idle; skip on Save-Data or 2g. */
function warmAfterIdle(warm: () => void): () => void {
  const conn = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g')
    return () => {};
  let idle: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (typeof requestIdleCallback === 'function')
      idle = requestIdleCallback(warm, { timeout: 500 });
    else timer = setTimeout(warm, 500);
  };
  if (document.readyState === 'complete') schedule();
  else timer = setTimeout(schedule, 500);
  return () => {
    if (idle !== null) cancelIdleCallback(idle);
    if (timer !== null) clearTimeout(timer);
  };
}

function browserSupported(): boolean {
  return (
    typeof ResizeObserver !== 'undefined' &&
    typeof IntersectionObserver !== 'undefined' &&
    typeof AbortController !== 'undefined' &&
    'noModule' in HTMLScriptElement.prototype
  );
}

interface Crash {
  report: CrashReport;
  crashLoop: boolean;
  retries: number;
}
/** Scores ranked within this window share one initials prompt (a game over submitting to several boards). */
const PROMPT_GROUP_MS = 1000;

export function GameHost(props: GameHostProps) {
  const {
    gameId,
    title,
    aspectRatio,
    minSize,
    orientation,
    leaderboards,
    buildId,
    repoUrl,
    cover,
    tagline,
  } = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLButtonElement>(null);
  const runnerRef = useRef<GameRunner | null>(null);
  const playedRef = useRef(false);
  const swallowKeyUp = useRef(false);
  const retriesRef = useRef(0);
  const lastGameplay = useRef<'start' | 'stop' | null>(null);
  const announcedReady = useRef(false);

  // Direct landings render the poster on the server and on hydration (the flag is false then).
  const [started, setStarted] = useState(() => isStartedInDocument());
  const [supported, setSupported] = useState(true);
  const [ready, setReady] = useState(false); // Play stays disabled until the runner exists
  const [state, setState] = useState<RunnerState>('idle');
  const [reasons, setReasons] = useState<PauseReason[]>([]);
  const [overlay, setOverlay] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const [notice, setNotice] = useState<'rotate' | 'enlarge' | null>(null);
  const [crash, setCrash] = useState<Crash | null>(null);
  const [updated, setUpdated] = useState(false);
  const [fsMode, setFsMode] = useState<FullscreenMode>('none');
  const [toast, setToast] = useState<{ text: string; ms: number } | null>(null);
  const [ranked, setRanked] = useState<{ items: RankedScore[]; at: number } | null>(null);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [announce, setAnnounce] = useState('');

  const showToast = useCallback((text: string, ms = 2500) => setToast({ text, ms }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.ms);
    return () => clearTimeout(timer);
  }, [toast]);

  const focusGame = useCallback(() => {
    frameRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    // An unsupported browser keeps the poster with its message and never builds a runner.
    if (!browserSupported()) {
      setSupported(false);
      return;
    }
    const frame = frameRef.current;
    const player = playerRef.current;
    if (!frame || !player) return;
    const services = getHostServices(buildId);
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    const runner = createGameRunner({
      gameId,
      load: gameLoaders[gameId],
      frame,
      fullscreenTarget: player,
      services,
      onEvent(e) {
        if (runnerRef.current !== runner) return; // a Strict Mode / navigation leftover
        switch (e.type) {
          case 'state':
            setState(e.state);
            if (e.state === 'loading') {
              setProgress(null);
              setSlow(false);
              announcedReady.current = false;
              setAnnounce(`Loading ${title}`);
              if (slowTimer) clearTimeout(slowTimer);
              slowTimer = setTimeout(() => setSlow(true), 5000);
            }
            if (e.state === 'running' && !announcedReady.current) {
              announcedReady.current = true;
              setAnnounce(`${title} ready`);
            }
            if (e.state !== 'loading' && e.state !== 'mounting' && slowTimer)
              clearTimeout(slowTimer);
            if (e.state !== 'crashed') setCrash(null);
            break;
          case 'progress':
            setProgress(e.value);
            break;
          case 'pausechange':
            setReasons(e.reasons);
            setOverlay(e.overlay);
            if (e.overlay) setAnnounce('Paused');
            break;
          case 'notice':
            setNotice(e.kind);
            break;
          case 'fullscreenchange':
            setFsMode(e.mode);
            break;
          case 'escapehint':
            showToast('Press Esc again to exit full screen', 2000);
            break;
          case 'gameplay':
            lastGameplay.current = e.event;
            break;
          case 'score': {
            const item: RankedScore = {
              board: e.board,
              value: e.value,
              rank: e.rank,
              entryId: e.entryId,
              personalBest: e.personalBest,
            };
            const now = Date.now();
            // a later score replaces the prompt; same-moment scores join it.
            setRanked((r) =>
              r && now - r.at < PROMPT_GROUP_MS
                ? { items: [...r.items, item], at: r.at }
                : { items: [item], at: now },
            );
            setNewIds((s) => new Set([...s, e.entryId]));
            break;
          }
          case 'crash': {
            setOverlay(false);
            const report = e.report;
            const show = () =>
              setCrash({ report, crashLoop: recordCrash(gameId), retries: retriesRef.current });
            // a chunk failure after a new deploy is an update notice, not a crash.
            if (report.errorName === 'ChunkLoadError') {
              void checkForUpdate().then((r) =>
                r === 'updated' && claimUpdatePrompt() ? setUpdated(true) : show(),
              );
            } else show();
            break;
          }
        }
      },
    });
    runnerRef.current = runner;
    setReady(true);
    if (!services.storage.persistent && !storageNoticeShown) {
      storageNoticeShown = true;
      showToast("Progress won't be saved in this browser mode.", 6000);
    }
    if (isStartedInDocument()) {
      runner.mount('play'); // auto-mount after client-side navigation
      if (isPhone()) void runner.enterFullscreen(true);
    }
    const cancelWarm = warmAfterIdle(() => void gameLoaders[gameId]().catch(() => {}));
    return () => {
      cancelWarm();
      if (slowTimer) clearTimeout(slowTimer);
      runnerRef.current = null;
      void runner.unmount();
      void runner.exitFullscreen(); // leave fullscreen at once on navigation
    };
  }, [gameId, buildId, title, showToast]);

  // everything outside the stage is inert in pseudo-fullscreen.
  useEffect(() => {
    if (fsMode !== 'pseudo' || !playerRef.current) return;
    return inertOutside(playerRef.current);
  }, [fsMode]);

  // when the overlay appears and focus was in the frame, move focus to it.
  useEffect(() => {
    if (!overlay) return;
    const active = document.activeElement;
    if (!active || active === document.body || playerRef.current?.contains(active))
      overlayRef.current?.focus({ preventScroll: true });
  }, [overlay]);

  function onPlay(fullscreen = false): void {
    const runner = runnerRef.current;
    if (!runner || playedRef.current) return;
    playedRef.current = true;
    // In this order and synchronously inside the click.
    getHostServices(buildId).audio.unlock();
    if (fullscreen || isPhone()) void runner.enterFullscreen();
    runner.mount('play');
    markStartedInDocument();
    recordPlay(gameId, buildId);
    setStarted(true);
  }

  function resume(e: SyntheticEvent): void {
    e.preventDefault();
    e.stopPropagation();
    runnerRef.current?.resumeFromOverlay();
    focusGame();
  }

  function restart(): void {
    setRanked(null);
    if (lastGameplay.current === 'start' && (state === 'running' || state === 'paused')) {
      runnerRef.current?.addPause('overlay', 'overlay:restart');
      setConfirmOpen(true);
    } else {
      runnerRef.current?.restart();
    }
  }

  function retry(): void {
    retriesRef.current += 1;
    setCrash(null);
    runnerRef.current?.restart();
  }

  function openSheet(): void {
    if (state === 'running' || state === 'paused')
      runnerRef.current?.addPause('overlay', 'overlay:leaderboard');
    setSheetOpen(true);
  }

  const toggleFullscreen = (e: { detail: number }) => {
    const runner = runnerRef.current;
    if (!runner) return;
    if (!started) return onPlay(true);
    if (runner.fullscreenMode === 'none') void runner.enterFullscreen();
    else void runner.exitFullscreen();
    if (e.detail > 0) focusGame();
  };

  const live = state === 'running' || state === 'paused';
  const loading =
    started &&
    !crash &&
    !updated &&
    (state === 'idle' || state === 'loading' || state === 'mounting');
  const promptText = ranked?.items
    .map((r) => {
      const b = leaderboards.find((x) => x.id === r.board);
      return b
        ? `${r.personalBest ? 'New best! ' : ''}#${r.rank} on ${b.label}: ${formatValue(b.format, r.value)}`
        : '';
    })
    .filter(Boolean)
    .join(' · ');
  const range = aspectRange(aspectRatio);
  const stageStyle = {
    ...(range ? { '--ar-min': String(range.min), '--ar-max': String(range.max) } : {}),
    '--min-w': `${minSize.width}px`,
    '--min-h': `${minSize.height}px`,
  } as CSSProperties;

  return (
    <div className="stage" style={stageStyle}>
      <div
        ref={playerRef}
        className={range ? 'player' : 'player player-fill'}
        data-runner-state={state}
        data-pause-reasons={reasons.join(' ')}
        data-fullscreen={fsMode}
        onKeyUpCapture={(e) => {
          // Swallow the keyup of the key that resumed from the overlay.
          if (!swallowKeyUp.current) return;
          swallowKeyUp.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="frame" ref={frameRef} />
        {!started && (
          <div className="poster">
            {cover && <img className="poster-bg" src={cover} alt="" aria-hidden="true" />}
            <div className="poster-body">
              {cover && <img className="poster-art" src={cover} alt="" width={160} height={160} />}
              <p className="poster-title">{title}</p>
              {tagline && <p className="poster-tagline">{tagline}</p>}
              {supported ? (
                <button
                  type="button"
                  className="play-button"
                  onClick={() => onPlay()}
                  disabled={!ready}
                >
                  <Icon name="play" size={22} />
                  <span>
                    Play <span className="visually-hidden">{title}</span>
                  </span>
                </button>
              ) : (
                <p role="alert">Update your browser to play</p>
              )}
              {orientation !== 'any' && (
                <p className="badge">
                  <Icon name="rotate" size={16} /> Best in {orientation}
                </p>
              )}
            </div>
          </div>
        )}
        {loading && (
          <div className="loading" role="status">
            {cover && (
              <img
                className="loading-art"
                src={cover}
                alt=""
                aria-hidden="true"
                width={96}
                height={96}
              />
            )}
            <span>{slow ? 'Still loading…' : `Loading ${title}…`}</span>
            <span className="progress" aria-hidden="true">
              <span
                className={progress === null ? 'bar indeterminate' : 'bar'}
                style={progress === null ? undefined : { width: `${Math.round(progress * 100)}%` }}
              />
            </span>
          </div>
        )}
        {overlay && !notice && !crash && (
          <button
            type="button"
            ref={overlayRef}
            className="resume-overlay"
            onPointerDown={resume}
            onClick={resume}
            onKeyDown={(e) => {
              if (NON_RESUME_KEYS.has(e.key)) return;
              swallowKeyUp.current = true;
              resume(e);
            }}
          >
            <span className="resume-icon" aria-hidden="true">
              <Icon name="play" size={34} />
            </span>
            <span>Paused — tap or press any key to resume</span>
          </button>
        )}
        {notice && !crash && (
          <div className="notice" role="status">
            {notice === 'rotate'
              ? `Rotate your device to ${orientation} to play`
              : isPhone()
                ? 'Rotate your device or close other panels'
                : `Make the window larger to play (needs at least ${minSize.width} × ${minSize.height})`}
          </div>
        )}
        {updated && (
          <ReloadCard
            text="Pocketcade was updated. Reload to get the latest version."
            label="Reload"
          />
        )}
        {crash && (
          <CrashCard
            {...crash}
            title={title}
            repoUrl={repoUrl}
            onRetry={retry}
            onCopied={() => showToast('Copied')}
          />
        )}
        {fsMode !== 'none' && (
          <div className="fs-chrome">
            <MuteButton buildId={buildId} onPointerUse={focusGame} />
            <button
              type="button"
              className="icon-button"
              aria-label="Exit full screen"
              onClick={() => void runnerRef.current?.exitFullscreen()}
            >
              <Icon name="shrink" size={22} />
            </button>
          </div>
        )}
        {ranked && promptText && live && (
          <InitialsPrompt
            key={ranked.items[0]!.entryId}
            text={promptText}
            defaultInitials={getSettings().lastInitials ?? 'YOU'}
            onDismiss={() => setRanked(null)}
            onSave={(initials) => {
              const scores = getHostServices(buildId).scores;
              for (const r of ranked.items)
                void scores.setInitials(gameId, r.board, r.entryId, initials);
              saveInitials(initials);
              setRanked(null);
              setAnnounce('Saved');
            }}
          />
        )}
        {toast && <Toast text={toast.text} />}
        <LeaderboardSheet
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false);
            runnerRef.current?.removePause('overlay', 'overlay:leaderboard');
          }}
          gameId={gameId}
          title={title}
          boards={leaderboards}
          buildId={buildId}
          newIds={newIds}
        />
        <ConfirmDialog
          open={confirmOpen}
          title={`Restart ${title}? Your current game will end.`}
          confirm="Restart"
          onClose={() => {
            setConfirmOpen(false);
            runnerRef.current?.removePause('overlay', 'overlay:restart');
          }}
          onConfirm={() => runnerRef.current?.restart()}
        />
        <p className="visually-hidden" role="status" aria-live="polite">
          {announce}
        </p>
      </div>
      <div className="player-bar" role="toolbar" aria-label={`${title} controls`}>
        <button type="button" className="chip-button" onClick={toggleFullscreen} disabled={!ready}>
          <Icon name={fsMode === 'none' ? 'expand' : 'shrink'} size={18} />
          {!started
            ? 'Play in full screen'
            : fsMode === 'none'
              ? 'Full screen'
              : 'Exit full screen'}
        </button>
        <MuteButton
          buildId={buildId}
          className="chip-button chip-icon"
          onPointerUse={live ? focusGame : undefined}
        />
        {!crash && (
          <button type="button" className="chip-button" onClick={restart} disabled={!live}>
            <Icon name="restart" size={18} />
            Restart
          </button>
        )}
        {leaderboards.length > 0 && (
          <button type="button" className="chip-button" onClick={openSheet}>
            <Icon name="trophy" size={18} />
            Leaderboard
          </button>
        )}
      </div>
    </div>
  );
}
