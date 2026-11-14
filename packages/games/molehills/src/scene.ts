// The Molehills scene: a garden bed of tile + overlay sprites in one container. The layout follows the visible
// view (any shape from 9:16 to 16:9): a HUD row on top, a control band at the bottom and the board in between,
// turned whichever way gives the biggest cells, with a close-up mode that pans when cells would be too small to
// touch. Rules, solver and generation live in logic.ts; all drawing (done once per mount) lives in art.ts.
import type Phaser from 'phaser';
import { colorNum, colors, prng, type ColorToken, type Rng, type Save } from '@pocketcade/toolkit';
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
import * as art from './art.ts';
import { ATTRACT_FIRST, ATTRACT_FIRST_STEP, ATTRACT_SIZE, type AttractView } from './attract.ts';
import {
  createGenerator,
  dig,
  fromBits,
  GEN_VERSION,
  hint,
  makeBoard,
  neighbours,
  popcount,
  provenMoles,
  SIZE_IDS,
  SIZES,
  toBits,
  type Board,
  type BoardOrigin,
  type SizeId,
} from './logic.ts';
import {
  freshPrefs,
  freshStats,
  isPrefsV1,
  isRunOrNull,
  isStatsV1,
  withOutcome,
  type PrefsV1,
  type RunV1,
  type StatsV1,
} from './save.ts';
import { strings } from './strings.ts';

const SIZE = 1000;
const FRAME = 18;
/**
 * HUD pills and buttons are built at this height and shown at a scale ≤ 1 (`hs`) chosen from the frame's CSS
 * size, so they stay about the same size on screen on a phone and on a desktop and are never upscaled.
 */
const CTRL_H = 96;
const PAD = 14;
const GAP = 22;
const ROW_H = CTRL_H + 2 * PAD;
const W = {
  moles: 240,
  board: 420,
  time: 260,
  hint: 220,
  tab: 260,
  mode: 230,
  zoom: 220,
  fresh: 300,
};
const TAB_GAP = 12;
const TABS_W = 3 * W.tab + 2 * TAB_GAP;
const FULL_ROW = W.moles + TABS_W + W.time + W.hint + 3 * GAP;
const FONT_PX = 40;
/** Wanted on-screen HUD height in CSS px. */
const HUD_CSS = 44;
/** Tile textures: art.TEX design units drawn at 1.5x so big cells stay crisp. */
const TEX_RES = 1.5;
const UNIT = art.TEX * TEX_RES;
/** Cell sizes in CSS px: largest fitted cell, smallest tappable one, and the close-up size. */
const CELL_MAX_CSS = 72;
const CELL_MIN_CSS = { touch: 40, pointer: 22 };
const CELL_CLOSE_CSS = { touch: 50, pointer: 32 };
const HINT_PENALTY_MS = 20_000;
const MAX_MS = 359_999_999;
const LONG_PRESS_MS = 400;
/** The hold ring starts after this, so quick taps never flash it. */
const PRESS_SHOW_MS = 120;
const DIRT = ['#8A5532', '#B27645', '#5ECB42', '#6E3D20'];
const CONFETTI = [colors.gold, colors.pink, colors.sky, colors.lime, colors.yellow, '#FFFFFF'];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Button {
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  w: number;
  act: () => void;
}

type Phase = 'picking' | 'generating' | 'playing' | 'over' | 'review';

const fmtTime = (ms: number): string => {
  const sec = Math.floor(ms / 1000);
  return sec >= 6000 ? '99:59+' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

export const createScenes: SceneFactory = (_P, kit) => {
  class Play extends kit.Scene {
    private size: SizeId = 'garden';
    private board: Board | null = null;
    private dug: Uint8Array = new Uint8Array(0);
    private flowers: Uint8Array = new Uint8Array(0);
    private start = -1;
    private origin: BoardOrigin = { src: 'gen', seed: '' };
    private phase: Phase = 'picking';
    private elapsed = 0;
    private savedAtElapsed = 0;
    private clockOn = false;
    private hints = 0;
    private cursor = 0;
    private cursorShown = false;
    private hover = -1;
    private flowerMode = false;
    private zoom: 'fit' | 'close' = 'fit';
    private cam = { cx: 0, cy: 0 };
    private transposed = false;
    private panFrom: { cx: number; cy: number } | null = null;
    private press: {
      id: number;
      x: number;
      y: number;
      t: number;
      cell: number;
      fired: boolean;
    } | null = null;
    /** set when a long-press planted a daisy, so the tap that ends the same press does nothing */
    private swallowTap = false;
    private gen: ReturnType<typeof createGenerator> | null = null;
    private genCell = -1;
    private mark: { cell: number; color: ColorToken; until: number } | null = null;
    private won = false;
    /** bumped by every new board, so a delayed game-over card for an old board never shows */
    private runId = 0;
    private decor = prng(0x5eed);
    private nudge: { cells: number[]; until: number } | null = null;
    private woken = -1;
    private sceneMs = 0;
    private attractRun = 0;
    private attractStart = 0;
    private attractMoves = 0;
    private attractNextMove: AttractView['next'] = null;
    private runRng!: Rng;
    private runSeed = '';
    private stats: StatsV1 = freshStats();
    private prefs: PrefsV1 = freshPrefs();
    private runSave!: Save<RunV1 | null>;
    private statsSave!: Save<StatsV1>;
    private prefsSave!: Save<PrefsV1>;
    // Layout, in design units, recomputed from tk.layout.view on every resize.
    private viewRect: Rect = { x: 0, y: 0, w: SIZE, h: SIZE };
    /** CSS px per design unit */
    private cpu = 1;
    /** HUD scale */
    private hs = 1;
    /** narrow view: the size tabs take the whole top row and the board pill is hidden */
    private compact = false;
    /** the window the board shows through, and the area inside its wooden frame */
    private boardView: Rect = { x: 0, y: 0, w: SIZE, h: SIZE };
    private area: Rect = { x: 0, y: 0, w: SIZE, h: SIZE };
    private layer!: Phaser.GameObjects.Container;
    private tiles: Phaser.GameObjects.Image[] = [];
    private marks: Phaser.GameObjects.Image[] = [];
    private fx!: Phaser.GameObjects.Graphics;
    private pointer!: Phaser.GameObjects.Image;
    private bed!: {
      shadow: Phaser.GameObjects.Rectangle;
      soil: Phaser.GameObjects.Rectangle;
      planks: Phaser.GameObjects.Image[];
      posts: Phaser.GameObjects.Image[];
    };
    private sky!: Phaser.GameObjects.Image;
    private clouds: Phaser.GameObjects.Image[] = [];
    /** crops of the lawn that hide the board where it pans past its window in close-up */
    private edges: Phaser.GameObjects.Image[] = [];
    private buttons: Button[] = [];
    private hud!: {
      moles: HudPill;
      board: HudPill;
      time: HudPill;
      tabs: Button[];
      hint: Button;
      dig: Button;
      plant: Button;
      zoom: Button;
      fresh: Button;
      ready: Phaser.GameObjects.Text;
    };

    constructor() {
      super('play');
    }

    create(): void {
      const tk = this.tk;
      const bleed = tk.layout.bleed;
      this.makeTextures();
      backdrop(this, 'mh-garden', SIZE, SIZE, {
        stops: ['#5CC44A', '#43A93F', '#2E8A36'],
        draw: (ctx, w, h) => art.lawn(ctx, -bleed.x, -bleed.y, w + 2 * bleed.x, h + 2 * bleed.y),
      });
      this.layer = this.add.container(0, 0);
      this.makeBed();
      this.fx = this.add.graphics();
      this.pointer = this.add.image(0, 0, 'mh-hintArrow').setVisible(false);
      this.layer.add([this.fx, this.pointer]);
      this.edges = [0, 1, 2].map(() =>
        this.add.image(-bleed.x, -bleed.y, 'mh-garden').setOrigin(0).setDepth(5).setVisible(false),
      );
      this.sky = this.add.image(-bleed.x, 0, 'mh-sky').setOrigin(0, 1).setDepth(6);
      this.clouds = [0, 1, 2].map((k) =>
        canvasImage(this, 0, 0, 'mh-cloud')
          .setDepth(7)
          .setAlpha(0.9 - k * 0.15),
      );
      this.makeHud();
      this.input.mouse?.disableContextMenu();
      tk.input.configure({
        actions: {
          up: { codes: ['ArrowUp', 'KeyW'], repeat: true },
          down: { codes: ['ArrowDown', 'KeyS'], repeat: true },
          left: { codes: ['ArrowLeft', 'KeyA'], repeat: true },
          right: { codes: ['ArrowRight', 'KeyD'], repeat: true },
          dig: { codes: ['Space', 'Enter', 'NumpadEnter'] },
          flower: { codes: ['KeyF', 'KeyX'] },
          flowerMode: { codes: ['KeyM'] },
          zoom: { codes: ['KeyO'] },
          hint: { codes: ['KeyH'] },
          newBoard: { codes: ['KeyN'] },
          size1: { codes: ['Digit1', 'Numpad1'] },
          size2: { codes: ['Digit2', 'Numpad2'] },
          size3: { codes: ['Digit3', 'Numpad3'] },
        },
      });
      for (const a of [
        'up',
        'down',
        'left',
        'right',
        'dig',
        'flower',
        'flowerMode',
        'zoom',
        'hint',
        'newBoard',
        'size1',
        'size2',
        'size3',
      ])
        tk.input.on(a, (e) => e.phase === 'press' && this.onKey(a));
      tk.input.onGesture('tap', (e) => this.onTap(e.x, e.y));
      tk.input.onGesture(
        'dragstart',
        () => (this.panFrom = this.zoom === 'close' ? { ...this.cam } : null),
      );
      tk.input.onGesture('drag', (e) => this.onPan(e.dx, e.dy));
      tk.input.onGesture('dragend', () => (this.panFrom = null));
      this.bindPointer();
      tk.on('pause', () => {
        this.press = null;
        if (this.phase !== 'playing') return;
        this.game.canvas.style.visibility = 'hidden'; // pause time can't be spent studying the board
        this.saveRun();
        void this.runSave.flush();
      });
      tk.on('resume', () => (this.game.canvas.style.visibility = ''));
      tk.on('inputchange', ({ primary }) => {
        this.cursorShown = primary === 'keyboard';
        this.layout();
      });
      tk.on('resize', () => this.layout());
      tk.ui.onRestart(() => {
        if (this.phase === 'playing' || this.phase === 'generating') this.endRun('abandoned');
        this.newBoard(this.size);
      });
      this.runSave = tk.createSave<RunV1 | null>({
        key: 'run',
        defaults: () => null,
        validate: isRunOrNull,
      });
      this.statsSave = tk.createSave<StatsV1>({
        key: 'stats',
        defaults: freshStats,
        validate: isStatsV1,
      });
      this.prefsSave = tk.createSave<PrefsV1>({
        key: 'prefs',
        defaults: freshPrefs,
        validate: isPrefsV1,
      });
      this.cursorShown = tk.env.input.primary === 'keyboard';
      tk.deferReady();
      if (tk.attract) {
        this.startAttractRun();
        tk.ready();
        return;
      }
      const launch = tk.ctx.launch;
      void Promise.all([
        launch === 'play' ? this.runSave.load() : this.runSave.clear().then(() => null),
        this.statsSave.load(),
        this.prefsSave.load(),
      ])
        .then(([r, s, p]) => {
          if (tk.signal.aborted) return; // unmounted while loading
          this.stats = s.data;
          this.prefs = p.data;
          this.flowerMode = p.data.flowerMode;
          if (r?.data) this.restore(r.data);
          else this.newBoard(this.prefs.size);
        })
        .catch((e: unknown) => {
          tk.reportError(e);
          if (!tk.signal.aborted) this.newBoard(this.prefs.size);
        })
        .finally(() => tk.ready());
    }

    // ─── art: one texture per frame, drawn once per mount (art.ts) ───
    private makeTextures(): void {
      const tile = (key: string, draw: (ctx: CanvasRenderingContext2D) => void) =>
        canvasTexture(this, `mh-${key}`, art.TEX, art.TEX, draw, { scale: TEX_RES });
      for (let v = 0; v < 3; v++) tile(`covered${v}`, (ctx) => art.grass(ctx, v));
      for (let v = 0; v < 2; v++) tile(`soil${v}`, (ctx) => art.soil(ctx, v));
      tile('planted', art.planted);
      tile('woketile', (ctx) => art.soil(ctx, 0, colors.vermillion));
      tile('flower', art.flower);
      tile('wilted', art.wilted);
      tile('mole', (ctx) => art.mole(ctx, 'sleep'));
      tile('molebloom', (ctx) => art.mole(ctx, 'bloom'));
      tile('wokemole', (ctx) => art.mole(ctx, 'grump'));
      for (let n = 1; n <= 8; n++) tile(`n${n}`, (ctx) => art.digit(ctx, n));
      canvasTexture(this, 'mh-hintArrow', 64, 64, art.hintArrow, { scale: 2 });
      canvasTexture(this, 'mh-hintBadge', 64, 64, art.hintBadge, { scale: 2 });
      canvasTexture(this, 'mh-petal', 24, 24, art.petal, { scale: 2 });
      canvasTexture(this, 'mh-plankH', 240, FRAME, (ctx, w, h) => art.plank(ctx, w, h));
      canvasTexture(this, 'mh-plankV', FRAME, 240, (ctx, w, h) => art.plank(ctx, w, h, true));
      canvasTexture(this, 'mh-post', 28, 28, (ctx, s) => art.post(ctx, s));
      const skyW = SIZE + 2 * this.tk.layout.bleed.x;
      canvasTexture(
        this,
        'mh-sky',
        skyW,
        ROW_H,
        (ctx, w, h) => art.sky(ctx, w, h, this.tk.layout.bleed.x + SIZE - 120),
        { scale: 1 },
      );
      canvasTexture(this, 'mh-cloud', 140, 64, (ctx) => art.cloud(ctx, 70, 34, 0.6));
      // The pill's stock icon is (height × 0.72) across; the garden badges replace it at the same size.
      const badge = Math.round(CTRL_H * 0.72);
      canvasTexture(this, 'mh-badgeDaisy', badge, badge, (ctx) =>
        art.badge(ctx, badge, colors.green, 'daisy'),
      );
      canvasTexture(this, 'mh-badgeMound', badge, badge, (ctx) =>
        art.badge(ctx, badge, colors.orange, 'mound'),
      );
      const btn = (key: string, w: number, base: string, glyph: art.Glyph | null) =>
        canvasTexture(this, `mh-${key}`, w, CTRL_H, (ctx) =>
          art.button(ctx, w, CTRL_H, base, glyph),
        );
      const glass = (key: string, w: number, glyph: art.Glyph | null) =>
        canvasTexture(this, `mh-${key}`, w, CTRL_H, (ctx) => art.glassTab(ctx, w, CTRL_H, glyph));
      btn('hint', W.hint, colors.gold, 'bulb');
      btn('digOn', W.mode, '#FF8A3D', 'shovel');
      glass('digOff', W.mode, 'shovel');
      btn('plantOn', W.mode, colors.green, 'daisy');
      glass('plantOff', W.mode, 'daisy');
      btn('zoom', W.zoom, colors.sky, 'zoom');
      btn('new', W.fresh, '#FF8A3D', 'shovel');
      btn('tabOn', W.tab, colors.orange, null);
      glass('tabOff', W.tab, null);
    }

    /** The wooden garden bed: soil under the tiles, four planks and corner posts, resized by placeBoard(). */
    private makeBed(): void {
      const shadow = this.add.rectangle(0, 0, 1, 1, colorNum('ink'), 0.3).setOrigin(0);
      const soil = this.add.rectangle(0, 0, 1, 1, 0x3b2012).setOrigin(0);
      const planks = ['mh-plankH', 'mh-plankH', 'mh-plankV', 'mh-plankV'].map((k) =>
        this.add.image(0, 0, k).setOrigin(0),
      );
      const posts = [0, 1, 2, 3].map(() => canvasImage(this, 0, 0, 'mh-post'));
      this.layer.add([shadow, soil, ...planks, ...posts]);
      this.bed = { shadow, soil, planks, posts };
    }

    private placeBed(w: number, h: number): void {
      const F = FRAME;
      const { shadow, soil, planks, posts } = this.bed;
      shadow.setPosition(-F + 5, -F + 9).setSize(w + 2 * F, h + 2 * F);
      soil.setSize(w, h);
      planks[0]!.setPosition(-F, -F).setDisplaySize(w + 2 * F, F);
      planks[1]!.setPosition(-F, h).setDisplaySize(w + 2 * F, F);
      planks[2]!.setPosition(-F, 0).setDisplaySize(F, h);
      planks[3]!.setPosition(w, 0).setDisplaySize(F, h);
      [
        [-F / 2, -F / 2],
        [w + F / 2, -F / 2],
        [-F / 2, h + F / 2],
        [w + F / 2, h + F / 2],
      ].forEach(([x, y], i) => posts[i]!.setPosition(x, y));
    }

    private makeHud(): void {
      const pill = (w: number, label: string, icon: HudIcon, accent: string, badge?: string) => {
        const p = hudPill(this, 0, 0, { icon, accent, label, width: w, height: CTRL_H, depth: 20 });
        // Swap the pill's stock icon for a garden badge of the same size.
        if (badge)
          (p.container.list[1] as Phaser.GameObjects.Image)
            .setTexture(badge)
            .setScale(1 / texScale(this, badge));
        return p;
      };
      const button = (w: number, key: string, label: string, act: () => void, glyph = true) => {
        const bg = canvasImage(this, 0, 0, `mh-${key}`).setOrigin(0);
        const text = kit
          .text(this, glyph ? (w + CTRL_H * 0.95) / 2 : w / 2, CTRL_H / 2 - 3, label, {
            px: FONT_PX,
            color: 'ink',
          })
          .setOrigin(0.5);
        const b: Button = {
          box: this.add.container(0, 0, [bg, text]).setDepth(20),
          bg,
          text,
          w,
          act,
        };
        this.buttons.push(b);
        return b;
      };
      this.hud = {
        moles: pill(W.moles, strings.molesLabel, 'flag', colors.green, 'mh-badgeDaisy'),
        board: pill(W.board, strings.boardLabel, 'flag', colors.orange, 'mh-badgeMound'),
        time: pill(W.time, strings.timeLabel, 'clock', colors.sky),
        tabs: SIZE_IDS.map((id, i) =>
          button(
            W.tab,
            'tabOff',
            strings.t('tab', { n: i + 1, name: strings[id] }),
            () => this.setSize(id),
            false,
          ),
        ),
        hint: button(W.hint, 'hint', strings.hint, () => this.showHint()),
        dig: button(W.mode, 'digOff', strings.dig, () => this.setFlowerMode(false)),
        plant: button(W.mode, 'plantOff', strings.plant, () => this.setFlowerMode(true)),
        zoom: button(W.zoom, 'zoom', strings.zoom, () => this.toggleZoom(this.cursor)),
        fresh: button(W.fresh, 'new', strings.newBoard, () => this.newBoard(this.size)),
        ready: kit
          .text(this, 0, 0, strings.ready, { px: 44, stroke: 'ink', strokePx: 9 })
          .setOrigin(0.5)
          .setDepth(20),
      };
    }

    // ─── boards ───
    private cells(): number {
      return SIZES[this.size].cols * SIZES[this.size].rows;
    }

    private newBoard(size: SizeId): void {
      const tk = this.tk;
      // Each board has its own seed; attempt n forks 'gen/n' from it.
      this.runSeed = tk.attract
        ? `molehills:attract/run/${this.attractRun}`
        : [tk.rng.main.nextUint32(), tk.rng.main.nextUint32()]
            .map((x) => x.toString(16).padStart(8, '0'))
            .join('');
      this.runRng = tk.rng.create(this.runSeed);
      this.size = size;
      const n = this.cells();
      this.board = null;
      this.won = false;
      this.runId++;
      this.dug = new Uint8Array(n);
      this.flowers = new Uint8Array(n);
      this.start = -1;
      this.elapsed = this.savedAtElapsed = 0;
      this.clockOn = false;
      this.hints = 0;
      this.woken = -1;
      this.mark = this.nudge = null;
      this.gen = null;
      this.phase = 'picking';
      this.cursor = Math.floor(n / 2);
      this.zoom = 'fit';
      this.buildSprites();
      this.layout();
      this.redraw();
    }

    private restore(r: RunV1): void {
      this.size = r.size;
      const n = this.cells();
      this.board = makeBoard(r.size, fromBits(r.moles, n)!);
      this.dug = fromBits(r.dug, n)!;
      this.flowers = fromBits(r.flowers, n)!;
      this.start = r.start;
      this.origin = r.origin;
      this.elapsed = this.savedAtElapsed = r.elapsedMs;
      this.hints = r.hints;
      this.cursor = r.cursor;
      this.woken = -1;
      this.phase = 'playing';
      this.clockOn = false; // resumes on the first input
      this.buildSprites();
      this.zoom = r.view.zoom;
      this.cam = { cx: r.view.cx, cy: r.view.cy };
      this.layout();
      this.redraw();
    }

    private buildSprites(): void {
      const n = this.cells();
      while (this.tiles.length < n) {
        const t = this.add.image(0, 0, 'mh-covered0').setOrigin(0.5);
        const m = this.add.image(0, 0, 'mh-flower').setOrigin(0.5);
        this.layer.add([t, m]);
        this.tiles.push(t);
        this.marks.push(m);
      }
      this.tweens.killTweensOf([...this.tiles, ...this.marks]);
      this.tiles.forEach((t, i) => t.setVisible(i < n));
      this.marks.forEach((m) => m.setVisible(false).setScale(1).setAngle(0));
      this.layer.bringToTop(this.fx);
      this.layer.bringToTop(this.pointer);
    }

    // ─── layout ───
    /** Fitted cell size, orientation, and whether the board needs the close-up to be tappable. */
    private view() {
      const { cols, rows } = SIZES[this.size];
      const A = this.area;
      const canon = Math.min(A.w / cols, A.h / rows);
      const trans = Math.min(A.w / rows, A.h / cols);
      const transposed = trans > canon;
      const [dc, dr] = transposed ? [rows, cols] : [cols, rows];
      const touch = this.tk.env.input.primary === 'touch';
      const fit = Math.min(Math.max(canon, trans), CELL_MAX_CSS / this.cpu);
      const needsZoom = fit * this.cpu < CELL_MIN_CSS[touch ? 'touch' : 'pointer'];
      const close = CELL_CLOSE_CSS[touch ? 'touch' : 'pointer'] / this.cpu;
      const cell = this.zoom === 'close' && needsZoom ? close : fit;
      return { transposed, dc, dr, cell, needsZoom };
    }

    /** Recomputes every rectangle from the visible view, then places the HUD, the scenery and the board. */
    private layout(): void {
      const L = this.tk.layout;
      const v = { x: L.view.x, y: L.view.y, w: L.view.width, h: L.view.height };
      this.viewRect = v;
      this.cpu = Math.min(L.cssWidth / v.w, L.cssHeight / v.h) || 1;
      const hs = Math.min(1, Math.max(0.55, HUD_CSS / (CTRL_H * this.cpu)));
      this.hs = hs;
      this.compact = FULL_ROW * hs > v.w - 2 * PAD * hs;
      const rowH = ROW_H * hs;
      this.boardView = { x: v.x + 8, y: v.y + rowH, w: v.w - 16, h: v.h - 2 * rowH };
      const B = this.boardView;
      this.area = { x: B.x + FRAME, y: B.y + FRAME, w: B.w - 2 * FRAME, h: B.h - 2 * FRAME };
      this.placeHud();
      // Scenery: the sky strip ends where the board's window starts; clouds drift inside it.
      this.sky.setY(B.y);
      this.clouds.forEach((c, k) => {
        c.setScale((0.8 - k * 0.12) / texScale(this, 'mh-cloud'));
        c.setPosition(v.x + ((k * 0.37 + 0.12) % 1) * v.w, B.y - rowH * (0.62 - k * 0.12));
      });
      const bleed = L.bleed;
      const strips = [
        [v.x, B.y + B.h, v.w, v.y + v.h - B.y - B.h],
        [v.x, B.y, B.x - v.x, B.h],
        [B.x + B.w, B.y, v.x + v.w - B.x - B.w, B.h],
      ];
      this.edges.forEach((e, i) => {
        const [x, y, w, h] = strips[i]!;
        e.setCrop(x! + bleed.x, y! + bleed.y, w!, h!);
      });
      this.placeBoard();
    }

    private placeHud(): void {
      const { hs, compact, viewRect: v, hud } = this;
      const at = (o: Phaser.GameObjects.Container, x: number, y: number) =>
        o.setPosition(x, y).setScale(hs);
      const top = v.y + PAD * hs;
      const left = v.x + PAD * hs;
      const right = v.x + v.w - PAD * hs;
      const tabsAt = (x: number) =>
        hud.tabs.forEach((t, i) => at(t.box, x + i * (W.tab + TAB_GAP) * hs, top));
      at(hud.moles.container, left, top);
      at(hud.hint.box, right - W.hint * hs, top);
      if (compact) {
        at(hud.time.container, v.x + (v.w - W.time * hs) / 2, top);
        tabsAt(v.x + (v.w - TABS_W * hs) / 2);
      } else {
        const timeX = right - (W.hint + GAP + W.time) * hs;
        at(hud.time.container, timeX, top);
        const mid = (left + W.moles * hs + timeX) / 2;
        tabsAt(mid - (TABS_W * hs) / 2);
        at(hud.board.container, mid - (W.board * hs) / 2, top);
      }
      const band = v.y + v.h - (ROW_H - PAD) * hs;
      at(hud.dig.box, left, band);
      at(hud.plant.box, left + (W.mode + 8) * hs, band);
      at(hud.zoom.box, right - W.zoom * hs, band);
      at(hud.fresh.box, v.x + (v.w - W.fresh * hs) / 2, band);
      // Centred, or between the left edge and the Zoom button when that is showing.
      const zoomX = right - W.zoom * hs;
      const readyX = this.view().needsZoom ? (left + zoomX) / 2 : v.x + v.w / 2;
      hud.ready.setPosition(readyX, band + (CTRL_H / 2) * hs).setScale(hs);
    }

    /** Positions the bed and every tile for the current zoom and camera. */
    private placeBoard(): void {
      if (this.tiles.length < this.cells()) return;
      const v = this.view();
      const A = this.area;
      if (!v.needsZoom) this.zoom = 'fit';
      if (v.transposed !== this.transposed && this.zoom === 'close') {
        this.transposed = v.transposed;
        this.centreOn(this.cursor);
      }
      this.transposed = v.transposed;
      const w = v.dc * v.cell;
      const h = v.dr * v.cell;
      let x = A.x + (A.w - w) / 2;
      let y = A.y + (A.h - h) / 2;
      if (this.zoom === 'close') {
        const clamp = (c: number, span: number, area: number) =>
          span <= area ? (area - span) / 2 : Math.min(16, Math.max(area - span - 16, c));
        x = A.x + clamp(A.w / 2 - this.cam.cx * v.cell, w, A.w);
        y = A.y + clamp(A.h / 2 - this.cam.cy * v.cell, h, A.h);
        this.cam = { cx: (A.x + A.w / 2 - x) / v.cell, cy: (A.y + A.h / 2 - y) / v.cell };
      }
      this.layer.setPosition(x, y);
      this.placeBed(w, h);
      for (const e of this.edges) e.setVisible(this.zoom === 'close');
      const s = v.cell / UNIT;
      const { cols } = SIZES[this.size];
      for (let i = 0; i < this.cells(); i++) {
        const [r, c] = [Math.floor(i / cols), i % cols];
        const [dx, dy] = v.transposed ? [r, c] : [c, r];
        this.tiles[i]!.setPosition((dx + 0.5) * v.cell, (dy + 0.5) * v.cell).setScale(s);
        this.marks[i]!.setPosition((dx + 0.5) * v.cell, (dy + 0.5) * v.cell).setScale(s);
      }
    }

    private inBoardView(x: number, y: number): boolean {
      const B = this.boardView;
      return x >= B.x && x <= B.x + B.w && y >= B.y && y <= B.y + B.h;
    }

    /** Canonical cell under a design-unit point, or -1. */
    private cellAt(x: number, y: number): number {
      if (!this.inBoardView(x, y)) return -1;
      const v = this.view();
      const dx = Math.floor((x - this.layer.x) / v.cell);
      const dy = Math.floor((y - this.layer.y) / v.cell);
      if (dx < 0 || dy < 0 || dx >= v.dc || dy >= v.dr) return -1;
      const [r, c] = v.transposed ? [dx, dy] : [dy, dx];
      return r * SIZES[this.size].cols + c;
    }

    private cellCentre(i: number): { x: number; y: number } {
      const t = this.tiles[i]!;
      return { x: this.layer.x + t.x, y: this.layer.y + t.y };
    }

    private tileScale(): number {
      return this.view().cell / UNIT;
    }

    // ─── actions ───
    private firstInput(): void {
      if (this.phase === 'playing' && !this.clockOn) {
        this.clockOn = true;
        this.tk.run.begin();
      }
    }

    private digAt(cell: number): void {
      if (cell < 0) return;
      this.cursor = cell;
      if (this.phase === 'picking') return this.beginGeneration(cell);
      if (this.phase !== 'playing' || !this.board) return;
      this.firstInput();
      const b = this.board;
      if (this.flowers[cell]) return this.nudgeCells([cell]);
      if (this.dug[cell]) {
        // Chord: a number with exactly that many daisies around it digs every other covered neighbour.
        const nb = neighbours(this.size)[cell]!;
        const covered = nb.filter((j) => !this.dug[j] && !this.flowers[j]);
        if (!b.counts[cell] || !covered.length) return;
        if (nb.filter((j) => this.flowers[j]).length !== b.counts[cell]) {
          this.tk.sfx.play('click', { detuneCents: -700 });
          return this.nudgeCells(covered);
        }
        const mole = covered.find((j) => b.moles[j]);
        if (mole !== undefined) return this.lose(mole);
        const opened = covered.flatMap((j) => dig(b, this.dug, j, this.flowers));
        return this.afterDig(opened);
      }
      if (b.moles[cell]) return this.lose(cell);
      this.afterDig(dig(b, this.dug, cell, this.flowers));
    }

    private afterDig(opened: number[]): void {
      if (opened.length >= 2)
        this.tk.sfx.play('coin', {
          detuneCents: Math.min(400, 100 * Math.floor(opened.length / 20)),
        });
      else if (opened.length) this.tk.sfx.play('click');
      this.redraw();
      this.ripple(opened);
      if (popcount(this.dug) === this.cells() - SIZES[this.size].moles) return this.win();
      this.saveRun();
      this.publishView();
    }

    private toggleFlower(cell: number): void {
      if (cell < 0) return;
      this.cursor = cell;
      if (this.phase === 'picking') return this.tk.ui.toast(strings.firstFlower);
      if (this.phase !== 'playing' || this.dug[cell]) return;
      this.firstInput();
      this.flowers[cell] = this.flowers[cell] ? 0 : 1;
      this.tk.sfx.play(this.flowers[cell] ? 'plant' : 'unplant');
      const m = this.marks[cell]!;
      const p = this.cellCentre(cell);
      const size = this.view().cell;
      if (this.flowers[cell]) {
        burst(this, p.x, p.y - size * 0.15, {
          count: 8,
          colors: ['#FFFFFF', colors.yellow, '#FFC4E1'],
          size: size * 0.14,
          distance: size * 0.75,
          lifeMs: 400,
          depth: 800,
        });
        this.hud.moles.bump();
        if (!this.tk.motion.reduced) {
          m.setScale(0);
          this.tweens.add({
            targets: m,
            scale: this.tileScale(),
            duration: 180,
            ease: 'Back.easeOut',
          });
        }
      } else
        burst(this, p.x, p.y, {
          count: 4,
          colors: DIRT,
          size: size * 0.12,
          distance: size * 0.5,
          lifeMs: 320,
          depth: 800,
        });
      this.redraw();
      this.saveRun();
      this.publishView();
    }

    private showHint(): void {
      if (this.phase !== 'playing' || !this.board) return;
      this.firstInput();
      const h = hint(this.board, this.dug, this.flowers);
      this.hints++;
      this.elapsed += HINT_PENALTY_MS;
      this.tk.sfx.play('click', { detuneCents: 500 });
      if (!h) return;
      if (h.kind === 'misplaced') this.tk.ui.toast(strings.misplaced);
      this.mark = {
        cell: h.cell,
        color: h.kind === 'dig' ? 'green' : 'orange',
        until: this.sceneMs + 2500,
      };
      this.pointer.setTexture(h.kind === 'dig' ? 'mh-hintArrow' : 'mh-hintBadge');
      this.cursor = h.cell;
      this.follow();
      this.saveRun();
    }

    private nudgeCells(cells: number[]): void {
      this.nudge = { cells, until: this.sceneMs + (this.tk.motion.reduced ? 300 : 160) };
    }

    private beginGeneration(cell: number): void {
      this.phase = 'generating';
      this.genCell = cell;
      const tk = this.tk;
      if (!tk.attract) {
        this.stats = withOutcome(this.stats, this.size, 'played');
        this.statsSave.set(this.stats);
        tk.run.begin();
      }
      // Attract counts attempts only (identical boards everywhere); play slices ≤ 24 ms per frame.
      this.gen = createGenerator(
        this.size,
        cell,
        this.runRng,
        tk.attract ? null : () => performance.now(),
      );
      if (tk.attract) {
        let r = null;
        while (!r) r = this.gen.step(0);
        this.boardReady(r);
      }
    }

    private boardReady(r: { moles: Uint8Array; origin: BoardOrigin }): void {
      this.gen = null;
      this.board = makeBoard(this.size, r.moles);
      this.origin = { src: r.origin.src, seed: `${this.runSeed}/${r.origin.seed}` };
      if (r.origin.src === 'unverified')
        this.tk.reportError(new Error('molehills: no no-guess board within the attempt cap'));
      this.start = this.genCell;
      this.phase = 'playing';
      this.clockOn = true;
      this.afterDig(dig(this.board, this.dug, this.genCell));
    }

    /**
     * Dig feedback: dirt puffs at a few opened patches, and the patches pop in rings outward from where the dig
     * started, all within about a third of a second. Big floods skip the pop (they read fine at once).
     */
    private ripple(opened: number[]): void {
      if (!opened.length) return;
      const cell = this.view().cell;
      const picks =
        opened.length <= 3
          ? opened
          : [0, 1, 2, 3].map((k) => opened[Math.floor((k * opened.length) / 4)]!);
      picks.forEach((i, k) => {
        const p = this.cellCentre(i);
        if (this.inBoardView(p.x, p.y))
          burst(this, p.x, p.y, {
            count: k ? 5 : 10,
            colors: DIRT,
            size: cell * 0.16,
            distance: cell * 0.9,
            gravity: cell * 0.6,
            lifeMs: 420,
            depth: 800,
          });
      });
      if (this.tk.motion.reduced || opened.length > 120) return;
      const { cols } = SIZES[this.size];
      const o = opened[0]!;
      const ringOf = (i: number) =>
        Math.max(
          Math.abs(Math.floor(i / cols) - Math.floor(o / cols)),
          Math.abs((i % cols) - (o % cols)),
        );
      let far = 1;
      for (const i of opened) far = Math.max(far, ringOf(i));
      const step = Math.min(28, 180 / far);
      const s = this.tileScale();
      for (const i of opened) {
        const delay = ringOf(i) * step;
        const targets = this.marks[i]!.visible
          ? [this.tiles[i]!, this.marks[i]!]
          : [this.tiles[i]!];
        for (const t of targets) t.setScale(s * 0.8);
        this.tweens.add({ targets, scale: s, delay, duration: 150, ease: 'Back.easeOut' });
      }
    }

    /** Moles (and wilted daisies) pop up in reading order after a game ends. */
    private reveal(cells: number[], delay = 0): void {
      if (this.tk.motion.reduced) return;
      const s = this.tileScale();
      const gap = Math.min(30, 500 / Math.max(1, cells.length));
      cells.forEach((i, k) => {
        const m = this.marks[i]!;
        m.setScale(0);
        this.tweens.add({
          targets: m,
          scale: s,
          delay: delay + k * gap,
          duration: 220,
          ease: 'Back.easeOut',
        });
      });
    }

    /** Win party: star confetti, a short shower of petals and a floating "cleared" banner. */
    private celebrate(): void {
      const v = this.view();
      const B = this.boardView;
      const cx = Math.min(B.x + B.w - 200, Math.max(B.x + 200, this.layer.x + (v.dc * v.cell) / 2));
      const cy = Math.min(B.y + B.h - 200, Math.max(B.y + 200, this.layer.y + (v.dr * v.cell) / 2));
      burst(this, cx, cy, {
        count: 30,
        shape: 'star',
        colors: CONFETTI,
        size: 24,
        distance: 380,
        gravity: 140,
        lifeMs: 1100,
      });
      burst(this, cx, cy, {
        count: 16,
        shape: 'spark',
        colors: [colors.yellow, '#FFFFFF'],
        size: 40,
        distance: 200,
        lifeMs: 600,
      });
      popText(this, cx, cy, strings.t('cleared', { name: strings[this.size] }), {
        px: 72,
        rise: 70,
        ms: 1300,
      });
      if (this.tk.motion.reduced) return;
      const r = this.decor;
      const tints = [0xffffff, 0xffc4e1, 0xfff0a0, 0xe2d8ff];
      for (let k = 0; k < 28; k++) {
        const x = B.x + r() * B.w;
        const p = this.add
          .image(x, B.y - 30 - r() * 100, 'mh-petal')
          .setDepth(900)
          .setTint(tints[k % 4]!)
          .setScale((0.6 + r() * 0.7) / 2)
          .setAngle(r() * 360);
        this.tweens.add({
          targets: p,
          y: B.y + B.h,
          x: x + (r() - 0.5) * 200,
          angle: p.angle + (r() - 0.5) * 720,
          delay: r() * 250,
          duration: 1100 + r() * 600,
          ease: 'Sine.easeIn',
          onComplete: () => p.destroy(),
        });
      }
    }

    private win(): void {
      const tk = this.tk;
      this.phase = 'over';
      this.clockOn = false;
      const b = this.board!;
      const moles: number[] = [];
      for (let i = 0; i < this.cells(); i++) if (b.moles[i]) moles.push(i);
      for (const i of moles) this.flowers[i] = 1; // bloom
      this.won = true;
      this.redraw();
      this.reveal(moles);
      this.celebrate();
      tk.sfx.play('win');
      if (tk.attract) return void this.time.delayedCall(1600, () => this.attractNext());
      const name = strings[this.size];
      const value = Math.floor(this.elapsed);
      const prevBest = this.stats[this.size].bestMs;
      this.endRun('won', value);
      if (prevBest && value < prevBest) tk.ui.toast(strings.newBest, { tone: 'success' });
      const streak = this.stats[this.size].streak;
      if (streak >= 2) tk.ui.toast(strings.t('streak', { n: streak }), { tone: 'success' });
      const next = this.size === 'garden' ? 'field' : this.size === 'field' ? 'meadow' : null;
      if (
        next &&
        this.stats[this.size].won >= 3 &&
        !this.stats[next].played &&
        !this.prefs.suggested.includes(next)
      ) {
        this.prefs = { ...this.prefs, suggested: [...this.prefs.suggested, next] };
        this.prefsSave.set(this.prefs);
        tk.ui.toast(strings.bigger);
      }
      const run = this.runId;
      this.time.delayedCall(tk.motion.reduced ? 400 : 1200, () => {
        if (run === this.runId)
          void this.gameOverCard(
            strings.t('cleared', { name }),
            value >= 1 && value <= MAX_MS ? [{ board: `time-${this.size}`, value }] : [],
          );
      });
    }

    /** The woken mole jumps up on a red patch; every other mole and any misplaced daisy is shown. */
    private lose(cell: number): void {
      const tk = this.tk;
      this.phase = 'over';
      this.clockOn = false;
      this.woken = cell;
      this.redraw();
      tk.sfx.play('yawn');
      const b = this.board!;
      const p = this.cellCentre(cell);
      const size = this.view().cell;
      shake(this, 220, 0.01);
      flash(this, colors.vermillion, 220, 0.3);
      burst(this, p.x, p.y, {
        count: 14,
        colors: DIRT,
        size: size * 0.2,
        distance: size * 1.4,
        gravity: size * 0.8,
        lifeMs: 520,
        depth: 800,
      });
      const rest: number[] = [];
      for (let i = 0; i < this.cells(); i++)
        if (i !== cell && (b.moles[i] ? !this.flowers[i] : this.flowers[i])) rest.push(i);
      this.reveal(rest, 250);
      if (!tk.motion.reduced) {
        const m = this.marks[cell]!;
        m.setScale(0);
        this.tweens.add({
          targets: m,
          scale: this.tileScale(),
          duration: 260,
          ease: 'Back.easeOut',
          easeParams: [3],
        });
        this.tweens.add({
          targets: m,
          angle: { from: -9, to: 9 },
          delay: 260,
          duration: 80,
          yoyo: true,
          repeat: 2,
          onComplete: () => m.setAngle(0),
        });
      }
      if (tk.attract) return void this.time.delayedCall(1200, () => this.attractNext());
      this.endRun('lost');
      const run = this.runId;
      this.time.delayedCall(tk.motion.reduced ? 400 : 1000, () => {
        if (run !== this.runId) return;
        tk.sfx.play('lose');
        void this.gameOverCard(strings.woke, []);
      });
    }

    /** Stats and save for a finished or abandoned run. */
    private endRun(o: 'won' | 'lost' | 'abandoned', ms = 0): void {
      this.stats = withOutcome(this.stats, this.size, o, ms);
      this.statsSave.set(this.stats);
      this.runSave.set(null);
      void this.runSave.flush();
    }

    private async gameOverCard(
      title: string,
      scores: { board: string; value: number }[],
    ): Promise<void> {
      const action = await this.tk.ui.gameOver({
        title,
        scores,
        meta: { gen: GEN_VERSION, origin: this.origin, start: this.start, hints: this.hints },
        actions: [
          { id: 'size', label: strings.changeSize },
          { id: 'view', label: strings.viewBoard },
        ],
      });
      if (this.tk.signal.aborted) return;
      if (action === 'view') {
        this.phase = 'review';
        return this.redraw();
      }
      this.newBoard(this.size);
    }

    private saveRun(): void {
      const tk = this.tk;
      if (tk.attract || this.phase !== 'playing' || !this.board) return;
      const { cols, rows } = SIZES[this.size];
      this.savedAtElapsed = this.elapsed;
      this.runSave.set({
        size: this.size,
        cols,
        rows,
        moles: toBits(this.board.moles),
        dug: toBits(this.dug),
        flowers: toBits(this.flowers),
        start: this.start,
        origin: this.origin,
        gen: GEN_VERSION,
        elapsedMs: Math.min(MAX_MS, Math.floor(this.elapsed)),
        hints: Math.min(999, this.hints),
        cursor: this.cursor,
        view: { zoom: this.zoom, ...this.cam },
        startedAt: new Date().toISOString(),
      });
    }

    private setSize(size: SizeId): void {
      if (this.phase !== 'picking') return;
      this.prefs = { ...this.prefs, size };
      this.prefsSave.set(this.prefs);
      this.newBoard(size);
    }

    private setFlowerMode(on: boolean): void {
      if (on === this.flowerMode) return;
      this.flowerMode = on;
      this.tk.sfx.play('click', { detuneCents: on ? 300 : 0 });
      if (!this.tk.attract) {
        this.prefs = { ...this.prefs, flowerMode: on };
        this.prefsSave.set(this.prefs);
      }
      this.publishView(false);
    }

    private toggleZoom(at?: number): void {
      if (!this.view().needsZoom) return;
      this.zoom = this.zoom === 'fit' ? 'close' : 'fit';
      if (at !== undefined && at >= 0) this.centreOn(at);
      this.placeBoard();
    }

    private centreOn(cell: number): void {
      const { cols } = SIZES[this.size];
      const [r, c] = [Math.floor(cell / cols), cell % cols];
      const [dx, dy] = this.view().transposed ? [r, c] : [c, r];
      this.cam = { cx: dx + 0.5, cy: dy + 0.5 };
    }

    /** Keeps the keyboard cursor at least one cell from the view's edge in close-up. */
    private follow(): void {
      if (this.zoom !== 'close') return;
      const p = this.cellCentre(this.cursor);
      const cell = this.view().cell;
      const A = this.area;
      if (
        p.x < A.x + 1.5 * cell ||
        p.x > A.x + A.w - 1.5 * cell ||
        p.y < A.y + 1.5 * cell ||
        p.y > A.y + A.h - 1.5 * cell
      ) {
        this.centreOn(this.cursor);
        this.placeBoard();
      }
    }

    /** A fitted board whose cells are too small to tap safely: taps zoom in instead of digging. */
    private tapZooms(): boolean {
      return this.view().needsZoom && this.zoom === 'fit' && !this.tk.attract;
    }

    // ─── input ───
    private bindPointer(): void {
      const world = (p: Phaser.Input.Pointer) => this.cameras.main.getWorldPoint(p.x, p.y);
      const live = () => !this.tk.attract && !this.tk.ui.open;
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (!live()) return;
        const w = world(p);
        if (p.rightButtonDown()) return this.toggleFlower(this.cellAt(w.x, w.y));
        // A second finger means a pinch or a stray touch, never a hold.
        if (this.press && this.press.id !== p.id) return void (this.press = null);
        this.swallowTap = false;
        const cell = this.phase === 'playing' && !this.tapZooms() ? this.cellAt(w.x, w.y) : -1;
        this.press = { id: p.id, x: p.x, y: p.y, t: this.sceneMs, cell, fired: false };
      });
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (
          this.press &&
          this.press.id === p.id &&
          Math.hypot(p.x - this.press.x, p.y - this.press.y) > 8 * (this.tk.layout.renderScale || 1)
        )
          this.press = null;
        if (!live() || p.wasTouch) return;
        const w = world(p);
        this.hover = this.cellAt(w.x, w.y);
      });
      this.input.on('pointerup', () => (this.press = null));
      this.input.on('gameout', () => (this.hover = -1));
    }

    private onTap(x: number, y: number): void {
      if (this.tk.ui.open) return;
      if (this.swallowTap) return void (this.swallowTap = false);
      if (!this.tk.attract) this.cursorShown = false;
      const s = this.hs;
      for (const b of this.buttons)
        if (
          b.box.visible &&
          x >= b.box.x &&
          x <= b.box.x + b.w * s &&
          y >= b.box.y &&
          y <= b.box.y + CTRL_H * s
        )
          return b.act();
      if (!this.inBoardView(x, y) || this.phase === 'review') return;
      const cell = this.cellAt(x, y);
      if (this.phase !== 'picking' && this.tapZooms()) return this.toggleZoom(cell);
      // Plant mode plants on covered patches; a tap on a number still chords.
      if (this.flowerMode && this.phase === 'playing' && cell >= 0 && !this.dug[cell])
        this.toggleFlower(cell);
      else this.digAt(cell);
    }

    private onPan(dx: number, dy: number): void {
      if (!this.panFrom || this.zoom !== 'close') return;
      const v = this.view();
      this.press = null;
      this.cam = {
        cx: this.panFrom.cx - dx / this.cpu / v.cell,
        cy: this.panFrom.cy - dy / this.cpu / v.cell,
      };
      this.placeBoard();
    }

    private onKey(action: string): void {
      if (this.tk.attract) {
        if (action === 'flowerMode') this.setFlowerMode(!this.flowerMode);
        return;
      }
      this.cursorShown = true;
      if (this.phase === 'review') {
        if (action === 'dig' || action === 'newBoard') this.newBoard(this.size);
        return;
      }
      const v = this.view();
      const { cols, rows } = SIZES[this.size];
      const [r, c] = [Math.floor(this.cursor / cols), this.cursor % cols];
      let [dx, dy] = v.transposed ? [r, c] : [c, r];
      switch (action) {
        case 'up':
        case 'down':
        case 'left':
        case 'right': {
          if (action === 'up') dy = Math.max(0, dy - 1);
          if (action === 'down') dy = Math.min(v.dr - 1, dy + 1);
          if (action === 'left') dx = Math.max(0, dx - 1);
          if (action === 'right') dx = Math.min(v.dc - 1, dx + 1);
          const [nr, nc] = v.transposed ? [dx, dy] : [dy, dx];
          this.cursor = Math.min(rows - 1, nr) * cols + Math.min(cols - 1, nc);
          this.follow();
          break;
        }
        case 'dig':
          return this.digAt(this.cursor);
        case 'flower':
          return this.toggleFlower(this.cursor);
        case 'flowerMode':
          return this.setFlowerMode(!this.flowerMode);
        case 'zoom':
          return this.toggleZoom(this.cursor);
        case 'hint':
          return this.showHint();
        case 'size1':
        case 'size2':
        case 'size3':
          return this.setSize(SIZE_IDS[Number(action.slice(4)) - 1]!);
      }
    }

    // ─── attract ───
    private startAttractRun(): void {
      const a = this.tk.attract!;
      this.newBoard(ATTRACT_SIZE);
      this.attractStart = a.step;
      this.attractMoves = 0;
      this.publishView();
    }

    private attractNext(): void {
      this.attractRun++;
      void this.tk.ui
        .gameOver({ title: '', scores: [] })
        .then(() => !this.tk.signal.aborted && this.startAttractRun());
    }

    /** `replan` false keeps the planned move (switching mode mid-sequence doesn't change the board). */
    private publishView(replan = true): void {
      const a = this.tk.attract;
      if (!a) return;
      if (!replan)
        return a.setView({
          startStep: this.attractStart,
          next: this.attractNextMove,
          flowerMode: this.flowerMode,
        } satisfies AttractView);
      let next: AttractView['next'] = null;
      if (this.phase === 'picking')
        next = {
          kind: 'dig',
          ...this.cellCentre(ATTRACT_FIRST.row * SIZES[this.size].cols + ATTRACT_FIRST.col),
        };
      else if (this.phase === 'playing' && this.board) {
        // Every third move plants a daisy on a proven mole so the reel shows both actions.
        const flower =
          this.attractMoves++ % 3 === 2
            ? provenMoles(this.board, this.dug).find((i) => !this.flowers[i])
            : undefined;
        const h =
          flower !== undefined
            ? ({ cell: flower, kind: 'flower' } as const)
            : hint(this.board, this.dug, this.flowers);
        if (h && h.kind !== 'misplaced')
          next = { kind: h.kind === 'dig' ? 'dig' : 'flower', ...this.cellCentre(h.cell) };
      }
      this.attractNextMove = next;
      a.setView({
        startStep: this.attractStart,
        next,
        flowerMode: this.flowerMode,
      } satisfies AttractView);
    }

    // ─── frame ───
    override update(_t: number, delta: number): void {
      this.sceneMs += delta;
      const a = this.tk.attract;
      if (this.phase === 'playing' && this.clockOn) {
        this.elapsed = a
          ? Math.max(0, ((a.step - this.attractStart - ATTRACT_FIRST_STEP) * 1000) / 60)
          : this.elapsed + delta;
        if (this.elapsed - this.savedAtElapsed >= 5000) this.saveRun();
      }
      if (this.gen) {
        const r = this.gen.step(24);
        if (r) this.boardReady(r);
      }
      const pr = this.press;
      if (pr && !pr.fired && pr.cell >= 0 && this.sceneMs - pr.t >= LONG_PRESS_MS) {
        pr.fired = true;
        if (!this.dug[pr.cell]) {
          this.swallowTap = true;
          this.toggleFlower(pr.cell);
        }
      }
      if (!this.tk.motion.reduced) {
        const v = this.viewRect;
        for (const c of this.clouds) {
          c.x += delta * 0.006;
          if (c.x > v.x + v.w + 80) c.x = v.x - 80;
        }
      }
      this.drawFx();
      this.syncHud();
    }

    private redraw(): void {
      const b = this.board;
      const over = this.phase === 'over' || this.phase === 'review';
      for (let i = 0; i < this.cells(); i++) {
        const tile = this.tiles[i]!;
        const m = this.marks[i]!;
        const dug = this.dug[i];
        const v = (Math.imul(i, 2654435761) >>> 13) % 6; // decoration variant per patch
        tile.setTexture(
          i === this.woken
            ? 'mh-woketile'
            : dug
              ? `mh-soil${v % 2}`
              : this.flowers[i]
                ? 'mh-planted'
                : `mh-covered${v % 3}`,
        );
        let mark: string | null = null;
        if (i === this.woken) mark = 'wokemole';
        else if (dug && b?.counts[i]) mark = `n${b.counts[i]}`;
        else if (this.flowers[i])
          mark = over && b && !b.moles[i] ? 'wilted' : over && this.won ? 'molebloom' : 'flower';
        else if (over && b?.moles[i]) mark = 'mole';
        m.setVisible(mark !== null);
        if (mark) m.setTexture(`mh-${mark}`);
      }
    }

    private drawFx(): void {
      const g = this.fx.clear();
      const v = this.view();
      const cell = v.cell;
      const ring = (i: number, color: number, w: number, alpha = 1) => {
        const t = this.tiles[i];
        if (!t || i < 0 || i >= this.cells()) return;
        g.lineStyle(w, color, alpha).strokeRoundedRect(
          t.x - cell / 2 + w / 2,
          t.y - cell / 2 + w / 2,
          cell - w,
          cell - w,
          cell * 0.22,
        );
      };
      // Plant mode: a green border round the whole bed, so the mode is visible where the player is looking.
      if (this.flowerMode && this.phase === 'playing') {
        const bw = Math.max(6, 8 * this.hs);
        g.lineStyle(bw, colorNum('green')).strokeRoundedRect(
          -FRAME - bw / 2 - 2,
          -FRAME - bw / 2 - 2,
          v.dc * cell + 2 * FRAME + bw + 4,
          v.dr * cell + 2 * FRAME + bw + 4,
          10,
        );
      }
      if (this.hover >= 0 && !this.tk.attract)
        ring(
          this.hover,
          this.flowerMode ? colorNum('green') : 0xffffff,
          Math.max(3, cell * 0.06),
          0.85,
        );
      if (this.nudge && this.sceneMs < this.nudge.until)
        for (const c of this.nudge.cells) ring(c, 0xffffff, Math.max(4, cell * 0.07));
      // Holding a covered patch: a ring fills clockwise until the daisy is planted.
      const pr = this.press;
      const held = pr ? this.sceneMs - pr.t : 0;
      if (pr && !pr.fired && pr.cell >= 0 && !this.dug[pr.cell] && held >= PRESS_SHOW_MS) {
        const t = this.tiles[pr.cell]!;
        const k = Math.min(1, (held - PRESS_SHOW_MS) / (LONG_PRESS_MS - PRESS_SHOW_MS));
        const r = cell * 0.62;
        g.lineStyle(Math.max(8, cell * 0.14), colorNum('ink'), 0.6).strokeCircle(t.x, t.y, r);
        g.lineStyle(Math.max(5, cell * 0.09), colorNum('green'))
          .beginPath()
          .arc(t.x, t.y, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2)
          .strokePath();
      }
      const hinting = !!this.mark && this.sceneMs < this.mark.until;
      this.pointer.setVisible(hinting);
      if (hinting && this.mark) {
        // A pulsing ring plus a bobbing marker: an arrow for "dig here", a daisy badge for a daisy (shape, not colour).
        const pulse = this.tk.motion.reduced ? 0.5 : (Math.sin(this.sceneMs / 120) + 1) / 2;
        ring(this.mark.cell, colorNum('ink'), Math.max(8, cell * 0.12));
        ring(this.mark.cell, colorNum(this.mark.color), Math.max(4, cell * 0.06) + pulse * 3);
        const t = this.tiles[this.mark.cell]!;
        const size = Math.max(30, cell * 0.62);
        this.pointer
          .setPosition(t.x, t.y - cell * 0.5 - size * (0.3 + pulse * 0.15))
          .setScale((size / 64) * (0.95 + pulse * 0.1) * 0.5);
      }
      if (this.cursorShown && !this.tk.attract && this.phase !== 'over') {
        ring(this.cursor, colorNum('ink'), Math.max(8, cell * 0.12));
        ring(this.cursor, colorNum('yellow'), Math.max(4, cell * 0.06));
      }
    }

    private syncHud(): void {
      const h = this.hud;
      const picking = this.phase === 'picking';
      const attract = !!this.tk.attract;
      const tabs = picking && !attract;
      const setTex = (img: Phaser.GameObjects.Image, key: string) =>
        img.texture.key !== key && img.setTexture(key);
      const setColor = (t: Phaser.GameObjects.Text, c: string) =>
        t.style.color !== c && t.setColor(c); // setColor re-renders the text
      h.moles.set(String(Math.max(-99, SIZES[this.size].moles - popcount(this.flowers))));
      SIZE_IDS.forEach((id, i) => {
        const on = id === this.size;
        const t = h.tabs[i]!;
        t.box.setVisible(tabs);
        setTex(t.bg, on ? 'mh-tabOn' : 'mh-tabOff');
        setColor(t.text, colors[on ? 'ink' : 'text']);
      });
      const pills = !(this.compact && tabs);
      h.moles.container.setVisible(pills);
      h.time.container.setVisible(pills);
      const { cols, rows } = SIZES[this.size];
      h.board.container.setVisible(!tabs && !this.compact);
      h.board.set(strings.t('sizeLabel', { name: strings[this.size], cols, rows }));
      h.time.set(fmtTime(this.elapsed));
      const best = this.stats[this.size].bestMs;
      h.time.setLabel(best ? strings.t('bestLabel', { time: fmtTime(best) }) : strings.timeLabel);
      h.hint.box.setVisible(this.phase === 'playing' && !attract);
      const modes = this.phase === 'playing';
      for (const [b, on, key] of [
        [h.dig, !this.flowerMode, 'dig'],
        [h.plant, this.flowerMode, 'plant'],
      ] as const) {
        b.box.setVisible(modes);
        setTex(b.bg, `mh-${key}${on ? 'On' : 'Off'}`);
        setColor(b.text, colors[on ? 'ink' : 'text']);
      }
      h.zoom.box.setVisible(this.view().needsZoom && !attract);
      h.fresh.box.setVisible(this.phase === 'review');
      h.ready.setVisible(picking && !attract);
    }
  }

  return [Play];
};
