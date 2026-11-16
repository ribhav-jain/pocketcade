// The single Snugfit scene: layout, drawing, drag / tap / keyboard input, saves, sound and the attract view.
// The rules live in logic.ts; nothing here decides what a move does.
import type Phaser from 'phaser';
import {
  colorNum,
  colors,
  formatScore,
  mixHex,
  prng,
  type Rng,
  type Save,
} from '@pocketcade/toolkit';
import {
  backdrop,
  canvasTexture,
  hudPill,
  popText,
  shake,
  texScale,
  type HudPill,
  type SceneFactory,
} from '@pocketcade/toolkit/phaser';
import {
  BEAM,
  FABRICS,
  LIGHTS,
  PURL_TEX,
  QUILT_PAD,
  drawBeam,
  drawButton,
  drawGlow,
  drawNeedle,
  drawPatch,
  drawPincushion,
  drawPurl,
  drawQuilt,
  drawScissors,
  drawScrap,
  drawSlot,
  drawSpool,
  drawTable,
  drawThread,
  drawYarn,
  lightFor,
  type Mood,
} from './art.ts';
import { OPENING, type AttractView } from './attract.ts';
import { BIND, CELL_MAX, DESIGN, PILL, frameFor, trayScale, type Frame } from './layout.ts';
import {
  CELLS,
  COLOURS,
  HAND,
  POINTS,
  SHAPES,
  SIZE,
  bestMove,
  canPlaceAny,
  fits,
  linesAfter,
  newGame,
  place,
  type GameState,
  type Piece,
  type PlaceOutcome,
  type Shape,
} from './logic.ts';
import { isProfileV1, isRunV1, type ProfileV1, type RunSaveV1 } from './save.ts';
import { strings } from './strings.ts';

type Img = Phaser.GameObjects.Image;
type Box = Phaser.GameObjects.Container;

/** Squares in the largest patch (3 × 3). */
const PIECE_MAX = 9;
const FX_CELLS = 40;
const FX_LINES = 6;
const PARTICLES = 64;
const MOTES = 10;
const NEEDLE_W = 96;
const THREAD_W = SIZE * CELL_MAX;
const BUTTON = 26;
/** Purl looks worried once this share of the quilt is covered. */
const CROWDED = 0.58;
/** How far (in squares) a dragged patch may be from a free spot and still snap to it. */
const SNAP = 0.8;
/** Gap between a finger and the bottom of the patch it drags, in design units. */
const FINGER_GAP = 70;

function hex16(rng: Rng): string {
  return [rng.nextUint32(), rng.nextUint32()].map((n) => n.toString(16).padStart(8, '0')).join('');
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const createScenes: SceneFactory = (_P, kit) => {
  class Play extends kit.Scene {
    private runSave!: Save<RunSaveV1 | null>;
    private profileSave!: Save<ProfileV1>;
    private state!: GameState;
    private rng!: Rng;
    private seed = '';
    private startedAt = '';
    private best = 0;
    private over = false;
    private ending = false;

    private f!: Frame;
    /** keys of the textures drawn for the current square size */
    private sized: string[] = [];

    private bg!: Img;
    private beam!: Img;
    private lamp!: Img;
    private motes: Img[] = [];
    private moteX = new Float32Array(MOTES);
    private moteY = new Float32Array(MOTES);
    private kitBox!: Box;
    private yarn!: Img;
    private purl!: Img;
    private purlScale = 1;
    private mood: Mood = 'doze';
    private moodTimer: Phaser.Time.TimerEvent | null = null;
    private breath: Phaser.Tweens.Tween | null = null;
    private quilt!: Img;
    private slotImgs: Img[] = [];
    private slotHints: Phaser.GameObjects.Text[] = [];
    private cells: Img[] = [];
    private rowGlow: Phaser.GameObjects.Rectangle[] = [];
    private colGlow: Phaser.GameObjects.Rectangle[] = [];
    private ghostImgs: Img[] = [];
    private pieces: Box[] = [];
    private fxCells: Img[] = [];
    private threads: Img[] = [];
    private needles: Img[] = [];
    private hud!: { score: HudPill; best: HudPill };
    private shown = { score: '', best: '' };

    // particles: buttons and thread scraps, simulated by hand so nothing is allocated while they fly
    private pImg: Img[] = [];
    private pX = new Float32Array(PARTICLES);
    private pY = new Float32Array(PARTICLES);
    private pVx = new Float32Array(PARTICLES);
    private pVy = new Float32Array(PARTICLES);
    private pSpin = new Float32Array(PARTICLES);
    private pLife = new Float32Array(PARTICLES);
    private pWait = new Float32Array(PARTICLES);
    private pNext = 0;
    private pLive = 0;
    /** decoration-only randomness; the game RNG is never touched by effects */
    private fxRnd = prng(0x51a9f17);
    private clock = 0;

    // interaction
    /** slot being dragged, or -1 */
    private held = -1;
    /** slot chosen by tap or keyboard, or -1 */
    private sel = -1;
    /** the last input was the keyboard: show the ghost at the cursor */
    private kbd = false;
    private cur = { col: 2, row: 2 };
    private ghost = { on: false, slot: -1, col: 0, row: 0, ok: false };
    private snapCol = 0;
    private snapRow = 0;
    /** a tapped patch is on its way to the quilt */
    private flying = false;
    private light = 0;
    private lightTween: Phaser.Tweens.Tween | null = null;

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

    // ─── setup ───
    private async setup(): Promise<void> {
      const tk = this.tk;
      this.build();
      tk.loading(0.4);

      this.runSave = tk.createSave<RunSaveV1 | null>({
        key: 'run',
        defaults: () => null,
        validate: (d): d is RunSaveV1 | null => d === null || isRunV1(d),
        debounceMs: 0,
      });
      this.profileSave = tk.createSave<ProfileV1>({
        key: 'profile',
        defaults: () => ({ best: 0 }),
        validate: isProfileV1,
      });
      const launch = tk.ctx.launch;
      const [run, profile, top] = await Promise.all([
        launch === 'play' ? this.runSave.load() : null,
        this.profileSave.load(),
        // the best is display only: a leaderboard failure must not stop the game
        launch === 'attract' ? [] : tk.host.scores.top('best-score', 1).catch(() => []),
      ]);
      if (tk.signal.aborted) return; // unmounted while loading: the scene is gone
      tk.loading(0.8);
      this.best = Math.max(profile.data.best, top[0]?.value ?? 0);

      const saved = run?.data ?? null;
      if (saved && saved.phase === 'playing') this.restore(saved);
      else this.startNewRun();
      this.light = lightFor(this.state.score);
      this.paintLight(this.light, this.light, 1);
      this.relayout();
      this.updateHud();
      this.bindInput();
      tk.on('resize', () => {
        this.dropEverything();
        this.relayout();
        this.publishView();
      });
      tk.on('pause', () => this.dropEverything());
      tk.on('inputchange', () => this.refreshSlots());
      tk.ui.onRestart(() => this.playAgain());
      this.publishView();
      tk.loading(1);
      // A game saved after its last possible move but before the game-over write: finish it now.
      if (!canPlaceAny(this.state.board, this.state.hand)) void this.gameOver();
    }

    private restore(saved: RunSaveV1): void {
      const { phase: _phase, seed, startedAt, ...state } = saved;
      this.state = state;
      this.seed = seed;
      this.startedAt = startedAt;
      this.rng = this.tk.rng.create(state.rng);
    }

    private startNewRun(): void {
      this.seed = `snugfit:run:${hex16(this.tk.rng.main)}`;
      this.rng = this.tk.rng.create(this.seed);
      // The demo always opens on the same half-sewn quilt, so the clip shows a stitch straight away.
      this.state = this.tk.attract
        ? {
            board: [...OPENING.board],
            hand: OPENING.hand.map((p) => ({ ...p })),
            score: 0,
            streak: 0,
            placed: 0,
            lines: 0,
            rng: this.rng.state(),
          }
        : newGame(this.rng);
      this.startedAt = new Date().toISOString();
      this.over = false;
      this.ending = false;
      this.saveRun('playing');
    }

    private saveRun(phase: RunSaveV1['phase']): void {
      this.runSave.set({ ...this.state, phase, seed: this.seed, startedAt: this.startedAt });
    }

    // ─── objects (made once; relayout() positions them) ───
    private tex(
      key: string,
      w: number,
      h: number,
      draw: (ctx: CanvasRenderingContext2D) => void,
    ): string {
      return canvasTexture(this, key, w, h, draw);
    }

    /** An image of a canvas texture at its design size, times `k`. */
    private img(key: string, k = 1): Img {
      return this.add.image(0, 0, key).setScale(k / texScale(this, key));
    }

    private build(): void {
      const { bleed } = this.tk.layout;
      const fullW = DESIGN.width + bleed.x * 2;
      const fullH = DESIGN.height + bleed.y * 2;
      this.bg = backdrop(this, 'sf-table', DESIGN.width, DESIGN.height, {
        stops: ['#FFFFFF', '#F1ECF7'],
        draw: (ctx) => {
          ctx.translate(-bleed.x, -bleed.y);
          drawTable(ctx, fullW, fullH);
        },
      });
      canvasTexture(this, 'sf-beam', BEAM.w, BEAM.h, drawBeam, { scale: 1 });
      this.beam = this.add.image(0, 0, 'sf-beam').setDepth(-950);
      canvasTexture(this, 'sf-glow', 512, 512, (ctx) => drawGlow(ctx, 512), { scale: 1 });
      this.lamp = this.add.image(0, 0, 'sf-glow').setDepth(-930).setBlendMode('ADD');
      canvasTexture(this, 'sf-mote', 24, 24, (ctx) => drawGlow(ctx, 24), { scale: 1 });
      for (let i = 0; i < MOTES; i++)
        this.motes.push(this.add.image(0, 0, 'sf-mote').setDepth(-940).setAlpha(0.7));

      // sewing kit: pincushion, three spools and scissors, placed as one group
      const spool = (color: string) =>
        this.tex(`sf-spool-${color}`, 76, 96, (ctx) => drawSpool(ctx, color));
      const pin = this.tex('sf-pins', 120, 100, drawPincushion);
      const scissors = this.tex('sf-scissors', 150, 130, drawScissors);
      this.kitBox = this.add
        .container(0, 0, [
          this.img(scissors).setPosition(-60, 86).setAngle(-18),
          this.img(pin).setPosition(-72, -78),
          this.img(spool(FABRICS[1]!.color)).setPosition(64, -92),
          this.img(spool(FABRICS[0]!.color)).setPosition(112, -40),
          this.img(spool(FABRICS[2]!.color)).setPosition(52, -16),
        ])
        .setDepth(-900);
      this.yarn = this.img(this.tex('sf-yarn', 100, 100, (ctx) => drawYarn(ctx, FABRICS[0]!.color)))
        .setOrigin(0.5, 1)
        .setDepth(-490);

      for (const mood of ['doze', 'perk', 'worry'] as const)
        this.tex(`sf-purl-${mood}`, PURL_TEX.w, PURL_TEX.h, (ctx) => drawPurl(ctx, mood));
      this.purl = this.add.image(0, 0, 'sf-purl-doze').setOrigin(0.5, 1).setDepth(-500);

      this.quilt = this.add.image(0, 0, '__DEFAULT').setDepth(-600);
      for (let i = 0; i < HAND; i++) {
        this.slotImgs.push(this.add.image(0, 0, '__DEFAULT').setOrigin(0).setDepth(-700));
        this.slotHints.push(
          kit
            .text(this, 0, 0, String(i + 1), { px: 22, color: '#B9ADF5' })
            .setOrigin(0.5)
            .setDepth(-690),
        );
      }
      for (let i = 0; i < CELLS; i++)
        this.cells.push(this.add.image(0, 0, '__DEFAULT').setVisible(false));
      for (let i = 0; i < SIZE; i++) {
        this.rowGlow.push(
          this.add.rectangle(0, 0, 1, 1, 0xfff3b0, 0.55).setDepth(5).setVisible(false),
        );
        this.colGlow.push(
          this.add.rectangle(0, 0, 1, 1, 0xfff3b0, 0.55).setDepth(5).setVisible(false),
        );
      }
      for (let i = 0; i < PIECE_MAX; i++)
        this.ghostImgs.push(this.add.image(0, 0, '__DEFAULT').setDepth(10).setVisible(false));
      for (let i = 0; i < HAND; i++) {
        const kids: Img[] = [];
        for (let k = 0; k < PIECE_MAX; k++) kids.push(this.add.image(0, 0, '__DEFAULT'));
        this.pieces.push(this.add.container(0, 0, kids).setDepth(50).setVisible(false));
      }
      for (let i = 0; i < FX_CELLS; i++)
        this.fxCells.push(this.add.image(0, 0, '__DEFAULT').setDepth(20).setVisible(false));

      const thread = this.tex('sf-thread', THREAD_W, 12, (ctx) => drawThread(ctx, THREAD_W));
      const needle = this.tex('sf-needle', NEEDLE_W, 16, (ctx) => drawNeedle(ctx, NEEDLE_W));
      for (let i = 0; i < FX_LINES; i++) {
        this.threads.push(this.img(thread).setOrigin(0, 0.5).setDepth(30).setVisible(false));
        this.needles.push(this.img(needle).setOrigin(0.3, 0.5).setDepth(31).setVisible(false));
      }
      for (let c = 1; c <= COLOURS; c++)
        this.tex(`sf-button-${c}`, BUTTON, BUTTON, (ctx) => drawButton(ctx, BUTTON, c));
      this.tex('sf-scrap', 32, 14, drawScrap);
      for (let i = 0; i < PARTICLES; i++)
        this.pImg.push(this.add.image(0, 0, 'sf-scrap').setDepth(200).setVisible(false));

      const pill = { width: PILL.w, height: PILL.h };
      this.hud = {
        score: hudPill(this, 0, 0, {
          ...pill,
          icon: 'star',
          accent: colors.gold,
          label: strings.score,
          value: '0',
        }),
        best: hudPill(this, 0, 0, {
          ...pill,
          icon: 'trophy',
          accent: colors.purple,
          label: strings.best,
          value: strings.noBest,
        }),
      };
    }

    // ─── layout ───
    private patchKey(colour: number): string {
      return `sf-patch-${colour}-${this.f.cell}`;
    }

    private setPatch(img: Img, colour: number): Img {
      const key = this.patchKey(colour);
      return img.setTexture(key).setScale(1 / texScale(this, key));
    }

    private sizedTex(
      key: string,
      w: number,
      h: number,
      draw: (ctx: CanvasRenderingContext2D) => void,
    ): string {
      this.sized.push(key);
      return this.tex(key, w, h, draw);
    }

    /** Lays the whole scene out for the current view; textures that depend on the square size are redrawn. */
    private relayout(): void {
      const view = this.tk.layout.view;
      const f = (this.f = frameFor(view));
      const { cell, gx, gy } = f;
      const grid = cell * SIZE;
      const outer = grid + BIND * 2;
      const old = this.sized;
      this.sized = [];

      const quiltSize = outer + QUILT_PAD * 2;
      const quiltKey = this.sizedTex(`sf-quilt-${cell}`, quiltSize, quiltSize, (ctx) =>
        drawQuilt(ctx, cell),
      );
      for (let c = 1; c <= COLOURS; c++)
        this.sizedTex(this.patchKey(c), cell, cell, (ctx) => drawPatch(ctx, cell, c));
      const sw = Math.round(f.slots[0].w);
      const sh = Math.round(f.slots[0].h);
      for (const on of [false, true])
        this.sizedTex(`sf-slot-${sw}x${sh}-${on}`, sw, sh, (ctx) => drawSlot(ctx, sw, sh, on));

      this.quilt
        .setTexture(quiltKey)
        .setScale(1 / texScale(this, quiltKey))
        .setPosition(gx + grid / 2, gy + grid / 2);
      this.cells.forEach((img, i) =>
        img.setPosition(gx + ((i % SIZE) + 0.5) * cell, gy + (Math.floor(i / SIZE) + 0.5) * cell),
      );
      for (let i = 0; i < SIZE; i++) {
        this.rowGlow[i]!.setPosition(gx + grid / 2, gy + (i + 0.5) * cell).setSize(grid, cell);
        this.colGlow[i]!.setPosition(gx + (i + 0.5) * cell, gy + grid / 2).setSize(cell, grid);
      }
      for (const img of this.fxCells) {
        this.tweens.killTweensOf(img);
        this.setPatch(img, 1).setVisible(false);
      }
      for (const img of this.ghostImgs) this.setPatch(img, 1);
      this.ghost.on = false;
      this.hideGhost(true);
      for (const img of [...this.threads, ...this.needles]) {
        this.tweens.killTweensOf(img);
        img.setVisible(false);
      }

      f.slots.forEach((s, i) => {
        this.slotImgs[i]!.setPosition(s.x, s.y);
        this.slotHints[i]!.setPosition(s.x + 26, s.y + 26);
      });
      this.hud.score.container.setPosition(f.score.x, f.score.y);
      this.hud.best.container.setPosition(f.best.x, f.best.y);

      // scenery
      const cx = view.x + view.width / 2;
      const cy = view.y + view.height / 2;
      const span = Math.min(view.width, view.height);
      this.beam.setPosition(cx - view.width * 0.14, cy - view.height * 0.08).setScale(span / 640);
      this.lamp.setPosition(gx + grid / 2, gy + grid / 2).setScale((outer * 2.1) / 512);
      const rnd = prng(77);
      this.motes.forEach((m, i) => {
        this.moteX[i] = this.beam.x + (rnd() - 0.5) * BEAM.w * this.beam.scale * 0.8;
        this.moteY[i] = this.beam.y + (rnd() - 0.5) * BEAM.h * this.beam.scale * 0.8;
        m.setPosition(this.moteX[i], this.moteY[i]).setScale(0.35 + rnd() * 0.5);
      });
      this.kitBox.setVisible(f.kit !== null);
      if (f.kit) this.kitBox.setPosition(f.kit.x, f.kit.y).setScale(f.kit.scale);
      this.yarn.setVisible(f.yarn !== null);
      if (f.yarn)
        this.yarn
          .setPosition(f.yarn.x, f.yarn.y)
          .setScale(f.yarn.scale / texScale(this, 'sf-yarn'));
      this.purlScale = f.purl.h / PURL_TEX.h / texScale(this, 'sf-purl-doze');
      this.purl.setPosition(f.purl.x, f.purl.y);
      this.setMood(this.mood, true);

      this.renderBoard();
      this.renderHand(false);
      this.showCursorGhost();
      for (const key of old) if (!this.sized.includes(key)) this.textures.remove(key);
    }

    // ─── rendering the state ───
    private renderBoard(): void {
      const board = this.state.board;
      for (let i = 0; i < CELLS; i++) {
        const img = this.cells[i]!;
        const colour = board[i]!;
        this.tweens.killTweensOf(img);
        this.setPatch(img, colour || 1)
          .setVisible(colour !== 0)
          .setAlpha(this.over ? 0.55 : 1);
      }
    }

    private slotCentre(slot: number): { x: number; y: number } {
      const s = this.f.slots[slot]!;
      return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    }

    private restScale(slot: number, shape: Shape): number {
      return trayScale(this.f, shape.w, shape.h) * (this.sel === slot ? 1.12 : 1);
    }

    private renderHand(dealt: boolean): void {
      const cell = this.f.cell;
      const animate = dealt && !this.tk.motion.reduced;
      this.state.hand.forEach((piece, slot) => {
        const box = this.pieces[slot]!;
        const kids = box.list as Img[];
        this.tweens.killTweensOf(box);
        if (!piece) {
          for (const img of kids) this.setPatch(img, 1);
          box.setVisible(false);
          return;
        }
        const shape = SHAPES[piece.shape]!;
        for (let i = 0; i < PIECE_MAX; i++) {
          const at = shape.cells[i];
          const img = this.setPatch(kids[i]!, piece.colour).setVisible(at !== undefined);
          if (at)
            img.setPosition((at[0] - (shape.w - 1) / 2) * cell, (at[1] - (shape.h - 1) / 2) * cell);
        }
        const c = this.slotCentre(slot);
        const k = this.restScale(slot, shape);
        box.setPosition(c.x, c.y).setScale(k).setDepth(50).setAlpha(1).setVisible(true);
        if (animate) {
          box.setScale(0);
          this.tweens.add({
            targets: box,
            scale: k,
            duration: 240,
            delay: slot * 70,
            ease: 'Back.easeOut',
          });
        }
      });
      this.refreshSlots();
    }

    private refreshSlots(): void {
      const sw = Math.round(this.f.slots[0].w);
      const sh = Math.round(this.f.slots[0].h);
      const hints = !this.tk.attract && this.tk.env.input.primary === 'keyboard';
      for (let i = 0; i < HAND; i++) {
        const key = `sf-slot-${sw}x${sh}-${this.sel === i}`;
        this.slotImgs[i]!.setTexture(key).setScale(1 / texScale(this, key));
        this.slotHints[i]!.setVisible(hints);
      }
    }

    private showGhost(slot: number, col: number, row: number, ok: boolean): void {
      const g = this.ghost;
      if (g.on && g.slot === slot && g.col === col && g.row === row && g.ok === ok) return;
      const piece = this.state.hand[slot];
      if (!piece) return this.hideGhost();
      this.hideGhost(true);
      g.on = true;
      g.slot = slot;
      g.col = col;
      g.row = row;
      g.ok = ok;
      const shape = SHAPES[piece.shape]!;
      const { gx, gy, cell } = this.f;
      shape.cells.forEach(([c, r], i) => {
        const img = this.setPatch(this.ghostImgs[i]!, piece.colour)
          .setPosition(gx + (col + c + 0.5) * cell, gy + (row + r + 0.5) * cell)
          .setAlpha(ok ? 0.55 : 0.5)
          .setVisible(true);
        if (ok) img.clearTint();
        else img.setTint(0x8a86a8);
      });
      if (!ok) return;
      const lines = linesAfter(this.state.board, shape, col, row);
      for (const r of lines.rows) this.rowGlow[r]!.setVisible(true);
      for (const c of lines.cols) this.colGlow[c]!.setVisible(true);
    }

    private hideGhost(force = false): void {
      if (!this.ghost.on && !force) return;
      this.ghost.on = false;
      for (const img of this.ghostImgs) img.setVisible(false);
      for (const r of this.rowGlow) r.setVisible(false);
      for (const r of this.colGlow) r.setVisible(false);
    }

    /** Keyboard play: the ghost is the cursor, shown even where the patch does not fit. */
    private showCursorGhost(): void {
      const piece = this.kbd && !this.over ? this.state.hand[this.sel] : null;
      if (!piece) return this.hideGhost();
      const shape = SHAPES[piece.shape]!;
      this.cur.col = Math.max(0, Math.min(SIZE - shape.w, this.cur.col));
      this.cur.row = Math.max(0, Math.min(SIZE - shape.h, this.cur.row));
      const ok = fits(this.state.board, shape, this.cur.col, this.cur.row);
      this.showGhost(this.sel, this.cur.col, this.cur.row, ok);
    }

    private updateHud(pop = false): void {
      const { score, streak } = this.state;
      const locale = this.tk.env.locale;
      const scoreText = formatScore(score, 'integer', locale);
      const bestValue = Math.max(this.best, score);
      const bestText =
        bestValue === 0 || this.tk.attract
          ? strings.noBest
          : formatScore(bestValue, 'integer', locale);
      if (pop && scoreText !== this.shown.score) this.hud.score.bump();
      if (pop && bestText !== this.shown.best) this.hud.best.bump();
      this.shown.score = scoreText;
      this.shown.best = bestText;
      this.hud.score.set(scoreText);
      this.hud.best.set(bestText);
      this.hud.score.setLabel(
        streak > 0
          ? strings.t('nextStreak', { n: Math.min(streak + 1, POINTS.maxStreak) })
          : strings.score,
      );
    }

    private publishView(): void {
      const a = this.tk.attract;
      if (!a) return;
      const move = this.over ? null : bestMove(this.state);
      if (!move) return a.setView(null);
      const shape = SHAPES[this.state.hand[move.slot]!.shape]!;
      const { gx, gy, cell } = this.f;
      a.setView({
        pick: this.slotCentre(move.slot),
        drop: {
          x: gx + (move.col + shape.w / 2) * cell,
          y: gy + (move.row + shape.h / 2) * cell,
        },
      } satisfies AttractView);
    }

    // ─── Purl and the light ───
    private setMood(mood: Mood, force = false): void {
      if (mood === this.mood && !force) return;
      const changed = mood !== this.mood;
      this.mood = mood;
      this.breath?.remove();
      this.breath = null;
      this.tweens.killTweensOf(this.purl);
      this.purl.setTexture(`sf-purl-${mood}`).setScale(this.purlScale);
      if (this.tk.motion.reduced) return;
      if (changed) {
        this.purl.setScale(this.purlScale, this.purlScale * (mood === 'perk' ? 1.12 : 0.94));
        this.tweens.add({
          targets: this.purl,
          scaleY: this.purlScale,
          duration: 260,
          ease: 'Back.easeOut',
        });
      }
      // slow breathing while asleep; awake poses stay still
      if (mood === 'doze')
        this.breath = this.tweens.add({
          targets: this.purl,
          scaleY: this.purlScale * 1.025,
          duration: 2200,
          delay: 300,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
    }

    private restingMood(): Mood {
      if (this.over) return 'worry';
      const used = this.state.board.reduce((n, c) => n + (c ? 1 : 0), 0);
      return used / CELLS >= CROWDED ? 'worry' : 'doze';
    }

    private perkUp(): void {
      this.setMood('perk');
      this.moodTimer?.remove(false);
      this.moodTimer = this.time.delayedCall(1700, () => {
        this.moodTimer = null;
        this.setMood(this.restingMood());
      });
    }

    private paintLight(from: number, to: number, t: number): void {
      const a = LIGHTS[from]!;
      const b = LIGHTS[to]!;
      const table = mixHex(a.table, b.table, t);
      this.bg.setTint(colorNum(table));
      // the props take only half of the light's colour, so they stay bright
      const soft = colorNum(mixHex(table, '#FFFFFF', 0.5));
      for (const prop of this.kitBox.list as Img[]) prop.setTint(soft);
      const beam = colorNum(mixHex(a.beam, b.beam, t));
      const lamp = lerp(a.lamp, b.lamp, t);
      this.beam.setTint(beam).setAlpha(lerp(a.beamAlpha, b.beamAlpha, t));
      this.lamp.setTint(0xffd27a).setAlpha(lamp * 0.6);
      for (const m of this.motes) m.setTint(lamp > 0.5 ? 0xffe2a0 : 0xffffff);
    }

    /** Moves the room's light to the phase for the current score. */
    private updateLight(announce: boolean): void {
      const to = lightFor(this.state.score);
      if (to === this.light) return;
      const from = this.light;
      this.light = to;
      this.lightTween?.remove();
      this.lightTween = null;
      if (announce && to > from && !this.tk.attract)
        this.tk.ui.toast(
          [strings.toastAfternoon, strings.toastGolden, strings.toastNight][to - 1] ?? '',
        );
      if (this.tk.motion.reduced) return this.paintLight(to, to, 1);
      kit.fps.burst(1500);
      this.lightTween = this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 1400,
        ease: 'Sine.easeInOut',
        onUpdate: (tw) => this.paintLight(from, to, tw.getValue() ?? 1),
      });
    }

    // ─── input ───
    private bindInput(): void {
      const { input } = this.tk;
      input.configure({
        actions: {
          pick1: { codes: ['Digit1', 'Numpad1'] },
          pick2: { codes: ['Digit2', 'Numpad2'] },
          pick3: { codes: ['Digit3', 'Numpad3'] },
          next: { codes: ['Tab'] },
          up: { codes: ['ArrowUp', 'KeyW'], repeat: true },
          down: { codes: ['ArrowDown', 'KeyS'], repeat: true },
          left: { codes: ['ArrowLeft', 'KeyA'], repeat: true },
          right: { codes: ['ArrowRight', 'KeyD'], repeat: true },
          place: { codes: ['Enter', 'NumpadEnter', 'Space'] },
        },
      });
      const press = (action: string, run: () => void) =>
        input.on(action, (e) => {
          if (e.phase !== 'press' || this.over || this.flying || this.held >= 0) return;
          this.kbd = true;
          run();
        });
      press('pick1', () => this.keyPick(0));
      press('pick2', () => this.keyPick(1));
      press('pick3', () => this.keyPick(2));
      press('next', () => this.keyPick(this.nextSlot(this.sel)));
      press('up', () => this.keyMove(0, -1));
      press('down', () => this.keyMove(0, 1));
      press('left', () => this.keyMove(-1, 0));
      press('right', () => this.keyMove(1, 0));
      press('place', () => this.keyPlace());
      input.onGesture('tap', (e) => this.onTap(e.x, e.y));
      input.onGesture('dragstart', (e) => this.onDragStart(e.x, e.y));
      input.onGesture('drag', (e) => this.onDrag(e.x, e.y));
      input.onGesture('dragend', (e) => this.onDragEnd(e.cancelled === true));
    }

    /** The first slot after `from` that still holds a patch, or -1. */
    private nextSlot(from: number): number {
      for (let i = 1; i <= HAND; i++) {
        const slot = (from + i + HAND) % HAND;
        if (this.state.hand[slot]) return slot;
      }
      return -1;
    }

    private slotAt(x: number, y: number): number {
      return this.f.slots.findIndex(
        (s) => x >= s.x - 4 && x <= s.x + s.w + 4 && y >= s.y - 4 && y <= s.y + s.h + 4,
      );
    }

    private select(slot: number): void {
      if (slot === this.sel) return;
      const before = this.sel;
      this.sel = slot;
      this.refreshSlots();
      for (const i of [before, slot]) {
        const piece = this.state.hand[i];
        if (!piece || i === this.held) continue;
        const box = this.pieces[i]!;
        const c = this.slotCentre(i);
        this.tweens.killTweensOf(box);
        box.setPosition(c.x, c.y);
        this.tweens.add({
          targets: box,
          scale: this.restScale(i, SHAPES[piece.shape]!),
          duration: this.tk.motion.ms('fast'),
          ease: 'Back.easeOut',
        });
      }
      if (slot >= 0) {
        kit.fps.burst(200);
        this.tk.sfx.play('lift');
      }
    }

    private keyPick(slot: number): void {
      if (slot < 0 || !this.state.hand[slot]) return;
      this.select(slot);
      this.showCursorGhost();
    }

    private keyMove(dc: number, dr: number): void {
      if (!this.state.hand[this.sel]) return this.keyPick(this.nextSlot(-1));
      this.cur.col += dc;
      this.cur.row += dr;
      this.showCursorGhost();
    }

    private keyPlace(): void {
      const piece = this.state.hand[this.sel];
      if (!piece) return this.keyPick(this.nextSlot(-1));
      this.showCursorGhost();
      if (fits(this.state.board, SHAPES[piece.shape]!, this.cur.col, this.cur.row))
        this.commit(this.sel, this.cur.col, this.cur.row);
      else this.refuse(this.sel);
    }

    private onTap(x: number, y: number): void {
      if (this.over || this.flying || this.held >= 0) return;
      this.kbd = false;
      const slot = this.slotAt(x, y);
      if (slot >= 0) {
        this.hideGhost();
        if (this.state.hand[slot]) this.select(slot);
        return;
      }
      const piece = this.state.hand[this.sel];
      const { gx, gy, cell } = this.f;
      const grid = cell * SIZE;
      const onQuilt =
        x > gx - cell && x < gx + grid + cell && y > gy - cell && y < gy + grid + cell;
      if (!piece || !onQuilt) {
        this.hideGhost();
        this.select(-1);
        return;
      }
      if (this.snap(x, y, SHAPES[piece.shape]!)) this.fly(this.sel, this.snapCol, this.snapRow);
      else this.refuse(this.sel);
    }

    /**
     * Finds the free spot nearest to a patch centred on (px, py), within SNAP squares. The result is left in
     * snapCol / snapRow.
     */
    private snap(px: number, py: number, shape: Shape): boolean {
      const { gx, gy, cell } = this.f;
      const fc = (px - gx) / cell - shape.w / 2;
      const fr = (py - gy) / cell - shape.h / 2;
      const board = this.state.board;
      let nearest = SNAP * SNAP;
      let found = false;
      for (let dr = 0; dr <= 1; dr++)
        for (let dc = 0; dc <= 1; dc++) {
          const c = Math.floor(fc) + dc;
          const r = Math.floor(fr) + dr;
          const d = (c - fc) ** 2 + (r - fr) ** 2;
          if (d < nearest && fits(board, shape, c, r)) {
            nearest = d;
            this.snapCol = c;
            this.snapRow = r;
            found = true;
          }
        }
      return found;
    }

    private onDragStart(x: number, y: number): void {
      if (this.over || this.flying || this.held >= 0) return;
      const slot = this.slotAt(x, y);
      if (slot < 0 || !this.state.hand[slot]) return;
      this.kbd = false;
      this.hideGhost();
      this.select(-1);
      this.held = slot;
      const box = this.pieces[slot]!;
      this.tweens.killTweensOf(box);
      box.setDepth(100);
      const ms = this.tk.motion.ms('fast');
      if (ms === 0) box.setScale(1);
      else this.tweens.add({ targets: box, scale: 1, duration: ms, ease: 'Back.easeOut' });
      this.tk.sfx.play('lift');
      this.onDrag(x, y);
    }

    private onDrag(x: number, y: number): void {
      const piece = this.state.hand[this.held];
      if (!piece) return;
      kit.fps.burst(400);
      const shape = SHAPES[piece.shape]!;
      // on a touch screen the patch rides above the finger so it stays in sight
      const lift =
        this.tk.env.input.primary === 'touch' ? (shape.h * this.f.cell) / 2 + FINGER_GAP : 0;
      const py = y - lift;
      this.pieces[this.held]!.setPosition(x, py);
      if (this.snap(x, py, shape)) this.showGhost(this.held, this.snapCol, this.snapRow, true);
      else this.hideGhost();
    }

    private onDragEnd(cancelled: boolean): void {
      const slot = this.held;
      if (slot < 0) return;
      this.held = -1;
      const g = this.ghost;
      if (!cancelled && g.on && g.ok && g.slot === slot) return this.commit(slot, g.col, g.row);
      this.hideGhost();
      this.springBack(slot);
      if (!cancelled) this.tk.sfx.play('nope', { volume: 0.6 });
    }

    private springBack(slot: number): void {
      const piece = this.state.hand[slot];
      if (!piece) return;
      const box = this.pieces[slot]!;
      const c = this.slotCentre(slot);
      const k = this.restScale(slot, SHAPES[piece.shape]!);
      this.tweens.killTweensOf(box);
      box.setDepth(50);
      if (this.tk.motion.reduced) {
        box.setPosition(c.x, c.y).setScale(k);
        return;
      }
      kit.fps.burst(320);
      this.tweens.add({
        targets: box,
        x: c.x,
        y: c.y,
        scale: k,
        duration: 220,
        ease: 'Back.easeOut',
      });
    }

    /** A patch that cannot go there: a shake of the head and a low note. */
    private refuse(slot: number): void {
      this.tk.sfx.play('nope');
      const box = this.pieces[slot];
      if (!box || this.tk.motion.reduced) return;
      const c = this.slotCentre(slot);
      this.tweens.killTweensOf(box);
      box
        .setPosition(c.x, c.y)
        .setScale(this.restScale(slot, SHAPES[this.state.hand[slot]!.shape]!));
      kit.fps.burst(300);
      this.tweens.add({
        targets: box,
        x: c.x + 8,
        duration: 50,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
        onComplete: () => box.setX(c.x),
      });
    }

    /** Tap-to-place: the chosen patch flies from the tray to its spot, then is sewn on. */
    private fly(slot: number, col: number, row: number): void {
      const piece = this.state.hand[slot]!;
      const shape = SHAPES[piece.shape]!;
      const ms = this.tk.motion.ms('base');
      if (ms === 0) return this.commit(slot, col, row);
      const { gx, gy, cell } = this.f;
      const box = this.pieces[slot]!;
      this.flying = true;
      this.showGhost(slot, col, row, true);
      this.tweens.killTweensOf(box);
      box.setDepth(100);
      kit.fps.burst(ms + 100);
      this.tweens.add({
        targets: box,
        x: gx + (col + shape.w / 2) * cell,
        y: gy + (row + shape.h / 2) * cell,
        scale: 1,
        duration: ms,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this.flying = false;
          this.commit(slot, col, row);
        },
      });
    }

    /** Stops a drag or a flight in progress and puts the patch back (pause, resize, restart). */
    private dropEverything(): void {
      const slot = this.held;
      this.held = -1;
      this.flying = false;
      this.hideGhost();
      for (let i = 0; i < HAND; i++) {
        const piece = this.state.hand[i];
        const box = this.pieces[i]!;
        if (!piece) continue;
        if (i !== slot && box.depth === 50) continue;
        const c = this.slotCentre(i);
        this.tweens.killTweensOf(box);
        box.setPosition(c.x, c.y).setScale(this.restScale(i, SHAPES[piece.shape]!)).setDepth(50);
      }
      this.showCursorGhost();
    }

    // ─── a placement ───
    private commit(slot: number, col: number, row: number): void {
      const piece = this.state.hand[slot];
      const out = piece ? place(this.state, slot, col, row, this.rng) : null;
      if (!piece || !out) return;
      const tk = this.tk;
      tk.run.begin();
      this.state = out.next;
      this.hideGhost();
      if (!this.state.hand[this.sel]) this.sel = this.kbd ? this.nextSlot(slot) : -1;
      this.renderBoard();
      this.renderHand(out.dealt);
      this.feedback(out, piece, col, row);

      if (this.state.score > this.best && !tk.attract) {
        this.best = this.state.score;
        this.profileSave.set({ best: this.best });
      }
      this.saveRun('playing');
      this.updateHud(true);
      this.updateLight(true);
      const lines = out.rows.length + out.cols.length;
      if (lines >= 2 || out.gain.multiplier >= 2 || out.clean) this.perkUp();
      else if (!this.moodTimer) this.setMood(this.restingMood());
      this.showCursorGhost();
      this.publishView();
      if (out.over) this.endBeat();
    }

    private feedback(out: PlaceOutcome, piece: Piece, col: number, row: number): void {
      const { sfx, motion } = this.tk;
      const { gx, gy, cell } = this.f;
      const shape = SHAPES[piece.shape]!;
      const lines = out.rows.length + out.cols.length;
      const locale = this.tk.env.locale;
      sfx.play('pat');
      if (lines > 0) {
        sfx.play('zip');
        sfx.play('coin', {
          detuneCents: Math.min(1200, (lines - 1) * 200 + (out.gain.multiplier - 1) * 100),
        });
      }
      if (out.clean) sfx.play('win');

      // the new squares settle with a small squash
      if (!motion.reduced) {
        kit.fps.burst(lines > 0 ? 800 : 260);
        for (const i of out.placed) {
          const img = this.cells[i]!;
          if (!img.visible) continue;
          const s = img.scale;
          img.setScale(s * 1.16);
          this.tweens.add({ targets: img, scale: s, duration: 160, ease: 'Back.easeOut' });
        }
      }

      const cx = gx + (col + shape.w / 2) * cell;
      const cy = gy + (row + shape.h / 2) * cell;
      popText(this, cx, cy - 10, `+${formatScore(out.gain.total, 'integer', locale)}`, {
        color: lines > 0 ? colors.gold : colors.text,
        px: lines > 0 ? 40 : 28,
        rise: 46,
      });
      if (lines === 0) return;
      const call =
        lines >= 4 ? strings.popMega : lines === 3 ? strings.popTriple : strings.popDouble;
      const midX = gx + cell * (SIZE / 2);
      const midY = gy + cell * (SIZE / 2);
      if (out.clean)
        popText(this, midX, midY, strings.popClean, {
          color: '#7CF2C0',
          px: 54,
          rise: 60,
          ms: 1300,
        });
      else if (lines >= 2)
        popText(this, midX, midY, call, { color: '#FF8FC7', px: 48, rise: 56, ms: 1100 });
      if (out.gain.multiplier >= 2)
        popText(this, midX, midY + 58, strings.t('popStreak', { n: out.gain.multiplier }), {
          color: '#8FE3FF',
          px: 36,
          rise: 40,
          ms: 1100,
        });
      if (lines >= 2) shake(this, 140, 0.004);
      this.clearFx(out);
    }

    /** The needle zips along each full line, then its squares pop into buttons and thread scraps. */
    private clearFx(out: PlaceOutcome): void {
      const { gx, gy, cell } = this.f;
      const reduced = this.tk.motion.reduced;
      const sparse = out.cleared.length > 24;
      out.cleared.forEach(({ index, colour }, n) => {
        const img = this.fxCells[n];
        if (!img) return;
        const c = index % SIZE;
        const r = Math.floor(index / SIZE);
        const x = gx + (c + 0.5) * cell;
        const y = gy + (r + 0.5) * cell;
        const delay = reduced ? 0 : 80 + (out.rows.includes(r) ? c : r) * 24;
        this.tweens.killTweensOf(img);
        this.setPatch(img, colour).setPosition(x, y).setAlpha(1).setVisible(true);
        this.tweens.add({
          targets: img,
          ...(reduced ? { alpha: 0 } : { scale: 0 }),
          delay,
          duration: reduced ? 180 : 210,
          ease: reduced ? 'Linear' : 'Back.easeIn',
          onComplete: () => img.setVisible(false),
        });
        if (reduced) return;
        this.emit(x, y, colour, true, delay + 130);
        if (!sparse || n % 2 === 0) this.emit(x, y, colour, false, delay + 130);
      });
      if (reduced) return;
      const grid = cell * SIZE;
      const run = grid + cell * 0.5;
      let n = 0;
      const zip = (x: number, y: number, across: boolean) => {
        const thread = this.threads[n];
        const needle = this.needles[n++];
        if (!thread || !needle) return;
        const k = grid / THREAD_W / texScale(this, 'sf-thread');
        this.tweens.killTweensOf(thread);
        this.tweens.killTweensOf(needle);
        thread
          .setPosition(x, y)
          .setAngle(across ? 0 : 90)
          .setScale(0, Math.max(k, 0.7 / texScale(this, 'sf-thread')))
          .setAlpha(1)
          .setVisible(true);
        this.tweens.add({ targets: thread, scaleX: k, duration: 200, ease: 'Cubic.easeIn' });
        this.tweens.add({
          targets: thread,
          alpha: 0,
          delay: 300,
          duration: 200,
          onComplete: () => thread.setVisible(false),
        });
        needle
          .setPosition(x, y)
          .setAngle(across ? 0 : 90)
          .setAlpha(1)
          .setVisible(true);
        this.tweens.add({
          targets: needle,
          x: across ? x + run : x,
          y: across ? y : y + run,
          duration: 240,
          ease: 'Cubic.easeIn',
          onComplete: () => needle.setVisible(false),
        });
      };
      for (const r of out.rows) zip(gx, gy + (r + 0.5) * cell, true);
      for (const c of out.cols) zip(gx + (c + 0.5) * cell, gy, false);
    }

    /** Launches one pooled particle: a button in the square's colour, or a thread scrap tinted to match. */
    private emit(x: number, y: number, colour: number, button: boolean, delayMs: number): void {
      const i = this.pNext;
      this.pNext = (i + 1) % PARTICLES;
      const rnd = this.fxRnd;
      const img = this.pImg[i]!;
      const key = button ? `sf-button-${colour}` : 'sf-scrap';
      img
        .setTexture(key)
        .setScale((0.8 + rnd() * 0.5) / texScale(this, key))
        .setRotation(rnd() * 6.28)
        .setAlpha(1)
        .setVisible(false);
      if (button) img.clearTint();
      else img.setTint(colorNum(FABRICS[colour - 1]!.color));
      const angle = -Math.PI / 2 + (rnd() - 0.5) * 2.6;
      const speed = 190 + rnd() * 260;
      this.pX[i] = x;
      this.pY[i] = y;
      this.pVx[i] = Math.cos(angle) * speed;
      this.pVy[i] = Math.sin(angle) * speed - 120;
      this.pSpin[i] = (rnd() - 0.5) * 14;
      this.pLife[i] = 0.55 + rnd() * 0.35;
      this.pWait[i] = delayMs / 1000;
      this.pLive = PARTICLES;
    }

    override update(_time: number, delta: number): void {
      const dt = Math.min(50, delta) / 1000;
      if (this.pLive > 0) {
        let live = 0;
        for (let i = 0; i < PARTICLES; i++) {
          if (this.pLife[i]! <= 0) continue;
          live++;
          const img = this.pImg[i]!;
          if (this.pWait[i]! > 0) {
            this.pWait[i]! -= dt;
            continue;
          }
          this.pVy[i]! += 1100 * dt;
          this.pX[i]! += this.pVx[i]! * dt;
          this.pY[i]! += this.pVy[i]! * dt;
          this.pLife[i]! -= dt;
          const life = this.pLife[i]!;
          img.setVisible(life > 0);
          img.setPosition(this.pX[i]!, this.pY[i]!);
          img.rotation += this.pSpin[i]! * dt;
          img.setAlpha(Math.min(1, life * 4));
        }
        this.pLive = live;
      }
      if (this.tk.motion.reduced) return;
      // dust in the sunbeam drifts very slowly
      this.clock += dt;
      for (let i = 0; i < MOTES; i++) {
        const m = this.motes[i]!;
        const t = this.clock * 0.25 + i * 1.7;
        m.setPosition(this.moteX[i]! + Math.sin(t) * 26, this.moteY[i]! + Math.cos(t * 0.8) * 18);
      }
    }

    // ─── game over ───
    private endBeat(): void {
      this.over = true;
      this.sel = -1;
      this.refreshSlots();
      this.moodTimer?.remove(false);
      this.moodTimer = null;
      this.setMood('worry');
      const slow = this.tk.motion.ms('slow');
      const filled = this.cells.filter((img) => img.visible);
      if (slow === 0) {
        for (const img of filled) img.setAlpha(0.55);
        void this.gameOver();
        return;
      }
      kit.fps.burst(slow * 3);
      // let the last placement's pop finish before the quilt dims
      this.time.delayedCall(420, () => {
        this.tweens.add({
          targets: filled,
          alpha: 0.55,
          duration: slow,
          delay: this.tweens.stagger(8, {}),
          onComplete: () => void this.gameOver(),
        });
      });
    }

    private async gameOver(): Promise<void> {
      if (this.ending) return;
      this.ending = true;
      this.over = true;
      const s = this.state;
      // Save 'over' and flush before the score is submitted, so a reload never submits it twice.
      this.saveRun('over');
      await this.runSave.flush();
      this.tk.sfx.play('lose');
      const action = await this.tk.ui.gameOver({
        title: strings.gameOverTitle,
        scores: [{ board: 'best-score', value: s.score }],
        meta: { placed: s.placed, lines: s.lines, seed: this.seed },
      });
      if (action === 'play-again') this.playAgain();
    }

    private playAgain(): void {
      if (this.tk.signal.aborted) return;
      this.dropEverything();
      this.sel = -1;
      this.startNewRun();
      this.moodTimer?.remove(false);
      this.moodTimer = null;
      this.setMood('doze');
      this.updateLight(false);
      this.renderBoard();
      this.renderHand(true);
      this.updateHud();
      this.showCursorGhost();
      this.publishView();
    }
  }

  return [Play];
};
