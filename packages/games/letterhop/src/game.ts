// Letterhop on the DOM adapter: daily and practice ladders, type and picker entry, results and share.
// Hop the frog leaps up a ladder of lily-pad rungs; effects are CSS keyframes (off under reduced motion).
import type { Rng } from '@pocketcade/toolkit';
import type { DomGameHooks, DomScope } from '@pocketcade/toolkit/dom';
import { FIREFLIES, FLAME, FROG, ICONS, SCENE, leaf } from './art.ts';
import { ATTRACT_PUZZLE } from './attract.ts';
import { DAILY_EPOCH } from './daily.ts';
import {
  ALPHABET,
  HOP_CAP,
  currentStreak,
  dailySlot,
  daysBetween,
  makeDict,
  rate,
  revealPath,
  spell,
  trimHistory,
  validateHop,
  wordAt,
  type HopResult,
} from './logic.ts';
import {
  isDailyV1,
  isPracticeV1,
  isSettingsV1,
  type AttemptV1,
  type DailySaveV1,
  type PracticeSaveV1,
  type SettingsSaveV1,
  type Tier,
} from './save.ts';
import { strings } from './strings.ts';

type Mode = 'daily' | 'practice';
type Attempt = AttemptV1 & { dailyKey?: string; day?: number };
type Finished = Exclude<AttemptV1['status'], 'playing'>;

const ERRORS: Record<Exclude<HopResult, { ok: true }>['code'], keyof typeof strings> = {
  format: 'errFormat',
  same: 'errSame',
  one_letter: 'errOneLetter',
  repeat: 'errRepeat',
  unknown: 'errUnknown',
};
const TIERS: readonly Tier[] = ['short', 'medium', 'long'];
const SPARK_COLORS = ['#B8F34A', '#FFC83D', '#38D6FF', '#FF4FA3'];
const CONFETTI = ['#B8F34A', '#FFC83D', '#38D6FF', '#FF4FA3', '#C77DFF', '#FF9F1C'];
type Mood = 'idle' | 'happy' | 'sad';

function bits(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}
const hex16 = (r: Rng) =>
  [r.nextUint32(), r.nextUint32()].map((n) => n.toString(16).padStart(8, '0')).join('');

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...kids: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

/** A button with a decorative icon before its text (the text stays the accessible name). */
function iconButton(attrs: Record<string, string>, icon: string, text: string): HTMLButtonElement {
  const b = h('button', { type: 'button', ...attrs }, text);
  b.insertAdjacentHTML('afterbegin', icon);
  return b;
}

export async function mountLetterhop(tk: DomScope): Promise<DomGameHooks> {
  const attract = tk.ctx.launch === 'attract';
  const data = await import('./data/index.ts');
  if (tk.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  tk.loading(0.6);
  const dict = makeDict(data.WORDS, bits(data.COMMON));
  const puzzle = (list: readonly number[], i: number) => ({
    start: wordAt(dict, list[i * 3]!),
    goal: wordAt(dict, list[i * 3 + 1]!),
    par: list[i * 3 + 2]!,
  });
  const slot = (key: string) => dailySlot(key, DAILY_EPOCH, data.DAILY.length / 3);
  // The shortest ladder for the current puzzle, cached: it is a BFS over the whole dictionary.
  let wayCache = { key: '', path: [] as string[] };
  function shownWay(a: Attempt): string[] {
    const key = `${a.start}>${a.goal}`;
    if (wayCache.key !== key) wayCache = { key, path: revealPath(dict, a.start, a.goal, a.par) };
    return wayCache.path;
  }

  // ─── saves (attract mode makes no storage calls) ───
  const dailySave = tk.createSave<DailySaveV1>({
    key: 'daily',
    defaults: () => ({ current: null, history: {}, bestStreak: 0 }),
    validate: isDailyV1,
  });
  const practiceSave = tk.createSave<PracticeSaveV1>({
    key: 'practice',
    defaults: () => {
      const order = () => ({ seed: hex16(tk.rng.main), next: 0, cycle: 0 });
      return {
        tier: 'medium',
        orders: { short: order(), medium: order(), long: order() },
        current: { short: null, medium: null, long: null },
        totals: { solved: 0, onPar: 0, revealed: 0 },
      };
    },
    validate: isPracticeV1,
  });
  const settingsSave = tk.createSave<SettingsSaveV1>({
    key: 'settings',
    defaults: () => ({ entry: 'auto' }),
    validate: isSettingsV1,
  });
  const [dl, pl, sl] = await Promise.all([
    dailySave.load(),
    practiceSave.load(),
    settingsSave.load(),
  ]);
  if (tk.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  let daily = dl.data;
  let practice = pl.data;
  let settings = sl.data;
  if (!attract && (dl.issue || pl.issue || sl.issue)) tk.ui.toast(strings.loadIssue);

  // ─── state ───
  let mode: Mode = 'daily';
  let attempt: Attempt;
  let draft = ['', '', '', ''];
  let selected = 0;
  let confirming = false;
  let rolloverWaiting = false;
  const entry = (): 'type' | 'picker' =>
    attract
      ? 'picker'
      : settings.entry !== 'auto'
        ? settings.entry
        : tk.env.input.primary === 'touch'
          ? 'picker'
          : 'type';

  /** Moves the unfinished daily into the history as expired. */
  function expire(cur: NonNullable<DailySaveV1['current']>): void {
    daily = {
      ...daily,
      current: null,
      history: trimHistory({
        ...daily.history,
        [cur.dailyKey]: { h: cur.hops, p: cur.par, s: 'expired' },
      }),
    };
    dailySave.set(daily);
    void dailySave.flush();
  }
  function expireOld(today: string): void {
    const cur = daily.current;
    if (!cur || cur.status !== 'playing') return;
    const age = daysBetween(cur.dailyKey, today);
    if (age !== 0 && age !== 1) expire(cur); // an unfinished daily stays playable until the next rollover
  }

  function dailyAttempt(key: string): Attempt {
    const cur = daily.current;
    if (
      cur &&
      (cur.dailyKey === key || (cur.status === 'playing' && daysBetween(cur.dailyKey, key) === 1))
    )
      return cur;
    const { day, index } = slot(key);
    const p = puzzle(data.DAILY, index);
    const stored = daily.history[key];
    const a: Attempt = {
      puzzleId: `d4-${String(index).padStart(4, '0')}`,
      length: 4,
      ...p,
      ladder: [],
      hops: stored?.h ?? 0,
      climbs: 0,
      startedAt: new Date().toISOString(),
      status: stored ? (stored.s === 'expired' ? 'out_of_hops' : stored.s) : 'playing',
      dailyKey: key,
      day,
    };
    if (!stored) {
      daily = { ...daily, current: a as DailySaveV1['current'] };
      dailySave.set(daily);
    }
    return a;
  }

  function practiceAttempt(tier: Tier, fresh = false): Attempt {
    const cur = practice.current[tier];
    if (cur && !fresh) return cur;
    const list = data.PRACTICE[tier];
    const n = list.length / 3;
    let order = practice.orders[tier];
    if (order.next >= n) order = { seed: hex16(tk.rng.main), next: 0, cycle: order.cycle + 1 };
    const idx = tk.rng.create(order.seed).shuffle(Array.from({ length: n }, (_, i) => i))[
      order.next
    ]!;
    const a: Attempt = {
      puzzleId: `p4-${tier[0]}-${String(idx).padStart(4, '0')}`,
      length: 4,
      ...puzzle(list, idx),
      ladder: [],
      hops: 0,
      climbs: 0,
      startedAt: new Date().toISOString(),
      status: 'playing',
    };
    practice = {
      ...practice,
      orders: { ...practice.orders, [tier]: { ...order, next: order.next + 1 } },
      current: { ...practice.current, [tier]: a },
    };
    practiceSave.set(practice);
    return a;
  }

  function persist(): void {
    if (attract) return;
    if (mode === 'daily') {
      daily = { ...daily, current: attempt as DailySaveV1['current'] };
      dailySave.set(daily);
    } else {
      practice = { ...practice, current: { ...practice.current, [practice.tier]: attempt } };
      practiceSave.set(practice);
    }
  }

  // ─── DOM ───
  const root = h('div', { class: 'lh' });
  if (tk.motion.reduced) root.dataset.motion = 'reduced';
  root.insertAdjacentHTML('afterbegin', SCENE);
  for (const [x, y, d] of FIREFLIES)
    root.append(
      h('span', {
        class: 'fly',
        'aria-hidden': 'true',
        style: `left:${x}%;top:${y}%;width:${d}px;height:${d}px`,
      }),
    );
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': strings.modes });
  for (const m of ['daily', 'practice'] as const)
    tabs.append(h('button', { type: 'button', role: 'tab', 'data-mode': m }, strings[m]));
  const label = h('span', { class: 'label' });
  const streakBadge = h('span', { class: 'streak', role: 'img' });
  const count = h('span', { class: 'count', role: 'status' });
  const helpBtn = iconButton({ 'aria-expanded': 'false' }, ICONS.help, strings.help);
  const top = h('div', { class: 'top' }, tabs, label, streakBadge, count, helpBtn);
  const helpMenu = h(
    'div',
    { class: 'help-menu' },
    h('button', { type: 'button', 'data-act': 'reveal' }, strings.showWay),
  );
  const confirmText = h('span');
  const confirmBox = h(
    'div',
    { class: 'confirm', role: 'group' },
    confirmText,
    h('button', { type: 'button', class: 'primary', 'data-act': 'confirm' }, strings.confirm),
    h('button', { type: 'button', 'data-act': 'cancel' }, strings.cancel),
  );
  const banner = h(
    'div',
    { class: 'banner', role: 'region', 'aria-label': strings.banner },
    strings.banner,
    h('button', { type: 'button', 'data-act': 'today' }, strings.playToday),
  );
  const tiers = h('div', { class: 'tiers', role: 'radiogroup', 'aria-label': strings.length });
  for (const t of TIERS)
    tiers.append(h('button', { type: 'button', role: 'radio', 'data-tier': t }, strings[t]));
  const header = h('div', {}, top, helpMenu, confirmBox, banner, tiers);

  const ladder = h('ol');
  // Hop lives in the pond (not in a rung), so moving between rungs is one FLIP jump and idle/blink never restart.
  const frog = h('div', { class: 'hop', 'aria-hidden': 'true', 'data-mood': 'idle' });
  frog.innerHTML = FROG;
  const ladderWrap = h('div', { class: 'ladder-wrap' }, ladder, frog);
  const field = h('input', {
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    maxlength: '4',
    enterkeyhint: 'go',
    inputmode: 'text',
  });
  const fieldLabel = h('label', { class: 'field' }, strings.field, field);
  const picker = h('div', { class: 'picker', role: 'group', 'aria-label': strings.picker });
  [...ALPHABET].forEach((ch, i) =>
    picker.append(
      h('button', { type: 'button', 'data-letter': ch, tabindex: i === 0 ? '0' : '-1' }, ch),
    ),
  );
  const tip = h('p', { class: 'tip' });
  const msg = h('p', { class: 'msg' });
  const modeBtn = h('button', { type: 'button', 'data-act': 'mode' });
  const climbBtn = iconButton({ 'data-act': 'climb' }, ICONS.down, strings.climbDown);
  const actions = h(
    'div',
    { class: 'actions' },
    iconButton({ class: 'go', 'data-act': 'hop' }, ICONS.hop, strings.hop),
    iconButton({ 'data-act': 'clear' }, ICONS.clear, strings.clear),
    climbBtn,
    modeBtn,
  );
  const controls = h('div', { class: 'controls' }, tip, fieldLabel, picker, actions, msg);
  const results = h('section', { class: 'results', 'aria-labelledby': 'lh-results' });
  const main = h('div', { class: 'main' }, ladderWrap, controls, results);
  const shareText = h('textarea', { readonly: '', 'aria-labelledby': 'lh-share' });
  const shareHelp = h('p');
  const shareDialog = h(
    'div',
    { class: 'dialog', hidden: '' },
    h(
      'div',
      { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lh-share' },
      h('h2', { id: 'lh-share' }, strings.shareTitle),
      shareText,
      shareHelp,
      h('button', { type: 'button', 'data-act': 'close-share' }, strings.close),
    ),
  );
  root.append(header, main, shareDialog);
  tk.root.append(root);

  // ─── rendering ───
  const layout = () => {
    const { width, height } = tk.env.size;
    root.setAttribute('data-layout', width >= 560 ? 'wide' : height >= 600 ? 'tall' : 'short');
  };
  const playing = () => attempt.status === 'playing';
  const topWord = () => attempt.ladder.at(-1) ?? attempt.start;
  const dayLabel = (day = attempt.day) =>
    day !== undefined && day >= 1 ? strings.t('dailyLabel', { day }) : strings.preview;

  function bead(ch: string, cls = ''): HTMLElement {
    return h('span', { class: `bead ${cls}`, 'aria-hidden': 'true' }, ch);
  }
  function rung(word: string, cls: string, name: string, changed = -1): HTMLLIElement {
    const li = h('li', { class: `rung ${cls}`, 'aria-label': name });
    [...word].forEach((ch, i) => li.append(bead(ch, i === changed ? 'changed' : '')));
    return li;
  }

  /** The draft rung's 4 tiles: picker buttons, or plain tiles mirroring the field (type entry). */
  let draftBeads: HTMLElement[] = [];
  /** Fills the draft tiles in place (typing and picking never rebuild the ladder) and keeps the draft in view. */
  function updateDraft(): void {
    const isPicker = entry() === 'picker';
    draftBeads.forEach((b, i) => {
      const ch = (isPicker ? draft[i] : field.value[i]) ?? '';
      b.textContent = ch;
      if (!isPicker) return;
      b.setAttribute('aria-pressed', String(i === selected));
      b.setAttribute('aria-label', strings.t('bead', { n: i + 1, letter: ch || strings.empty }));
      b.tabIndex = i === selected ? 0 : -1;
    });
    // Scroll the ladder only (scrollIntoView would also scroll clipped ancestors).
    const d = draftBeads[0]?.parentElement;
    if (!d) return;
    const r = d.getBoundingClientRect();
    const w = ladderWrap.getBoundingClientRect();
    if (r.top < w.top || r.bottom > w.bottom)
      ladderWrap.scrollTop += r.top - w.top - (w.height - r.height) / 2;
  }
  function selectBead(i: number): void {
    selected = i;
    updateDraft();
  }

  function render(): void {
    for (const b of tabs.querySelectorAll('button'))
      b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    for (const b of tiers.querySelectorAll('button'))
      b.setAttribute('aria-checked', String(b.dataset.tier === practice.tier));
    tiers.hidden = mode !== 'practice' || attract;
    tabs.hidden = attract;
    label.textContent =
      mode === 'daily' ? dayLabel() : strings.t('practiceLabel', { tier: strings[practice.tier] });
    count.textContent = strings.t('count', { hops: attempt.hops, par: attempt.par });
    helpMenu.hidden = helpBtn.getAttribute('aria-expanded') !== 'true' || !playing();
    confirmBox.hidden = !confirming;
    confirmText.textContent = mode === 'daily' ? strings.confirmDaily : strings.confirmPractice;
    banner.hidden = !rolloverWaiting;
    helpBtn.hidden = !playing() || attract;
    streakBadge.hidden = mode !== 'daily' || attract;
    if (!streakBadge.hidden) {
      const n = currentStreak(daily.history, tk.env.dailyKey);
      streakBadge.setAttribute('aria-label', strings.t('streak', { n }));
      streakBadge.innerHTML = `${FLAME}${n}`;
    }

    // Ladder, top to bottom: goal, empty par rungs, draft, newest rung … start.
    ladder.setAttribute(
      'aria-label',
      strings.t('ladderName', { start: attempt.start, goal: attempt.goal }),
    );
    const words = [attempt.start, ...attempt.ladder];
    const items: HTMLElement[] = [];
    const solved = attempt.ladder.at(-1) === attempt.goal;
    if (!solved)
      items.push(
        rung(
          attempt.goal,
          'goal',
          strings.t('goalRung', { word: attempt.goal, spelled: spell(attempt.goal) }),
        ),
      );
    const isPicker = entry() === 'picker';
    draftBeads = [];
    if (playing()) {
      for (let i = words.length; i < attempt.par; i++) {
        const li = h('li', { class: 'rung empty', 'aria-hidden': 'true' });
        for (let k = 0; k < 4; k++) li.append(bead(''));
        items.push(li);
      }
      for (let i = 0; i < 4; i++)
        draftBeads.push(
          isPicker
            ? h('button', { type: 'button', class: 'bead', 'data-bead': String(i) })
            : bead(''),
        );
      items.push(
        h(
          'li',
          {
            class: 'rung draft',
            ...(isPicker ? { 'aria-label': strings.picker } : { 'aria-hidden': 'true' }),
          },
          ...draftBeads,
        ),
      );
    }
    for (let i = words.length - 1; i >= 1; i--) {
      const w = words[i]!;
      const changed = [...w].findIndex((ch, k) => ch !== words[i - 1]![k]);
      items.push(
        rung(
          w,
          i === words.length - 1 && w === attempt.goal ? 'goal' : '',
          strings.t('rung', { n: i, word: w, spelled: spell(w), pos: changed + 1 }),
          changed,
        ),
      );
    }
    items.push(
      rung(
        attempt.start,
        'start',
        strings.t('startRung', { word: attempt.start, spelled: spell(attempt.start) }),
      ),
    );
    // Hop stands on the newest rung: the one just below the draft, or the start.
    const frogRung = items[items.length - words.length]!;
    ladderWrap.style.setProperty('--rows', String(items.length));
    const focusedBead = (tk.shadow.activeElement as HTMLElement | null)?.dataset?.bead;
    ladder.replaceChildren(...items);
    if (focusedBead !== undefined) draftBeads[Number(focusedBead)]?.focus({ preventScroll: true });

    tip.textContent = strings.t('tip', { word: topWord().toUpperCase() });
    controls.hidden = !playing();
    fieldLabel.hidden = isPicker;
    picker.hidden = !isPicker;
    modeBtn.textContent = isPicker ? strings.useKeyboard : strings.usePicker;
    modeBtn.hidden = attract;
    climbBtn.disabled = attempt.ladder.length === 0;
    countdownStop?.();
    countdownStop = null;
    results.hidden = playing();
    if (!playing()) renderResults();
    updateDraft();
    frogLi = frogRung;
    placeFrog(frogRung);
    if (attempt.status !== frogStatus) {
      frogStatus = attempt.status;
      frog.classList.toggle('party', frogStatus === 'solved');
      setMood(frogStatus === 'playing' ? 'idle' : frogStatus === 'solved' ? 'happy' : 'sad');
    }
  }

  // ─── Hop the frog and the pond effects ───
  let frogLi: HTMLElement | null = null;
  let frogAt: { x: number; y: number } | null = null;
  let frogJump = false;
  let frogStatus = '';
  let moodTimer: (() => void) | null = null;
  function setMood(m: Mood, ms = 0): void {
    moodTimer?.();
    moodTimer = null;
    frog.dataset.mood = m;
    if (ms)
      moodTimer = tk.timeout(() => {
        frog.dataset.mood = 'idle';
        moodTimer = null;
      }, ms);
  }
  /** Stands Hop at the left end of `li`'s pad; after a hop or climb, leaps there from the old spot (FLIP). */
  function placeFrog(li: HTMLElement): void {
    const at = { x: li.offsetLeft + li.offsetWidth / 2, y: li.offsetTop + li.offsetHeight };
    const from = frogAt;
    frogAt = at;
    frog.style.left = `${at.x}px`;
    frog.style.top = `${at.y}px`;
    if (!frogJump || !from || tk.motion.reduced) return;
    frogJump = false;
    frog.style.setProperty('--dx', `${from.x - at.x}px`);
    frog.style.setProperty('--dy', `${from.y - at.y}px`);
    frog.classList.remove('jump');
    void frog.offsetWidth;
    frog.classList.add('jump');
    if (at.y < from.y) {
      effect('splash', at.x, at.y, 750);
      tk.timeout(() => sparkle(at.x, at.y - li.offsetHeight / 2), 260);
    }
  }
  function effect(cls: string, x: number, y: number, ms: number, style = ''): void {
    const e = h('span', { class: cls, style: `left:${x}px;top:${y}px;${style}` });
    ladderWrap.append(e);
    tk.timeout(() => e.remove(), ms);
  }
  function sparkle(x: number, y: number): void {
    for (let i = 0; i < 8; i++)
      effect(
        'spark',
        x,
        y,
        800,
        `--a:${i * 45 + 20}deg;--c:${SPARK_COLORS[i % 4]};--r:${70 + (i % 3) * 22}px`,
      );
  }
  function celebrate(): void {
    if (tk.motion.reduced) return;
    const box = h('div', { class: 'confetti', style: `--fall:${root.clientHeight + 40}px` });
    for (let i = 0; i < 28; i++) {
      const style = `left:${(i * 53) % 100}%;--x:${((i * 37) % 100) - 50}px;--r:${(i % 2 ? 1 : -1) * (200 + i * 23)}deg;background:${CONFETTI[i % 6]};animation-delay:${(i % 7) * 0.06}s`;
      box.append(h('i', { style }));
    }
    root.append(box);
    tk.timeout(() => box.remove(), 2400);
    if (frogAt) sparkle(frogAt.x, frogAt.y - 30);
  }

  let countdownStop: (() => void) | null = null;
  function renderResults(): void {
    const a = attempt;
    const status = a.status as Finished;
    const r = rate(a.hops, a.par, status);
    const parts: HTMLElement[] = [
      h('h2', { id: 'lh-results', tabindex: '-1' }, r.label),
      h('p', {}, strings.t('hopsVsPar', { hops: a.hops, par: a.par })),
    ];
    if (r.marks !== null) {
      const marks = r.marks;
      const leaves = h('p', {
        class: 'leaves',
        role: 'img',
        'aria-label': strings.t('marks', { n: marks }),
      });
      leaves.innerHTML = [0, 1, 2].map((i) => leaf(i < marks)).join('');
      parts.push(leaves);
    }
    if (a.ladder.length)
      parts.push(
        h('h3', {}, strings.resultsYour),
        h('ol', { class: 'words' }, ...[a.start, ...a.ladder].map((w) => h('li', {}, w))),
      );
    const way = h('ol', { class: 'words' });
    parts.push(h('h3', {}, strings.resultsWay), way);
    // the shortest-ladder search runs after paint
    tk.timeout(() => way.replaceChildren(...shownWay(a).map((w) => h('li', {}, w))), 0);
    if (mode === 'daily') {
      const streak = currentStreak(daily.history, tk.env.dailyKey);
      const cd = h('p');
      const tick = () => {
        const now = new Date();
        const next =
          new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
        const min = Math.floor(next / 60_000);
        cd.textContent =
          min <= 0
            ? strings.anyMoment
            : strings.t('nextIn', {
                h: Math.floor(min / 60),
                mm: String(min % 60).padStart(2, '0'),
              });
      };
      tick();
      countdownStop = tk.interval(tick, 60_000);
      const streakLine = h('p', { class: 'streak' }, strings.t('streak', { n: streak }));
      streakLine.insertAdjacentHTML('afterbegin', FLAME);
      parts.push(
        streakLine,
        h('p', {}, strings.t('bestStreak', { n: Math.max(daily.bestStreak, streak) })),
        cd,
        h('button', { type: 'button', 'data-act': 'share' }, strings.share),
        h(
          'button',
          { type: 'button', class: 'primary', 'data-act': 'to-practice' },
          strings.practiceNow,
        ),
      );
    } else
      parts.push(
        h('button', { type: 'button', class: 'primary', 'data-act': 'next' }, strings.nextLadder),
      );
    results.replaceChildren(...parts);
  }

  function shareTextFor(a: Attempt): string {
    const S = a.start.toUpperCase();
    const G = a.goal.toUpperCase();
    const head =
      a.day !== undefined && a.day >= 1
        ? `Letterhop daily #${a.day} (${a.dailyKey})`
        : `Letterhop daily preview (${a.dailyKey})`;
    const r = rate(a.hops, a.par, a.status as Finished);
    const lines = [head];
    if (a.status === 'solved')
      lines.push(`${S} to ${G}: ${a.hops} hops, par ${a.par}`, `Rating: ${r.label} (${r.marks}/3)`);
    else if (a.status === 'revealed')
      lines.push(`${S} to ${G}: shown the way after ${a.hops} hops, par ${a.par}`);
    else lines.push(`${S} to ${G}: out of rungs at 50 hops, par ${a.par}`);
    lines.push(`Streak: ${currentStreak(daily.history, tk.env.dailyKey)} days`);
    return lines.join('\n');
  }

  // ─── actions ───
  const draftWord = () => (entry() === 'picker' ? draft.join('') : field.value);
  function clearEntry(): void {
    field.value = '';
    draft = [...topWord()];
    selected = 0;
  }
  function focusEntry(): void {
    if (attract || !playing()) return;
    if (entry() === 'type') {
      if (tk.env.input.primary !== 'touch') field.focus({ preventScroll: true });
    } else draftBeads[selected]?.focus({ preventScroll: true });
  }

  function hop(): void {
    if (!playing()) return;
    const r = validateHop(dict, draftWord(), topWord(), [attempt.start, ...attempt.ladder]);
    if (!r.ok) {
      msg.textContent = strings[ERRORS[r.code]] as string;
      setMood('sad', 1100);
      if (!tk.motion.reduced) {
        for (const el of [controls, ladder.querySelector<HTMLElement>('.draft')]) {
          el?.classList.remove('shake');
          void el?.offsetWidth;
          el?.classList.add('shake');
        }
      }
      tk.announce(msg.textContent, 'assertive');
      tk.sfx.play('hit', { volume: 0.4 });
      return;
    }
    tk.run.begin();
    attempt.ladder.push(r.word);
    attempt.hops++;
    frogJump = true;
    setMood('happy', 1000);
    msg.textContent = '';
    clearEntry();
    const over = attempt.hops - attempt.par;
    const params = {
      hops: attempt.hops,
      word: r.word,
      spelled: spell(r.word),
      pos: r.changedAt + 1,
      letter: r.word[r.changedAt]!,
      par: attempt.par,
      over,
    };
    if (!attract) tk.announce(strings.t(over > 0 ? 'hoppedOver' : 'hopped', params));
    persist();
    if (r.word === attempt.goal) {
      tk.sfx.play('win');
      void finish('solved');
    } else if (attempt.hops >= HOP_CAP) {
      tk.sfx.play('lose');
      void finish('out_of_hops');
    } else {
      tk.sfx.play('click');
      draft = [...r.word];
      render();
      focusEntry();
    }
  }

  function climbDown(): void {
    if (!playing() || attempt.ladder.length === 0) return;
    attempt.ladder.pop();
    attempt.climbs++;
    frogJump = true;
    clearEntry();
    persist();
    if (!attract) tk.announce(strings.t('climbed', { word: topWord(), hops: attempt.hops }));
    render();
    focusEntry();
  }

  async function finish(status: Finished): Promise<void> {
    const a = attempt;
    a.status = status;
    confirming = false;
    helpBtn.setAttribute('aria-expanded', 'false');
    if (status === 'solved' && a.hops < a.par)
      tk.reportError(new Error(`Letterhop data: ${a.puzzleId} solved in ${a.hops} < par ${a.par}`));
    let scores: Array<{ board: string; value: number }> = [];
    if (!attract && mode === 'daily' && a.dailyKey) {
      // Flush, then re-read the save: another tab may already have finished this daily.
      await dailySave.flush();
      const fresh = (await dailySave.load()).data;
      const done = fresh.history[a.dailyKey];
      if (done) daily = fresh;
      else {
        const history = trimHistory({
          ...fresh.history,
          [a.dailyKey]: { h: a.hops, p: a.par, s: status },
        });
        const streak = currentStreak(history, tk.env.dailyKey);
        daily = {
          current: a as DailySaveV1['current'],
          history,
          bestStreak: Math.max(fresh.bestStreak, streak),
        };
        dailySave.set(daily);
        await dailySave.flush();
        if (status === 'solved')
          scores = [
            { board: 'daily-moves', value: a.hops },
            { board: 'streak', value: streak },
          ];
      }
    } else if (!attract) {
      const t = practice.totals;
      const totals = {
        ...t,
        solved: t.solved + (status === 'solved' ? 1 : 0),
        onPar: t.onPar + (status === 'solved' && a.hops <= a.par ? 1 : 0),
        revealed: t.revealed + (status === 'revealed' ? 1 : 0),
      };
      practice = { ...practice, totals, current: { ...practice.current, [practice.tier]: a } };
      practiceSave.set(practice);
    }
    render();
    if (status === 'solved') celebrate();
    if (!attract) {
      const path = shownWay(a).join(', ');
      const rating = rate(a.hops, a.par, status).label;
      tk.announce(
        status === 'solved'
          ? strings.t('solvedSay', {
              start: a.start,
              goal: a.goal,
              hops: a.hops,
              par: a.par,
              rating,
            })
          : strings.t(status === 'revealed' ? 'revealedSay' : 'outSay', { path }),
      );
    }
    const title =
      status === 'solved'
        ? strings.t('solvedTitle', { hops: a.hops })
        : status === 'revealed'
          ? strings.revealedTitle
          : strings.outTitle;
    await tk.ui.gameOver({
      title,
      scores,
      ...(scores.length ? { meta: { dailyKey: a.dailyKey!, day: a.day!, par: a.par } } : {}),
    });
    if (tk.signal.aborted) return;
    if (attract) return startAttract();
    (results.querySelector('#lh-results') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  function setMode(m: Mode): void {
    if (m === mode) return;
    if (tk.run.active) tk.run.end('menu');
    mode = m;
    show(m === 'daily' ? dailyAttempt(tk.env.dailyKey) : practiceAttempt(practice.tier));
  }

  /** Switches to `a` with a fresh entry and announces it. */
  function show(a: Attempt): void {
    attempt = a;
    tk.ui.setRestartConfirm(mode === 'daily' ? strings.restartDaily : null);
    clearEntry();
    render();
    announceReady();
  }

  function announceReady(): void {
    if (attract || !playing()) return;
    tk.announce(
      mode === 'daily'
        ? strings.t('readyDaily', {
            label: dayLabel(),
            start: attempt.start,
            goal: attempt.goal,
            par: attempt.par,
          })
        : strings.t('readyPractice', {
            tier: strings[practice.tier].toLowerCase(),
            start: attempt.start,
            goal: attempt.goal,
            par: attempt.par,
          }),
    );
  }

  function startAttract(): void {
    show({
      puzzleId: 'attract',
      length: 4,
      ...ATTRACT_PUZZLE,
      ladder: [],
      hops: 0,
      climbs: 0,
      startedAt: '',
      status: 'playing',
    });
  }

  function act(name: string | undefined): void {
    switch (name) {
      case 'hop':
        return hop();
      case 'clear':
        clearEntry();
        msg.textContent = '';
        render();
        return focusEntry();
      case 'climb':
        return climbDown();
      case 'mode':
        settings = { entry: entry() === 'picker' ? 'type' : 'picker' };
        settingsSave.set(settings);
        shownEntry = entry();
        clearEntry();
        render();
        return focusEntry();
      case 'reveal':
        confirming = true;
        return render();
      case 'cancel':
        confirming = false;
        return render();
      case 'confirm':
        return void finish('revealed');
      case 'today': {
        rolloverWaiting = false;
        const cur = daily.current;
        if (cur?.status === 'playing' && cur.dailyKey !== tk.env.dailyKey) expire(cur);
        return show(dailyAttempt(tk.env.dailyKey));
      }
      case 'share': {
        shareText.value = shareTextFor(attempt);
        shareHelp.textContent =
          tk.env.input.primary === 'touch' ? strings.shareHelpTouch : strings.shareHelpKeys;
        shareDialog.hidden = false;
        main.inert = true;
        header.inert = true;
        shareText.focus();
        shareText.select();
        return;
      }
      case 'close-share':
        return closeShare();
      case 'to-practice':
        return setMode('practice');
      case 'next':
        show(practiceAttempt(practice.tier, true));
        return focusEntry();
    }
  }
  function closeShare(): void {
    shareDialog.hidden = true;
    main.inert = false;
    header.inert = false;
    (results.querySelector('[data-act=share]') as HTMLElement | null)?.focus();
  }

  function pickLetter(ch: string): void {
    if (!playing()) return;
    tk.run.begin();
    draft[selected] = ch;
    if (!attract)
      tk.announce(
        strings.t('letterSet', { n: selected + 1, letter: ch, draft: spell(draft.join('')) }),
      );
    updateDraft();
  }

  // ─── listeners (delegated; every target is inside the shadow root) ───
  tk.listen(root, 'click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t) return;
    if (t === helpBtn) {
      helpBtn.setAttribute(
        'aria-expanded',
        String(helpBtn.getAttribute('aria-expanded') !== 'true'),
      );
      return render();
    }
    if (t.dataset.mode) return setMode(t.dataset.mode as Mode);
    if (t.dataset.tier && t.dataset.tier !== practice.tier) {
      if (tk.run.active) tk.run.end('menu');
      practice = { ...practice, tier: t.dataset.tier as Tier };
      practiceSave.set(practice);
      return show(practiceAttempt(practice.tier));
    }
    if (t.dataset.bead) return selectBead(Number(t.dataset.bead));
    if (t.dataset.letter) return pickLetter(t.dataset.letter);
    act(t.dataset.act);
  });
  tk.listen(field, 'input', () => {
    const clean = field.value
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .slice(0, 4);
    if (clean !== field.value) field.value = clean;
    if (clean) tk.run.begin(); // the first typed character starts the run
    msg.textContent = '';
    updateDraft();
  });
  tk.listen(field, 'keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      hop();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && field.value === '') {
      e.preventDefault();
      climbDown();
    }
  });
  tk.listen(picker, 'keydown', (e) => {
    const keys = [...picker.querySelectorAll<HTMLButtonElement>('button')];
    const i = keys.indexOf(tk.shadow.activeElement as HTMLButtonElement);
    const cols = getComputedStyle(picker).gridTemplateColumns.split(' ').length || 7;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (i < 0 || step === undefined) return;
    e.preventDefault();
    const next = keys[Math.min(keys.length - 1, Math.max(0, i + step))]!;
    for (const k of keys) k.tabIndex = k === next ? 0 : -1;
    next.focus();
  });
  tk.listen(ladder, 'keydown', (e) => {
    if (
      (e.target as HTMLElement).dataset.bead === undefined ||
      (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')
    )
      return;
    e.preventDefault();
    selectBead((selected + (e.key === 'ArrowRight' ? 1 : 3)) % 4);
    draftBeads[selected]?.focus();
  });
  tk.listen(shareDialog, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation(); // Escape closes the share dialog, not the pause menu
    closeShare();
  });

  // Attract drives the picker through named virtual actions (attract.ts).
  for (let i = 0; i < 4; i++) tk.input.on(`bead:${i}`, (e) => e.phase === 'press' && selectBead(i));
  for (const ch of ALPHABET) tk.input.on(`key:${ch}`, (e) => e.phase === 'press' && pickLetter(ch));
  tk.input.on('hop', (e) => e.phase === 'press' && hop());

  tk.on('resize', () => {
    layout();
    if (frogLi) placeFrog(frogLi);
  });
  let shownEntry = entry();
  tk.on('inputchange', () => {
    // Auto-follow only when the effective mode changes: keyboard ↔ pointer keeps Type entry.
    if (entry() === shownEntry) return;
    shownEntry = entry();
    clearEntry();
    render();
  });
  tk.on('dailyrollover', ({ dailyKey }) => {
    if (attract) return;
    if (mode === 'daily' && playing()) {
      rolloverWaiting = true; // the attempt keeps its own dailyKey; focus does not move
      render();
      return tk.announce(strings.rolloverPlaying);
    }
    expireOld(dailyKey);
    if (mode === 'daily') {
      attempt = dailyAttempt(dailyKey);
      clearEntry();
      render();
    }
    tk.announce(strings.t('rolloverIdle', { label: dayLabel(slot(dailyKey).day) }));
  });
  tk.ui.onRestart(() => {
    // Daily climbs back to the start word and keeps its hop count; practice restarts the same puzzle.
    if (!playing()) return;
    if (mode === 'daily') attempt.ladder = [];
    else Object.assign(attempt, { ladder: [], hops: 0, climbs: 0 });
    clearEntry();
    persist();
    render();
  });

  // ─── start ───
  layout();
  if (attract) startAttract();
  else {
    expireOld(tk.env.dailyKey);
    const a = dailyAttempt(tk.env.dailyKey);
    rolloverWaiting = a.status === 'playing' && a.dailyKey !== tk.env.dailyKey;
    show(a);
    focusEntry();
  }
  tk.loading(1);
  return {};
}
