// The Pop Reef scene: Puff the pufferfish under a ceiling of bubbles, in one of four reef zones. The rules live in
// sim.ts and the boards in levels.ts; this file maps input to aim, fire and swap, runs the level flow (intro, win
// card, next level) and draws. All art is drawn once per mount (art.ts), except the zone backdrop, which is redrawn
// when the zone changes between levels. Bubbles, guide dots, pops, rings, droplets and freed fish are pooled images.
import type Phaser from 'phaser';
import { colorNum, colors, formatScore, prng, shade, type Save } from '@pocketcade/toolkit';
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
  type HudPill,
  type SceneFactory,
} from '@pocketcade/toolkit/phaser';
import * as art from './art.ts';
import { MAX_LEVEL, buildLevel, type Level, type Tip } from './levels.ts';
import {
  freshProgress,
  furthest,
  isProgressV1,
  withLevel,
  withRun,
  type ProgressV1,
} from './save.ts';
import {
  CELL_COUNT,
  COLOURS,
  COLS,
  DANGER_ROW,
  DANGER_Y,
  FIELD_L,
  FIELD_R,
  R,
  RAINBOW,
  ROW_H,
  STAR_BONUS,
  SHOOT_X,
  SHOOT_Y,
  STEP_MS,
  STONE,
  URCHIN,
  aimToward,
  cellX,
  cellY,
  createRun,
  lowestRow,
  trace,
  type Bubble,
  type Run,
  type SimEvent,
} from './sim.ts';
import { strings } from './strings.ts';

const MAX_STEPS = 6;
/** the lost-level moment before the dialog */
const OVER_MS = 1300;
const OVER_MS_CALM = 500;
/** the cleared-level moment before the result card (or, in attract, the next level) */
const WIN_MS = 1500;
const WIN_MS_CALM = 600;
/** after a new board drops in, shots wait this long */
const LEVEL_HOLD_MS = 600;
/** the level title stays this long */
const INTRO_MS = 2400;
/** card buttons ignore input this long, so a shot meant for the level can't press them */
const CARD_GUARD_MS = 500;
const STAR_GAP_MS = 280;
const LOAD_MS = 180;
const PUFF_MS = 240;
/** the level the self-playing demo starts on: a busy kelp-forest rescue */
const ATTRACT_LEVEL = 30;
const GUIDE_DOTS = 56;
const GUIDE_GAP = 26;
const GUIDE_SKIP = 50;
const FX_BUBBLES = CELL_COUNT;
const FX_DROPS = 160;
const FX_RINGS = 48;
const FX_FISH = 10;
const DROPS_PER_POP = 3;
const POP_MS = 110;
const RING_MS = 240;
const BLAST_MS = 380;
const BLAST_SIZE = 5 * 2 * R;
/** pops in one chain are this far apart */
const CHAIN_MS = 28;
const FALL_G = 2200;
const DROP_G = 520;
const SPECKS = 20;
const SHOAL = 6;
const BIG_COMBO = 8;
const HUGE_COMBO = 16;
/** worried face and a pulsing danger line when the lowest bubble is this many rows from the line */
const WORRY_ROWS = 3;
const MAX_PIPS = 6;
const PILL = { y: 10, h: 56 } as const;
const LEVEL_PILL = { x: 10, w: 132 } as const;
const STAR_PILL = { x: 148, w: 178 } as const;
const GOAL_PILL = { x: 332, w: 118 } as const;
const SCORE_PILL = { x: 456, w: 188 } as const;
const PAUSE = { x: 650, w: 60 } as const;
const NEXT_HIT = 50;
const CARD_Y = 430;
const BTN_Y = CARD_Y + 128;
const BTN_NEXT_X = 360 + 124;
const BTN_REPLAY_X = 360 - 124;
const RAYS = [
  [-330, 0.5, 0],
  [40, 0.55, 1.3],
  [330, 0.4, 2.6],
  [640, 0.5, 4.2],
] as const;
const TIPS = {
  match: 'tipMatch',
  drop: 'tipDrop',
  rainbow: 'tipRainbow',
  stone: 'tipStone',
  fish: 'tipFish',
  urchin: 'tipUrchin',
} as const satisfies Record<Tip, string>;
const ZONE_NAMES = ['zone0', 'zone1', 'zone2', 'zone3'] as const;

type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
type Rect = Phaser.GameObjects.Rectangle;
interface Fx {
  img: Img;
  on: boolean;
  mode: 'pop' | 'fall' | 'drop' | 'ring' | 'fish';
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** scene clock when it starts moving (before that a pop shows its bubble still, the others hide) */
  t0: number;
  life: number;
  base: number;
  /** a pop's place in its chain (sets the pitch of its sound); -1 = silent */
  note: number;
}

const tex = (k: number, fish = false) => (fish ? `pr-f${k}` : `pr-b${k}`);

export const createScenes: SceneFactory = (_P, kit) => {
  class Reef extends kit.Scene {
    private sim!: Run;
    private level!: Level;
    private progress: ProgressV1 = freshProgress();
    private progressSave!: Save<ProgressV1>;
    /** points from the levels already cleared in this run */
    private runBase = 0;
    /** scene ms: frame time in play, the attract step clock in attract */
    private clock = 0;
    private acc = 0;
    private lastStep = 0;
    private holdUntil = 0;
    /** clock when the level was lost or won, else -1 */
    private endAt = -1;
    private wonAt = -1;
    private ending = false;
    private drag = false;
    private rnd = prng(0x9e3f);
    // the reef
    private zone = -1;
    private bg: Img | null = null;
    private band!: Rect;
    private lip!: Img;
    private field!: Rect;
    private walls: Img[] = [];
    private rays: { img: Img; a: number; phase: number }[] = [];
    private weeds: { x: number; phase: number; leaves: Img[] }[] = [];
    private specks: { img: Img; x: number; y: number; v: number; phase: number }[] = [];
    private shoal: { img: Img; x: number; y: number; v: number; phase: number }[] = [];
    // the board
    private layer!: Phaser.GameObjects.Container;
    private cells: Img[] = [];
    private shown = new Int16Array(CELL_COUNT).fill(-2);
    private shownShift = -1;
    private shownVersion = -1;
    private low = -1;
    private shot!: Img;
    private danger!: Img;
    // the launcher
    private cur!: Img;
    private nxt!: Img;
    private bubbleScale = 1;
    private shownCur = -1;
    private shownNext = -1;
    private loadAt = -Infinity;
    private guide: Img[] = [];
    private ghost!: Img;
    private guidePath: number[] = [];
    private guideCell = -1;
    private guideAim = NaN;
    private guideVersion = -1;
    private guideTints: number[] = [];
    private pips: Img[] = [];
    private sink!: Img;
    private shownMisses = -1;
    // Puff
    private body!: Img;
    private face!: Img;
    private pupils: Img[] = [];
    private faceKey = '';
    private faceNow: art.Face = 'idle';
    private faceUntil = 0;
    private puffUntil = 0;
    private blinkAt = 0;
    // effects
    private fxBubbles: Fx[] = [];
    private fxDrops: Fx[] = [];
    private fxRings: Fx[] = [];
    private fxFish: Fx[] = [];
    private blast!: Img;
    private blastAt = -Infinity;
    private blastScale = 1;
    // HUD, level title and result card
    private hudLayer!: Phaser.GameObjects.Container;
    private hud!: {
      level: HudPill;
      score: HudPill;
      stars: Img[];
      starShots: Txt;
      goalIcon: Img;
      goal: Txt;
      pause: Img;
      next: Txt;
      title: Txt;
      zone: Txt;
      goalLine: Txt;
      hint: Txt;
    };
    private shownStars = -1;
    private introAt = -Infinity;
    private card!: {
      root: Phaser.GameObjects.Container;
      title: Txt;
      stars: Img[];
      score: Txt;
      bonus: Txt;
      keys: Txt;
    };
    private cardAt = -1;
    private cardStars = 0;
    private cardShown = 0;

    constructor() {
      super('reef');
    }

    create(): void {
      const tk = this.tk;
      this.makeTextures();
      this.buildReef();
      this.buildBoard();
      this.buildLauncher();
      this.buildFx();
      this.buildHud();
      this.buildCard();
      this.place();
      tk.input.configure({
        actions: {
          left: { codes: ['ArrowLeft'] },
          right: { codes: ['ArrowRight'] },
          fire: { codes: ['Space', 'ArrowUp', 'Enter'] },
          swap: { codes: ['KeyX', 'ShiftLeft', 'ShiftRight'] },
          replay: { codes: ['KeyR'] },
        },
      });
      tk.input.on('fire', (e) => e.phase === 'press' && (this.cardOpen ? this.next() : this.fire()));
      tk.input.on('swap', (e) => e.phase === 'press' && this.swap());
      tk.input.on('replay', (e) => e.phase === 'press' && this.cardOpen && this.replay());
      // touch (and mouse) drag aims, release fires; a tap or click aims at the point and fires
      tk.input.onGesture('tap', (e) => this.onTap(e.x, e.y));
      tk.input.onGesture('dragstart', (e) => {
        this.drag = !this.cardOpen && e.y > this.hudBottom;
        if (this.drag) this.aimAt(e.x, e.y);
      });
      tk.input.onGesture('drag', (e) => this.drag && this.aimAt(e.x, e.y));
      tk.input.onGesture('dragend', (e) => {
        // letting go back down on Puff cancels the shot, and so does a touch the OS took away
        if (this.drag && !e.cancelled && e.y < SHOOT_Y) this.fire();
        this.drag = false;
      });
      // the mouse aims by hovering (the toolkit has no hover gesture)
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (p.wasTouch || this.drag || tk.attract || tk.ui.open) return;
        const w = this.cameras.main.getWorldPoint(p.x, p.y);
        this.aimAt(w.x, w.y);
      });
      tk.on('pause', () => {
        this.drag = false;
      });
      tk.on('resize', () => this.place());
      tk.on('inputchange', () => this.showHint());
      tk.ui.onRestart(() => this.startLevel(this.level.n, true));
      this.progressSave = tk.createSave<ProgressV1>({
        key: 'progress',
        defaults: freshProgress,
        validate: isProgressV1,
      });
      tk.deferReady();
      if (tk.attract) {
        this.startLevel(ATTRACT_LEVEL, true);
        tk.ready();
        return;
      }
      void this.progressSave
        .load()
        .then((s) => {
          if (tk.signal.aborted) return; // unmounted while loading: the scene is gone
          this.progress = s.data;
          this.startLevel(furthest(this.progress), true);
        })
        .catch((e: unknown) => {
          tk.reportError(e);
          if (!tk.signal.aborted) this.startLevel(1, true);
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
      const { x: bx, y: by } = this.tk.layout.bleed;
      const B = art.BUBBLE;
      for (let k = 0; k < COLOURS; k++) {
        crisp(tex(k), B, B, (ctx) => art.drawBubble(ctx, B, k));
        crisp(tex(k, true), B, B, (ctx) => art.drawFishBubble(ctx, B, k));
      }
      crisp(tex(STONE), B, B, (ctx) => art.drawStone(ctx, B));
      crisp(tex(URCHIN), B, B, (ctx) => art.drawUrchin(ctx, B));
      crisp(tex(RAINBOW), B, B, (ctx) => art.drawRainbow(ctx, B));
      crisp('pr-fish', art.FISH.w, art.FISH.h, (ctx) =>
        art.drawFish(ctx, art.FISH.w / 2, art.FISH.h / 2, art.FISH.w - 6, art.FISH.h - 6),
      );
      crisp('pr-ring', B, B, (ctx) => art.drawRing(ctx, B, 5));
      crisp('pr-ghost', B, B, (ctx) => art.drawRing(ctx, B, 4));
      crisp('pr-blast', BLAST_SIZE, BLAST_SIZE, (ctx) => art.drawRing(ctx, BLAST_SIZE, 14));
      crisp('pr-puff', art.PUFF.w, art.PUFF.h, (ctx) => art.drawPuff(ctx, false));
      crisp('pr-puff-spiky', art.PUFF.w, art.PUFF.h, (ctx) => art.drawPuff(ctx, true));
      for (const f of art.FACES)
        crisp(`pr-face-${f}`, art.FACE.w, art.FACE.h, (ctx) => art.drawFace(ctx, f));
      crisp('pr-pupil', 12, 12, (ctx) => art.drawPupil(ctx, 12));
      crisp('pr-drop', 16, 16, (ctx) => art.drawDrop(ctx, 16));
      crisp('pr-dot', 14, 14, (ctx) => art.drawDot(ctx, 14));
      crisp('pr-speck', 18, 18, (ctx) => art.drawSpeck(ctx, 18));
      crisp('pr-sil', art.SIL.w, art.SIL.h, (ctx) => art.drawSilhouette(ctx, art.SIL.w, art.SIL.h));
      crisp('pr-pip-on', 18, 18, (ctx) => art.drawPip(ctx, 18, art.ACCENT));
      crisp('pr-pip-warn', 18, 18, (ctx) => art.drawPip(ctx, 18, colors.orange));
      crisp('pr-pip-off', 18, 18, (ctx) => art.drawPip(ctx, 18, null));
      crisp('pr-sink', 22, 22, (ctx) => art.drawSink(ctx, 22));
      crisp('pr-danger', FIELD_R - FIELD_L, 6, (ctx) => art.drawDanger(ctx, FIELD_R - FIELD_L, 6));
      crisp('pr-pause', PAUSE.w, PILL.h, (ctx) => art.drawPauseButton(ctx, PAUSE.w, PILL.h));
      crisp('pr-pill-stars', STAR_PILL.w, PILL.h, (ctx) => art.drawPill(ctx, STAR_PILL.w, PILL.h));
      crisp('pr-pill-goal', GOAL_PILL.w, PILL.h, (ctx) => art.drawPill(ctx, GOAL_PILL.w, PILL.h));
      for (const on of [true, false]) {
        crisp(`pr-star-${on}`, 34, 34, (ctx) => art.drawStar(ctx, 34, on));
        crisp(`pr-bigstar-${on}`, 96, 96, (ctx) => art.drawStar(ctx, 96, on));
      }
      crisp('pr-card', art.CARD.w, art.CARD.h, (ctx) => art.drawCard(ctx, art.CARD.w, art.CARD.h));
      crisp('pr-btn-next', art.BUTTON.w, art.BUTTON.h, (ctx) =>
        art.drawButton(ctx, art.BUTTON.w, art.BUTTON.h, colors.gold),
      );
      crisp('pr-btn-replay', art.BUTTON.w, art.BUTTON.h, (ctx) =>
        art.drawButton(ctx, art.BUTTON.w, art.BUTTON.h, '#8E86C8'),
      );
      crisp('pr-leaf', art.LEAF.w, art.LEAF.h, (ctx) => art.drawLeaf(ctx, art.LEAF.w, art.LEAF.h));
      crisp('pr-wall', FIELD_L, art.H + by * 2, (ctx) => art.drawWall(ctx, FIELD_L, art.H + by * 2));
      crisp('pr-lip', art.W + bx * 2, 22, (ctx) => art.drawLip(ctx, art.W + bx * 2, 22));
      canvasTexture(this, 'pr-ray', art.RAY.w, art.RAY.h, (ctx, w, h) => art.drawRay(ctx, w, h), {
        scale: 1,
      });
    }

    /** Everything around the board. It is built once and re-tinted by setZone(); only the backdrop is redrawn. */
    private buildReef(): void {
      const { x: bx, y: by } = this.tk.layout.bleed;
      const fullW = art.W + bx * 2;
      for (const [x, a, phase] of RAYS)
        this.rays.push({
          img: this.add
            .image(x, -by, 'pr-ray')
            .setOrigin(0)
            .setBlendMode('ADD')
            .setDisplaySize(art.RAY.w * 1.3, art.H + by)
            .setDepth(-900),
          a,
          phase,
        });
      for (let i = 0; i < SHOAL; i++) {
        const dir = i % 2 ? 1 : -1;
        const img = canvasImage(this, 0, 0, 'pr-sil')
          .setDepth(-880)
          .setFlipX(dir < 0)
          .setAlpha(0.55);
        img.setScale(img.scaleX * (0.55 + (i % 3) * 0.2));
        this.shoal.push({
          img,
          x: -bx + this.rnd() * fullW,
          y: 180 + this.rnd() * 480,
          v: dir * (14 + this.rnd() * 22),
          phase: this.rnd() * 6.28,
        });
      }
      for (let i = 0; i < SPECKS; i++) {
        const img = canvasImage(this, 0, 0, 'pr-speck').setDepth(-850);
        img.setScale(img.scaleX * (0.5 + (i % 4) * 0.17));
        this.specks.push({
          img,
          x: -bx + this.rnd() * fullW,
          y: -by + this.rnd() * (art.H + by * 2),
          v: 10 + this.rnd() * 20,
          phase: this.rnd() * 6.28,
        });
      }
      // seaweed by the walls and right across the side scenery
      const stalks = [44, 96, 628, 680];
      for (let x = -bx + 36; x < art.W + bx; x += 112) if (x < -20 || x > 740) stalks.push(x);
      for (const x of stalks)
        this.weeds.push({
          x,
          phase: this.rnd() * 6.28,
          leaves: Array.from({ length: 5 + Math.floor(this.rnd() * 4) }, (_, i) =>
            canvasImage(this, x, 0, 'pr-leaf')
              .setOrigin(0.55, 1)
              .setFlipX(i % 2 === 1)
              .setDepth(-800 + i),
          ),
        });
      this.field = this.add
        .rectangle(FIELD_L, -by, FIELD_R - FIELD_L, art.H + by * 2, 0, 0.34)
        .setOrigin(0)
        .setDepth(-600);
      this.walls = [
        canvasImage(this, 0, -by, 'pr-wall').setOrigin(0).setDepth(40),
        canvasImage(this, art.W, -by, 'pr-wall').setOrigin(1, 0).setFlipX(true).setDepth(40),
      ];
      this.danger = canvasImage(this, FIELD_L, DANGER_Y, 'pr-danger')
        .setOrigin(0, 0.5)
        .setDepth(50);
      // the ceiling sits above the bubbles, so new rows slide in from under it
      this.band = this.add
        .rectangle(-bx, -by, fullW, by + art.HUD_H - 15, 0)
        .setOrigin(0)
        .setDepth(400);
      this.lip = canvasImage(this, -bx, art.HUD_H - 16, 'pr-lip').setOrigin(0).setDepth(400);
    }

    /** Switches the scenery to a zone: a new backdrop (the old one is freed) and new tints. */
    private setZone(zone: number): void {
      if (zone === this.zone) return;
      const { x: bx, y: by } = this.tk.layout.bleed;
      const z = art.ZONE_ART[zone]!;
      this.bg?.destroy();
      if (this.zone >= 0) this.textures.remove(`pr-zone${this.zone}`);
      this.zone = zone;
      this.bg = backdrop(this, `pr-zone${zone}`, art.W, art.H, {
        stops: z.stops,
        glows: [
          [360, -by, 700, z.glow, 0.25],
          [360, 900, 380, art.ACCENT, 0.08],
        ],
        draw: (ctx, w, h) => art.drawZone(ctx, w, h, zone, bx, by),
      });
      const rock = colorNum(z.rock);
      this.band.setFillStyle(rock);
      this.lip.setTint(rock);
      for (const w of this.walls) w.setTint(colorNum(shade(z.rock, 0.12)));
      this.field.setFillStyle(colorNum(z.field), 0.34);
      for (const r of this.rays) r.img.setTint(colorNum(z.glow)).setVisible(z.rays > 0);
      for (const f of this.shoal) f.img.setTint(colorNum(z.life));
      for (const s of this.specks) s.img.setTint(colorNum(z.glow));
      this.weeds.forEach((w, n) =>
        w.leaves.forEach((leaf, i) =>
          leaf.setTint(colorNum(shade(z.weed[n % 2]!, -0.25 - i * 0.03))),
        ),
      );
    }

    private buildBoard(): void {
      this.layer = this.add.container(0, 0).setDepth(100);
      for (let i = 0; i < CELL_COUNT; i++) {
        const img = canvasImage(this, 0, 0, tex(0)).setVisible(false);
        this.cells.push(img);
        this.layer.add(img);
      }
      this.bubbleScale = this.cells[0]!.scaleX;
      this.shot = canvasImage(this, 0, 0, tex(0)).setDepth(140).setVisible(false);
    }

    private buildLauncher(): void {
      this.guideTints = Array.from({ length: RAINBOW + 1 }, (_, k) =>
        k < COLOURS ? colorNum(shade(art.kindColor(k), 0.3)) : 0xffffff,
      );
      for (let i = 0; i < GUIDE_DOTS; i++)
        this.guide.push(canvasImage(this, 0, 0, 'pr-dot').setDepth(60).setVisible(false));
      this.ghost = canvasImage(this, 0, 0, 'pr-ghost').setDepth(61).setVisible(false);
      this.body = canvasImage(this, art.PUFF.x, art.PUFF.y, 'pr-puff')
        .setOrigin(art.PUFF.cx / art.PUFF.w, art.PUFF.cy / art.PUFF.h)
        .setDepth(200);
      this.face = canvasImage(this, 0, 0, 'pr-face-idle')
        .setOrigin(art.FACE.ox / art.FACE.w, art.FACE.oy / art.FACE.h)
        .setDepth(201);
      this.faceKey = 'pr-face-idle';
      this.pupils = art.EYES.map(() => canvasImage(this, 0, 0, 'pr-pupil').setDepth(202));
      this.cur = canvasImage(this, SHOOT_X, SHOOT_Y, tex(0)).setDepth(210);
      this.nxt = canvasImage(this, art.NEXT.x, art.NEXT.y, tex(0)).setDepth(210);
      for (let i = 0; i < MAX_PIPS; i++)
        this.pips.push(
          canvasImage(this, art.PIPS.x + 30 + i * art.PIPS.gap, art.PIPS.y, 'pr-pip-on').setDepth(
            210,
          ),
        );
      this.sink = canvasImage(this, art.PIPS.x, art.PIPS.y, 'pr-sink').setDepth(210).setAlpha(0.85);
    }

    private buildFx(): void {
      const make = (key: string, n: number, depth: number) =>
        Array.from({ length: n }, (): Fx => {
          const img = canvasImage(this, 0, 0, key).setDepth(depth).setVisible(false);
          return {
            img,
            on: false,
            mode: 'pop',
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            t0: 0,
            life: 0,
            base: img.scaleX,
            note: -1,
          };
        });
      this.fxBubbles = make(tex(0), FX_BUBBLES, 120);
      this.fxRings = make('pr-ring', FX_RINGS, 125);
      this.fxDrops = make('pr-drop', FX_DROPS, 130);
      this.fxFish = make('pr-fish', FX_FISH, 135);
      this.blast = canvasImage(this, 0, 0, 'pr-blast').setDepth(126).setVisible(false);
      this.blastScale = this.blast.scaleX;
    }

    private buildHud(): void {
      const ink = colors.ink;
      const midY = PILL.y + PILL.h / 2;
      const level = hudPill(this, LEVEL_PILL.x, PILL.y, {
        icon: 'flag',
        accent: art.ACCENT,
        label: strings.level,
        value: '1',
        width: LEVEL_PILL.w,
        height: PILL.h,
      });
      const score = hudPill(this, SCORE_PILL.x, PILL.y, {
        icon: 'trophy',
        accent: colors.orange,
        label: strings.score,
        value: '0',
        width: SCORE_PILL.w,
        height: PILL.h,
      });
      const starBg = canvasImage(this, STAR_PILL.x, PILL.y, 'pr-pill-stars').setOrigin(0);
      const stars = [0, 1, 2].map((i) =>
        canvasImage(this, STAR_PILL.x + 30 + i * 36, midY, 'pr-star-true'),
      );
      const starShots = kit
        .text(this, STAR_PILL.x + 144, midY, '', { px: 28 })
        .setOrigin(0.5);
      const goalBg = canvasImage(this, GOAL_PILL.x, PILL.y, 'pr-pill-goal').setOrigin(0);
      const goalIcon = canvasImage(this, GOAL_PILL.x + 32, midY, tex(0));
      goalIcon.setScale(goalIcon.scaleX * 0.56);
      const goal = kit.text(this, GOAL_PILL.x + 82, midY, '', { px: 28 }).setOrigin(0.5);
      const pause = canvasImage(this, PAUSE.x, PILL.y, 'pr-pause').setOrigin(0);
      this.hudLayer = this.add
        .container(0, 0, [
          level.container,
          score.container,
          starBg,
          ...stars,
          starShots,
          goalBg,
          goalIcon,
          goal,
          pause,
        ])
        .setDepth(500);
      const banner = (y: number, px: number, color: string) =>
        kit
          .text(this, 360, y, '', { px, color, stroke: ink, strokePx: Math.round(px * 0.22) })
          .setOrigin(0.5)
          .setAlign('center')
          .setDepth(600)
          .setVisible(false);
      this.hud = {
        level,
        score,
        stars,
        starShots,
        goalIcon,
        goal,
        pause,
        next: kit
          .text(this, art.NEXT.x, art.NEXT.y - 46, strings.next, {
            px: 18,
            color: 'textMuted',
            stroke: ink,
            strokePx: 4,
          })
          .setOrigin(0.5)
          .setDepth(210),
        title: banner(628, 58, colors.text),
        zone: banner(678, 26, art.ACCENT),
        goalLine: banner(722, 24, colors.gold),
        hint: banner(762, 24, colors.text),
      };
    }

    private buildCard(): void {
      const { x: bx, y: by } = this.tk.layout.bleed;
      const ink = colors.ink;
      const dim = this.add
        .rectangle(-bx, -by, art.W + bx * 2, art.H + by * 2, colorNum(ink), 0.6)
        .setOrigin(0);
      const panel = canvasImage(this, 360, CARD_Y, 'pr-card');
      const title = kit.text(this, 360, CARD_Y - 158, '', { px: 44 }).setOrigin(0.5);
      const sockets = [-1, 0, 1].map((i) =>
        canvasImage(this, 360 + i * 112, CARD_Y - 62 - (i ? 0 : 14), 'pr-bigstar-false'),
      );
      const stars = sockets.map((s) => canvasImage(this, s.x, s.y, 'pr-bigstar-true'));
      const score = kit.text(this, 360, CARD_Y + 22, '', { px: 40, color: colors.gold });
      const bonus = kit.text(this, 360, CARD_Y + 64, '', { px: 22, color: 'textMuted' });
      const label = (x: number, text: string) =>
        kit.text(this, x, BTN_Y - 4, text, { px: 28, color: ink }).setOrigin(0.5);
      const keys = kit
        .text(this, 360, CARD_Y + 190, strings.cardKeys, { px: 18, color: 'textMuted' })
        .setOrigin(0.5);
      const root = this.add
        .container(0, 0, [
          dim,
          panel,
          title,
          ...sockets,
          ...stars,
          score.setOrigin(0.5),
          bonus.setOrigin(0.5),
          canvasImage(this, BTN_REPLAY_X, BTN_Y, 'pr-btn-replay'),
          canvasImage(this, BTN_NEXT_X, BTN_Y, 'pr-btn-next'),
          label(BTN_REPLAY_X, strings.replay),
          label(BTN_NEXT_X, strings.nextLevel),
          keys,
        ])
        .setDepth(800)
        .setVisible(false);
      this.card = { root, title, stars, score, bonus, keys };
    }

    /** The HUD rides the top of the view: on a tall phone that is above the design area. */
    private place(): void {
      this.hudLayer.setY(Math.min(0, this.tk.layout.view.y));
    }

    private get hudBottom(): number {
      return this.hudLayer.y + PILL.y + PILL.h + 4;
    }

    // ─── level flow ───
    /** Starts level `n`; `fresh` also starts a new run (the score counts up from zero again). */
    private startLevel(n: number, fresh: boolean): void {
      const tk = this.tk;
      if (fresh) this.runBase = 0;
      this.level = buildLevel(n);
      const seed = `pop-reef:run:${tk.rng.main.nextUint32().toString(16)}`;
      this.sim = createRun(tk.rng.create(seed), this.level);
      tk.attract?.setView(this.sim);
      this.setZone(this.level.zone);
      this.endAt = -1;
      this.wonAt = -1;
      this.ending = false;
      this.cardAt = -1;
      this.card.root.setVisible(false);
      this.holdUntil = this.clock + LEVEL_HOLD_MS;
      this.acc = 0;
      this.lastStep = tk.attract?.step ?? 0;
      this.drag = false;
      this.faceUntil = 0;
      this.puffUntil = 0;
      this.loadAt = -Infinity;
      this.blastAt = -Infinity;
      this.shown.fill(-2);
      this.shownVersion = -1;
      this.shownMisses = -1;
      this.shownStars = -1;
      this.guideVersion = -1;
      for (const f of [...this.fxBubbles, ...this.fxDrops, ...this.fxRings, ...this.fxFish])
        this.free(f);
      const h = this.hud;
      h.pause.setVisible(!tk.attract);
      h.level.set(String(this.level.n));
      const rescue = this.level.goal === 'rescue';
      h.goalIcon.setTexture(rescue ? 'pr-fish' : tex(this.sim.current)).setScale(1);
      h.goalIcon.setScale((rescue ? 0.8 : 0.56) / kit.renderScale);
      this.pips.forEach((p, i) => p.setVisible(i < this.sim.pushEvery));
      this.showIntro();
      this.showStats();
      this.slideBoard(-(lowestRow(this.sim.cells) + 2) * ROW_H, 600, 'Back.easeOut');
      this.draw(0);
    }

    private showIntro(): void {
      const h = this.hud;
      const on = !this.tk.attract;
      this.introAt = on ? this.clock : -Infinity;
      for (const t of [h.title, h.zone, h.goalLine]) t.setVisible(on).setAlpha(1);
      if (on) {
        const s = this.sim;
        // just under the board, so the title never covers the bubbles
        const top = Math.min(620, cellY(lowestRow(s.cells) * COLS) + R + 70);
        h.title.setY(top);
        h.zone.setY(top + 50);
        h.goalLine.setY(top + 92);
        h.hint.setY(top + 146);
        h.title.setText(strings.t('levelN', { n: this.level.n }));
        h.zone.setText(strings[ZONE_NAMES[this.level.zone]!]);
        h.goalLine.setText(
          `${s.goal === 'rescue' ? strings.t('goalRescue', { n: s.fishLeft }) : strings.goalClear} · ${strings.t('parLine', { n: s.par })}`,
        );
      }
      this.showHint();
    }

    /** Under the level title until the first shot: what this level teaches, or else how to shoot. */
    private showHint(): void {
      const h = this.hud.hint;
      const on = !!this.sim && this.sim.shots === 0 && !this.tk.attract && !this.cardOpen;
      h.setVisible(on);
      if (!on) return;
      const p = this.tk.env.input.primary;
      const tip = this.level.tip;
      const text =
        tip && tip !== 'match'
          ? strings[TIPS[tip]]
          : this.level.n > 1
            ? ''
            : `${p === 'touch' ? strings.readyTouch : p === 'pointer' ? strings.readyPointer : strings.readyKeyboard}\n${strings.tipMatch}`;
      if (h.text !== text) h.setText(text);
    }

    private fmt(v: number): string {
      return formatScore(v, 'integer', this.tk.env.locale);
    }

    private showStats(): void {
      const s = this.sim;
      const h = this.hud;
      h.score.set(this.fmt(this.runBase + s.score));
      h.goal.setText(String(s.goal === 'rescue' ? s.fishLeft : s.coloursLeft));
      // the star count only moves once a shot has settled, so the bubble in flight still counts for the old one
      if (s.phase === 'flying') return;
      const stars = s.stars;
      if (stars !== this.shownStars) {
        const lost = this.shownStars > stars && s.phase === 'aim';
        this.shownStars = stars;
        h.stars.forEach((img, i) => img.setTexture(`pr-star-${i < stars}`));
        if (lost) {
          this.tk.sfx.play('click', { detuneCents: -700 });
          bump(this, h.stars[stars]!, 1.3, 320);
          popText(this, STAR_PILL.x + 90, this.hudBottom + 22, strings.starLost, {
            color: colors.orange,
            px: 22,
            rise: -14,
          });
        }
      }
      const left = s.phase === 'aim' ? s.starShots : 0;
      h.starShots.setText(left > 0 ? String(left) : '').setColor(left <= 2 ? colors.orange : colors.text);
    }

    private get cardOpen(): boolean {
      return this.cardAt >= 0;
    }

    private showCard(): void {
      const s = this.sim;
      const c = this.card;
      this.cardAt = this.clock;
      this.cardStars = s.stars;
      this.cardShown = 0;
      c.title.setText(strings.t('cleared', { n: this.level.n }));
      c.score.setText(strings.t('cardScore', { n: this.fmt(s.score) }));
      c.bonus.setText(strings.t('bonus', { n: this.fmt(s.stars * STAR_BONUS) }));
      c.keys.setVisible(this.tk.env.input.primary === 'keyboard');
      for (const img of c.stars) img.setVisible(false);
      c.root.setVisible(true).setAlpha(1);
      this.hud.hint.setVisible(false);
      if (!this.tk.motion.reduced) {
        c.root.setAlpha(0);
        this.tweens.add({ targets: c.root, alpha: 1, duration: 180 });
      }
    }

    /** The card's stars pop in one after another. */
    private drawCard(): void {
      if (!this.cardOpen) return;
      const due = Math.min(
        this.cardStars,
        Math.floor((this.clock - this.cardAt - 200) / STAR_GAP_MS) + 1,
      );
      while (this.cardShown < due) {
        const img = this.card.stars[this.cardShown]!.setVisible(true);
        bump(this, img, 1.25, 300);
        this.tk.sfx.play('coin', { volume: 0.7, detuneCents: this.cardShown * 300 });
        burst(this, img.x, img.y, { shape: 'star', count: 8, distance: 80, depth: 900 });
        this.cardShown++;
      }
    }

    private cardReady(): boolean {
      return this.cardOpen && this.clock >= this.cardAt + CARD_GUARD_MS;
    }

    private next(): void {
      if (!this.cardReady()) return;
      this.tk.sfx.play('click');
      this.runBase += this.sim.score;
      this.startLevel(Math.min(MAX_LEVEL, this.level.n + 1), false);
    }

    private replay(): void {
      if (!this.cardReady()) return;
      this.tk.sfx.play('click');
      this.startLevel(this.level.n, false);
    }

    // ─── input ───
    private live(): boolean {
      return !!this.sim && (this.sim.phase === 'aim' || this.sim.phase === 'flying');
    }

    /** Aim toward a point; points level with or below the launcher (Puff, Next) leave the aim alone. */
    private aimAt(x: number, y: number): void {
      if (this.live() && y < SHOOT_Y) this.sim.setAim(aimToward(x - SHOOT_X, y - SHOOT_Y));
    }

    private fire(): void {
      if (this.live() && this.clock >= this.holdUntil) this.handle(this.sim.fire());
    }

    private swap(): void {
      if (!this.live() || !this.sim.swap().length) return;
      this.tk.sfx.play('click', { volume: 0.6 });
      this.loadAt = this.clock;
    }

    private onTap(x: number, y: number): void {
      if (this.cardOpen) {
        if (Math.abs(y - BTN_Y) > art.BUTTON.h / 2 + 8) return;
        if (Math.abs(x - BTN_NEXT_X) < art.BUTTON.w / 2) this.next();
        else if (Math.abs(x - BTN_REPLAY_X) < art.BUTTON.w / 2) this.replay();
        return;
      }
      if (y < this.hudBottom) return this.hudTap(x);
      if (Math.hypot(x - art.NEXT.x, y - art.NEXT.y) < NEXT_HIT) return this.swap();
      if (y >= SHOOT_Y) return; // a tap on Puff's patch at the bottom does nothing
      this.aimAt(x, y);
      this.fire();
    }

    private hudTap(x: number): void {
      if (x < PAUSE.x - 6 || x > art.W || this.tk.attract) return;
      this.tk.sfx.play('click');
      void this.tk.ui.pauseMenu();
    }

    // ─── frame ───
    override update(_time: number, delta: number): void {
      if (!this.sim) return;
      const a = this.tk.attract;
      let steps: number;
      let dt: number;
      if (a) {
        steps = a.step - this.lastStep;
        this.lastStep = a.step;
        dt = steps * STEP_MS;
      } else {
        dt = Math.min(delta, 100);
        this.acc += dt;
        steps = Math.floor(this.acc / STEP_MS);
        this.acc -= steps * STEP_MS;
      }
      this.clock += dt;
      const input = this.tk.input;
      const turn = (input.isDown('left') ? 1 : 0) - (input.isDown('right') ? 1 : 0);
      for (let i = 0; i < Math.min(steps, MAX_STEPS); i++) this.handle(this.sim.step(turn));
      const calm = this.tk.motion.reduced;
      if (this.endAt >= 0 && !this.ending && this.clock >= this.endAt + (calm ? OVER_MS_CALM : OVER_MS))
        void this.gameOver();
      if (this.wonAt >= 0 && this.clock >= this.wonAt + (calm ? WIN_MS_CALM : WIN_MS)) {
        this.wonAt = -1;
        if (a && a.step < 0) {
          this.runBase += this.sim.score;
          this.startLevel(this.level.n + 1, false);
        } else this.showCard();
      }
      this.draw(dt);
    }

    private handle(events: SimEvent[]): void {
      for (const e of events) {
        switch (e.type) {
          case 'fire':
            this.tk.run.begin();
            this.tk.sfx.play('puff');
            this.showHint();
            this.introAt = Math.min(this.introAt, this.clock - INTRO_MS + 300);
            this.puffUntil = this.clock + PUFF_MS;
            this.setFace('blow', PUFF_MS + 60);
            break;
          case 'bounce':
            this.splash(e.x + (e.x < 360 ? -R : R) * 0.6, e.y, art.ACCENT, 3);
            break;
          case 'stick':
            // the toolkit drops a repeat of a sound within 30 ms, so a push's louder thud takes the hit's place
            if (!events.some((x) => x.type === 'push')) this.tk.sfx.play('hit', { volume: 0.4 });
            this.loadAt = this.clock;
            break;
          case 'pop':
            this.onPop(e);
            break;
          case 'push':
            this.onPush();
            break;
          case 'rainbow':
            this.onRainbow();
            break;
          case 'win':
            this.onWin(e.left);
            break;
          case 'over':
            this.onOver();
            break;
          case 'swap':
            break;
        }
      }
      if (events.length) this.showStats();
    }

    private onPop(e: Extract<SimEvent, { type: 'pop' }>): void {
      const tk = this.tk;
      const calm = tk.motion.reduced;
      const n = e.popped.length + e.dropped.length;
      e.popped.forEach((b, i) => this.spawnPop(b, calm ? 0 : Math.min(i, 24) * CHAIN_MS, i));
      const after = calm ? 0 : Math.min(e.popped.length, 6) * CHAIN_MS + 60;
      e.dropped.forEach((b, i) => this.spawnFall(b, after + (calm ? 0 : (i % 6) * 15)));
      if (e.blasts.length) {
        const c = e.blasts[0]!;
        tk.sfx.play('explode', { volume: 0.8 });
        shake(this, 260, 0.008);
        this.blastAt = this.clock;
        this.blast.setPosition(c.x, c.y);
        for (const u of e.blasts)
          burst(this, u.x, u.y, {
            shape: 'spark',
            colors: ['#FF4FA3', '#FFFFFF', colors.gold],
            count: 12,
            distance: 150,
            size: 16,
            depth: 700,
          });
        popText(this, c.x, c.y - 30, strings.boom, { color: colors.pink, px: 44, rise: 50, ms: 900 });
      }
      if (e.fish) {
        tk.sfx.play('coin', { volume: 0.8, detuneCents: 500 });
        const b = [...e.popped, ...e.dropped].find((x) => x.fish)!;
        popText(this, b.x, b.y + 30, strings.freed, { color: '#FFF3D6', px: 26, ms: 900 });
        bump(this, this.hud.goal, 1.3);
      }
      const o = e.popped[0]!;
      popText(this, o.x, o.y - 26, strings.t('points', { n: e.points }), {
        color: colors.gold,
        px: n >= BIG_COMBO ? 36 : 28,
      });
      if (e.streak >= 2)
        popText(this, 360, 730, strings.t('streak', { n: e.streak, m: Math.min(5, e.streak) }), {
          color: e.streak >= 4 ? colors.pink : art.ACCENT,
          px: 26 + Math.min(4, e.streak) * 3,
          rise: 30,
          ms: 900,
        });
      if (n >= BIG_COMBO) {
        const huge = n >= HUGE_COMBO;
        const y = Math.min(DANGER_Y - 140, Math.max(220, o.y + 80));
        popText(this, 360, y, huge ? strings.bigSplash : strings.splash, {
          color: huge ? colors.yellow : art.ACCENT,
          px: huge ? 56 : 46,
          rise: 50,
          ms: 1100,
        });
        if (huge) shake(this, 200, 0.006);
      }
      if (n >= BIG_COMBO || e.streak >= 2 || e.fish) this.setFace('happy', 900);
      this.hud.score.bump();
    }

    private onPush(): void {
      this.tk.sfx.play('hit', { volume: 0.8, detuneCents: -900 });
      shake(this, 220, 0.005);
      popText(this, 360, 300, strings.sinking, { color: colors.orange, px: 32, ms: 900 });
      this.slideBoard(-ROW_H, 320, 'Cubic.easeOut');
    }

    private onRainbow(): void {
      this.tk.sfx.play('coin', { volume: 0.7, detuneCents: 900 });
      popText(this, art.NEXT.x + 40, art.NEXT.y - 84, strings.rainbow, {
        color: colors.yellow,
        px: 28,
        ms: 1200,
      });
      burst(this, art.NEXT.x, art.NEXT.y, { shape: 'star', count: 10, distance: 80, depth: 700 });
    }

    private onWin(left: Bubble[]): void {
      const tk = this.tk;
      const s = this.sim;
      const calm = tk.motion.reduced;
      this.wonAt = this.clock;
      tk.sfx.play('win');
      flash(this, colors.gold, 300, 0.2);
      left.forEach((b, i) => this.spawnFall(b, calm ? 0 : 200 + (i % 10) * 30));
      for (const x of [180, 360, 540])
        burst(this, x, 380, { shape: 'star', count: 10, distance: 150, depth: 700 });
      this.setFace('happy', 4000);
      // saved now, not when the card opens: a Restart from the pause menu in between would lose the level
      if (!tk.attract) {
        this.progress = withRun(
          withLevel(this.progress, this.level.n, { stars: s.stars, score: s.score }),
          this.runBase + s.score,
        );
        this.progressSave.set(this.progress);
        tk.run.end('level_end');
      }
    }

    private onOver(): void {
      const tk = this.tk;
      tk.sfx.play('lose');
      shake(this, 260, 0.01);
      flash(this, colors.vermillion, 220, 0.2);
      this.endAt = this.clock;
      this.syncBoard();
      for (const img of this.cells) if (img.visible) img.setTint(0x8a90b8);
      if (!tk.attract) {
        this.progress = withRun(this.progress, this.runBase + this.sim.score);
        this.progressSave.set(this.progress);
      }
    }

    /** New board positions are already set; draw them from `dy` above and slide into place. */
    private slideBoard(dy: number, ms: number, ease: string): void {
      this.syncBoard();
      this.tweens.killTweensOf(this.layer);
      if (this.tk.motion.reduced) return void this.layer.setY(0);
      this.layer.setY(dy);
      this.tweens.add({ targets: this.layer, y: 0, duration: ms, ease });
    }

    private setFace(face: art.Face, ms: number): void {
      this.faceNow = face;
      this.faceUntil = this.clock + ms;
    }

    private async gameOver(): Promise<void> {
      this.ending = true;
      const tk = this.tk;
      const s = this.sim;
      const score = this.runBase + s.score;
      await tk.ui.gameOver({
        title: strings.over,
        scores: score >= 1 ? [{ board: 'score', value: score }] : [],
        meta: { v: 1, level: this.level.n, shots: s.shots },
      });
      if (!tk.signal.aborted) this.startLevel(this.level.n, true);
    }

    // ─── effects (pooled) ───
    private take(pool: Fx[]): Fx | null {
      for (const f of pool) if (!f.on) return f;
      return null;
    }

    private free(f: Fx): void {
      f.on = false;
      f.img.setVisible(false);
    }

    /** A popped bubble: shown still until its turn in the chain, then it bursts into a ring and droplets. */
    private spawnPop(b: Bubble, delay: number, order: number): void {
      const color = art.kindColor(b.kind);
      const f = this.take(this.fxBubbles);
      if (f) {
        Object.assign(f, {
          on: true,
          mode: 'pop',
          x: b.x,
          y: b.y,
          t0: this.clock + delay,
          life: POP_MS,
          note: order < 14 ? order : -1,
        });
        f.img
          .setTexture(tex(b.kind, b.fish))
          .setPosition(b.x, b.y)
          .setScale(f.base)
          .setAlpha(1)
          .setVisible(true);
      }
      const ring = this.take(this.fxRings);
      if (ring) {
        Object.assign(ring, { on: true, mode: 'ring', t0: this.clock + delay, life: RING_MS });
        ring.img.setPosition(b.x, b.y).setTint(colorNum(shade(color, 0.3))).setVisible(false);
      }
      if (!this.tk.motion.reduced) this.splash(b.x, b.y, color, DROPS_PER_POP, delay);
      if (b.fish) this.spawnFish(b, delay);
    }

    /** A bubble cut loose: a little hop, then it falls off the screen. */
    private spawnFall(b: Bubble, delay: number): void {
      const f = this.take(this.fxBubbles);
      if (f) {
        Object.assign(f, {
          on: true,
          mode: 'fall',
          x: b.x,
          y: b.y,
          vx: (this.rnd() - 0.5) * 160,
          vy: -(80 + this.rnd() * 160),
          t0: this.clock + delay,
          life: 0,
          note: -1,
        });
        // the fish swims off, so the bubble falls empty
        f.img
          .setTexture(tex(b.kind))
          .setPosition(b.x, b.y)
          .setScale(f.base)
          .setAlpha(1)
          .setVisible(true);
      }
      if (b.fish) this.spawnFish(b, delay);
    }

    /** A freed fish darts away to the nearer side. */
    private spawnFish(b: Bubble, delay: number): void {
      const f = this.take(this.fxFish);
      if (!f) return;
      const dir = b.x < 360 ? -1 : 1;
      Object.assign(f, {
        on: true,
        mode: 'fish',
        x: b.x,
        y: b.y,
        vx: dir * (260 + this.rnd() * 120),
        vy: -(30 + this.rnd() * 60),
        t0: this.clock + delay,
        life: 1600,
      });
      f.img.setPosition(b.x, b.y).setFlipX(dir < 0).setAlpha(1).setVisible(false);
    }

    /** Droplets bursting out of (x, y). */
    private splash(x: number, y: number, color: string, n: number, delay = 0): void {
      const tints = [colorNum(shade(color, 0.35)), 0xffffff, colorNum(color)];
      for (let i = 0; i < n; i++) {
        const f = this.take(this.fxDrops);
        if (!f) return;
        const a = this.rnd() * Math.PI * 2;
        const v = 140 + this.rnd() * 220;
        Object.assign(f, {
          on: true,
          mode: 'drop',
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 60,
          t0: this.clock + delay,
          life: 340 + this.rnd() * 220,
        });
        f.img
          .setPosition(x, y)
          .setTint(tints[i % tints.length]!)
          .setScale(f.base * (0.6 + this.rnd() * 0.7))
          .setAlpha(1)
          .setVisible(false);
      }
    }

    private drawFx(dt: number): void {
      const s = dt / 1000;
      for (const f of this.fxBubbles) {
        if (!f.on) continue;
        const t = this.clock - f.t0;
        if (t < 0) continue;
        if (f.mode === 'pop') {
          if (f.note >= 0) {
            this.tk.sfx.play('pop', { volume: 0.55, detuneCents: f.note * 90 });
            f.note = -1;
          }
          const k = t / f.life;
          if (k >= 1) this.free(f);
          else f.img.setScale(f.base * (1 - 0.35 * k)).setAlpha(1 - k * k);
          continue;
        }
        f.vy += FALL_G * s;
        f.x = Math.min(FIELD_R - R, Math.max(FIELD_L + R, f.x + f.vx * s));
        f.y += f.vy * s;
        f.img.setPosition(f.x, f.y);
        if (f.y > art.H + this.tk.layout.bleed.y + R) this.free(f);
      }
      for (const f of this.fxRings) {
        if (!f.on) continue;
        const t = this.clock - f.t0;
        if (t < 0) continue;
        const k = t / f.life;
        if (k >= 1) this.free(f);
        else
          f.img
            .setVisible(true)
            .setScale(f.base * (0.45 + 0.55 * (1 - (1 - k) ** 2)))
            .setAlpha(1 - k);
      }
      for (const f of this.fxDrops) {
        if (!f.on) continue;
        const t = this.clock - f.t0;
        if (t < 0) continue;
        if (t >= f.life) {
          this.free(f);
          continue;
        }
        f.vx *= 0.96;
        f.vy = f.vy * 0.96 + DROP_G * s;
        f.x += f.vx * s;
        f.y += f.vy * s;
        f.img
          .setVisible(true)
          .setPosition(f.x, f.y)
          .setAlpha(1 - t / f.life);
      }
      for (const f of this.fxFish) {
        if (!f.on) continue;
        const t = this.clock - f.t0;
        if (t < 0) continue;
        if (t >= f.life) {
          this.free(f);
          continue;
        }
        f.x += f.vx * s;
        f.y += f.vy * s;
        f.img
          .setVisible(true)
          .setPosition(f.x, f.y + Math.sin(t / 70) * 5)
          .setAlpha(Math.min(1, (f.life - t) / 300));
      }
      const bk = (this.clock - this.blastAt) / BLAST_MS;
      this.blast.setVisible(bk >= 0 && bk < 1);
      if (bk >= 0 && bk < 1)
        this.blast.setScale(this.blastScale * (0.3 + 0.7 * (1 - (1 - bk) ** 2))).setAlpha(1 - bk);
    }

    // ─── drawing ───
    /** Board images follow the sim, re-textured only where a cell changed. */
    private syncBoard(): void {
      const s = this.sim;
      if (s.version === this.shownVersion && s.shift === this.shownShift) return;
      const moved = s.shift !== this.shownShift;
      for (let i = 0; i < CELL_COUNT; i++) {
        const k = s.cells[i]!;
        const key = k < 0 ? -1 : k + s.fish[i]! * 16;
        if (key === this.shown[i] && !moved) continue;
        this.shown[i] = key;
        const img = this.cells[i]!;
        if (k < 0) img.setVisible(false);
        else
          img
            .setTexture(tex(k, s.fish[i] === 1))
            .setPosition(cellX(i, s.shift), cellY(i))
            .clearTint()
            .setVisible(true);
      }
      this.shownVersion = s.version;
      this.shownShift = s.shift;
      this.low = lowestRow(s.cells);
    }

    private draw(dt: number): void {
      const s = this.sim;
      const t = this.clock;
      const calm = this.tk.motion.reduced;
      this.syncBoard();
      // the shot in flight
      this.shot.setVisible(!!s.shot);
      if (s.shot) {
        if (this.shot.texture.key !== tex(s.shot.kind)) this.shot.setTexture(tex(s.shot.kind));
        this.shot.setPosition(s.shot.x, s.shot.y);
      }
      const playing = s.phase === 'aim' || s.phase === 'flying';
      const worried = playing && this.low >= DANGER_ROW - WORRY_ROWS;
      this.danger
        .setTint(worried ? colorNum(colors.vermillion) : 0xffffff)
        .setAlpha(worried ? (calm ? 0.9 : 0.55 + 0.4 * Math.sin(t / 160) ** 2) : 0.35);
      this.drawPuff(s, t, calm, worried);
      this.drawLauncher(s, t, calm);
      this.drawGuide(s, t);
      this.drawFx(dt);
      this.drawDecor(t, dt, calm);
      this.drawIntro(t);
      this.drawCard();
    }

    /** The level title fades out after a moment (sooner once the first bubble is fired). */
    private drawIntro(t: number): void {
      const h = this.hud;
      if (!h.title.visible) return;
      const k = (t - this.introAt - INTRO_MS + 300) / 300;
      if (k >= 1 || this.cardOpen) for (const x of [h.title, h.zone, h.goalLine]) x.setVisible(false);
      else if (k > 0) for (const x of [h.title, h.zone, h.goalLine]) x.setAlpha(1 - k);
    }

    private drawPuff(s: Run, t: number, calm: boolean, worried: boolean): void {
      const bob = calm ? 0 : Math.sin(t / 520) * 3;
      const y = art.PUFF.y + bob;
      const puffed = t < this.puffUntil;
      const key = puffed ? 'pr-puff-spiky' : 'pr-puff';
      if (this.body.texture.key !== key) this.body.setTexture(key);
      this.body.setY(y);
      const face = this.faceFor(s, t, worried);
      const fk = `pr-face-${face}`;
      if (fk !== this.faceKey) {
        this.faceKey = fk;
        this.face.setTexture(fk);
      }
      this.face.setPosition(art.PUFF.x, y);
      const open = art.OPEN_EYES.has(face);
      const lx = Math.cos(s.aim) * 4;
      const ly = -Math.sin(s.aim) * 4.5;
      this.pupils.forEach((p, i) => {
        const [ex, ey] = art.EYES[i]!;
        p.setVisible(open).setPosition(art.PUFF.x + ex + lx, y + ey + ly);
      });
    }

    private faceFor(s: Run, t: number, worried: boolean): art.Face {
      if (s.phase === 'over') return 'sad';
      if (s.phase === 'won') return 'happy';
      if (t < this.faceUntil) return this.faceNow;
      if (t >= this.blinkAt + 130) this.blinkAt = t + 2000 + this.rnd() * 2600;
      if (t >= this.blinkAt) return 'blink';
      return worried ? 'worried' : 'idle';
    }

    /** The loaded bubble (sliding in from Next after each shot or swap), the next one and the shots-left pips. */
    private drawLauncher(s: Run, t: number, calm: boolean): void {
      if (s.current !== this.shownCur) {
        this.shownCur = s.current;
        this.cur.setTexture(tex(s.current));
      }
      if (s.next !== this.shownNext) {
        this.shownNext = s.next;
        this.nxt.setTexture(tex(s.next));
      }
      const k = calm ? 1 : Math.min(1, (t - this.loadAt) / LOAD_MS);
      const e = 1 - (1 - k) ** 3;
      const playing = s.phase === 'aim' || s.phase === 'flying';
      const bob = calm ? 0 : Math.sin(t / 520) * 1.5;
      this.cur
        .setVisible(s.phase === 'aim')
        .setPosition(
          art.NEXT.x + (SHOOT_X - art.NEXT.x) * e,
          art.NEXT.y + (SHOOT_Y + bob - art.NEXT.y) * e,
        )
        .setScale(this.bubbleScale * (0.78 + 0.22 * e));
      this.nxt.setVisible(playing).setScale(this.bubbleScale * 0.78 * e);
      this.hud.next.setVisible(playing);
      // the last two shots before the ceiling sinks turn orange and pulse
      const left = s.pushEvery - s.misses;
      const urgent = left <= 2 && playing;
      if (s.misses !== this.shownMisses) {
        this.shownMisses = s.misses;
        const on = urgent ? 'pr-pip-warn' : 'pr-pip-on';
        this.pips.forEach((p, i) => p.setTexture(i < left ? on : 'pr-pip-off').setAlpha(1));
      }
      const pulse = urgent && !calm ? 0.6 + 0.4 * Math.sin(t / 140) ** 2 : 1;
      for (let i = 0; i < left; i++) this.pips[i]!.setAlpha(pulse);
    }

    /** Dots along the aim through up to two wall bounces, and a ring where the bubble will settle. */
    private drawGuide(s: Run, t: number): void {
      const show = s.phase === 'aim' && t >= this.holdUntil && !this.cardOpen;
      if (show && (s.aim !== this.guideAim || s.version !== this.guideVersion)) {
        this.guideAim = s.aim;
        this.guideVersion = s.version;
        const tr = trace(s.cells, s.shift, s.aim);
        // the launcher, two bounces and the next point; the landing ring only shows if the path gets there
        this.guidePath = tr.path.slice(0, 8);
        this.guideCell = tr.path.length <= 8 ? tr.cell : -1;
        if (this.guideCell >= 0)
          this.ghost.setPosition(cellX(this.guideCell, s.shift), cellY(this.guideCell));
      }
      const path = this.guidePath;
      const tint = this.guideTints[s.current]!;
      this.ghost
        .setVisible(show && this.guideCell >= 0)
        .setTint(tint)
        .setAlpha(0.85);
      let total = 0;
      for (let i = 2; i < path.length; i += 2)
        total += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
      let d = GUIDE_SKIP + (this.tk.motion.reduced ? 0 : (t * 0.05) % GUIDE_GAP);
      let seg = 2;
      let segStart = 0;
      for (const dot of this.guide) {
        if (!show || d > total - R * 0.5) {
          dot.setVisible(false);
          continue;
        }
        // find the segment holding distance d
        let len = Math.hypot(path[seg]! - path[seg - 2]!, path[seg + 1]! - path[seg - 1]!);
        while (d > segStart + len && seg + 2 < path.length) {
          segStart += len;
          seg += 2;
          len = Math.hypot(path[seg]! - path[seg - 2]!, path[seg + 1]! - path[seg - 1]!);
        }
        const f = len > 0 ? (d - segStart) / len : 0;
        dot
          .setVisible(true)
          .setTint(tint)
          .setPosition(
            path[seg - 2]! + (path[seg]! - path[seg - 2]!) * f,
            path[seg - 1]! + (path[seg + 1]! - path[seg - 1]!) * f,
          )
          .setAlpha(1 - 0.5 * (d / total));
        d += GUIDE_GAP;
      }
    }

    private drawDecor(t: number, dt: number, calm: boolean): void {
      const z = art.ZONE_ART[this.zone]!;
      const { x: bx, y: by } = this.tk.layout.bleed;
      for (const r of this.rays)
        r.img.setAlpha(z.rays * r.a * (calm ? 1 : 0.65 + 0.35 * Math.sin(t / 2400 + r.phase)));
      for (const w of this.weeds)
        w.leaves.forEach((leaf, i) => {
          const sway = calm ? 0 : Math.sin(t / 1100 + w.phase + i * 0.55) * i * 2.6;
          leaf.setPosition(w.x + sway, art.H - 6 - i * 26);
        });
      const s = dt / 1000;
      for (const sp of this.specks) {
        if (!calm) {
          sp.y -= sp.v * s;
          if (sp.y < -by) sp.y = art.H + by;
        }
        sp.img
          .setPosition(sp.x + (calm ? 0 : Math.sin(t / 1500 + sp.phase) * 10), sp.y)
          .setAlpha(0.22 + 0.2 * Math.sin(t / 900 + sp.phase) ** 2);
      }
      for (const f of this.shoal) {
        if (!calm) {
          f.x += f.v * s;
          if (f.x > art.W + bx + 60) f.x = -bx - 60;
          else if (f.x < -bx - 60) f.x = art.W + bx + 60;
        }
        f.img.setPosition(f.x, f.y + (calm ? 0 : Math.sin(t / 1300 + f.phase) * 8));
      }
    }
  }

  return [Reef];
};
