// The Glowworm scene: a crystal cave, Wick the glowworm and the glowing berries. The rules live in sim.ts; this
// file maps input to turns and draws. All art is drawn once per mount (art.ts); per frame only positions, alphas,
// scales and tints of pooled images change. A new cave only retints the scenery and repaints the floor.
import type Phaser from 'phaser';
import { colorNum, colors, formatScore, prng, type Save } from '@pocketcade/toolkit';
import {
  backdrop,
  bump,
  burst,
  canvasImage,
  canvasTexture,
  flash,
  hudPill,
  popText,
  shake,
  texScale,
  type HudPill,
  type SceneFactory,
} from '@pocketcade/toolkit/phaser';
import * as art from './art.ts';
import { freshStats, isStatsV1, withRun, type StatsV1 } from './save.ts';
import {
  CLEAR_MS,
  COLS,
  COMBO_MAX,
  COMBO_TICKS,
  DELTA,
  DIRS,
  ENTER_MS,
  GOLDEN_MS,
  QUOTA,
  ROWS,
  cellX,
  cellY,
  createRun,
  stepCell,
  tapDir,
  type Dir,
  type Run,
  type SimEvent,
} from './sim.ts';
import { biomeNames, strings } from './strings.ts';

const STEP_MS = 1000 / 60;
/** the run-over moment before the dialog: Wick's light goes out tail first */
const DEATH_MS = 1100;
const DEATH_MS_CALM = 450;
const WIN_MS = 1600;
/** after a resume Wick waits this long before moving again */
const RESUME_HOLD_MS = 700;
/** CSS px of drag that turns Wick (a turn per stretch, so one drag can steer twice) */
const DRAG_TURN_PX = 24;
/** how long the new cave's name stays up */
const BANNER_MS = 1900;
const PAUSE = { x: 824, w: 162 } as const;
/** floor lights along Wick's body */
const TRAIL = 8;
const MOTES = 30;
/** the demo starts a few caves in, with a longer Wick, so previews show crystals and tunnels */
const ATTRACT_DEPTHS = [6, 3, 2, 4] as const;
/** a link's outline, relative to a bead's */
const LINK_OUT = (art.LINK + 6) / art.OUT;

/** Centre of cell column x / row y in design units. */
const px = (x: number) => art.BOARD_X + (x + 0.5) * art.CELL;
const py = (y: number) => art.BOARD_Y + (y + 0.5) * art.CELL;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;

export const createScenes: SceneFactory = (_P, kit) => {
  class CaveScene extends kit.Scene {
    private sim!: Run;
    private stats: StatsV1 = freshStats();
    private statsSave!: Save<StatsV1>;
    /** saved stats or the top score, whichever is higher */
    private best = 0;
    private newBest = false;
    /** scene ms: frame time in play, the attract step clock in attract */
    private clock = 0;
    private dt = 0;
    private lastStep = 0;
    private holdUntil = 0;
    /** clock when the run ended (death or win), else -1 */
    private endAt = -1;
    private ending = false;
    private attractRuns = 0;
    private drag: { x: number; y: number; turned: boolean; hud: boolean } | null = null;
    private rnd = prng(0x6c0ff);
    /** scratch for lerpCell (no per-segment allocation) */
    private at = { x: 0, y: 0, f: 1 };
    private headAt = { x: px(6), y: py(8) };
    /** 1 / the scale crisp textures were drawn at */
    private unit = 1;
    // scenery
    private back!: Img;
    private rocks: { img: Img; near: boolean }[] = [];
    private spires: { img: Img; glow: Img; glint: Img; hue: 0 | 1; phase: number }[] = [];
    private motes: {
      img: Img;
      x: number;
      y: number;
      top: number;
      bottom: number;
      vy: number;
      phase: number;
      a: number;
    }[] = [];
    private biome = -1;
    // the board
    private floor!: Phaser.GameObjects.Graphics;
    private rims: Img[] = [];
    private gates: Img[] = [];
    private blocks: { img: Img; glint: Img }[] = [];
    private berry!: { img: Img; glow: Img; cell: number; born: number; base: number };
    private gold!: {
      img: Img;
      glow: Img;
      ring: Phaser.GameObjects.Graphics;
      sparks: Img[];
      cell: number;
      born: number;
      base: number;
    };
    private fade!: Phaser.GameObjects.Rectangle;
    // Wick: fill[j] and rim[j] are the bead (even j) or link (odd j) half a cell further from the head
    private fill: Img[] = [];
    private rim: Img[] = [];
    private sizeOf: number[] = [];
    private shown = 0;
    private head!: Img;
    private antennae!: Img;
    private face!: Img;
    private pupils: Img[] = [];
    private angle = 0;
    private antAngle = 0;
    private faceKey = '';
    private faceNow: art.Face = 'idle';
    private faceUntil = 0;
    private blinkAt = 0;
    private look = { x: 0, y: 0 };
    private headGlow!: Img;
    private light!: Img;
    private trail: Img[] = [];
    private flareAt = -Infinity;
    private gulpAt = -Infinity;
    private bannerAt = -Infinity;
    private hud!: {
      score: HudPill;
      best: HudPill;
      cave: HudPill;
      pips: Img[];
      combo: HudPill;
      comboBar: Phaser.GameObjects.Rectangle;
      pause: Img;
      pauseText: Txt;
      hint: Txt;
      rule: Txt;
      ready: Txt;
      caveTitle: Txt;
      caveSub: Txt;
    };

    constructor() {
      super('cave');
    }

    create(): void {
      const tk = this.tk;
      this.makeTextures();
      this.buildScenery();
      this.buildBoard();
      this.buildWick();
      this.buildHud();
      tk.input.configure({
        actions: {
          up: { codes: ['ArrowUp', 'KeyW'] },
          down: { codes: ['ArrowDown', 'KeyS'] },
          left: { codes: ['ArrowLeft', 'KeyA'] },
          right: { codes: ['ArrowRight', 'KeyD'] },
        },
      });
      for (const d of DIRS) tk.input.on(d, (e) => e.phase === 'press' && this.turn(d));
      tk.input.onGesture('tap', (e) => this.onTap(e.x, e.y));
      tk.input.onGesture('dragstart', (e) => {
        this.drag = { x: 0, y: 0, turned: false, hud: this.inHud(e.x, e.y) };
      });
      tk.input.onGesture('drag', (e) => this.onDrag(e.dx, e.dy));
      tk.input.onGesture('swipe', (e) => {
        if (this.drag && !this.drag.turned && !this.drag.hud) this.turn(e.dir);
        this.drag = null;
      });
      tk.on('pause', () => {
        this.drag = null;
      });
      tk.on('resume', () => {
        if (this.sim?.phase === 'playing' && !tk.attract)
          this.holdUntil = this.clock + RESUME_HOLD_MS;
      });
      tk.on('inputchange', () => this.showHint());
      tk.ui.onRestart(() => this.newRun());
      this.statsSave = tk.createSave<StatsV1>({
        key: 'stats',
        defaults: freshStats,
        validate: isStatsV1,
      });
      tk.deferReady();
      if (tk.attract) {
        this.newRun();
        tk.ready();
        return;
      }
      void Promise.all([this.statsSave.load(), tk.host.scores.top('score', 1).catch(() => [])])
        .then(([s, top]) => {
          if (tk.signal.aborted) return; // unmounted while loading: the scene is gone
          this.stats = s.data;
          this.best = Math.max(s.data.best, top[0]?.value ?? 0);
          this.newRun();
        })
        .catch((e: unknown) => {
          tk.reportError(e);
          if (!tk.signal.aborted) this.newRun();
        })
        .finally(() => tk.ready());
    }

    // ─── art ───
    private makeTextures(): void {
      const crisp = (
        key: string,
        w: number,
        h: number,
        draw: (ctx: CanvasRenderingContext2D) => void,
      ) => kit.textures.canvas(this, key, w, h, draw);
      art.RAMP.forEach((color, i) => {
        crisp(`gw-bead-${i}`, art.BEAD, art.BEAD, (ctx) => art.drawBead(ctx, art.BEAD, color));
        crisp(`gw-link-${i}`, art.LINK, art.LINK, (ctx) => art.drawLink(ctx, art.LINK, color));
      });
      crisp('gw-out', art.OUT, art.OUT, (ctx) => art.drawDisc(ctx, art.OUT, art.WORM_INK));
      crisp('gw-head', art.HEAD, art.HEAD, art.drawHead);
      crisp('gw-antennae', art.ANTENNAE, art.ANTENNAE, art.drawAntennae);
      for (const f of art.FACES)
        crisp(`gw-face-${f}`, art.HEAD, art.HEAD, (ctx) => art.drawFace(ctx, f));
      crisp('gw-pupil', art.PUPIL, art.PUPIL, art.drawPupil);
      crisp('gw-berry', 52, 58, (ctx) => art.drawBerry(ctx, 52, 58));
      crisp('gw-golden', 60, 60, (ctx) => art.drawGolden(ctx, 60));
      art.BIOMES.forEach((b, i) => {
        for (let v = 0; v < art.BLOCK.variants; v++)
          crisp(`gw-block-${i}-${v}`, art.BLOCK.w, art.BLOCK.h, (ctx) => art.drawBlock(ctx, b, v));
      });
      const long = art.BOARD + art.RIM * 2;
      crisp('gw-rim-h', long, art.RIM, (ctx) => art.drawRim(ctx, long, true));
      crisp('gw-rim-v', art.RIM, art.BOARD, (ctx) => art.drawRim(ctx, art.BOARD, false));
      crisp('gw-gate', art.CELL, art.RIM, art.drawGate);
      for (let v = 0; v < art.ROCK.variants; v++)
        crisp(`gw-rock-${v}`, art.ROCK.w, art.ROCK.h, (ctx) => art.drawRock(ctx, v));
      for (let v = 0; v < art.SPIRE.variants; v++)
        crisp(`gw-spire-${v}`, art.SPIRE.w, art.SPIRE.h, (ctx) => art.drawSpire(ctx, v));
      crisp('gw-pause', PAUSE.w, art.HUD.h, (ctx) => art.drawPauseButton(ctx, PAUSE.w, art.HUD.h));
      crisp('gw-badge', 42, 42, (ctx) => art.drawBadge(ctx, 42));
      crisp('gw-pip-on', 20, 20, (ctx) => art.drawPip(ctx, 20, true));
      crisp('gw-pip-off', 20, 20, (ctx) => art.drawPip(ctx, 20, false));
      crisp('gw-sparkle', 28, 28, (ctx) => art.drawSparkle(ctx, 28));
      canvasTexture(this, 'gw-glow', 128, 128, (ctx) => art.drawGlow(ctx, 128), { scale: 1 });
      canvasTexture(this, 'gw-shade', 4, 16, (ctx) => art.drawShade(ctx, 4, 16), { scale: 1 });
      this.unit = 1 / texScale(this, 'gw-out');
    }

    private glow(x: number, y: number, size: number, depth: number, tint?: string): Img {
      const img = this.add
        .image(x, y, 'gw-glow')
        .setBlendMode('ADD')
        .setDisplaySize(size, size)
        .setDepth(depth);
      return tint ? img.setTint(colorNum(tint)) : img;
    }

    private sparkle(x: number, y: number, size: number, depth: number): Img {
      return canvasImage(this, x, y, 'gw-sparkle')
        .setBlendMode('ADD')
        .setScale((this.unit * size) / 28)
        .setDepth(depth);
    }

    private buildScenery(): void {
      const { x: bx, y: by } = this.tk.layout.bleed;
      const rnd = this.rnd;
      this.back = backdrop(this, 'gw-back', art.W, art.H, {
        stops: ['#E6E6E6', '#FFFFFF', '#D6D6D6'],
        draw: (ctx, w, h) => art.drawBackdrop(ctx, w, h, bx, by),
      });
      for (const p of art.props(bx, by)) {
        const img = canvasImage(this, p.x, p.y, `gw-${p.kind}-${p.v}`)
          .setOrigin(0.5, p.hang ? 0 : 1)
          .setFlipY(!!p.hang)
          .setFlipX(!!p.flip);
        img.setScale(img.scaleX * p.scale);
        if (p.kind === 'rock') {
          this.rocks.push({ img: img.setDepth(p.near ? -800 : -900), near: !!p.near });
          continue;
        }
        const size = art.SPIRE.h * p.scale;
        const up = p.hang ? 1 : -1;
        this.spires.push({
          img: img.setDepth(-850),
          glow: this.glow(p.x, p.y + up * size * 0.55, size * 1.15, -860),
          glint: this.sparkle(p.x + (rnd() - 0.5) * 50 * p.scale, p.y + up * size * 0.7, 34, -840),
          hue: p.hue ?? 0,
          phase: rnd() * 6.28,
        });
      }
      // motes drift up through the space around the board: two thirds beside it, the rest above and below
      for (let i = 0; i < MOTES; i++) {
        const side = i % 3 > 0;
        const first = i % 2 === 0;
        const top = side ? 0 : first ? -by : art.H;
        const bottom = side ? art.H : first ? 0 : art.H + by;
        const x = side ? (first ? -bx : art.W) + rnd() * bx : rnd() * art.W;
        const size = 8 + rnd() * 12;
        this.motes.push({
          img: this.glow(x, 0, size, -700),
          x,
          y: top + rnd() * (bottom - top),
          top,
          bottom,
          vy: 8 + rnd() * 16,
          phase: rnd() * 6.28,
          a: 0.35 + rnd() * 0.45,
        });
      }
    }

    private buildBoard(): void {
      const { BOARD_X: bx, BOARD_Y: by, BOARD: b, RIM: r } = art;
      this.floor = this.add.graphics().setDepth(0);
      // the top and left walls cast a soft shadow on the floor
      this.add.image(bx, by, 'gw-shade').setOrigin(0).setDisplaySize(b, 16).setDepth(1);
      this.add
        .image(bx, by + b, 'gw-shade')
        .setOrigin(0)
        .setDisplaySize(b, 16)
        .setAngle(-90)
        .setDepth(1);
      this.rims = [
        canvasImage(this, bx - r, by - r, 'gw-rim-h').setOrigin(0),
        canvasImage(this, bx - r, by + b, 'gw-rim-h')
          .setOrigin(0)
          .setFlipY(true),
        canvasImage(this, bx - r, by, 'gw-rim-v')
          .setOrigin(0)
          .setFlipX(true),
        canvasImage(this, bx + b, by, 'gw-rim-v').setOrigin(0),
      ];
      for (const e of this.rims) e.setDepth(2);
      this.gates = Array.from({ length: 2 * (COLS + ROWS) }, () =>
        canvasImage(this, 0, 0, 'gw-gate').setDepth(3).setVisible(false),
      );
      const berry = canvasImage(this, 0, 0, 'gw-berry')
        .setOrigin(0.5, 34 / 58)
        .setDepth(15);
      this.berry = {
        img: berry,
        glow: this.glow(0, 0, 120, 14, colors.pink),
        cell: -1,
        born: 0,
        base: berry.scaleX,
      };
      const gold = canvasImage(this, 0, 0, 'gw-golden').setDepth(16);
      this.gold = {
        img: gold,
        glow: this.glow(0, 0, 170, 14, colors.gold),
        ring: this.add.graphics().setDepth(17),
        sparks: Array.from({ length: 3 }, () =>
          this.sparkle(0, 0, 24, 18).setTint(colorNum('yellow')),
        ),
        cell: -1,
        born: 0,
        base: gold.scaleX,
      };
      const { x: ox, y: oy } = this.tk.layout.bleed;
      this.fade = this.add
        .rectangle(-ox, -oy, art.W + ox * 2, art.H + oy * 2, 0x07041a)
        .setOrigin(0)
        .setDepth(450)
        .setAlpha(0);
    }

    private buildWick(): void {
      this.light = this.glow(0, 0, 520, 5, '#B8FFD8');
      this.trail = Array.from({ length: TRAIL }, () =>
        this.glow(0, 0, 140, 5, art.ACCENT).setVisible(false),
      );
      this.headGlow = this.glow(0, 0, 150, 6, '#E9FF8A');
      this.antennae = canvasImage(this, 0, 0, 'gw-antennae').setDepth(31);
      this.head = canvasImage(this, 0, 0, 'gw-head').setDepth(32);
      this.face = canvasImage(this, 0, 0, 'gw-face-idle').setDepth(33);
      this.faceKey = 'gw-face-idle';
      this.pupils = [0, 1].map(() => canvasImage(this, 0, 0, 'gw-pupil').setDepth(34));
    }

    private buildHud(): void {
      const { y, h } = art.HUD;
      const pill = (
        x: number,
        w: number,
        label: string,
        icon: 'star' | 'trophy' | 'heart' | 'bolt',
        accent: string,
      ) =>
        hudPill(this, x, y, { icon, accent, label, value: '', width: w, height: h, depth: 500 });
      // the cave pill wears a little glowworm badge and shows the berries eaten as pips instead of a value
      const cave = pill(370, 300, '', 'heart', art.ACCENT);
      (cave.container.list[1] as Img)
        .setTexture('gw-badge')
        .setScale(1 / texScale(this, 'gw-badge'));
      const pips = Array.from({ length: QUOTA }, (_, i) =>
        canvasImage(this, 72 + i * 27, h * 0.65, 'gw-pip-off'),
      );
      cave.container.add(pips);
      const combo = pill(678, 136, strings.combo, 'bolt', colors.pink);
      const comboBar = this.add
        .rectangle(62, h - 8, 58, 4, colorNum(colors.pink))
        .setOrigin(0, 0.5);
      combo.container.add(comboBar).setVisible(false);
      const ink = colors.ink;
      const text = (ty: number, size: number, strokePx: number) =>
        kit
          .text(this, art.W / 2, ty, '', { px: size, stroke: ink, strokePx, align: 'center' })
          .setOrigin(0.5)
          .setDepth(600);
      const small = (ty: number) =>
        kit
          .text(this, art.W / 2, ty, '', {
            px: 26,
            weight: 600,
            font: 'body',
            color: 'textMuted',
            stroke: ink,
            strokePx: 6,
            align: 'center',
          })
          .setOrigin(0.5)
          .setDepth(600);
      this.hud = {
        score: pill(14, 170, strings.score, 'star', colors.gold),
        best: pill(192, 170, strings.best, 'trophy', colors.orange),
        cave,
        pips,
        combo,
        comboBar,
        pause: canvasImage(this, PAUSE.x, y, 'gw-pause').setOrigin(0).setDepth(501),
        pauseText: kit
          .text(this, PAUSE.x + 98, y + (h - 6) / 2, strings.pause, { px: 25, color: ink })
          .setOrigin(0.5)
          .setDepth(502),
        hint: text(py(11), 36, 8),
        rule: small(py(12) + 4),
        ready: text(py(5), 46, 9).setText(strings.getReady).setVisible(false),
        caveTitle: text(py(4), 60, 10).setVisible(false),
        caveSub: small(py(5) + 8).setVisible(false),
      };
      if (!this.tk.motion.reduced)
        this.tweens.add({
          targets: this.hud.hint,
          alpha: 0.5,
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
    }

    /** Recolours the scenery, the walls and the floor for a cave palette. */
    private applyBiome(index: number): void {
      if (index === this.biome) return;
      this.biome = index;
      const b = art.BIOMES[index]!;
      const top = colorNum(b.sky[0]);
      const bottom = colorNum(b.sky[1]);
      this.back.setTint(top, top, bottom, bottom);
      for (const r of this.rocks) r.img.setTint(colorNum(r.near ? b.near : b.rock));
      for (const s of this.spires) {
        const tint = colorNum(b.crystal[s.hue]);
        s.img.setTint(tint);
        s.glow.setTint(tint);
      }
      for (const m of this.motes) m.img.setTint(colorNum(b.mote));
      for (const e of this.rims) e.setTint(colorNum(b.wall));
      const g = this.floor.clear();
      g.fillStyle(colorNum(b.floor[0])).fillRect(art.BOARD_X, art.BOARD_Y, art.BOARD, art.BOARD);
      g.fillStyle(colorNum(b.floor[1]));
      for (let y = 0; y < ROWS; y++)
        for (let x = (y + 1) % 2; x < COLS; x += 2)
          g.fillRect(art.BOARD_X + x * art.CELL, art.BOARD_Y + y * art.CELL, art.CELL, art.CELL);
    }

    /** Lays out the current cave: palette, crystal blocks, tunnels and the cave pill. */
    private showCave(): void {
      const cave = this.sim.cave;
      this.applyBiome(cave.biome);
      for (let i = this.blocks.length; i < cave.blocks.length; i++)
        this.blocks.push({
          img: canvasImage(this, 0, 0, 'gw-block-0-0').setOrigin(
            0.5,
            (art.BLOCK.top + art.CELL / 2) / art.BLOCK.h,
          ),
          glint: this.sparkle(0, 0, 26, 12),
        });
      this.blocks.forEach((b, i) => {
        const c = cave.blocks[i];
        b.img.setVisible(c !== undefined);
        b.glint.setVisible(c !== undefined);
        if (c === undefined) return;
        const x = px(cellX(c));
        const y = py(cellY(c));
        b.img
          .setTexture(`gw-block-${cave.biome}-${(c * 7) % art.BLOCK.variants}`)
          .setPosition(x, y)
          .setDepth(10 + cellY(c) / 100);
        b.glint.setPosition(x - 4, y - art.CELL * 0.42);
      });
      const { BOARD_X: bx, BOARD_Y: by, BOARD: b, RIM: r } = art;
      let used = 0;
      const gate = (x: number, y: number, angle: number) =>
        this.gates[used++]!.setPosition(x, y).setAngle(angle).setVisible(true);
      for (let x = 0; x < COLS; x++) {
        if (!cave.wrapCols[x]) continue;
        gate(px(x), by - r / 2, 0);
        gate(px(x), by + b + r / 2, 180);
      }
      for (let y = 0; y < ROWS; y++) {
        if (!cave.wrapRows[y]) continue;
        gate(bx - r / 2, py(y), -90);
        gate(bx + b + r / 2, py(y), 90);
      }
      for (; used < this.gates.length; used++) this.gates[used]!.setVisible(false);
      this.hud.cave.setLabel(strings.t('cave', { n: cave.depth }));
    }

    /** One line about the cave's edges. */
    private edgeRule(): string {
      const { wrapRows, wrapCols } = this.sim.cave;
      const rows = wrapRows.filter(Boolean).length;
      const cols = wrapCols.filter(Boolean).length;
      if (rows === ROWS && cols === COLS) return strings.edgesOpen;
      if (rows + cols === 0) return strings.edgesWalls;
      return rows === ROWS && cols === 0 ? strings.edgesSides : strings.edgesGates;
    }

    // ─── run lifecycle ───
    private newRun(): void {
      const tk = this.tk;
      const seed = `glowworm:run:${tk.rng.main.nextUint32().toString(16)}`;
      const demo = tk.attract
        ? { depth: ATTRACT_DEPTHS[this.attractRuns++ % ATTRACT_DEPTHS.length]!, length: 9 }
        : {};
      this.sim = createRun(tk.rng.create(seed), demo);
      tk.attract?.setView(this.sim);
      this.ending = false;
      this.endAt = -1;
      this.newBest = false;
      this.holdUntil = 0;
      this.drag = null;
      this.lastStep = tk.attract?.step ?? 0;
      this.flareAt = -Infinity;
      this.gulpAt = -Infinity;
      this.bannerAt = -Infinity;
      this.faceUntil = 0;
      this.angle = 0;
      this.antAngle = 0;
      // -2: not drawn yet, so the next draw shows or hides both berries
      this.berry.cell = -2;
      this.gold.cell = -2;
      for (const img of this.fill) img.clearTint();
      const h = this.hud;
      const demoHud = !!tk.attract;
      h.best.container.setVisible(!demoHud);
      h.cave.container.setX(demoHud ? 192 : 370);
      h.combo.container.setX(demoHud ? 500 : 678);
      h.pause.setVisible(!demoHud);
      h.pauseText.setVisible(!demoHud);
      h.best.setLabel(strings.best);
      h.ready.setVisible(false);
      this.showCave();
      this.showHint();
      this.showStats();
      this.draw();
    }

    private showHint(): void {
      const h = this.hud;
      const on = !!this.sim && this.sim.phase === 'ready' && !this.tk.attract;
      h.hint.setVisible(on);
      h.rule.setVisible(on);
      if (!on) return;
      const p = this.tk.env.input.primary;
      const hint =
        p === 'touch'
          ? strings.readyTouch
          : p === 'pointer'
            ? strings.readyPointer
            : strings.readyKeyboard;
      const rule = strings.t('goal', { n: QUOTA });
      if (h.hint.text !== hint) h.hint.setText(hint);
      if (h.rule.text !== rule) h.rule.setText(rule);
    }

    private showStats(): void {
      const s = this.sim;
      const fmt = (v: number) => formatScore(v, 'integer', this.tk.env.locale);
      this.hud.score.set(fmt(s.score));
      this.hud.best.set(fmt(Math.max(this.best, this.newBest ? s.score : 0)));
      this.hud.pips.forEach((pip, i) => pip.setTexture(i < s.got ? 'gw-pip-on' : 'gw-pip-off'));
    }

    // ─── input ───
    private turn(d: Dir): void {
      this.handle(this.sim.turn(d));
    }

    private inHud(x: number, y: number): boolean {
      return y > 0 && y < art.HUD.y + art.HUD.h + 10 && x >= PAUSE.x - 8;
    }

    private onTap(x: number, y: number): void {
      if (this.inHud(x, y)) {
        this.tk.sfx.play('click');
        bump(this, this.hud.pauseText, 1.15, 160);
        void this.tk.ui.pauseMenu();
        return;
      }
      const s = this.sim;
      if (s.phase !== 'ready' && s.phase !== 'playing') return;
      // turn toward the tap, across the latest heading (two quick taps make a U-turn)
      const from = s.queue.at(-1) ?? s.heading;
      const d = tapDir(from, x - this.headAt.x, y - this.headAt.y);
      if (d) this.turn(d);
      else if (s.phase === 'ready') this.turn(s.heading);
    }

    private onDrag(dx: number, dy: number): void {
      const g = this.drag;
      if (!g || g.hud) return;
      const ax = dx - g.x;
      const ay = dy - g.y;
      if (Math.max(Math.abs(ax), Math.abs(ay)) < DRAG_TURN_PX) return;
      g.x = dx;
      g.y = dy;
      g.turned = true;
      this.turn(Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up');
    }

    // ─── frame ───
    override update(_time: number, delta: number): void {
      if (!this.sim) return;
      const a = this.tk.attract;
      const dt = a ? (a.step - this.lastStep) * STEP_MS : Math.min(delta, 100);
      this.lastStep = a?.step ?? 0;
      this.clock += dt;
      this.dt = dt;
      const s = this.sim;
      if ((s.phase === 'playing' || s.phase === 'cleared') && this.clock >= this.holdUntil)
        this.handle(s.advance(dt));
      const wait = s.phase === 'won' ? WIN_MS : this.tk.motion.reduced ? DEATH_MS_CALM : DEATH_MS;
      if (this.endAt >= 0 && !this.ending && this.clock >= this.endAt + wait) void this.gameOver();
      this.draw();
    }

    private handle(events: SimEvent[]): void {
      for (const e of events) {
        switch (e.type) {
          case 'start':
            this.tk.run.begin();
            this.showHint();
            break;
          case 'eat':
            this.onEat(e.cell, e.golden, e.points, e.chain);
            break;
          case 'golden': {
            const x = px(cellX(e.cell));
            const y = py(cellY(e.cell));
            this.tk.sfx.play('click', { volume: 0.5, detuneCents: 700 });
            burst(this, x, y, {
              shape: 'star',
              colors: [colors.gold, colors.yellow, '#FFFFFF'],
              count: 8,
              distance: 56,
              size: 11,
              depth: 60,
            });
            // a heads-up next to it (kept inside the cave)
            popText(this, Math.min(820, Math.max(180, x)), y < 240 ? y + 54 : y - 50, strings.golden, {
              color: colors.gold,
              px: 32,
              ms: 1100,
            });
            break;
          }
          case 'golden-gone':
            burst(this, px(cellX(e.cell)), py(cellY(e.cell)), {
              shape: 'spark',
              colors: [colors.gold, '#FFFFFF'],
              count: 6,
              distance: 40,
              size: 14,
              depth: 60,
            });
            break;
          case 'clear':
            this.onClear(e.points);
            break;
          case 'cave':
            this.onCave();
            break;
          case 'die':
            this.onDie();
            break;
          case 'won':
            this.onWin();
            break;
        }
      }
    }

    private onEat(cell: number, golden: boolean, points: number, chain: number): void {
      const tk = this.tk;
      const x = px(cellX(cell));
      const y = py(cellY(cell));
      // the pickup note climbs with the combo
      if (golden) tk.sfx.play('gold', { volume: 0.7 });
      else
        tk.sfx.play('coin', { volume: 0.7, detuneCents: 120 * (Math.min(chain, COMBO_MAX) - 1) });
      burst(this, x, y, {
        shape: golden ? 'star' : 'dot',
        colors: golden
          ? [colors.gold, colors.yellow, '#FFFFFF']
          : [colors.pink, '#FFB3DA', art.ACCENT, '#FFFFFF'],
        count: golden ? 16 : 10,
        distance: golden ? 120 : 76,
        size: golden ? 15 : 10,
        lifeMs: 520,
        depth: 60,
      });
      const hot = golden || chain > 1;
      popText(this, x, y - 34, strings.t('points', { n: points }), {
        color: hot ? colors.gold : '#FFC2E0',
        px: golden ? 40 : chain > 1 ? 34 : 30,
        rise: golden ? 52 : 38,
      });
      this.setFace(golden ? 'happy' : 'chomp', golden ? 600 : 240);
      this.flareAt = this.clock;
      this.gulpAt = this.clock;
      bump(this, this.head, 1.22, 220);
      const s = this.sim;
      if (!tk.attract && !this.newBest && this.best > 0 && s.score > this.best) {
        this.newBest = true;
        this.hud.best.setLabel(strings.newBest);
        popText(this, 277, 104, strings.newBestPop, { color: colors.gold, px: 26 });
        burst(this, 277, 40, { shape: 'star', count: 12, distance: 90, depth: 700 });
      }
      this.showStats();
      this.hud.score.bump();
      if (!golden && s.got > 0) bump(this, this.hud.pips[s.got - 1]!, 1.5, 260);
    }

    /** The cave is cleared: a short celebration while the view fades toward the next cave. */
    private onClear(points: number): void {
      const b = art.BIOMES[this.sim.cave.biome]!;
      this.tk.sfx.play('win', { volume: 0.8 });
      flash(this, b.wall, 280, 0.2);
      const body = this.sim.body;
      for (let i = 0; i < 5; i++) {
        const c = body[Math.floor((i * body.length) / 5)]!;
        burst(this, px(cellX(c)), py(cellY(c)), {
          shape: 'star',
          colors: [...b.crystal, colors.gold, '#FFFFFF'],
          count: 10,
          distance: 130,
          size: 13,
          depth: 440,
        });
      }
      popText(this, art.W / 2, py(8), strings.t('cleared', { n: points }), {
        color: colors.gold,
        px: 54,
        rise: 56,
        ms: 1250,
        depth: 440,
      });
      this.gulpAt = this.clock;
      this.flareAt = this.clock;
      this.showStats();
      this.hud.score.bump();
    }

    /** Wick arrives in the next cave. */
    private onCave(): void {
      this.tk.sfx.play('whoosh');
      this.showCave();
      this.showStats();
      for (const img of this.fill) img.clearTint();
      this.angle = 0;
      this.antAngle = 0;
      this.gulpAt = -Infinity;
      this.bannerAt = this.clock;
      const h = this.hud;
      h.caveTitle.setText(strings.t('cave', { n: this.sim.cave.depth }));
      h.caveSub.setText(`${biomeNames[this.sim.cave.biome]!}\n${this.edgeRule()}`);
      bump(this, h.cave.container, 1.08, 260);
    }

    private onDie(): void {
      const tk = this.tk;
      tk.sfx.play('hit');
      tk.sfx.play('lose');
      shake(this, 260, 0.012);
      flash(this, colors.vermillion, 220, 0.22);
      burst(this, this.headAt.x, this.headAt.y, {
        shape: 'dot',
        colors: [colors.vermillion, '#FFFFFF', art.ACCENT],
        count: 10,
        distance: 66,
        size: 10,
        depth: 60,
      });
      this.endRun();
    }

    private onWin(): void {
      this.tk.sfx.play('win');
      flash(this, colors.gold, 300, 0.25);
      const body = this.sim.body;
      for (let i = 0; i < 6; i++) {
        const c = body[Math.floor((i * body.length) / 6)]!;
        burst(this, px(cellX(c)), py(cellY(c)), {
          shape: 'star',
          count: 14,
          distance: 160,
          depth: 700,
        });
      }
      popText(this, art.W / 2, py(8), strings.won, {
        color: colors.gold,
        px: 56,
        rise: 60,
        ms: 1400,
      });
      this.endRun();
    }

    /** Stats are saved now, not when the dialog opens: a Restart from the pause menu in between would lose the run. */
    private endRun(): void {
      this.endAt = this.clock;
      const s = this.sim;
      if (this.tk.attract) return;
      this.stats = withRun(this.stats, { score: s.score, length: s.length, depth: s.cave.depth });
      this.statsSave.set(this.stats);
      this.best = Math.max(this.best, s.score);
    }

    private setFace(face: art.Face, ms: number): void {
      this.faceNow = face;
      this.faceUntil = this.clock + ms;
    }

    private async gameOver(): Promise<void> {
      this.ending = true;
      const tk = this.tk;
      const s = this.sim;
      const title =
        s.phase === 'won'
          ? strings.won
          : s.cause === 'self'
            ? strings.self
            : s.cause === 'wall'
              ? strings.wall
              : strings.crystalHit;
      await tk.ui.gameOver({
        title,
        scores: s.score >= 1 ? [{ board: 'score', value: s.score }] : [],
        meta: { v: 1, cave: s.cave.depth, length: s.length, berries: s.eaten, ticks: s.ticks },
      });
      if (!tk.signal.aborted) this.newRun();
    }

    // ─── drawing ───
    /** Colours and sizes when Wick's length changes: lime at the neck to teal at the tail, which tapers. */
    private restyle(m: number): void {
      for (let j = this.fill.length; j < m; j++) {
        this.rim.push(canvasImage(this, 0, 0, 'gw-out').setDepth(28));
        this.fill.push(canvasImage(this, 0, 0, 'gw-link-0').setDepth(30 - j * 1e-4));
        this.sizeOf.push(1);
      }
      for (let j = 0; j < Math.max(m, this.shown, 1); j++) {
        const on = j > 0 && j < m;
        this.fill[j]?.setVisible(on);
        this.rim[j]?.setVisible(on);
        if (!on) continue;
        const rel = j / (m - 1);
        const tone = Math.min(art.RAMP.length - 1, Math.floor(rel * art.RAMP.length));
        const fromTail = m - 1 - j;
        this.sizeOf[j] = (fromTail >= 5 ? 1 : 0.5 + 0.1 * fromTail) * (1 - 0.08 * rel);
        this.fill[j]!.setTexture(`gw-${j % 2 ? 'link' : 'bead'}-${tone}`);
      }
      this.shown = m;
    }

    /**
     * The point at k (0..1) of the way from cell `from` to `to`, into `this.at`. Through a tunnel it slides half a
     * cell out of one edge, fading, then in from the other side.
     */
    private lerpCell(from: number, to: number, k: number): void {
      const fx = cellX(from);
      const fy = cellY(from);
      const tx = cellX(to);
      const ty = cellY(to);
      const dx = Math.abs(tx - fx) > 1 ? -Math.sign(tx - fx) : tx - fx;
      const dy = Math.abs(ty - fy) > 1 ? -Math.sign(ty - fy) : ty - fy;
      const at = this.at;
      if (Math.abs(tx - fx) > 1 || Math.abs(ty - fy) > 1) {
        const out = k < 0.5;
        at.x = px(out ? fx + dx * k : tx - dx * (1 - k));
        at.y = py(out ? fy + dy * k : ty - dy * (1 - k));
        at.f = Math.abs(1 - 2 * k);
      } else {
        at.x = px(fx + dx * k);
        at.y = py(fy + dy * k);
        at.f = 1;
      }
    }

    /** The point `u` cells behind Wick's front cell along the body, into `this.at`. */
    private sample(u: number): void {
      const { body, prev } = this.sim;
      const n = body.length;
      const seg = Math.min(n - 1, Math.floor(u));
      const from = body[seg]!;
      // past the tail: the cell it just left, or the tail itself while Wick grows or rests
      const to = seg + 1 < n ? body[seg + 1]! : prev.length === n ? prev[n - 1]! : from;
      this.lerpCell(from, to, Math.min(1, u - seg));
    }

    private draw(): void {
      const s = this.sim;
      const t = this.clock;
      const calm = this.tk.motion.reduced;
      const m = s.body.length * 2 - 1;
      if (m !== this.shown) this.restyle(m);
      // Wick is drawn one tick behind the rules, gliding from the last cell to the current one
      const moving = s.phase === 'playing' && s.prev !== s.body && s.acc >= 0;
      const k = moving ? Math.min(1, s.acc / s.tickMs) : 1;
      const lag = 1 - k;
      const ended = this.endAt >= 0;
      const p = ended ? Math.min(1, (t - this.endAt) / (calm ? DEATH_MS_CALM : DEATH_MS)) : 0;
      const dead = s.phase === 'dead';
      const unit = this.unit;

      // head (a little bonk toward the obstacle when Wick dies)
      this.sample(lag);
      let { x: hx, y: hy } = this.at;
      const hf = this.at.f;
      const [ux, uy] = DELTA[s.heading];
      if (dead && !calm) {
        const bonk = Math.sin(Math.min(1, (t - this.endAt) / 180) * Math.PI) * 10;
        hx += ux * bonk;
        hy += uy * bonk;
      }
      this.headAt.x = hx;
      this.headAt.y = hy;
      // the face turns toward the heading the short way round; the feelers follow a beat later
      const want = Math.atan2(uy, ux);
      const ease = (from: number, ms: number) => {
        const d = Math.atan2(Math.sin(want - from), Math.cos(want - from));
        return from + d * (calm ? 1 : 1 - Math.exp(-this.dt / ms));
      };
      this.angle = ease(this.angle, 45);
      this.antAngle = ease(this.antAngle, 95);
      const cos = Math.cos(this.angle);
      const sin = Math.sin(this.angle);
      this.head.setPosition(hx, hy).setAlpha(hf);
      this.antennae.setPosition(hx, hy).setRotation(this.antAngle).setAlpha(hf);
      const face = this.faceFor(s, t);
      this.setFaceTexture(face);
      this.face.setPosition(hx, hy).setRotation(this.angle).setAlpha(hf);
      // pupils look at the nearest treat
      const target = s.golden >= 0 ? s.golden : s.berry;
      let lx = cos;
      let ly = sin;
      if (target >= 0) {
        lx = px(cellX(target)) - hx;
        ly = py(cellY(target)) - hy;
        const len = Math.hypot(lx, ly) || 1;
        lx /= len;
        ly /= len;
      }
      this.look.x += (lx * 2.8 - this.look.x) * 0.25;
      this.look.y += (ly * 2.8 - this.look.y) * 0.25;
      const eyes = face === 'idle' || face === 'open';
      this.pupils.forEach((pupil, i) => {
        const side = (i ? 1 : -1) * art.EYE.y;
        pupil
          .setVisible(eyes)
          .setPosition(
            hx + cos * art.EYE.x - sin * side + this.look.x,
            hy + sin * art.EYE.x + cos * side + this.look.y,
          )
          .setAlpha(hf);
      });

      // Wick's light pools on the floor under the head and along the body; it flares on every berry
      const glowFade = dead ? 1 - p : 1;
      const flare = Math.max(0, 1 - (t - this.flareAt) / 400);
      const chain = Math.min(COMBO_MAX, s.chain);
      const lightSize = 500 + chain * 40 + flare * 110;
      this.headGlow.setPosition(hx, hy).setAlpha(0.5 * hf * glowFade);
      this.light
        .setPosition(hx, hy)
        .setDisplaySize(lightSize, lightSize)
        .setAlpha((0.3 + chain * 0.025 + flare * 0.14) * glowFade);

      // body: bead or link j sits j half-cells behind the head; on death the light goes out tail first
      const wave = calm ? -99 : (t - this.gulpAt) / 20;
      for (let j = 1; j < m; j++) {
        this.sample(lag + j * 0.5);
        const { x, y, f } = this.at;
        const d = Math.abs(j - wave);
        const size = unit * this.sizeOf[j]! * (d < 3 ? 1.3 - 0.1 * d : 1);
        const fill = this.fill[j]!.setPosition(x, y).setAlpha(f).setScale(size);
        this.rim[j]!.setPosition(x, y + 1.5)
          .setAlpha(f)
          .setScale(j % 2 ? size * LINK_OUT : size);
        if (dead) {
          const out = clamp01((p * 1.4 - (m - 1 - j) / m) / 0.25);
          const v = Math.round(255 - 140 * out);
          fill.setTint((v << 16) | (v << 8) | v);
        }
      }
      const stride = Math.max(2, Math.ceil(m / TRAIL / 2) * 2);
      this.trail.forEach((img, i) => {
        const j = (i + 1) * stride;
        img.setVisible(j < m);
        if (j < m)
          img.setPosition(this.fill[j]!.x, this.fill[j]!.y).setAlpha(0.2 * this.fill[j]!.alpha * glowFade);
      });

      // crystals glint as Wick passes
      const count = s.cave.blocks.length;
      for (let i = 0; i < count; i++) {
        const g = this.blocks[i]!.glint;
        const near = Math.max(0, 1 - Math.hypot(g.x - hx, g.y - hy) / 260);
        g.setAlpha(near * (calm ? 0.8 : 0.55 + 0.45 * Math.sin(t / 170 + i * 1.7)));
      }
      this.drawBerries(s, t, calm);
      this.drawScenery(t, calm);
      this.drawOverlays(s, t, moving ? k : 0);
    }

    private drawScenery(t: number, calm: boolean): void {
      for (const sp of this.spires) {
        const wave = calm ? 0.5 : Math.sin(t / 1300 + sp.phase) ** 2;
        sp.glow.setAlpha(0.28 + 0.16 * wave);
        sp.glint.setAlpha(calm ? 0.7 : Math.max(0, Math.sin(t / 520 + sp.phase * 3)) ** 3);
      }
      if (calm) {
        for (const mote of this.motes) mote.img.setPosition(mote.x, mote.y).setAlpha(mote.a);
        return;
      }
      for (const mote of this.motes) {
        mote.y -= (mote.vy * this.dt) / 1000;
        if (mote.y < mote.top) mote.y = mote.bottom;
        mote.img
          .setPosition(mote.x + Math.sin(t / 1700 + mote.phase) * 12, mote.y)
          .setAlpha(mote.a * (0.45 + 0.55 * Math.sin(t / 900 + mote.phase) ** 2));
      }
    }

    /** The fade between caves, the new cave's name, the "Ready…" hold and the combo pill. */
    private drawOverlays(s: Run, t: number, k: number): void {
      const h = this.hud;
      const fade =
        s.phase === 'cleared'
          ? clamp01((CLEAR_MS - s.clearLeftMs - 800) / 450)
          : s.phase === 'playing' && s.acc < 0
            ? clamp01((-s.acc - (ENTER_MS - 450)) / 450)
            : 0;
      this.fade.setAlpha(fade);
      const age = t - this.bannerAt;
      const banner = age < BANNER_MS && !this.tk.attract && s.phase === 'playing';
      h.caveTitle.setVisible(banner);
      h.caveSub.setVisible(banner);
      if (banner) {
        const a = clamp01(age / 250) * clamp01((BANNER_MS - age) / 400);
        h.caveTitle.setAlpha(a);
        h.caveSub.setAlpha(a);
      }
      h.ready.setVisible(t < this.holdUntil && s.phase === 'playing');
      const chain = s.chain;
      h.combo.container.setVisible(chain > 1);
      if (chain > 1) {
        h.combo.set(strings.t('comboValue', { n: Math.min(COMBO_MAX, chain) }));
        h.comboBar.setScale(clamp01((s.chainTicksLeft - k) / COMBO_TICKS), 1);
      }
    }

    private faceFor(s: Run, t: number): art.Face {
      if (s.phase === 'dead') return 'sad';
      if (s.phase === 'won' || s.phase === 'cleared') return 'happy';
      if (t < this.faceUntil) return this.faceNow;
      if (t >= this.blinkAt + 130) this.blinkAt = t + 2200 + this.rnd() * 2400;
      if (t >= this.blinkAt) return 'blink';
      // mouth opens when a berry is one or two cells ahead
      const one = stepCell(s.body[0]!, s.heading, s.cave);
      const two = one >= 0 ? stepCell(one, s.heading, s.cave) : -1;
      const food = (c: number) => c >= 0 && (c === s.berry || c === s.golden);
      return s.phase === 'playing' && (food(one) || food(two)) ? 'open' : 'idle';
    }

    private setFaceTexture(face: art.Face): void {
      const key = `gw-face-${face}`;
      if (key === this.faceKey) return;
      this.faceKey = key;
      this.face.setTexture(key);
    }

    private drawBerries(s: Run, t: number, calm: boolean): void {
      const pop = (born: number) =>
        calm
          ? 1
          : Math.min(1, (t - born) / 220) ** 0.6 *
            (1 + 0.25 * Math.sin(Math.min(1, (t - born) / 220) * Math.PI));
      const b = this.berry;
      if (s.berry !== b.cell) {
        b.cell = s.berry;
        b.born = t;
        b.img.setVisible(b.cell >= 0);
        b.glow.setVisible(b.cell >= 0);
        if (b.cell >= 0) {
          b.img.setPosition(px(cellX(b.cell)), py(cellY(b.cell)));
          b.glow.setPosition(b.img.x, b.img.y);
        }
      }
      if (b.cell >= 0) {
        const pulse = calm ? 1 : 1 + 0.07 * Math.sin(t / 220);
        b.img.setScale(b.base * pulse * pop(b.born));
        b.glow.setAlpha(calm ? 0.55 : 0.45 + 0.2 * Math.sin(t / 220));
      }
      const g = this.gold;
      if (s.golden !== g.cell) {
        g.cell = s.golden;
        g.born = t;
        const on = g.cell >= 0;
        for (const o of [g.img, g.glow, g.ring, ...g.sparks]) o.setVisible(on);
        if (on) {
          g.img.setPosition(px(cellX(g.cell)), py(cellY(g.cell)));
          g.glow.setPosition(g.img.x, g.img.y);
        }
      }
      if (g.cell < 0) return;
      const { x, y } = g.img;
      const left = s.goldenLeftMs / GOLDEN_MS;
      // the last 2 s it flickers, so the fade is never a surprise
      const flicker = !calm && s.goldenLeftMs < 2000 && Math.sin(t / 45) > 0.4 ? 0.45 : 1;
      g.img
        .setScale(g.base * (calm ? 1 : 1 + 0.08 * Math.sin(t / 160)) * pop(g.born))
        .setAlpha(flicker);
      g.glow.setAlpha((calm ? 0.65 : 0.5 + 0.25 * Math.sin(t / 160)) * flicker);
      g.ring
        .clear()
        .lineStyle(9, colorNum('ink'), 0.6)
        .strokeCircle(x, y, 34)
        .lineStyle(5, colorNum('gold'), 1)
        .beginPath()
        .arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left)
        .strokePath();
      const unit = this.unit;
      g.sparks.forEach((sp, i) => {
        const a = t / 700 + (i * Math.PI * 2) / 3;
        const tw = calm ? 0.8 : 0.5 + 0.5 * Math.sin(t / 130 + i * 2.1) ** 2;
        sp.setPosition(x + Math.cos(a) * 28, y + Math.sin(a) * 28)
          .setScale(unit * (0.4 + 0.5 * tw))
          .setAlpha(tw);
      });
    }
  }

  return [CaveScene];
};
