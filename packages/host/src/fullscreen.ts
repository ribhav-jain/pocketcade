// Fullscreen for the player stage: native Fullscreen API when available, otherwise
// pseudo-fullscreen (fixed stage + scroll lock). Feature checks only, never user-agent sniffing.
import type { FullscreenMode, Orientation } from '@pocketcade/sdk';

interface FullscreenOptions {
  orientation(): Orientation;
  pauseKeys(): readonly string[];
  /** `userExit` = the player left fullscreen (Esc, browser gesture, exit button), not the game */
  onChange(mode: FullscreenMode, userExit: boolean): void;
  /** first Escape in pseudo-fullscreen when the game uses Escape */
  onEscapeHint(): void;
  dev: boolean;
}

export interface Fullscreen {
  readonly mode: FullscreenMode;
  /** `pseudoWithoutActivation`: the portal's auto-mount on phones has no fresh gesture */
  request(pseudoWithoutActivation?: boolean): Promise<{ mode: FullscreenMode }>;
  /** `byUser`: the portal's exit button (pauses); false for the game's own display.exitFullscreen() */
  exit(byUser: boolean): Promise<void>;
  dispose(): void;
}

const PSEUDO_STYLE: Array<[string, string]> = [
  ['position', 'fixed'],
  ['inset', '0'],
  ['z-index', '2147483000'],
  ['width', '100vw'],
  ['max-width', 'none'],
  ['height', '100vh'],
  ['height', '100dvh'],
  ['aspect-ratio', 'auto'],
  ['margin', '0'],
  ['box-sizing', 'border-box'],
  [
    'padding',
    'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
  ],
];

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

function nativeAvailable(target: HTMLElement): boolean {
  const standalone =
    typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  return (
    document.fullscreenEnabled === true &&
    typeof target.requestFullscreen === 'function' &&
    !standalone
  );
}

export function createFullscreen(target: HTMLElement, opts: FullscreenOptions): Fullscreen {
  let mode: FullscreenMode = 'none';
  let hostExit = false;
  let lastEscape: number | null = null;
  let saved: { style: string | null; html: string; body: string; scrollY: number } | null = null;

  const setMode = (m: FullscreenMode, userExit: boolean) => {
    if (m === mode) return;
    mode = m;
    opts.onChange(m, userExit);
  };

  function lockOrientation(): void {
    const o = opts.orientation();
    const so = (screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } })
      .orientation;
    if (o === 'any' || !so?.lock) return;
    try {
      void so.lock(o).catch(() => {});
    } catch {
      // unsupported (Safari/iOS): the rotate notice covers it
    }
  }

  function unlockOrientation(): void {
    try {
      (screen as Screen & { orientation?: { unlock?: () => void } }).orientation?.unlock?.();
    } catch {
      // ignore
    }
  }

  function enterPseudo(): FullscreenMode {
    const html = document.documentElement;
    saved = {
      style: target.getAttribute('style'),
      html: html.style.cssText,
      body: document.body.style.cssText,
      scrollY: window.scrollY,
    };
    for (const [k, v] of PSEUDO_STYLE) target.style.setProperty(k, v);
    for (const el of [html, document.body]) {
      el.style.overflow = 'hidden';
      el.style.overscrollBehavior = 'none';
    }
    setMode('pseudo', false);
    return 'pseudo';
  }

  function exitPseudo(userExit: boolean): void {
    if (mode !== 'pseudo' || !saved) return;
    if (saved.style === null) target.removeAttribute('style');
    else target.setAttribute('style', saved.style);
    document.documentElement.style.cssText = saved.html;
    document.body.style.cssText = saved.body;
    const y = saved.scrollY;
    saved = null;
    window.scrollTo(0, y);
    setMode('none', userExit);
  }

  const onFullscreenChange = () => {
    if (document.fullscreenElement === target) {
      lockOrientation();
      setMode('native', false);
    } else if (mode === 'native') {
      unlockOrientation();
      const byHost = hostExit;
      hostExit = false;
      setMode('none', !byHost);
    }
  };

  // Escape in pseudo-fullscreen. Capture phase on the stage so a consumed Escape never reaches the game.
  const onKeyDown = (e: KeyboardEvent) => {
    if (mode !== 'pseudo' || e.key !== 'Escape') {
      if (!MODIFIERS.has(e.key)) lastEscape = null;
      return;
    }
    const consume = () => {
      e.preventDefault();
      e.stopPropagation();
      lastEscape = null;
      exitPseudo(true);
    };
    if (!opts.pauseKeys().includes('Escape')) return consume();
    const now = performance.now();
    if (lastEscape !== null && now - lastEscape <= 1000) return consume();
    lastEscape = now;
    opts.onEscapeHint();
  };
  const onPointerDown = () => (lastEscape = null);

  document.addEventListener('fullscreenchange', onFullscreenChange);
  target.addEventListener('keydown', onKeyDown, true);
  target.addEventListener('pointerdown', onPointerDown, true);

  return {
    get mode() {
      return mode;
    },
    request(pseudoWithoutActivation = false) {
      if (mode !== 'none') return Promise.resolve({ mode });
      const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } })
        .userActivation;
      if (activation && !activation.isActive) {
        if (pseudoWithoutActivation) return Promise.resolve({ mode: enterPseudo() });
        if (opts.dev)
          console.warn('[pocketcade] requestFullscreen must be called from an input handler');
        return Promise.resolve({ mode: 'none' });
      }
      if (!nativeAvailable(target)) return Promise.resolve({ mode: enterPseudo() });
      let p: Promise<void>;
      try {
        p = target.requestFullscreen({ navigationUI: 'hide' }); // synchronous call: activation still valid
      } catch {
        return Promise.resolve({ mode: enterPseudo() });
      }
      return p.then(
        () => ({ mode: 'native' as FullscreenMode }),
        () => {
          if (opts.dev)
            console.warn('[pocketcade] native fullscreen was refused; using pseudo-fullscreen');
          return { mode: enterPseudo() };
        },
      );
    },
    async exit(byUser) {
      if (mode === 'pseudo') return exitPseudo(byUser);
      if (mode === 'native' && document.fullscreenElement) {
        hostExit = !byUser;
        try {
          await document.exitFullscreen();
        } catch {
          // already exiting
        }
      }
    },
    dispose() {
      if (mode === 'pseudo') exitPseudo(false);
      else if (mode === 'native' && document.fullscreenElement === target) {
        hostExit = true;
        void document.exitFullscreen().catch(() => {});
      }
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      target.removeEventListener('keydown', onKeyDown, true);
      target.removeEventListener('pointerdown', onPointerDown, true);
    },
  };
}
