// The single Sumslide scene: drawing, input, saves, sound and the demo. The rules live in logic.ts.
//
// Crispness: the tray, tiles and HUD cards are laid out in whole canvas pixels and their textures are drawn at
// exactly the size they are shown, so nothing is resampled. When the view changes shape the layout-dependent
// objects and textures are rebuilt for the new size.
import type Phaser from 'phaser';
import { colorNum, formatScore, prng, shade, type Rng, type Save } from '@pocketcade/toolkit';
import {
  burst,
  canvasTexture,
  popText,
  shake,
  type SceneFactory,
} from '@pocketcade/toolkit/phaser';
import { OPENING, type AttractView } from './attract.ts';
import {
  GOAL_BAR,
  RAINBOW,
  THEMES,
  cellOffset,
  drawBackdrop,
  drawBadge,
  drawBar,
  drawButton,
  drawEcho,
  drawFlash,
  drawGlow,
  drawMote,
  drawPanel,
  drawRing,
  drawShock,
  drawTile,
  drawTray,
  drawUndoIcon,
  tileFill,
  trayGeo,
  type TrayGeo,
} from './art.ts';
import { layoutHud, type HudLayout, type Rect } from './layout.ts';
import {
  DIRS,
  ECHO,
  ECHO_CHARGE_MAX,
  applyMove,
  canMove,
  goalLevel,
  goalProgress,
  labelOf,
  newRun,
  undosAfterUndo,
  valueOf,
  type Dir,
  type MoveOutcome,
} from './logic.ts';
import { isRun, type RunSave, type RunSnapshot } from './save.ts';
import { strings } from './strings.ts';

type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
type Box = Phaser.GameObjects.Container;
type Draw = (ctx: CanvasRenderingContext2D) => void;
interface Card {
  box: Box;
  /** design units */
  w: number;
  h: number;
  /** canvas pixels */
  wpx: number;
  hpx: number;
}

const DRAG_COMMIT = 30;
/** inner padding of a HUD card, design units */
const PAD = 14;
const MOTES = 30;
const MOTE_SIZE = 44;
/** Merge notes climb a pentatonic scale, one step per tile level, across two octaves. */
const PENTATONIC = [0, 200, 400, 700, 900];

function mergePitch(level: number): number {
  const i = Math.max(0, level - 2);
  return Math.min(1200, -1200 + 1200 * Math.floor(i / 5) + PENTATONIC[i % 5]!);
}

function hex16(rng: Rng): string {
  return [rng.nextUint32(), rng.nextUint32()].map((n) => n.toString(16).padStart(8, '0')).join('');
}

function dragDir(dx: number, dy: number): Dir | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const major = Math.max(ax, ay);
  if (major < DRAG_COMMIT || major < 1.5 * Math.min(ax, ay)) return null;
  return ax >= ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export const createScenes: SceneFactory = (_P, kit) => {
  class Play extends kit.Scene {
    private runSave!: Save<RunSave | null>;
    private state: RunSnapshot | null = null;
    private rng!: Rng;
    private seed = '';
    private undo: RunSave['undo'] = { left: 1, prev: null };
    private bestScore: number | null = null;
    private bestTile = 0;
    private over = false;
    private ending = false;

    /** canvas pixels per design unit */
    private z = 1;
    private L!: HudLayout;
    private layoutKey = '';
    private geo!: TrayGeo;
    /** the tray's top-left in canvas pixels from the view's corner */
    private trayPx = { x: 0, y: 0 };
    /** objects and textures that depend on the layout */
    private built: Phaser.GameObjects.GameObject[] = [];
    private texKeys = new Set<string>();

    private bg: Img[] = [];
    private glow!: Img;
    private theme = -1;
    private fade: Phaser.Tweens.Tween | null = null;
    private motes: { img: Img; speed: number; top: number; span: number }[] = [];

    private tileLayer!: Box;
    private pool: Img[] = [];
    private slots: Array<Img | null> = [];
    private flashes: Img[] = [];
    private shockImg!: Img;
    private moveTweens: Phaser.Tweens.Tween[] = [];
    private pendingFinish: (() => void) | null = null;
    private pendingTimer: Phaser.Time.TimerEvent | null = null;
    private hud!: {
      score: Txt;
      scoreW: number;
      best: Txt;
      percent: Txt;
      chip: Img;
      chipPx: number;
      goalBar: Img;
      echoCaption: Txt;
      echoValue: Txt;
      echoW: number;
      echoBar: Img;
      undoOn: Img;
      undoIcon: Img;
      undoLabel: Txt;
      badge: Img;
      count: Txt;
    };

    constructor() {
      super('play');
    }

    create(): void {
      this.tk.deferReady();
      this.setup().then(
        () => this.tk.ready(),
        (e: unknown) => {
          this.tk.reportError(e);
          this.tk.ready();
        },
      );
    }

    override update(_time: number, delta: number): void {
      if (this.tk.motion.reduced) return;
      for (const m of this.motes) {
        m.img.y -= (m.speed * delta) / 1000;
        if (m.img.y < m.top) m.img.y += m.span;
      }
    }

    // ─── setup ───
    private async setup(): Promise<void> {
      const tk = this.tk;
      this.z = kit.renderScale;
      this.drawScenery();
      tk.loading(0.3);
      this.build();
      tk.loading(0.5);

      this.runSave = tk.createSave<RunSave | null>({
        key: 'run',
        defaults: () => null,
        validate: (d): d is RunSave | null => d === null || isRun(d),
        debounceMs: 0,
      });
      const launch = tk.ctx.launch;
      // the bests are display only: a leaderboard failure must not stop the game
      const top = (board: string) =>
        launch === 'attract' ? [] : tk.host.scores.top(board, 1).catch(() => []);
      const [run, bestScore, bestTile] = await Promise.all([
        launch === 'play' ? this.runSave.load() : null,
        top('best-score'),
        top('best-tile'),
      ]);
      if (tk.signal.aborted) return; // unmounted while loading: the scene is gone
      tk.loading(0.8);
      this.bestScore = bestScore[0]?.value ?? null;
      this.bestTile = bestTile[0]?.value ?? 0;

      const saved = run?.data ?? null;
      if (saved && saved.phase === 'playing') this.restore(saved);
      else this.startNewRun();
      this.refresh();
      this.bindInput();
      tk.ui.onRestart(() => this.playAgain());
      tk.on('resize', () => this.relayout());
      tk.loading(1);
      // a run saved after its final move but before the game-over write: finish it now
      if (this.state && !canMove(this.state.cells)) void this.gameOver();
    }

    private restore(saved: RunSave): void {
      const { cells, score, moves, maxLevel, echoCharge, echoes, rung, rng } = saved;
      this.state = { cells, score, moves, maxLevel, echoCharge, echoes, rung, rng };
      this.seed = saved.seed;
      this.undo = saved.undo;
      this.rng = this.tk.rng.create(rng);
    }

    private startNewRun(): void {
      this.seed = `sumslide:run:${hex16(this.tk.rng.main)}`;
      this.rng = this.tk.rng.create(this.seed);
      // the demo always opens on the same mid-game tray
      this.state = this.tk.attract
        ? { ...OPENING, cells: [...OPENING.cells], moves: 0, echoes: 0, rng: this.rng.state() }
        : newRun(this.rng);
      this.undo = { left: 1, prev: null };
      this.over = false;
      this.ending = false;
      this.saveRun('playing');
    }

    private saveRun(phase: RunSave['phase']): void {
      if (this.state) this.runSave.set({ ...this.state, phase, seed: this.seed, undo: this.undo });
    }

    /** Redraws everything that shows the run. */
    private refresh(): void {
      this.renderBoard();
      this.updateHud();
      if (this.state) this.tk.attract?.setView({ cells: this.state.cells } satisfies AttractView);
    }

    // ─── pixel helpers ───
    /** A texture drawn in canvas pixels; dropped when the layout is rebuilt. */
    private texture(name: string, w: number, h: number, draw: Draw): string {
      const key = `ss-${name}`;
      this.texKeys.add(key);
      return canvasTexture(this, key, w, h, draw, { scale: 1 });
    }

    /** The design-unit x (or y) that lands `px` canvas pixels from the view's left (or top) edge. */
    private ux(px: number): number {
      return this.tk.layout.view.x + px / this.z;
    }
    private uy(px: number): number {
      return this.tk.layout.view.y + px / this.z;
    }

    private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
      this.built.push(o);
      return o;
    }

    /** An image shown 1:1 inside a card, its top-left `px`, `py` pixels from the card's. */
    private part(box: Box, key: string, px: number, py: number): Img {
      const img = this.add
        .image(px / this.z, py / this.z, key)
        .setOrigin(0)
        .setScale(1 / this.z);
      box.add(img);
      return img;
    }

    private text(box: Box, x: number, y: number, px: number, ox = 0, oy = 0, muted = false): Txt {
      const t = kit
        .text(this, x, y, '', {
          px,
          weight: muted ? 600 : 700,
          color: muted ? 'textMuted' : 'text',
        })
        .setOrigin(ox, oy);
      box.add(t);
      return t;
    }

    private tileTexture(size: number, code: number): string {
      return this.texture(`tile-${size}-${code}`, size, size, (ctx) =>
        code === ECHO
          ? drawEcho(ctx, size, strings.echoLabel)
          : drawTile(ctx, size, code, labelOf(code)),
      );
    }

    /** The centre of a cell in design units; a tile placed here sits on whole pixels. */
    private centre(index: number): { x: number; y: number } {
      const o = cellOffset(this.geo, index);
      const half = this.geo.cell / 2;
      return { x: this.ux(this.trayPx.x + o.x + half), y: this.uy(this.trayPx.y + o.y + half) };
    }

    // ─── scenery (independent of the layout) ───
    /** Themed gradients that cross-fade, a soft light behind the tray and slow drifting tile motes. */
    private drawScenery(): void {
      const { width, height, bleed } = this.tk.layout;
      const fw = width + bleed.x * 2;
      const fh = height + bleed.y * 2;
      THEMES.forEach((theme, i) =>
        canvasTexture(this, `ss-bg-${i}`, fw, fh, (ctx) => drawBackdrop(ctx, fw, fh, theme), {
          scale: 0.25,
        }),
      );
      this.bg = [0, 1].map((i) =>
        this.add
          .image(-bleed.x, -bleed.y, 'ss-bg-0')
          .setOrigin(0)
          .setDisplaySize(fw, fh)
          .setDepth(-1000 + i)
          .setAlpha(1 - i),
      );
      canvasTexture(this, 'ss-glow', 256, 256, (ctx) => drawGlow(ctx, 256), { scale: 1 });
      this.glow = this.add.image(0, 0, 'ss-glow').setDepth(-950).setAlpha(0.22);

      for (const outline of [false, true])
        canvasTexture(this, `ss-mote-${outline}`, MOTE_SIZE, MOTE_SIZE, (ctx) =>
          drawMote(ctx, MOTE_SIZE, outline),
        );
      const rnd = prng(11);
      const top = -bleed.y - MOTE_SIZE;
      const span = fh + MOTE_SIZE * 2;
      for (let i = 0; i < MOTES; i++) {
        const near = i % 3 === 0;
        const size = near ? 26 + rnd() * 18 : 10 + rnd() * 12;
        const img = this.add
          .image(-bleed.x + rnd() * fw, top + rnd() * span, `ss-mote-${i % 4 === 1}`)
          .setScale(size / MOTE_SIZE / this.z)
          .setAngle(rnd() * 90 - 45)
          .setAlpha(near ? 0.1 : 0.06)
          .setDepth(-900);
        this.motes.push({ img, speed: near ? 9 + rnd() * 6 : 4 + rnd() * 3, top, span });
      }
    }

    private setTheme(index: number, animate: boolean): void {
      if (index === this.theme) return;
      this.theme = index;
      const key = `ss-bg-${index}`;
      const [back, front] = this.bg as [Img, Img];
      this.glow.setTint(colorNum(THEMES[index]!.accent));
      this.fade?.remove();
      this.fade = null;
      const ms = animate ? this.tk.motion.ms('celebrate') : 0;
      if (ms === 0) {
        back.setTexture(key);
        front.setAlpha(0);
        return;
      }
      if (front.alpha > 0) back.setTexture(front.texture.key);
      front.setTexture(key).setAlpha(0);
      this.fade = this.tweens.add({
        targets: front,
        alpha: 1,
        duration: ms,
        onComplete: () => {
          back.setTexture(key);
          front.setAlpha(0);
        },
      });
    }

    // ─── layout-dependent drawing ───
    /** Side of the top-right corner square the pause button covers, in design units. */
    private pauseSide(): number {
      if (this.tk.attract) return 0;
      const { view, cssWidth, cssHeight } = this.tk.layout;
      const css = Math.min(cssWidth / view.width, cssHeight / view.height);
      return Math.ceil(Math.min(130, Math.max(60, 64 / css)) / 10) * 10;
    }

    private build(): void {
      const { view } = this.tk.layout;
      const z = this.z;
      const L = (this.L = layoutHud(view, this.pauseSide()));
      this.layoutKey = JSON.stringify(L);
      const geo = (this.geo = trayGeo(Math.round(L.tray.size * z)));
      const slack = (L.tray.size * z - geo.size) / 2;
      this.trayPx = {
        x: Math.round((L.tray.x - view.x) * z + slack),
        y: Math.round((L.tray.y - view.y) * z + slack),
      };
      const full = geo.size + geo.margin * 2;
      const tray = this.texture(`tray-${geo.size}`, full, full, (ctx) => drawTray(ctx, geo));
      this.keep(
        this.add
          .image(this.ux(this.trayPx.x - geo.margin), this.uy(this.trayPx.y - geo.margin), tray)
          .setOrigin(0)
          .setScale(1 / z),
      );
      const mid = L.tray.size / 2;
      this.glow
        .setPosition(L.tray.x + mid, L.tray.y + mid)
        .setDisplaySize(L.tray.size * 1.8, L.tray.size * 1.8);

      const cell = geo.cell;
      this.tileLayer = this.keep(this.add.container(0, 0).setDepth(10));
      for (let level = 2; level <= 11; level++) this.tileTexture(cell, level);
      this.tileTexture(cell, ECHO);
      this.pool = [];
      for (let i = 0; i < 16; i++) {
        const tile = this.add.image(0, 0, this.tileTexture(cell, 1)).setVisible(false);
        this.pool.push(tile);
        this.tileLayer.add(tile);
      }
      this.slots = new Array<Img | null>(16).fill(null);

      const flash = this.texture(`flash-${cell}`, cell, cell, (ctx) => drawFlash(ctx, cell));
      this.flashes = [0, 1, 2, 3].map(() =>
        this.keep(
          this.add
            .image(0, 0, flash)
            .setScale(1 / z)
            .setDepth(20)
            .setVisible(false),
        ),
      );
      const ring = Math.round(cell * 2.2);
      const shock = this.texture(`shock-${cell}`, ring, ring, (ctx) => drawShock(ctx, ring, cell));
      this.shockImg = this.keep(this.add.image(0, 0, shock).setDepth(30).setVisible(false));
      this.buildHud(L);
    }

    /** A glass card at a layout rect, snapped to whole pixels. */
    private card(r: Rect): Card {
      const { view } = this.tk.layout;
      const z = this.z;
      const wpx = Math.round(r.w * z);
      const hpx = Math.round(r.h * z);
      const radius = Math.round(Math.min(18 * z, hpx * 0.24));
      const box = this.keep(
        this.add
          .container(
            this.ux(Math.round((r.x - view.x) * z)),
            this.uy(Math.round((r.y - view.y) * z)),
          )
          .setDepth(500),
      );
      const key = this.texture(`panel-${wpx}x${hpx}`, wpx, hpx, (ctx) =>
        drawPanel(ctx, wpx, hpx, radius),
      );
      this.part(box, key, 0, 0);
      return { box, w: wpx / z, h: hpx / z, wpx, hpx };
    }

    private caption(box: Box, x: number, value: string): Txt {
      return this.text(box, x, PAD - 3, 14, 0, 0, true)
        .setLetterSpacing(1)
        .setText(value);
    }

    /** A progress bar along the bottom of a card; returns the fill, which is cropped to the progress. */
    private meter(c: Card, colours: readonly string[]): Img {
      const pad = Math.round(PAD * this.z);
      const w = c.wpx - pad * 2;
      const h = Math.round(8 * this.z);
      const y = c.hpx - pad - h;
      const track = this.texture(`bar-${w}x${h}`, w, h, (ctx) => drawBar(ctx, w, h));
      this.part(c.box, track, pad, y);
      const fill = this.texture(`bar-${colours[0]}-${w}x${h}`, w, h, (ctx) =>
        drawBar(ctx, w, h, colours),
      );
      return this.part(c.box, fill, pad, y);
    }

    private buildHud(L: HudLayout): void {
      const z = this.z;
      const pad = Math.round(PAD * z);

      // Score, with the best underneath (or on the right when the card is wide).
      const s = this.card(L.score);
      const wide = s.w >= s.h * 2.6;
      this.caption(s.box, PAD, strings.score);
      const score = wide
        ? this.text(s.box, PAD, s.h - PAD + 6, Math.min(48, s.h * 0.5), 0, 1)
        : this.text(s.box, PAD, s.h * 0.5 + 1, Math.min(40, s.h * 0.36), 0, 0.5);
      const best = wide
        ? this.text(s.box, s.w - PAD, s.h / 2, 20, 1, 0.5, true)
        : this.text(s.box, PAD, s.h - PAD + 3, 15, 0, 1, true);

      // Goal: the goal tile itself, how far along the tray is, and a bar.
      const g = this.card(L.goal);
      const icon = Math.min(g.hpx - pad * 2 - Math.round(15 * z), Math.round(70 * z));
      this.caption(g.box, PAD, strings.goal);
      const percent = this.text(g.box, PAD, PAD + 14, 22);
      const chip = this.part(g.box, this.tileTexture(icon, 5), g.wpx - pad - icon, pad);
      const goalBar = this.meter(g, GOAL_BAR);

      // Echo: its ring, moves until the next one, and a charge bar.
      const e = this.card(L.echo);
      const ringKey = this.texture(`echo-icon-${icon}`, icon, icon, (ctx) =>
        drawRing(ctx, icon / 2, icon / 2, icon * 0.39, icon * 0.18),
      );
      this.part(e.box, ringKey, pad, pad);
      const tx = PAD + icon / z + 10;
      const echoCaption = this.caption(e.box, tx, '');
      const echoValue = this.text(e.box, tx, PAD + 14, 20);
      const echoBar = this.meter(e, RAINBOW);

      // Undo: a solid key when there is a move to take back, with the undos left in a badge.
      const u = this.card(L.undo);
      const radius = Math.round(Math.min(18 * z, u.hpx * 0.24));
      const onKey = this.texture(`button-${u.wpx}x${u.hpx}`, u.wpx, u.hpx, (ctx) =>
        drawButton(ctx, u.wpx, u.hpx, radius),
      );
      const undoOn = this.part(u.box, onKey, 0, 0);
      const row = u.w >= u.h * 1.8;
      const arrow = Math.round(Math.min(u.wpx, u.hpx) * (row ? 0.5 : 0.42));
      const arrowKey = this.texture(`undo-${arrow}`, arrow, arrow, (ctx) =>
        drawUndoIcon(ctx, arrow),
      );
      const ax = row ? u.hpx * 0.55 : u.wpx / 2;
      const ay = u.hpx * (row ? 0.46 : 0.36);
      const undoIcon = this.part(
        u.box,
        arrowKey,
        Math.round(ax - arrow / 2),
        Math.round(ay - arrow / 2),
      );
      const undoLabel = row
        ? this.text(u.box, u.h * 1.05, u.h * 0.46, 22, 0, 0.5)
        : this.text(u.box, u.w / 2, u.h * 0.72, 16, 0.5, 0.5);
      undoLabel.setText(strings.undo);
      const dot = Math.round(26 * z);
      const bx = row ? u.wpx - Math.round(u.hpx * 0.5) : u.wpx - Math.round(17 * z);
      const by = row ? Math.round(u.hpx * 0.46) : Math.round(17 * z);
      const badgeKey = this.texture(`badge-${dot}`, dot, dot, (ctx) => drawBadge(ctx, dot));
      const badge = this.part(u.box, badgeKey, bx - Math.round(dot / 2), by - Math.round(dot / 2));
      const count = this.text(u.box, bx / z, by / z, 16, 0.5, 0.5);

      this.hud = {
        score,
        scoreW: wide ? s.w * 0.55 : s.w - PAD * 2,
        best,
        percent,
        chip,
        chipPx: icon,
        goalBar,
        echoCaption,
        echoValue,
        echoW: e.w - tx - PAD,
        echoBar,
        undoOn,
        undoIcon,
        undoLabel,
        badge,
        count,
      };
    }

    /** Rebuilds the tray, tiles and HUD when the view changes shape (rotation, fullscreen). */
    private relayout(): void {
      if (JSON.stringify(layoutHud(this.tk.layout.view, this.pauseSide())) === this.layoutKey)
        return;
      this.snap();
      const h = this.hud;
      this.tweens.killTweensOf([
        ...this.flashes,
        this.shockImg,
        h.score,
        h.chip,
        h.badge,
        h.undoIcon,
      ]);
      for (const o of this.built) o.destroy();
      this.built = [];
      for (const key of this.texKeys) this.textures.remove(key);
      this.texKeys.clear();
      this.build();
      this.refresh();
      if (this.over) for (const t of this.pool) t.setAlpha(0.55);
    }

    // ─── board and HUD ───
    private renderBoard(): void {
      if (!this.state) return;
      for (const t of this.pool) t.setVisible(false);
      this.slots.fill(null);
      let next = 0;
      this.state.cells.forEach((code, i) => {
        if (code === 0) return;
        const tile = this.pool[next++]!;
        const c = this.centre(i);
        tile
          .setTexture(this.tileTexture(this.geo.cell, code))
          .setPosition(c.x, c.y)
          .setScale(1 / this.z)
          .setAlpha(1)
          .setVisible(true);
        this.slots[i] = tile;
      });
    }

    /** Shows `frac` of a bar's fill. */
    private fill(bar: Img, frac: number): void {
      const w = Math.round(frac * bar.width);
      bar.setVisible(w > 0).setCrop(0, 0, w, bar.height);
    }

    /** A quick scale pop back to `base` (skipped with reduced motion). */
    private pulse(target: Img | Txt, base: number, from: number): void {
      if (this.tk.motion.reduced) return;
      this.tweens.killTweensOf(target);
      target.setScale(base * from);
      this.tweens.add({ targets: target, scale: base, duration: 180, ease: 'Cubic.easeOut' });
    }

    /** Refreshes every HUD element; `live` (after a move) pops the score and fades to a new theme. */
    private updateHud(live = false): void {
      const s = this.state;
      if (!s) return;
      const h = this.hud;
      const fmt = (n: number) => formatScore(n, 'integer', this.tk.env.locale);

      const score = fmt(s.score);
      if (h.score.text !== score) {
        h.score.setText(score);
        const base = Math.min(1, h.scoreW / h.score.width);
        h.score.setScale(base);
        if (live) this.pulse(h.score, base, 1.12);
      }
      const best =
        this.tk.attract || (this.bestScore === null && s.score === 0)
          ? null
          : Math.max(this.bestScore ?? 0, s.score);
      h.best.setText(best === null ? '' : strings.t('best', { value: fmt(best) }));

      const goal = goalLevel(s.rung);
      const progress = goalProgress(s.cells, s.rung);
      h.chip.setVisible(goal !== null);
      if (goal !== null) h.chip.setTexture(this.tileTexture(h.chipPx, goal));
      h.percent.setText(goal === null ? strings.goalsDone : `${Math.floor(progress * 100)}%`);
      this.fill(h.goalBar, progress);

      const onTray = s.cells.includes(ECHO);
      const left = ECHO_CHARGE_MAX - s.echoCharge;
      h.echoCaption.setText(onTray ? strings.echoOnTray : strings.echoIn);
      h.echoValue.setText(
        onTray
          ? strings.echoReady
          : left === 1
            ? strings.echoOneMove
            : strings.t('echoMoves', { n: left }),
      );
      h.echoValue.setScale(Math.min(1, h.echoW / h.echoValue.width));
      this.fill(h.echoBar, onTray ? 1 : s.echoCharge / ECHO_CHARGE_MAX);

      const can = this.undo.left > 0 && this.undo.prev !== null && !this.over;
      h.undoOn.setVisible(can);
      h.undoIcon.setAlpha(can ? 1 : 0.45);
      h.undoLabel.setAlpha(can ? 1 : 0.55);
      h.badge.setVisible(this.undo.left > 0);
      h.count.setVisible(this.undo.left > 0).setText(String(this.undo.left));

      this.setTheme(s.rung % THEMES.length, live);
    }

    // ─── input ───
    private bindInput(): void {
      const { input } = this.tk;
      input.configure({
        actions: {
          up: { codes: ['ArrowUp', 'KeyW'] },
          down: { codes: ['ArrowDown', 'KeyS'] },
          left: { codes: ['ArrowLeft', 'KeyA'] },
          right: { codes: ['ArrowRight', 'KeyD'] },
          undo: { codes: ['KeyZ'], modifiers: { ctrl: true, meta: true } },
        },
      });
      for (const d of DIRS) input.on(d, (e) => e.phase === 'press' && this.move(d));
      input.on('undo', (e) => e.phase === 'press' && this.undoMove());
      // Taps: the Undo key, else a tap on the outer part of the tray (or beyond it) slides that way.
      input.onGesture('tap', ({ x, y }) => {
        const L = this.L;
        if (inside(L.undo, x, y)) return this.undoMove();
        if ([L.score, L.goal, L.echo].some((r) => inside(r, x, y))) return;
        const half = L.tray.size / 2;
        const dx = x - (L.tray.x + half);
        const dy = y - (L.tray.y + half);
        if (Math.max(Math.abs(dx), Math.abs(dy)) < half * 0.45) return;
        this.move(
          Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up',
        );
      });
      // One move per pointer sequence, whichever of drag or swipe commits first.
      let committed = false;
      input.onGesture('dragstart', () => (committed = false));
      input.onGesture('drag', ({ dx, dy }) => {
        const dir = committed ? null : dragDir(dx, dy);
        if (dir) {
          committed = true;
          this.move(dir);
        }
      });
      input.onGesture('dragend', () => queueMicrotask(() => (committed = false)));
      input.onGesture('swipe', ({ dir }) => {
        if (!committed) this.move(dir);
        committed = true;
      });
    }

    // ─── moves ───
    /** Jumps every running move animation to its end, so the next input never waits. */
    private snap(): void {
      const busy = this.moveTweens.length > 0 || this.pendingFinish !== null;
      for (const t of this.moveTweens) t.remove();
      this.moveTweens = [];
      this.tileLayer.setPosition(0, 0);
      this.pendingTimer?.remove(false);
      this.pendingTimer = null;
      const finish = this.pendingFinish;
      this.pendingFinish = null;
      if (finish) finish();
      else if (busy) this.renderBoard();
    }

    private move(dir: Dir): void {
      if (!this.state) return;
      this.snap();
      if (this.over) return;
      const before = this.state;
      const out = applyMove(before, dir, this.rng);
      if (!out.moved) {
        this.nudge(dir);
        return;
      }
      this.tk.run.begin();
      this.state = out.next;
      // every goal reached earns an extra undo
      this.undo = { left: Math.min(99, this.undo.left + out.goals.length), prev: before };
      this.saveRun('playing');
      this.playSounds(out);
      this.updateHud(true);
      this.tk.attract?.setView({ cells: out.next.cells } satisfies AttractView);
      this.animate(out);
    }

    private playSounds(out: MoveOutcome): void {
      const { sfx } = this.tk;
      if (out.merges.some((m) => m.echo)) sfx.play('echo');
      else if (out.merges.length > 0)
        sfx.play('merge', {
          detuneCents: mergePitch(Math.max(...out.merges.map((m) => m.level))),
        });
      else sfx.play('slide');
      if (out.goals.length > 0) sfx.play('win');
      if (out.spawn?.code === ECHO) sfx.play('click', { detuneCents: 700 });
    }

    /** Takes back the last move. */
    private undoMove(): void {
      if (!this.state || this.tk.attract) return;
      this.snap();
      const prev = this.undo.prev;
      if (this.over || this.undo.left === 0 || !prev) {
        this.tk.sfx.play('click', { volume: 0.5, detuneCents: -600 });
        return;
      }
      this.undo = { left: undosAfterUndo(this.undo.left, this.state.rung, prev.rung), prev: null };
      this.state = prev;
      this.rng = this.tk.rng.create(prev.rng);
      this.saveRun('playing');
      this.refresh();
      this.tk.sfx.play('undo');
      this.pulse(this.hud.undoIcon, 1 / this.z, 0.7);
    }

    private animate(out: MoveOutcome): void {
      const ms = this.tk.motion.ms('fast') * 0.75;
      const finish = () => {
        this.renderBoard();
        if (out.over) this.endBeat();
      };
      if (ms === 0) {
        finish();
        this.celebrate(out);
        return;
      }
      kit.fps.burst(ms + 700 + (out.goals.length > 0 ? 600 : 0));
      for (const t of out.tracks) {
        const tile = this.slots[t.from];
        if (!tile) continue;
        const c = this.centre(t.to);
        this.moveTweens.push(
          this.tweens.add({ targets: tile, x: c.x, y: c.y, duration: ms, ease: 'Cubic.easeOut' }),
        );
      }
      this.pendingFinish = finish;
      this.pendingTimer = this.time.delayedCall(ms, () => {
        this.moveTweens = [];
        this.pendingFinish = null;
        this.pendingTimer = null;
        finish();
        this.celebrate(out);
      });
    }

    /** A tile grows into place from `from` of its size; it never goes above full size, so it stays sharp. */
    private punch(tile: Img | null | undefined, from: number, ms: number): void {
      if (!tile || this.tk.motion.reduced) return;
      tile.setScale(from / this.z);
      this.moveTweens.push(
        this.tweens.add({
          targets: tile,
          scale: 1 / this.z,
          duration: ms,
          ease: 'Cubic.easeOut',
        }),
      );
    }

    /** After the slide: merge pops and bursts, the new tile, and the goal moment. */
    private celebrate(out: MoveOutcome): void {
      const calm = this.tk.motion.reduced;
      const unit = this.geo.cell / this.z;
      const fmt = (n: number) => formatScore(n, 'integer', this.tk.env.locale);
      out.merges.forEach((m, i) => {
        const c = this.centre(m.at);
        const colour = tileFill(m.level);
        this.punch(this.slots[m.at], 0.8, 140);
        const flash = this.flashes[i % this.flashes.length]!;
        if (!calm) {
          this.tweens.killTweensOf(flash);
          flash.setPosition(c.x, c.y).setAlpha(0.7).setVisible(true);
          this.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 200,
            onComplete: () => flash.setVisible(false),
          });
        }
        burst(this, c.x, c.y, {
          count: out.merges.length > 2 ? 5 : 8,
          colors: m.echo ? RAINBOW : [colour, shade(colour, 0.45), '#FFFFFF'],
          shape: m.echo ? 'star' : 'square',
          size: unit * 0.1,
          distance: unit * 0.75,
          lifeMs: 420,
          depth: 800,
        });
      });
      if (out.spawn) this.punch(this.slots[out.spawn.at], 0.3, 160);
      if (out.spawn?.code === ECHO) {
        const c = this.centre(out.spawn.at);
        burst(this, c.x, c.y, { count: 10, colors: RAINBOW, shape: 'star', depth: 800 });
        popText(this, c.x, c.y - unit * 0.5, strings.popEcho, { color: '#FFFFFF', depth: 900 });
      }

      const top = out.merges.reduce<MoveOutcome['merges'][number] | null>(
        (a, m) => (a && a.level >= m.level ? a : m),
        null,
      );
      if (!top) return;
      const c = this.centre(top.at);
      if (out.goals.length === 0) {
        const points = out.merges.reduce((sum, m) => sum + valueOf(m.level), 0);
        popText(this, c.x, c.y - unit * 0.45, `+${fmt(points)}`, {
          color: '#FFFFFF',
          px: 26,
          ms: 600,
          depth: 900,
        });
        return;
      }
      // the goal moment: a ring and stars from the new tile, and the bonus spelled out
      const value = valueOf(out.goals[out.goals.length - 1]!);
      const record = !this.tk.attract && this.bestTile > 0 && value > this.bestTile;
      this.bestTile = Math.max(this.bestTile, value);
      if (!calm) {
        const ring = this.shockImg;
        this.tweens.killTweensOf(ring);
        ring
          .setPosition(c.x, c.y)
          .setScale(0.45 / this.z)
          .setAlpha(0.9)
          .setVisible(true);
        this.tweens.add({
          targets: ring,
          scale: 1 / this.z,
          alpha: 0,
          duration: 450,
          ease: 'Cubic.easeOut',
          onComplete: () => ring.setVisible(false),
        });
      }
      burst(this, c.x, c.y, {
        count: 18,
        shape: 'star',
        size: unit * 0.14,
        distance: unit * 1.5,
        lifeMs: 800,
        gravity: 50,
        depth: 950,
      });
      const bonus = fmt(out.goals.reduce((sum, level) => sum + valueOf(level), 0));
      popText(
        this,
        c.x,
        c.y - unit * 0.5,
        strings.t(record ? 'popBestTile' : 'popGoal', { bonus }),
        {
          color: '#FFD53D',
          px: 38,
          rise: 60,
          ms: 1200,
          depth: 1001,
        },
      );
      this.pulse(this.hud.chip, 1 / this.z, 0.6);
      this.pulse(this.hud.badge, 1 / this.z, 0.5);
    }

    /** A move that shifts nothing: the tiles lean that way and settle back. */
    private nudge(dir: Dir): void {
      this.tk.sfx.play('click', { volume: 0.4, detuneCents: -400 });
      const ms = this.tk.motion.ms('fast');
      if (ms === 0) return;
      kit.fps.burst(ms);
      this.moveTweens.push(
        this.tweens.add({
          targets: this.tileLayer,
          x: dir === 'left' ? -6 : dir === 'right' ? 6 : 0,
          y: dir === 'up' ? -6 : dir === 'down' ? 6 : 0,
          duration: ms / 2,
          yoyo: true,
          onComplete: () => this.tileLayer.setPosition(0, 0),
        }),
      );
    }

    // ─── game over ───
    /** The tiles dim one after another, then the game-over dialog opens. */
    private endBeat(): void {
      this.over = true;
      this.updateHud();
      const slow = this.tk.motion.ms('slow');
      const tiles = this.slots.filter((t): t is Img => t !== null);
      if (slow === 0) {
        for (const t of tiles) t.setAlpha(0.55);
        void this.gameOver();
        return;
      }
      kit.fps.burst(slow * 2 + 400);
      shake(this, 220, 0.005);
      this.tweens.add({
        targets: tiles,
        alpha: 0.55,
        duration: slow,
        delay: this.tweens.stagger(25, {}),
        onComplete: () => void this.gameOver(),
      });
    }

    private async gameOver(): Promise<void> {
      const s = this.state;
      if (!s || this.ending) return;
      this.ending = true;
      this.over = true;
      // save as over and flush before the scores are submitted, so a reload never submits twice
      this.saveRun('over');
      await this.runSave.flush();
      this.tk.sfx.play('lose');
      const action = await this.tk.ui.gameOver({
        title: strings.gameOverTitle,
        scores: [
          { board: 'best-score', value: s.score },
          { board: 'best-tile', value: valueOf(s.maxLevel) },
        ],
        meta: { moves: s.moves, echoes: s.echoes, seed: this.seed },
      });
      if (!this.tk.attract) this.bestScore = Math.max(this.bestScore ?? 0, s.score);
      if (action === 'play-again') this.playAgain();
    }

    private playAgain(): void {
      if (this.tk.signal.aborted) return;
      this.snap();
      this.startNewRun();
      this.refresh();
    }
  }

  return [Play];
};
