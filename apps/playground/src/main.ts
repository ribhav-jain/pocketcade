// The playground mounts any game package on the real @pocketcade/host: pick a game, a frame size and a launch
// mode, then pause, resume, restart or mute it. URL parameters preselect them:
//   ?game=<id>&launch=play|attract&size=<name|WxH>&storage=memory&muted=1&probe=1
// window.__playground drives the same controls from the leak test.
import {
  createGameRunner,
  createHostServices,
  createMemoryBackend,
  type GameRunner,
  type RunnerState,
} from '@pocketcade/host';
import { installLeakProbe } from '@pocketcade/host/testing';
import type { GameDefinition } from '@pocketcade/sdk';
import '@fontsource-variable/fredoka/index.css';
import '@fontsource-variable/nunito/index.css';
import './style.css';

type Launch = 'play' | 'attract';
type Loader = () => Promise<{ default: GameDefinition }>;

const params = new URLSearchParams(location.search);
// The leak probe patches page APIs, so it goes in before any game module loads (games are lazy chunks).
const probe = params.get('probe') === '1' ? installLeakProbe() : null;

const games = new Map<string, Loader>();
for (const [path, load] of Object.entries(
  import.meta.glob<{ default: GameDefinition }>('../../../packages/games/*/src/index.ts'),
))
  games.set(path.split('/')[5]!, load);
for (const [path, load] of Object.entries(
  import.meta.glob<{ default: GameDefinition }>('../fixtures/*/index.ts'),
))
  games.set(`fixture-${path.split('/')[2]!}`, load);

const SIZES: Record<string, [number, number]> = {
  'phone-portrait': [390, 844],
  'phone-landscape': [844, 390],
  'phone-small': [360, 640],
  tablet: [768, 1024],
  desktop: [1031, 580],
  'desktop-small': [640, 360],
  square: [1024, 1024],
  wide: [1600, 900],
};

const services = createHostServices({
  locale: 'en-US',
  reducedMotion: 'system',
  muted: params.get('muted') === '1',
  dev: true,
  buildId: 'playground',
  ...(params.get('storage') === 'memory' ? { backend: createMemoryBackend() } : {}),
});

const stage = document.getElementById('stage')!;
const frame = document.getElementById('frame')!;
const panel = document.getElementById('panel')!;

let game = games.has(params.get('game') ?? '')
  ? params.get('game')!
  : [...games.keys()].find((id) => !id.startsWith('fixture-'))!;
let launch: Launch = params.get('launch') === 'attract' ? 'attract' : 'play';
let runner: GameRunner | null = null;
let state: RunnerState = 'idle';
const waiters = new Set<() => void>();

/** `name` is a key of SIZES or "<width>x<height>" in CSS pixels. */
function setSize(name: string): void {
  const custom = /^(\d+)x(\d+)$/.exec(name);
  const [w, h] = custom ? [Number(custom[1]), Number(custom[2])] : (SIZES[name] ?? SIZES.desktop!);
  frame.style.width = `${w}px`;
  frame.style.height = `${h}px`;
}

function until(ok: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (ok()) return resolve();
    const check = () => {
      if (!ok()) return;
      waiters.delete(check);
      resolve();
    };
    waiters.add(check);
  });
}

function setState(next: RunnerState): void {
  state = next;
  badge.textContent = next;
  pause.textContent = next === 'paused' ? 'Resume' : 'Pause';
  if (next !== 'crashed') crash.textContent = '';
  for (const check of [...waiters]) check();
}

/** Unmounts whatever is mounted, then mounts `o.game` in `o.launch` mode; resolves once it runs or crashes. */
async function mount(o: { game?: string; launch?: Launch } = {}): Promise<void> {
  await unmount();
  game = o.game ?? game;
  launch = o.launch ?? launch;
  probe?.markGameStart();
  const r = createGameRunner({
    gameId: game,
    load: games.get(game)!,
    frame,
    fullscreenTarget: stage,
    services,
    onEvent(e) {
      if (runner !== r) return;
      if (e.type === 'state') setState(e.state);
      if (e.type === 'crash')
        crash.textContent = `${e.report.errorName} in ${e.report.phase}: ${e.report.message}`;
    },
  });
  runner = r;
  r.mount(launch);
  await until(() => state === 'running' || state === 'paused' || state === 'crashed');
}

async function unmount(): Promise<void> {
  const r = runner;
  if (!r) return;
  await r.unmount();
  runner = null;
  probe?.markGameEnd();
  setState('idle');
}

/** Pauses as the player would; Resume also clears a pause the host added when the tab lost focus. */
function togglePause(): void {
  if (state === 'paused') {
    runner?.removePause('user', 'playground');
    runner?.resumeFromOverlay();
  } else runner?.addPause('user', 'playground');
}

const api = {
  games: () => [...games.keys()],
  mount,
  unmount,
  state: () => state,
  /** null unless the page was opened with ?probe=1 */
  probe,
};
export type PlaygroundApi = typeof api;
declare global {
  interface Window {
    __playground: PlaygroundApi;
  }
}
window.__playground = api;

// ─── controls ───
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}
function select(
  label: string,
  options: string[],
  value: string,
  onChange: (value: string) => void,
): HTMLLabelElement {
  const s = el(
    'select',
    {},
    ...options.map((o) => el('option', { value: o, textContent: o, selected: o === value })),
  );
  s.addEventListener('change', () => onChange(s.value));
  return el('label', {}, `${label} `, s);
}
function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', textContent: text });
  b.addEventListener('click', onClick);
  return b;
}

const badge = el('output', { className: 'badge', textContent: state });
const crash = el('p', { className: 'crash' });
crash.setAttribute('role', 'alert');
const pause = button('Pause', togglePause);
const muted = el('input', { type: 'checkbox', checked: services.audio.muted });
muted.addEventListener('change', () => services.audio.setMuted(muted.checked));
const size = params.get('size') ?? 'desktop';
setSize(size);

panel.append(
  el('h1', { textContent: 'Pocketcade playground' }),
  el(
    'div',
    { className: 'row' },
    select('Game', [...games.keys()], game, (v) => void mount({ game: v })),
    select('Launch', ['play', 'attract'], launch, (v) => void mount({ launch: v as Launch })),
    select('Size', SIZES[size] ? Object.keys(SIZES) : [size, ...Object.keys(SIZES)], size, setSize),
  ),
  el(
    'div',
    { className: 'row' },
    button('Mount', () => {
      // Inside the click, so the browser lets the shared AudioContext start.
      if (launch === 'play' && !services.audio.muted) services.audio.unlock();
      void mount();
    }),
    button('Unmount', () => void unmount()),
    button('Restart', () => runner?.restart()),
    pause,
    el('label', {}, muted, ' Muted'),
    badge,
  ),
  crash,
);

// With the probe on, nothing mounts until the test has taken its baseline.
if (!probe) void mount();
