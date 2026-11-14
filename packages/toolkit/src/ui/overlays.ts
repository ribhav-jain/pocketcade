// Shared DOM overlays for both adapters: how-to, pause menu, game over,
// toasts and the touch pause button, in their own open shadow root. Never used in attract.
import {
  DEFAULT_PAUSE_KEYS,
  type GameMeta,
  type HostAPI,
  type Json,
  type SubmitResult,
  type Unsubscribe,
} from '@pocketcade/sdk';
import type { RunTracker, TkLiveEnv } from '../context.ts';
import { fill, type ToolkitStrings } from '../strings.en.ts';
import { FONT_DISPLAY, FONT_STACK, colors as c, gradients } from '../tokens.ts';
import { formatScore, sheet } from '../util.ts';

export type IconName =
  | 'arrows'
  | 'tap'
  | 'swipe'
  | 'drag'
  | 'key'
  | 'pause'
  | 'play'
  | 'restart'
  | 'sound-on'
  | 'sound-off'
  | 'info'
  | 'trophy';

export interface HowToStep {
  icon: IconName;
  keyboard: string;
  touch: string;
  pointer?: string;
}

export interface OverlayConfig {
  /** 1–4 steps */
  howTo: { steps: readonly HowToStep[] };
  /** default 'auto' (touch primary) */
  pauseButton?: 'auto' | 'always' | 'never';
  /** default false */
  confirmRestart?: boolean;
}

export interface GameOverOptions {
  /** e.g. strings.gameOver or strings.solved */
  title: string;
  /** first = headline; submitted in order */
  scores: readonly { board: string; value: number }[];
  /** one short line of run stats under the scores, e.g. "Hits 23 · Perfect 9" */
  detail?: string;
  /** forwarded to scores.submit (≤ 2 KiB) */
  meta?: Json;
  /** ≤ 2 extra buttons after "Play again" */
  actions?: readonly { id: string; label: string }[];
}

export interface Overlays {
  readonly open: 'howto' | 'pause' | 'gameover' | null;
  howTo(options?: { force?: boolean }): Promise<void>;
  pauseMenu(): Promise<'resume' | 'restart'>;
  gameOver(options: GameOverOptions): Promise<'play-again' | string>;
  toast(
    text: string,
    options?: { tone?: 'info' | 'success' | 'warning'; durationMs?: number },
  ): void;
  /** pause-menu Restart (game resets its run) */
  onRestart(cb: () => void): Unsubscribe;
  /** With `confirmRestart`: replaces the confirm text ("Restart? This game ends."); null restores it */
  setRestartConfirm(text: string | null): void;
}

interface OverlayDeps {
  /** div[data-tk-ui]; gets its own open shadow root */
  layer: HTMLElement;
  /** made inert while a dialog is open; focus returns here */
  stage: HTMLElement;
  host: HostAPI;
  meta: GameMeta;
  env(): TkLiveEnv;
  strings: ToolkitStrings;
  config: OverlayConfig;
  signal: AbortSignal;
  run: RunTracker;
  soundOff: { get(): boolean; set(off: boolean): void };
  /** the adapter freezes the game while the how-to or pause menu is open */
  onMenu(open: boolean): void;
  /** no menu opens while the host has the game paused */
  hostPaused(): boolean;
  reportError(e: unknown): void;
}

export interface OverlaysInternal extends Overlays {
  /** inputchange / mute: refresh the pause button and the sound toggle */
  refresh(): void;
}

// 24 × 24 line icons (currentColor), drawn for the overlays.
const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS: Record<IconName, string> = {
  arrows: svg('<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>'),
  tap: svg(
    '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4.5A5.5 5.5 0 0 1 12.5 21h-1a5 5 0 0 1-4.2-2.3L5 15.2a1.5 1.5 0 0 1 2.4-1.8L9 15"/>',
  ),
  swipe: svg('<path d="M4 9h13M13 5l4 4-4 4M20 15H7m4-4-4 4 4 4"/>'),
  drag: svg(
    '<path d="M12 3v18M3 12h18M12 3l-3 3m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3"/>',
  ),
  key: svg(
    '<rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8"/>',
  ),
  pause: svg('<path d="M9 5v14M15 5v14"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  restart: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>'),
  'sound-on': svg(
    '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  ),
  'sound-off': svg('<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4zM16 9.5l5 5M21 9.5l-5 5"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
  trophy: svg(
    '<path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>',
  ),
};

const [g0, g1] = gradients.sunset;
const CSS = `[hidden]{display:none!important}
:host{all:initial;position:absolute;inset:0;pointer-events:none;container-type:size;color:${c.text};font:16px/1.45 var(--pocketcade-font-family,${FONT_STACK})}
.s{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 90% at 50% 40%,rgba(42,31,96,.72),rgba(10,6,28,.88));-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);pointer-events:auto;animation:fade .18s ease-out}
.k{position:relative;box-sizing:border-box;width:min(380px,92%);max-height:94%;overflow:auto;padding:22px 20px 18px;border:2px solid rgba(255,255,255,.1);border-radius:26px;background:linear-gradient(180deg,${c.raised},${c.surface});box-shadow:0 24px 60px rgba(4,2,16,.6),inset 0 1px 0 rgba(255,255,255,.12);text-align:center;animation:pop .32s cubic-bezier(.2,.9,.3,1.25)}
.k::before{content:"";position:absolute;inset:0 0 auto;height:6px;border-radius:26px 26px 0 0;background:linear-gradient(90deg,${g0},${g1},${c.sky})}
h2{margin:2px 0 14px;font:700 clamp(22px,8cqmin,32px)/1.1 var(--pocketcade-display-font,${FONT_DISPLAY});letter-spacing:.2px;background:linear-gradient(90deg,${c.gold},${g1} 45%,${g0});-webkit-background-clip:text;background-clip:text;color:transparent}
ol{list-style:none;margin:0 0 6px;padding:0;text-align:left}
li{display:flex;gap:12px;align-items:center;margin:8px 0;padding:8px 10px;border-radius:16px;background:rgba(255,255,255,.05)}
.i{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:14px;background:linear-gradient(135deg,${c.sky},${c.violet});color:#fff;box-shadow:0 3px 0 rgba(0,0,0,.25)}
li:nth-child(2) .i{background:linear-gradient(135deg,${g0},${g1})}li:nth-child(3) .i{background:linear-gradient(135deg,${c.lime},${c.green})}li:nth-child(4) .i{background:linear-gradient(135deg,${c.gold},${c.orange})}
button{display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;width:100%;min-height:48px;margin:10px 0 0;padding:10px 18px;border:0;border-radius:16px;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 2px rgba(255,255,255,.12),0 4px 0 rgba(0,0,0,.28);color:inherit;font:600 17px/1.2 var(--pocketcade-display-font,${FONT_DISPLAY});cursor:pointer;transition:transform .12s,filter .12s,box-shadow .12s}
button:hover{filter:brightness(1.12)}
button:active{transform:translateY(3px);box-shadow:inset 0 0 0 2px rgba(255,255,255,.12),0 1px 0 rgba(0,0,0,.28)}
button.d{background:linear-gradient(180deg,${g0},${g1});box-shadow:inset 0 2px 0 rgba(255,255,255,.35),0 4px 0 #A8326B;color:${c.ink};font-weight:700;font-size:19px}
button.d:active{box-shadow:inset 0 2px 0 rgba(255,255,255,.35),0 1px 0 #A8326B}
button:focus-visible{outline:3px solid ${c.gold};outline-offset:3px}
.v{margin:2px 0 4px;font:700 clamp(36px,16cqmin,64px)/1.05 var(--pocketcade-display-font,${FONT_DISPLAY});font-variant-numeric:tabular-nums;background:linear-gradient(180deg,#fff,${c.gold});-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 rgba(0,0,0,.3))}
.m{min-height:1.45em;margin:0 0 4px;color:${c.textMuted}}
.m.b{display:inline-block;margin:2px auto 8px;padding:4px 14px;border-radius:999px;background:linear-gradient(90deg,${c.gold},${g1});color:${c.ink};font:700 15px/1.4 var(--pocketcade-display-font,${FONT_DISPLAY});animation:pop .4s cubic-bezier(.2,.9,.3,1.4)}
.t{position:absolute;top:12px;left:50%;transform:translateX(-50%);max-width:88%;padding:9px 18px;border-radius:999px;background:rgba(18,12,44,.88);box-shadow:inset 0 0 0 2px rgba(255,255,255,.14),0 8px 24px rgba(4,2,16,.45);font:600 15px/1.3 var(--pocketcade-display-font,${FONT_DISPLAY});pointer-events:none;animation:drop .28s cubic-bezier(.2,.9,.3,1.3)}
.t.success{box-shadow:inset 0 0 0 2px ${c.lime},0 8px 24px rgba(4,2,16,.45)}.t.warning{box-shadow:inset 0 0 0 2px ${c.orange},0 8px 24px rgba(4,2,16,.45)}
.p{position:absolute;top:12px;right:12px;width:48px;height:48px;min-height:0;margin:0;padding:0;border-radius:50%;background:rgba(18,12,44,.6);pointer-events:auto}
.c{position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:26px}
.c i{position:absolute;top:-12px;width:9px;height:14px;border-radius:2px;animation:fall 1.6s cubic-bezier(.3,.6,.6,1) forwards}
@keyframes fade{from{opacity:0}}
@keyframes pop{from{opacity:0;transform:scale(.86)}}
@keyframes drop{from{opacity:0;transform:translate(-50%,-14px)}}
@keyframes fall{to{transform:translateY(420px) rotate(540deg);opacity:0}}
.rm *,.rm{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createOverlays(d: OverlayDeps): OverlaysInternal {
  const s = d.strings;
  const pauseKeys = d.meta.pauseKeys ?? DEFAULT_PAUSE_KEYS;
  const shadow = d.layer.attachShadow({ mode: 'open' });
  try {
    shadow.adoptedStyleSheets = [sheet(CSS)];
  } catch {
    shadow.append(el('style', undefined, CSS)); // no constructable stylesheets
  }
  const root = el('div');
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  if (d.env().reducedMotion) root.className = 'rm';
  shadow.append(root);
  const restartSubs = new Set<() => void>();
  let restartConfirm: string | null = null;
  let open: Overlays['open'] = null;
  let scrim: HTMLElement | null = null;
  let refreshMenu: (() => void) | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  const pauseBtn = el('button', 'p');
  pauseBtn.innerHTML = ICONS.pause;
  pauseBtn.type = 'button';
  pauseBtn.setAttribute('aria-label', s.pause);
  pauseBtn.addEventListener('click', () => void api.pauseMenu());
  root.append(pauseBtn);
  const showPauseBtn = () => {
    const mode = d.config.pauseButton ?? 'auto';
    pauseBtn.hidden =
      open !== null || mode === 'never' || (mode === 'auto' && d.env().input.primary !== 'touch');
  };
  showPauseBtn();

  /** Builds a modal card with a 400 ms activation guard. */
  function dialog(kind: NonNullable<Overlays['open']>, title: string, escape: (() => void) | null) {
    close();
    open = kind;
    const opened = performance.now();
    let armed = false;
    scrim = el('div', 's');
    const card = el('div', 'k');
    const h = el('h2', undefined, title);
    h.id = 'tk-t';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'tk-t');
    card.append(h);
    scrim.append(card);
    root.append(scrim);
    d.stage.inert = true;
    showPauseBtn();
    const buttons = () => [...card.querySelectorAll('button')];
    scrim.addEventListener('pointerdown', () => (armed = true));
    scrim.addEventListener('keydown', (e) => {
      if (!e.repeat) armed = true;
      const list = buttons();
      const i = list.indexOf(shadow.activeElement as HTMLButtonElement);
      if (e.key === 'Tab') {
        e.preventDefault(); // focus trap
        list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length]?.focus();
      } else if (kind === 'pause' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
      } else if (
        escape &&
        (e.key === 'Escape' || (kind === 'pause' && pauseKeys.includes(e.code)))
      ) {
        e.preventDefault();
        if (!e.repeat) escape();
      }
    });
    const button = (label: string, onClick: () => void, primary = false) => {
      const b = el('button', primary ? 'd' : undefined, label);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (armed && performance.now() - opened >= 400) onClick();
      });
      card.append(b);
      return b;
    };
    return { card, button };
  }

  /** Counts an integer score up over ~650 ms (skipped with reduced motion). */
  function countUp(node: HTMLElement, value: number, format: (n: number) => string): void {
    if (d.env().reducedMotion || !Number.isInteger(value) || value <= 0 || value > 1e9) return;
    const t0 = performance.now();
    const step = () => {
      if (!node.isConnected || d.signal.aborted) return;
      const k = Math.min(1, (performance.now() - t0) / 650);
      node.textContent = format(Math.round(value * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    node.textContent = format(0);
    requestAnimationFrame(step);
  }

  function confetti(card: HTMLElement): void {
    const box = el('div', 'c');
    box.setAttribute('aria-hidden', 'true');
    const tints = [c.pink, c.gold, c.sky, c.lime, c.purple, c.orange];
    for (let i = 0; i < 28; i++) {
      const p = el('i');
      p.style.cssText = `left:${(i * 37) % 100}%;background:${tints[i % tints.length]};animation-delay:${(i % 7) * 70}ms;transform:rotate(${i * 47}deg)`;
      box.append(p);
    }
    card.append(box);
    later(() => box.remove(), 2400);
  }

  function close(): void {
    if (!scrim) return;
    scrim.remove();
    scrim = null;
    open = null;
    refreshMenu = null;
    d.stage.inert = false;
    showPauseBtn();
    if (!d.signal.aborted) d.stage.focus({ preventScroll: true });
  }

  function showHowTo(back: boolean): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        close();
        resolve();
      };
      const { card, button } = dialog('howto', d.strings.title, done);
      const list = el('ol');
      list.id = 'tk-d';
      card.setAttribute('aria-describedby', 'tk-d');
      const primary = d.env().input.primary;
      for (const step of d.config.howTo.steps) {
        const li = el('li');
        const icon = el('span', 'i');
        icon.innerHTML = ICONS[step.icon];
        icon.setAttribute('aria-hidden', 'true');
        li.append(
          icon,
          primary === 'touch'
            ? step.touch
            : primary === 'pointer'
              ? (step.pointer ?? step.touch)
              : step.keyboard,
        );
        list.append(li);
      }
      card.append(list);
      button(back ? s.back : s.play, done, true).focus({ preventScroll: true });
    });
  }

  async function submit(
    o: GameOverOptions,
    status: HTMLElement,
    lines: HTMLElement[],
    onBest: () => void,
  ) {
    const boards = d.meta.leaderboards;
    const pending = setTimeout(() => (status.textContent = s.saving), 150);
    for (const [i, sc] of o.scores.entries()) {
      const def = boards.find((b) => b.id === sc.board);
      let r: SubmitResult | null = null;
      try {
        r = await Promise.race([
          d.host.scores.submit({
            board: sc.board,
            value: sc.value,
            ...(o.meta !== undefined ? { meta: o.meta } : {}),
          }),
          new Promise<null>((res) => setTimeout(() => res(null), 3000)),
        ]);
      } catch {
        r = null;
      }
      if (r && !r.accepted && r.reason !== 'unavailable')
        d.reportError(new Error(`scores.submit ${sc.board}: ${r.reason}`));
      let text = '';
      if (!r || r.reason === 'unavailable') text = s.unavailable;
      else if (r.accepted && r.rank !== null)
        text = fill(r.personalBest ? s.newBest : s.ranked, { rank: r.rank });
      else if (r.accepted && def) {
        const top = await d.host.scores.top(sc.board, 1).catch(() => []);
        if (top[0])
          text = fill(s.best, { best: formatScore(top[0].value, def.format, d.env().locale) });
      }
      if (i === 0) {
        clearTimeout(pending);
        status.textContent = text;
        if (r?.accepted && r.personalBest) onBest();
      } else if (lines[i - 1]) lines[i - 1]!.textContent += text ? ` · ${text}` : '';
    }
    clearTimeout(pending);
  }

  const api: OverlaysInternal = {
    get open() {
      return open;
    },
    async howTo(o = {}) {
      if (open) return;
      if (!o.force) {
        const seen = await d.host.storage.get('tk.howto').catch(() => null);
        if (seen || d.signal.aborted || open) return;
      }
      d.onMenu(true);
      await showHowTo(false);
      void d.host.storage.set('tk.howto', { seen: true });
      d.onMenu(false);
    },
    pauseMenu() {
      if (open || d.hostPaused() || d.signal.aborted) return Promise.resolve('resume');
      if (d.run.active) d.host.gameplay.stop('pause');
      d.onMenu(true);
      return new Promise((resolve) => {
        const finish = (r: 'resume' | 'restart') => {
          close();
          d.onMenu(false);
          if (r === 'restart') {
            d.run.end('menu');
            for (const cb of [...restartSubs]) {
              try {
                cb();
              } catch (e) {
                d.reportError(e);
              }
            }
          } else if (d.run.active) d.host.gameplay.start();
          resolve(r);
        };
        const build = () => {
          const { button } = dialog('pause', s.paused, () => finish('resume'));
          button(s.resume, () => finish('resume'), true).focus({ preventScroll: true });
          let confirming = false;
          const restart = button(s.restart, () => {
            if (d.config.confirmRestart && !confirming) {
              confirming = true;
              restart.textContent = restartConfirm ?? s.restartConfirm;
            } else finish('restart');
          });
          button(s.howTo, () => void showHowTo(true).then(build));
          const sound = button('', () => {
            d.soundOff.set(!d.soundOff.get());
            label();
          });
          const label = () => {
            const on = !d.soundOff.get();
            sound.setAttribute('aria-pressed', String(on));
            sound.textContent = `${s.gameSound}: ${on ? s.on : s.off}${d.env().muted ? ` · ${s.mutedBySite}` : ''}`;
          };
          label();
          refreshMenu = label;
        };
        build();
      });
    },
    gameOver(o) {
      d.run.end('gameover');
      return new Promise((resolve) => {
        const { card, button } = dialog('gameover', o.title, null);
        const head = o.scores[0];
        const fmt = (board: string, value: number) => {
          const def = d.meta.leaderboards.find((b) => b.id === board);
          return def ? formatScore(value, def.format, d.env().locale) : String(value);
        };
        if (head) {
          const v = el('p', 'v', fmt(head.board, head.value));
          card.append(v);
          countUp(v, head.value, (n) => fmt(head.board, n));
        }
        const status = el('p', 'm');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        card.append(status);
        const lines = o.scores.slice(1).map((sc) => {
          const label = d.meta.leaderboards.find((b) => b.id === sc.board)?.label ?? sc.board;
          const p = el('p', 'm', `${label}: ${fmt(sc.board, sc.value)}`);
          card.append(p);
          return p;
        });
        if (o.detail) card.append(el('p', 'm', o.detail));
        void submit(o, status, lines, () => {
          status.classList.add('b');
          if (!d.env().reducedMotion) confetti(card);
        });
        const choose = (id: string) => {
          close();
          resolve(id);
        };
        const again = button(s.playAgain, () => choose('play-again'), true);
        for (const a of (o.actions ?? []).slice(0, 2)) button(a.label, () => choose(a.id));
        later(() => again.focus({ preventScroll: true }), 400);
      });
    },
    toast: (() => {
      const queue: string[] = [];
      let showing = false;
      let dur = 2500;
      let tone = 'info';
      const next = () => {
        const text = queue.shift();
        if (text === undefined || d.signal.aborted) return void (showing = false);
        showing = true;
        const t = el('div', `t ${tone}`, text);
        t.setAttribute('role', 'status');
        t.setAttribute('aria-atomic', 'true');
        root.append(t);
        later(() => {
          t.remove();
          next();
        }, dur);
      };
      return (
        text: string,
        o: { tone?: 'info' | 'success' | 'warning'; durationMs?: number } = {},
      ) => {
        dur = o.durationMs ?? 2500;
        tone = o.tone ?? 'info';
        queue.push(text);
        if (queue.length > 3) queue.shift();
        if (!showing) next();
      };
    })(),
    onRestart(cb) {
      restartSubs.add(cb);
      return () => void restartSubs.delete(cb);
    },
    setRestartConfirm(text) {
      restartConfirm = text;
    },
    refresh() {
      showPauseBtn();
      refreshMenu?.();
    },
  };

  // Pause keys open the menu while playing; keys on the overlay never reach the stage.
  d.stage.addEventListener(
    'keydown',
    (e) => {
      if (e.repeat || open || !pauseKeys.includes(e.code)) return;
      e.preventDefault();
      void api.pauseMenu();
    },
    { signal: d.signal },
  );
  d.signal.addEventListener(
    'abort',
    () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      restartSubs.clear();
      scrim = null;
      open = null;
    },
    { once: true },
  );
  return api;
}

/** Attract mode: no UI; game over restarts after `restartDelayMs`. */
export function attractOverlays(restartDelayMs: number, signal: AbortSignal): OverlaysInternal {
  return {
    open: null,
    howTo: () => Promise.resolve(),
    pauseMenu: () => Promise.resolve('resume'),
    gameOver: () =>
      new Promise((resolve) => {
        const t = setTimeout(() => resolve('play-again'), restartDelayMs);
        signal.addEventListener('abort', () => clearTimeout(t), { once: true });
      }),
    toast() {},
    onRestart: () => () => {},
    setRestartConfirm() {},
    refresh() {},
  };
}
