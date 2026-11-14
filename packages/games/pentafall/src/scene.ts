// The Pentafall scene: steps the pure simulation at 60 Hz and draws it. The layout follows the visible frame
// (layout.ts) and is rebuilt when the frame changes shape. Cells are pooled images that change only when the well,
// the piece or the conveyor changes; effects (clears, drop streaks, squash, danger, level-up) are short and never
// hold up input.
import type Phaser from 'phaser';
import {
  colorNum,
  colors,
  createRng,
  formatScore,
  mixHex,
  prng,
  type Save,
} from '@pocketcade/toolkit';
import {
  backdrop,
  burst,
  canvasImage,
  canvasTexture,
  flash,
  hudPill,
  popText,
  shake,
  texScale,
  type HudIcon,
  type HudPill,
  type SceneFactory,
} from '@pocketcade/toolkit/phaser';
import { plan } from './ai.ts';
import { ATTRACT_PILE, ATTRACT_QUEUE, OPENING, type AttractView } from './attract.ts';
import * as art from './draw.ts';
import { frameFor, VIS_ROWS, type Frame, type Rect } from './layout.ts';
import { meta } from './meta.ts';
import { boxCells, family, isMirror, PIECE_IDS, type Cell, type PieceId } from './pieces.ts';
import {
  isRunOrNull,
  isStatsV1,
  withRun,
  zeroStats,
  type RunSaveV1,
  type StatsSaveV1,
} from './save.ts';
import {
  cellsOf,
  COLS,
  createSim,
  HIDDEN_ROWS,
  LINES_PER_LEVEL,
  MAX_LEVEL,
  ROWS,
  type Action,
  type Board,
  type Input,
  type Piece,
  type Sim,
  type SimEvent,
} from './sim.ts';
import { strings } from './strings.ts';

const W = 720;
const H = 720;
const STEP_MS = 1000 / 60;
const COUNTDOWN_MS = 1200;
/** Line clear: the full rows flash and flatten, then the rows above drop and settle. */
const FLASH_MS = 90;
const COLLAPSE_MS = 170;
const SQUASH_MS = 150;
/** Game over: the pile turns to stone one row at a time, bottom first. */
const FILL_ROW_MS = 22;
/** The danger state shows while anything has settled in the top rows of the well. */
const DANGER_ROWS = 4;
/** The look changes every three levels: rim colour and the two sky glows. */
const ZONES = [
  { rim: colors.purple, sky: [colors.violet, colors.pink] },
  { rim: colors.sky, sky: [colors.blue, colors.sky] },
  { rim: colors.pink, sky: [colors.pink, colors.orange] },
  { rim: colors.green, sky: [colors.green, colors.sky] },
  { rim: colors.gold, sky: [colors.orange, colors.gold] },
  { rim: colors.lime, sky: [colors.green, colors.violet] },
  { rim: colors.text, sky: [colors.sky, colors.pink] },
] as const;
const zoneOf = (level: number) => Math.min(ZONES.length - 1, Math.floor((level - 1) / 3));
const BUTTONS = [
  { label: strings.turnLeft, color: colors.sky, icon: 'turnLeft', action: 'turnLeft' },
  { label: strings.stashButton, color: colors.pink, icon: 'stash', action: 'stash' },
  { label: strings.drop, color: colors.orange, icon: 'drop', action: 'slam' },
] as const;
const KEYS: Record<Exclude<Action, 'nudgeLeft' | 'nudgeRight' | 'fastRow'>, string[]> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  fast: ['ArrowDown', 'KeyS'],
  slam: ['Space'],
  turnRight: ['ArrowUp', 'KeyX', 'KeyW'],
  turnLeft: ['KeyZ', 'KeyQ'],
  stash: ['KeyC', 'ShiftLeft', 'ShiftRight'],
};
const CLEAR_DETUNE = [0, 0, 200, 400, 700];
const COUNTERS = ['score', 'level', 'lines'] as const;
const CONFETTI = [colors.gold, colors.pink, colors.sky, colors.lime, colors.purple, colors.orange];
const pieceAt = (i: number) => PIECE_IDS[i]!;
const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

type Txt = Phaser.GameObjects.Text;
type Img = Phaser.GameObjects.Image;
type G = Phaser.GameObjects.Graphics;

export const createScenes: SceneFactory = (_P, kit) => {
  class Play extends kit.Scene {
    private sim!: Sim;
    private seed = '';
    private runSave!: Save<RunSaveV1 | null>;
    private statsSave!: Save<StatsSaveV1>;
    private stats: StatsSaveV1 = zeroStats();
    private queue: Input[] = [];
    private acc = 0;
    private countdown = 0;
    private simSteps = 0;
    private serial = 0;
    private ending = false;
    private overAt = -1;

    private f!: Frame;
    private frameKey = '';
    /** everything that depends on the layout and is rebuilt with it */
    private chrome: Phaser.GameObjects.GameObject[] = [];
    /** textures drawn for the current layout's sizes */
    private sized = new Set<string>();
    /** scale that shows a render-scale texture at its design size */
    private unit = 1;

    private boardDirty = true;
    private uiDirty = true;
    /** what drawPiece() last drew; the sim replaces the piece object on every change */
    private drawnPiece: Piece | null = null;
    private drawnPhase = '';
    /** the falling piece is drawn this far from its cell and eases into place */
    private slide = { x: 0, y: 0 };
    private clearing: { before: Board; rows: number[]; shift: number[]; t0: number } | null = null;
    private squash: { cells: Cell[]; t0: number; amount: number } | null = null;
    private fillT0 = -1;
    /** null until first drawn */
    private danger: boolean | null = null;
    private zone = -1;
    private shown = { score: -1, level: -1, lines: -1, goal: -1 };
    private drag: { axis: 'h' | 'v' | 'up' | null; cols: number; rows: number } | null = null;

    private board: Img[] = [];
    private active: Img[] = [];
    private whites: Img[] = [];
    private streaks: Img[] = [];
    private previews: Img[][] = [];
    private skyGlows: Img[] = [];
    private dangerGlow!: Img;
    private g!: { shadow: G; rim: G; rails: G };
    private hud!: { score: HudPill; level: HudPill; lines: HudPill };
    private t!: { prompt: Txt; banner: Txt; digit: Txt };
    private buttons!: Phaser.GameObjects.Container;
    private hint!: Txt;

    constructor() {
      super('play');
    }

    create(): void {
      const tk = this.tk;
      this.makeScenery();
      this.makePools();
      this.layout();
      tk.on('resize', () => this.layout());
      tk.input.configure({
        actions: Object.fromEntries(Object.entries(KEYS).map(([a, codes]) => [a, { codes }])),
      });
      for (const action of Object.keys(KEYS) as Action[])
        tk.input.on(action, (e) => this.queue.push({ action, down: e.phase === 'press' }));
      this.bindTouch();
      tk.on('pause', () => {
        this.sim?.releaseAll();
        this.queue = [];
      });
      tk.on('resume', () => {
        this.acc = 0;
        if (this.sim && (this.sim.phase === 'falling' || this.sim.phase === 'entry') && !tk.attract)
          this.countdown = COUNTDOWN_MS;
      });
      tk.on('inputchange', () => this.showHints());
      tk.ui.onRestart(() => {
        void this.runSave.clear();
        this.newRun(null);
      });
      this.runSave = tk.createSave<RunSaveV1 | null>({
        key: 'run',
        defaults: () => null,
        validate: isRunOrNull,
      });
      this.statsSave = tk.createSave<StatsSaveV1>({
        key: 'stats',
        defaults: zeroStats,
        validate: isStatsV1,
      });
      tk.deferReady();
      const launch = tk.ctx.launch;
      const run =
        launch === 'play'
          ? this.runSave.load().then((l) => l.data)
          : launch === 'restart'
            ? this.runSave.clear().then(() => null)
            : Promise.resolve(null);
      const stats = tk.attract
        ? Promise.resolve(zeroStats())
        : this.statsSave.load().then((l) => l.data);
      void Promise.all([run, stats])
        .then(([r, s]) => {
          if (tk.signal.aborted) return; // unmounted while loading
          this.stats = s;
          this.newRun(r);
        })
        .catch((e: unknown) => {
          tk.reportError(e);
          if (!tk.signal.aborted) this.newRun(null);
        })
        .finally(() => tk.ready());
    }

    // ─── objects made once per mount ───
    private makeScenery(): void {
      canvasTexture(this, 'pf-glow', 64, 64, (ctx, s) => art.glow(ctx, s), { scale: 1 });
      canvasTexture(this, 'pf-streak', 16, 64, (ctx, w, h) => art.fade(ctx, w, h, '#FFFFFF', 1), {
        scale: 1,
      });
      canvasTexture(
        this,
        'pf-danger',
        16,
        64,
        (ctx, w, h) => art.fade(ctx, w, h, colors.vermillion, 0.6),
        { scale: 1 },
      );
      // Slightly oversized so a camera shake never shows past its edge.
      backdrop(this, 'pf-backdrop', W, H, {
        stops: ['#2A1F60', '#170F3E', '#120C2C', '#1F0F40'],
        stars: 70,
        seed: 23,
      })
        .setOrigin(0.5)
        .setPosition(W / 2, H / 2)
        .setScale(1.04);
      for (let i = 0; i < 2; i++)
        this.skyGlows.push(
          this.add.image(0, 0, 'pf-glow').setDepth(-950).setBlendMode('ADD').setAlpha(0.3),
        );
    }

    private makePools(): void {
      const img = (depth: number) =>
        this.add.image(0, 0, 'pf-glow').setDepth(depth).setVisible(false);
      this.dangerGlow = img(0.5).setOrigin(0, 0).setFlipY(true);
      for (let i = 0; i < VIS_ROWS * COLS; i++) this.board.push(img(1));
      for (let i = 0; i < 5; i++) {
        this.streaks.push(img(2).setOrigin(0.5, 1).setTexture('pf-streak').setBlendMode('ADD'));
        this.active.push(img(3));
        this.whites.push(img(4));
      }
      for (let s = 0; s < 4; s++) this.previews.push(Array.from({ length: 5 }, () => img(7)));
      this.g = {
        shadow: this.add.graphics().setDepth(2),
        rim: this.add.graphics().setDepth(5),
        rails: this.add.graphics().setDepth(5),
      };
      const text = (px: number, color = 'text') =>
        kit
          .text(this, 0, 0, '', {
            px,
            color,
            stroke: 'ink',
            strokePx: Math.max(4, Math.round(px * 0.18)),
          })
          .setOrigin(0.5)
          .setDepth(10);
      this.t = {
        prompt: text(30),
        banner: text(20, 'textMuted').setText(strings.continuing),
        digit: text(120),
      };
      if (!this.tk.motion.reduced)
        this.tweens.add({
          targets: this.t.prompt,
          alpha: 0.6,
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
    }

    // ─── layout: everything below is rebuilt when the frame changes shape ───
    private cellX(x: number): number {
      return this.f.well.x + x * this.f.cell;
    }
    private cellY(y: number): number {
      return this.f.well.y + (y - HIDDEN_ROWS) * this.f.cell;
    }
    private tex(
      key: string,
      w: number,
      h: number,
      draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
    ): string {
      this.sized.add(key);
      return canvasTexture(this, key, w, h, draw);
    }

    private layout(): void {
      const { view, cssWidth } = this.tk.layout;
      const f = frameFor(view, cssWidth);
      const key = JSON.stringify([f, view]);
      if (key === this.frameKey) return;
      this.frameKey = key;
      this.f = f;
      for (const o of this.chrome) {
        this.tweens.killTweensOf(o);
        if ('list' in o) this.tweens.killTweensOf((o as Phaser.GameObjects.Container).list);
        o.destroy();
      }
      this.chrome = [];
      const old = this.sized;
      this.sized = new Set();
      const { cell, mini, well } = f;

      // Cell art at exactly the sizes this layout shows, so nothing is ever scaled.
      for (const size of [cell, mini])
        for (const id of PIECE_IDS) {
          const fam = art.FAMILY[family(id)];
          for (const settled of [false, true])
            this.tex(art.cellKey(id, settled, size), size, size, (ctx, s) =>
              art.jelly(ctx, s, fam.color, fam.shape, isMirror(id), settled),
            );
        }
      const stone = this.tex(`pf-stone-${cell}`, cell, cell, (ctx, s) => art.stone(ctx, s));
      const white = this.tex(`pf-white-${cell}`, cell, cell, (ctx, s) => art.white(ctx, s));
      this.unit = 1 / texScale(this, stone);

      this.buildScenery();
      this.buildWell();
      this.buildHud();

      this.board.forEach((img, i) =>
        img
          .setTexture(stone)
          .setScale(this.unit)
          .setPosition(
            this.cellX(i % COLS) + cell / 2,
            this.cellY(HIDDEN_ROWS + Math.floor(i / COLS)) + cell / 2,
          )
          .setVisible(false),
      );
      for (const img of this.active) img.setTexture(stone).setScale(this.unit);
      for (const img of this.whites) img.setTexture(white).setScale(this.unit).setAlpha(0);
      for (const img of this.previews.flat())
        img.setTexture(art.cellKey('I', false, mini)).setScale(this.unit);
      this.dangerGlow
        .setTexture('pf-danger')
        .setPosition(well.x, well.y)
        .setDisplaySize(well.w, cell * DANGER_ROWS);
      const cx = well.x + well.w / 2;
      this.t.prompt.setPosition(cx, well.y + well.h * 0.36);
      this.t.banner.setPosition(cx, well.y + well.h * 0.36 + 44);
      this.t.digit.setPosition(cx, well.y + well.h * 0.45);

      for (const k of old) if (!this.sized.has(k)) this.textures.remove(k);
      this.squash = null;
      this.slide = { x: 0, y: 0 };
      this.boardDirty = this.uiDirty = true;
      this.drawnPiece = null;
      this.drawnPhase = '';
      this.danger = null;
      this.shown = { score: -1, level: -1, lines: -1, goal: -1 };
      this.showHints();
      if (this.sim) this.render();
    }

    private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
      this.chrome.push(o);
      return o;
    }

    /** Sky glows, the skyline along the bottom of the view and drifting motes. */
    private buildScenery(): void {
      const v = this.tk.layout.view;
      const base = v.y + v.height;
      const size = Math.max(v.width, v.height) * 0.9;
      this.skyGlows[0]!.setPosition(v.x + v.width * 0.2, v.y + v.height * 0.25).setDisplaySize(
        size,
        size,
      );
      this.skyGlows[1]!.setPosition(v.x + v.width * 0.85, v.y + v.height * 0.8).setDisplaySize(
        size,
        size,
      );
      const g = this.keep(this.add.graphics().setDepth(-900));
      const rnd = prng(0x5c1);
      for (const near of [false, true]) {
        let x = v.x - 20;
        while (x < v.x + v.width) {
          const bw = 44 + rnd() * 60;
          const bh = v.height * (near ? 0.06 + rnd() * 0.13 : 0.15 + rnd() * 0.14);
          g.fillStyle(near ? 0x1a1248 : 0x261c5e, near ? 1 : 0.75).fillRect(x, base - bh, bw, bh);
          if (near)
            for (let wy = base - bh + 10; wy < base - 12; wy += 22)
              for (let wx = x + 8; wx < x + bw - 12; wx += 16)
                if (rnd() < 0.3)
                  g.fillStyle(colorNum(rnd() < 0.7 ? 'gold' : 'sky'), 0.45).fillRect(wx, wy, 6, 9);
          x += bw + 4;
        }
      }
      const tints = [colors.purple, colors.sky, colors.pink];
      for (let i = 0; i < 14; i++) {
        const x = v.x + rnd() * v.width;
        const y = v.y + v.height * (0.35 + rnd() * 0.65);
        const d = 8 + rnd() * 12;
        const m = this.keep(
          this.add
            .image(x, y, 'pf-glow')
            .setDepth(-880)
            .setAlpha(0.25 + rnd() * 0.3)
            .setDisplaySize(d, d)
            .setBlendMode('ADD')
            .setTint(colorNum(tints[i % 3]!)),
        );
        if (!this.tk.motion.reduced)
          this.tweens.add({
            targets: m,
            y: y - 140 - rnd() * 200,
            x: x + (rnd() - 0.5) * 40,
            alpha: 0,
            duration: 6000 + rnd() * 5000,
            delay: rnd() * 3000,
            repeat: -1,
          });
      }
    }

    /** The dark glass well with faint column stripes; the rim and rails are drawn on top (drawRim, drawRails). */
    private buildWell(): void {
      const { well: w, cell } = this.f;
      const g = this.keep(this.add.graphics().setDepth(0));
      g.fillStyle(0x0b0722, 1).fillRoundedRect(w.x - 8, w.y - 8, w.w + 16, w.h + 16, 14);
      g.fillGradientStyle(0x120a33, 0x120a33, 0x2a1466, 0x2a1466, 1).fillRect(w.x, w.y, w.w, w.h);
      g.fillStyle(0xffffff, 0.035);
      for (let x = 1; x < COLS; x += 2) g.fillRect(w.x + x * cell, w.y, cell, w.h);
    }

    private buildHud(): void {
      const f = this.f;
      const g = this.keep(this.add.graphics().setDepth(6));
      const panel = (r: Rect, accent: string) => {
        g.fillStyle(0x160e3a, 0.92).fillRoundedRect(r.x, r.y, r.w, r.h, 16);
        g.lineStyle(3, colorNum(accent), 1).strokeRoundedRect(r.x, r.y, r.w, r.h, 16);
      };
      panel(f.stash, colors.pink);
      panel(f.next, colors.sky);
      // The piece that comes next sits on a lighter tile.
      const first = f.slots[1];
      const [sw, sh] = [Math.min(5 * f.mini + 12, f.next.w - 12), 3 * f.mini + 6];
      g.fillStyle(0xffffff, 0.09).fillRoundedRect(first.x - sw / 2, first.y - sh / 2, sw, sh, 10);
      const label = (r: Rect, value: string, color: string) =>
        this.keep(kit.text(this, r.x + 14, r.y + 7, value, { px: 18, color }).setDepth(7));
      label(f.stash, strings.stash, 'pink');
      label(f.next, strings.next, 'sky');

      const pill = (r: Rect, text: string, icon: HudIcon, accent: string) => {
        const p = hudPill(this, r.x, r.y, {
          icon: r.w < 150 ? 'none' : icon,
          accent,
          label: text,
          width: r.w,
          height: r.h,
          depth: 6,
        });
        this.keep(p.container);
        return p;
      };
      this.hud = {
        score: pill(f.pills[0], strings.score, 'star', colors.gold),
        level: pill(f.pills[1], strings.levelLabel, 'bolt', colors.violet),
        lines: pill(f.pills[2], strings.lines, 'flag', colors.sky),
      };
      // The lines pill wears a custom "rows" badge (same size as the stock icon).
      if (f.pills[2].w >= 150) {
        const size = Math.round(f.pills[2].h * 0.72);
        const badge = this.tex(`pf-badge-${size}`, size, size, (ctx, s) =>
          art.badge(ctx, s, colors.sky, 'lines'),
        );
        (this.hud.lines.container.list[1] as Img)
          .setTexture(badge)
          .setScale(1 / texScale(this, badge));
      }

      const parts = BUTTONS.flatMap((b, i) => {
        const r = f.buttons[i]!;
        const k = this.tex(`pf-btn${i}-${r.w}x${r.h}`, r.w, r.h, (ctx, w, h) =>
          art.button(ctx, w, h, b.color, b.icon),
        );
        return [
          canvasImage(this, r.x + r.w / 2, r.y + r.h / 2, k),
          kit
            .text(this, r.x + r.w / 2, r.y + r.h * 0.72, b.label, { px: 22, color: 'ink' })
            .setOrigin(0.5),
        ];
      });
      this.buttons = this.keep(this.add.container(0, 0, parts).setDepth(6));
      this.hint = this.keep(
        kit
          .text(this, f.hint.x, f.hint.y, f.wide ? strings.keyList : strings.keyHint, {
            px: 19,
            color: 'textMuted',
            weight: 600,
          })
          .setOrigin(f.wide ? 0 : 0.5, f.wide ? 0 : 0.5)
          .setLineSpacing(7)
          .setDepth(6),
      );
    }

    private showHints(): void {
      const touch = this.tk.env.input.primary === 'touch' && !this.tk.attract;
      this.buttons.setVisible(touch);
      this.hint.setVisible(!touch && !this.tk.attract);
      this.t.prompt.setText(touch ? strings.readyTouch : strings.ready);
    }

    // ─── touch: tap turns, drags move and drop faster, a flick down drops now, a swipe up stashes ───
    private bindTouch(): void {
      const tk = this.tk;
      const push = (action: Action) => this.queue.push({ action, down: true });
      /** CSS px of finger travel per cell: the piece follows the finger, within sensible limits */
      const stepPx = () =>
        Math.min(44, Math.max(18, (this.f.cell * tk.layout.cssWidth) / tk.layout.view.width));
      tk.input.onGesture('tap', (e) => {
        if (e.pointerType !== 'touch') return; // a mouse click only focuses the stage
        const hit = this.buttons.visible
          ? BUTTONS.find((_, i) => inside(this.f.buttons[i]!, e.x, e.y))
          : undefined;
        push(hit ? hit.action : 'turnRight');
      });
      tk.input.onGesture('dragstart', () => (this.drag = { axis: null, cols: 0, rows: 0 }));
      tk.input.onGesture('drag', (e) => {
        const d = this.drag;
        if (!d) return;
        const step = stepPx();
        if (!d.axis) {
          if (Math.max(Math.abs(e.dx), Math.abs(e.dy)) < Math.max(10, step / 2)) return;
          d.axis = Math.abs(e.dx) >= Math.abs(e.dy) ? 'h' : e.dy > 0 ? 'v' : 'up';
        }
        if (d.axis === 'h') {
          const target = Math.round(e.dx / step);
          for (; d.cols < target; d.cols++) push('nudgeRight');
          for (; d.cols > target; d.cols--) push('nudgeLeft');
        } else if (d.axis === 'v')
          for (const target = Math.floor(e.dy / step); d.rows < target; d.rows++) push('fastRow');
      });
      tk.input.onGesture('swipe', (e) => {
        if (e.dir === 'down' && e.dy >= 48 && e.durationMs <= 200) push('slam');
        else if (e.dir === 'up') push('stash');
        else if ((e.dir === 'left' || e.dir === 'right') && !this.drag?.cols)
          push(e.dir === 'left' ? 'nudgeLeft' : 'nudgeRight');
      });
    }

    // ─── run lifecycle ───
    private newRun(save: RunSaveV1 | null): void {
      const tk = this.tk;
      this.seed =
        save?.seed ??
        [tk.rng.main.nextUint32(), tk.rng.main.nextUint32()]
          .map((x) => x.toString(16).padStart(8, '0'))
          .join('');
      const rng = save ? createRng(save.rng) : tk.rng.create(`${this.seed}:pieces`);
      this.sim = createSim({
        seed: this.seed,
        rng,
        ...(save ? { save } : {}),
        ...(tk.attract ? { pile: ATTRACT_PILE, queue: ATTRACT_QUEUE } : {}),
      });
      this.queue = [];
      this.acc = 0;
      this.countdown = 0;
      this.ending = false;
      this.overAt = -1;
      this.fillT0 = -1;
      this.clearing = null;
      this.endSquash();
      this.slide = { x: 0, y: 0 };
      this.boardDirty = this.uiDirty = true;
      this.drawnPhase = '';
      this.danger = null;
      this.shown = { score: -1, level: -1, lines: -1, goal: -1 };
      this.setZone(zoneOf(this.sim.level), false);
      this.t.prompt.setVisible(!tk.attract);
      this.t.banner.setVisible(!!save);
      this.t.digit.setVisible(false);
      this.showHints();
      if (tk.attract) {
        this.simSteps = tk.attract.step;
        this.serial = 0;
        tk.attract.setView({
          actions: OPENING[0]!,
          startStep: this.simSteps,
        } satisfies AttractView);
      }
      this.render();
    }

    override update(time: number, delta: number): void {
      if (!this.sim) return;
      const tk = this.tk;
      if (this.danger)
        this.dangerGlow.setAlpha(tk.motion.reduced ? 0.8 : 0.6 + 0.4 * Math.sin(time / 170));
      if (this.countdown > 0) {
        this.countdown -= delta;
        this.queue = [];
        this.t.digit
          .setText(String(Math.ceil(this.countdown / (COUNTDOWN_MS / 3))))
          .setVisible(this.countdown > 0);
        if (this.countdown <= 0) this.acc = 0;
        return;
      }
      if (tk.attract) {
        // Lockstep with the attract step clock, so inputs injected for step s are consumed by simulation step s.
        while (this.simSteps < tk.attract.step) this.stepOnce();
      } else {
        this.acc += Math.min(delta, 250);
        for (let n = 0; this.acc >= STEP_MS && n < 5; n++) {
          this.acc -= STEP_MS;
          this.stepOnce();
        }
        this.acc = Math.min(this.acc, STEP_MS);
      }
      if (this.overAt >= 0 && !this.ending && this.time.now >= this.overAt) void this.gameOver();
      this.render();
      this.animate(delta);
    }

    private stepOnce(): void {
      const inputs = this.queue;
      this.queue = [];
      const step = this.simSteps++;
      const ev = this.sim.step(inputs);
      this.handle(ev);
      const a = this.tk.attract;
      if (a && this.sim.piece && ev.some((e) => e.type === 'spawn' || e.type === 'stash')) {
        this.serial++;
        const actions =
          this.serial < OPENING.length
            ? OPENING[this.serial]!
            : plan(this.sim.board, this.sim.piece);
        a.setView({ actions, startStep: step + 1 } satisfies AttractView);
      }
    }

    private handle(events: SimEvent[]): void {
      const { sfx, ui, motion } = this.tk;
      for (const e of events) {
        switch (e.type) {
          case 'start':
            this.tk.run.begin();
            this.t.prompt.setVisible(false);
            this.t.banner.setVisible(false);
            break;
          case 'shift':
          case 'turn':
          case 'bump':
            sfx.play(e.type);
            break;
          case 'stash':
            sfx.play('click');
            this.uiDirty = true;
            break;
          case 'spawn':
            this.uiDirty = true;
            break;
          case 'lock':
            sfx.play(e.slam ? 'hit' : 'thunk', e.slam ? { volume: 0.6 } : undefined);
            this.boardDirty = this.uiDirty = true;
            this.lockFx(e);
            break;
          case 'clear':
            if (e.five || e.sweep) sfx.play('win', e.sweep ? { detuneCents: 500 } : undefined);
            else sfx.play('coin', { detuneCents: CLEAR_DETUNE[e.rows.length]! });
            this.endSquash();
            if (motion.ms('base') > 0) {
              // How many rows each row of the new pile has to fall to reach its place.
              const shift: number[] = Array<number>(ROWS).fill(0);
              for (let dst = ROWS - 1, src = ROWS - 1; dst >= 0; dst--, src--) {
                while (e.rows.includes(src)) src--;
                shift[dst] = dst - src;
              }
              this.clearing = { before: e.before, rows: e.rows, shift, t0: this.time.now };
            }
            this.clearFx(e.rows, e.points, e.five, e.sweep);
            break;
          case 'level':
            sfx.play('rise');
            this.levelFx(e.level);
            break;
          case 'tier':
            ui.toast(
              strings.t('newShapes', {
                letters: e.pieces.filter((p) => !p.endsWith('m')).join(', '),
              }),
            );
            break;
          case 'over':
            this.fillT0 = this.time.now;
            this.overAt = this.time.now + (motion.reduced ? 0 : VIS_ROWS * FILL_ROW_MS + 250);
            shake(this, 300, 0.01);
            flash(this, colors.vermillion, 300, 0.35);
            break;
        }
      }
      if (!this.tk.attract && events.some((e) => e.type === 'lock') && this.sim.phase === 'entry')
        this.runSave.set(this.sim.snapshot());
    }

    // ─── effects ───
    /** A settling piece flashes white and squashes; a dropped one also leaves streaks and kicks up sparks. */
    private lockFx(e: Extract<SimEvent, { type: 'lock' }>): void {
      const { cell } = this.f;
      const reduced = this.tk.motion.reduced;
      const cells = e.cells.filter(([, y]) => y >= HIDDEN_ROWS);
      this.endSquash();
      this.whites.forEach((img, i) => {
        const c = cells[i];
        this.tweens.killTweensOf(img);
        img.setVisible(!!c).setAlpha(0);
        if (!c) return;
        img.setPosition(this.cellX(c[0]) + cell / 2, this.cellY(c[1]) + cell / 2).setAlpha(0.7);
        this.tweens.add({ targets: img, alpha: 0, duration: 120, ease: 'Quad.easeOut' });
      });
      if (!reduced) this.squash = { cells, t0: this.time.now, amount: e.slam ? 0.2 : 0.1 };
      if (!e.slam || e.fell < 1) return;
      const tint = colorNum(art.colorOf(e.id));
      const tops = new Map<number, number>();
      for (const [x, y] of cells) tops.set(x, Math.min(tops.get(x) ?? ROWS, y));
      const bottom = Math.max(...e.cells.map(([, y]) => y));
      [...tops].forEach(([x, top], i) => {
        const img = this.streaks[i]!;
        this.tweens.killTweensOf(img);
        const rows = Math.min(e.fell, 6, top - HIDDEN_ROWS);
        img.setVisible(!reduced && rows > 0);
        if (!img.visible) return;
        img
          .setPosition(this.cellX(x) + cell / 2, this.cellY(top))
          .setDisplaySize(cell * 0.8, rows * cell)
          .setTint(tint)
          .setAlpha(0.5);
        this.tweens.add({ targets: img, alpha: 0, duration: 180, ease: 'Quad.easeOut' });
      });
      for (const [x, y] of cells)
        if (y === bottom)
          burst(this, this.cellX(x) + cell / 2, this.cellY(bottom) + cell, {
            count: 3,
            shape: 'spark',
            colors: [art.colorOf(e.id), '#FFFFFF'],
            size: cell * 0.45,
            distance: cell,
            angle: -Math.PI / 2,
            spread: Math.PI,
            lifeMs: 280,
          });
      shake(this, 60, 0.002);
    }

    private endSquash(): void {
      const q = this.squash;
      this.squash = null;
      if (!q) return;
      const { cell } = this.f;
      for (const [x, y] of q.cells)
        this.board[(y - HIDDEN_ROWS) * COLS + x]!.setScale(this.unit).setY(this.cellY(y) + cell / 2);
    }

    /** Per-frame motion that is not a tween: the falling piece easing into its cell and the landing squash. */
    private animate(delta: number): void {
      const { cell } = this.f;
      const sl = this.slide;
      if (sl.x || sl.y) {
        const k = Math.exp(-delta / 26);
        sl.x = Math.abs(sl.x) < 0.5 ? 0 : sl.x * k;
        sl.y = Math.abs(sl.y) < 0.5 ? 0 : sl.y * k;
        this.placeActive();
      }
      const q = this.squash;
      if (!q || this.clearing) return;
      const t = (this.time.now - q.t0) / SQUASH_MS;
      if (t >= 1) return this.endSquash();
      // Flatten towards the bottom of the piece, then spring back.
      const s = 1 - q.amount * (1 - t) * (1 - t);
      const floor = this.cellY(Math.max(...q.cells.map(([, y]) => y))) + cell;
      for (const [x, y] of q.cells) {
        const cy = this.cellY(y) + cell / 2;
        this.board[(y - HIDDEN_ROWS) * COLS + x]!.setScale(
          this.unit * (1 + (1 - s) * 0.5),
          this.unit * s,
        ).setY(floor - (floor - cy) * s);
      }
    }

    /** Line clear: each row flashes and bursts, the points pop; a Full Five or a clean sweep throws a party. */
    private clearFx(rows: number[], points: number, five: boolean, sweep: boolean): void {
      const { well, cell } = this.f;
      const cx = well.x + well.w / 2;
      const visible = rows.filter((y) => y >= HIDDEN_ROWS);
      for (const y of visible) {
        const cy = this.cellY(y) + cell / 2;
        const bar = this.add.rectangle(cx, cy, well.w, cell, 0xffffff, 0.85).setDepth(4);
        this.tweens.add({
          targets: bar,
          alpha: 0,
          scaleY: 0.2,
          duration: FLASH_MS + 70,
          ease: 'Quad.easeOut',
          onComplete: () => bar.destroy(),
        });
        for (const fx of [0.25, 0.75])
          burst(this, well.x + well.w * fx, cy, {
            count: 6,
            shape: 'square',
            colors: CONFETTI,
            size: cell * 0.3,
            distance: cell * 2.4,
            gravity: cell,
            lifeMs: 500,
          });
      }
      const mid = visible.length
        ? this.cellY(visible.reduce((a, b) => a + b, 0) / visible.length) + cell / 2
        : well.y + well.h / 2;
      popText(this, cx, mid, `+${formatScore(points, 'integer', this.tk.env.locale)}`, {
        px: 32 + rows.length * 6,
        rise: 70,
        ms: 900,
      });
      if (rows.length >= 3) shake(this, 140, 0.003 * rows.length);
      if (!five && !sweep) return;
      const ty = Math.max(well.y + cell * 3, Math.min(mid - cell * 2.5, well.y + well.h * 0.45));
      popText(this, cx, ty, five ? strings.fullFive : strings.sweep, {
        px: Math.min(84, well.w / 5.6),
        color: colors.yellow,
        rise: 80,
        ms: 1400,
      });
      burst(this, cx, ty, {
        count: 30,
        shape: 'star',
        colors: CONFETTI,
        size: 24,
        distance: well.w * 0.7,
        gravity: 160,
        lifeMs: 1200,
      });
      flash(this, colors.violet, 240, 0.3);
      shake(this, 240, 0.01);
    }

    /** Level up: the level pops in the well, the rim pulses, and every third level the look changes. */
    private levelFx(level: number): void {
      const { well, pills } = this.f;
      popText(this, well.x + well.w / 2, well.y + well.h * 0.28, strings.t('levelUp', { n: level }), {
        px: Math.min(60, well.w / 6.5),
        color: colors.text,
        rise: 50,
        ms: 1100,
      });
      burst(this, pills[1].x + pills[1].w / 2, pills[1].y + pills[1].h / 2, {
        count: 14,
        shape: 'star',
        colors: [colors.violet, colors.purple, colors.gold],
        distance: 110,
      });
      this.setZone(zoneOf(level), true);
      const pulse = this.add.graphics().setDepth(5);
      pulse
        .lineStyle(10, colorNum('text'), 0.9)
        .strokeRoundedRect(well.x - 6, well.y - 6, well.w + 12, well.h + 12, 14);
      this.tweens.add({
        targets: pulse,
        alpha: 0,
        duration: 450,
        ease: 'Quad.easeOut',
        onComplete: () => pulse.destroy(),
      });
    }

    private setZone(zone: number, animate: boolean): void {
      if (zone === this.zone) return;
      const from = ZONES[Math.max(0, this.zone)]!.sky;
      const to = ZONES[zone]!.sky;
      this.zone = zone;
      this.drawRim();
      const paint = (t: number) =>
        this.skyGlows.forEach((img, i) => img.setTint(colorNum(mixHex(from[i]!, to[i]!, t))));
      if (!animate || this.tk.motion.reduced) return paint(1);
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 900,
        onUpdate: (tw) => paint(tw.getValue() ?? 1),
      });
    }

    private async gameOver(): Promise<void> {
      this.ending = true;
      const s = this.sim;
      const tk = this.tk;
      tk.sfx.play('lose');
      if (!tk.attract) {
        void this.runSave.clear();
        this.stats = withRun(this.stats, {
          lines: s.lines,
          fives: s.fives,
          sweeps: s.sweeps,
          level: s.level,
        });
        this.statsSave.set(this.stats);
      }
      const action = await tk.ui.gameOver({
        title: strings.wellFull,
        scores: [
          { board: 'score', value: s.score },
          { board: 'lines', value: s.lines },
        ],
        meta: {
          v: 1,
          seed: this.seed,
          level: s.level,
          pieces: s.pieces,
          playMs: s.playMs,
          fives: s.fives,
          sweeps: s.sweeps,
          ver: meta.version,
        },
      });
      if (tk.signal.aborted) return;
      if (action === 'play-again') this.newRun(null);
    }

    // ─── drawing ───
    private render(): void {
      const s = this.sim;
      if (this.clearing || this.boardDirty || this.fillT0 >= 0) this.drawBoard();
      if (s.piece !== this.drawnPiece || s.phase !== this.drawnPhase) this.drawPiece();
      if (this.uiDirty) this.drawConveyor();
      const locale = this.tk.env.locale;
      for (const k of COUNTERS) {
        const v = k === 'score' ? s.score : k === 'level' ? s.level : s.lines;
        if (v === this.shown[k]) continue;
        this.hud[k].set(formatScore(v, 'integer', locale));
        if (this.shown[k] >= 0) this.hud[k].bump();
        this.shown[k] = v;
      }
      const goal = s.level >= MAX_LEVEL ? LINES_PER_LEVEL : s.lines % LINES_PER_LEVEL;
      if (goal !== this.shown.goal) {
        this.shown.goal = goal;
        this.drawRails(goal);
      }
    }

    private drawBoard(): void {
      const s = this.sim;
      const { cell } = this.f;
      const now = this.time.now;
      const cl = this.clearing;
      const t = cl ? now - cl.t0 : 0;
      const flashing = !!cl && t < FLASH_MS;
      const collapsing = !!cl && !flashing && t < FLASH_MS + COLLAPSE_MS;
      const board = flashing ? cl.before : s.board;
      // Collapse: fall (accelerating) for the first three quarters, then one small bounce.
      const u = collapsing ? (t - FLASH_MS) / COLLAPSE_MS : 1;
      const fall = u < 0.75 ? 1 - (u / 0.75) ** 2 : 0;
      const bounce = u < 0.75 || u >= 1 ? 0 : cell * 0.1 * Math.sin((Math.PI * (u - 0.75)) / 0.25);
      const flat = flashing ? t / FLASH_MS : 0;
      const stoneRows = this.fillT0 < 0 ? 0 : Math.floor((now - this.fillT0) / FILL_ROW_MS) + 1;
      const stone = `pf-stone-${cell}`;
      for (let y = HIDDEN_ROWS; y < ROWS; y++) {
        const clearing = flashing && cl.rows.includes(y);
        const lift = collapsing && cl.shift[y]! > 0 ? cl.shift[y]! * cell * fall + bounce : 0;
        const cy = this.cellY(y) + cell / 2 - lift;
        const petrified = ROWS - 1 - y < stoneRows;
        for (let x = 0; x < COLS; x++) {
          const img = this.board[(y - HIDDEN_ROWS) * COLS + x]!;
          const c = board[y * COLS + x]!;
          img.setVisible(c >= 0);
          if (c < 0) continue;
          img
            .setTexture(petrified ? stone : art.cellKey(pieceAt(c), true, cell))
            .setY(cy)
            .setScale(this.unit * (1 + flat * (clearing ? 0.12 : 0)), this.unit * (clearing ? 1 - flat * 0.75 : 1));
        }
      }
      if (cl && !flashing && !collapsing) this.clearing = null;
      if (this.fillT0 >= 0 && stoneRows >= VIS_ROWS) this.fillT0 = -1;
      if (!this.clearing) this.boardDirty = false;
      this.drawDanger();
    }

    private drawDanger(): void {
      const s = this.sim;
      let danger = false;
      for (let i = HIDDEN_ROWS * COLS; i < (HIDDEN_ROWS + DANGER_ROWS) * COLS; i++)
        if (s.board[i]! >= 0) danger = true;
      danger &&= s.phase !== 'over';
      if (danger === this.danger) return;
      this.danger = danger;
      this.dangerGlow.setVisible(danger);
      this.drawRim();
    }

    /** The neon rim in the zone's colour (red in danger) and the dashed crest along the top of the well. */
    private drawRim(): void {
      const w = this.f.well;
      const color = colorNum(this.danger ? colors.vermillion : ZONES[Math.max(0, this.zone)]!.rim);
      const g = this.g.rim.clear();
      g.lineStyle(14, color, 0.18).strokeRoundedRect(w.x - 6, w.y - 6, w.w + 12, w.h + 12, 14);
      g.lineStyle(4, color, 1).strokeRoundedRect(w.x - 6, w.y - 6, w.w + 12, w.h + 12, 14);
      g.fillStyle(colorNum(this.danger ? 'vermillion' : 'textMuted'), this.danger ? 1 : 0.7);
      for (let x = w.x + 6; x < w.x + w.w - 12; x += 18) g.fillRoundedRect(x, w.y - 2, 10, 4, 2);
    }

    /** Level rails on both sides of the well: ten segments that fill as lines are cleared towards the next level. */
    private drawRails(filled: number): void {
      const w = this.f.well;
      const g = this.g.rails.clear();
      const gap = 4;
      const h = (w.h - gap * (LINES_PER_LEVEL - 1)) / LINES_PER_LEVEL;
      for (const x of [w.x - 23, w.x + w.w + 15])
        for (let i = 0; i < LINES_PER_LEVEL; i++) {
          const on = i < filled;
          g.fillStyle(on ? colorNum('gold') : 0xffffff, on ? 1 : 0.13).fillRoundedRect(
            x,
            w.y + w.h - (i + 1) * h - i * gap,
            8,
            h,
            4,
          );
        }
    }

    /** Called when the piece changed: its landing shadow, its cells, and how far it should slide into place. */
    private drawPiece(): void {
      const s = this.sim;
      const p = s.piece;
      const prev = this.drawnPiece;
      const { cell } = this.f;
      this.drawnPiece = p;
      this.drawnPhase = s.phase;
      const g = this.g.shadow.clear();
      for (const img of this.active) img.setVisible(false);
      if (!p || s.phase === 'over') return;
      if (prev && prev.id === p.id && prev.rot === p.rot && !this.tk.motion.reduced) {
        const sl = this.slide;
        sl.x = Math.max(-cell, Math.min(cell, sl.x + (prev.x - p.x) * cell));
        sl.y = Math.max(-cell, Math.min(0, sl.y + (prev.y - p.y) * cell));
      } else this.slide = { x: 0, y: 0 };
      const cells = cellsOf(p);
      const color = colorNum(art.colorOf(p.id));
      // Landing shadow: a tint where the piece will land, outlined along its outer edges.
      const drop = s.landing();
      const landed = new Set(cells.map(([x, y]) => `${x},${y + drop}`));
      g.lineStyle(3, color, 0.9);
      for (const [x, cy] of cells) {
        const y = cy + drop;
        if (y < HIDDEN_ROWS) continue;
        const [px, py] = [this.cellX(x), this.cellY(y)];
        g.fillStyle(color, 0.16).fillRect(px, py, cell, cell);
        if (!landed.has(`${x},${y - 1}`)) g.lineBetween(px, py + 1.5, px + cell, py + 1.5);
        if (!landed.has(`${x},${y + 1}`)) g.lineBetween(px, py + cell - 1.5, px + cell, py + cell - 1.5);
        if (!landed.has(`${x - 1},${y}`)) g.lineBetween(px + 1.5, py, px + 1.5, py + cell);
        if (!landed.has(`${x + 1},${y}`)) g.lineBetween(px + cell - 1.5, py, px + cell - 1.5, py + cell);
      }
      const key = art.cellKey(p.id, false, cell);
      cells.forEach(([, y], i) => this.active[i]!.setTexture(key).setVisible(y >= HIDDEN_ROWS));
      this.placeActive();
    }

    private placeActive(): void {
      const p = this.drawnPiece;
      if (!p) return;
      const { cell } = this.f;
      cellsOf(p).forEach(([x, y], i) =>
        this.active[i]!.setPosition(
          this.cellX(x) + cell / 2 + this.slide.x,
          this.cellY(y) + cell / 2 + this.slide.y,
        ),
      );
    }

    private drawConveyor(): void {
      this.uiDirty = false;
      const s = this.sim;
      const { mini, slots } = this.f;
      const preview = (slot: number, id: PieceId | null) => {
        const imgs = this.previews[slot]!;
        for (const img of imgs) img.setVisible(false);
        if (!id) return;
        const box = boxCells(id, 0);
        const xs = box.map(([x]) => x);
        const ys = box.map(([, y]) => y);
        const ox = slots[slot]!.x - ((Math.min(...xs) + Math.max(...xs) + 1) * mini) / 2;
        const oy = slots[slot]!.y - ((Math.min(...ys) + Math.max(...ys) + 1) * mini) / 2;
        box.forEach(([x, y], i) =>
          imgs[i]!.setPosition(ox + (x + 0.5) * mini, oy + (y + 0.5) * mini)
            .setTexture(art.cellKey(id, false, mini))
            .setAlpha(slot === 0 && s.stashUsed ? 0.35 : 1)
            .setVisible(true),
        );
      };
      preview(0, s.stash);
      s.next.forEach((id, i) => preview(i + 1, id));
    }
  }

  return [Play];
};
