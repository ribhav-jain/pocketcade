// The Rowdy scene: the rack, coin drops, Rowdy the robot, the in-canvas cards and the time-sliced AI. Rules, AI and
// save bookkeeping live in rules.ts, ai.ts and save.ts; art.ts draws every texture once per mount; this file wires
// layout, input, timing, storage and feedback.
import type Phaser from 'phaser';
import { colorNum, colors, formatScore, type Rng, type Save } from '@pocketcade/toolkit';
import {
  backdrop,
  burst,
  canvasImage,
  canvasTexture,
  hudPill,
  texScale,
  type HudPill,
  type SceneFactory,
} from '@pocketcade/toolkit/phaser';
import { createSearch, createTable, ORDER, type Search, type Table } from './ai.ts';
import {
  BLOCK,
  BODY,
  BUBBLES,
  BULB,
  CELL,
  colX,
  DISC_R,
  drawBody,
  drawBolt,
  drawBubble,
  drawBulb,
  drawButton,
  drawCoin,
  drawFace,
  drawFloor,
  drawFrame,
  drawHead,
  drawPad,
  drawPanel,
  drawRing,
  drawStand,
  drawStar,
  drawWall,
  FACES,
  FRAME,
  HEAD,
  LANE,
  OUTLINE,
  PAD,
  RACK,
  rowY,
  SCREEN,
  STAND,
  type BubbleKey,
  type FaceKey,
} from './art.ts';
import { ATTRACT_INSTANT, ATTRACT_MOVES, type AttractView } from './attract.ts';
import {
  at,
  BOT,
  canPlay,
  COLS,
  createBoard,
  drop,
  EMPTY,
  LINES,
  lineThrough,
  other,
  replay,
  ROWS,
  sideValue,
  type Board,
  type Outcome,
  type Side,
} from './rules.ts';
import {
  applyResult,
  endStreak,
  freshProgress,
  isProgressV1,
  isRoundV1,
  LEVELS,
  sharpnessFor,
  type Applied,
  type Level,
  type RowdyProgressV1,
  type RowdyRoundV1,
} from './save.ts';
import { QUIPS, REACTIONS, strings } from './strings.ts';

const W = 720;
const H = 720;
/** gap between blocks and to the view edges */
const M = 8;
/** Rowdy's textures are drawn at this scale, the largest he is ever shown. */
const ROBOT_MAX = 1.25;
/** Rowdy's extent in robot units around his neck joint, standing on his pad or as a head on a stand. */
const ROBOT = { fullBottom: 214, bustBottom: 44, fullH: 384, bustH: 214, fullW: 236, bustW: 208 };
/** the side column beside the board on wide frames */
const SIDE = { min: 300, max: 520 };
/** the strip above the board on tall frames: its least height, and the height at which the HUD moves into it */
const STRIP = { min: 130, roomy: 360 };
/** HUD pills at full size; they are shown smaller where space is tight */
const PILL = { streak: 181, best: 163, level: 304, h: 64, gap: 8, small: 0.75 };
const PLATE_H = 52;
/** Rowdy answers this long after your coin lands, at every level. */
const BEAT_MS = 380;
const SLICE_MS = 8;
const HARD_CEILING_MS = 1000;
const GUARD_MS = 400;
const BOUNCE_MS = 90;
const DISC_KEY = { you: 'disc-you', bot: 'disc-bot' } as const;
/** "Your turn" plus the controls hint for the primary input, until your first drop. */
const TURN_HINT = {
  touch: `${strings.yourTurn} · ${strings.hintTouch}`,
  pointer: `${strings.yourTurn} · ${strings.hintPointer}`,
  keyboard: `${strings.yourTurn} · ${strings.hintKeyboard}`,
} as const;

type Phase = 'boot' | 'card' | 'yourTurn' | 'thinking' | 'done' | 'over';
type Mood = 'idle' | 'thinking' | 'pleased' | 'surprised' | 'defeated';
/**
 * Still poses: where the head sits on the neck (robot units) and the antenna bulb colour. The head is never
 * turned: rotated canvas images render with missing wedges.
 */
const POSE: Record<Mood, { dx: number; dy: number; bulb: string }> = {
  idle: { dx: 0, dy: 0, bulb: colors.sky },
  thinking: { dx: -7, dy: 2, bulb: colors.yellow },
  pleased: { dx: 0, dy: -5, bulb: colors.gold },
  surprised: { dx: 0, dy: -10, bulb: colors.text },
  defeated: { dx: 5, dy: 11, bulb: colors.line },
};
type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Card {
  kind: 'level' | 'restore' | 'round';
  buttons: Button[];
  focus: number;
  openedAt: number;
  /** centred on the view, or (for the round result) laid over the board's aiming lane */
  layer: Phaser.GameObjects.Container;
  focusRing: Phaser.GameObjects.Graphics;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const colAt = (x: number) => clamp(Math.floor((x - RACK.x) / CELL), 0, COLS - 1);

export const createScenes: SceneFactory = (_P, kit) => {
  class Play extends kit.Scene {
    private progress: RowdyProgressV1 = freshProgress();
    private progressSave!: Save<RowdyProgressV1>;
    private roundSave!: Save<RowdyRoundV1 | null>;
    private round: RowdyRoundV1 | null = null;
    private board: Board = createBoard();
    private toMove: Side = 'you';
    private phase: Phase = 'boot';
    private aim = 3;
    private aimVisible = false;
    private yourDiscs = 0;
    private started = false;
    private sceneMs = 0;
    private search: Search | null = null;
    private searchAt = 0;
    private searchResult: number | null = null;
    private replyAt = 0;
    private table: Table | null = null;
    private tableFailed = false;
    private aiRng!: Rng;
    private quipRng!: Rng;
    private lastQuip = false;
    private reactN = 0;
    private coinThisStreak = false;
    private hinted = false;
    private shownSharp = 0;
    private message: { text: string; until: number } | null = null;
    private result: { text: string; side: Side | null } | null = null;
    private card: Card | null = null;
    private press: { id: number; at: number } | null = null;
    private attractStart = 0;
    private attractEnded = false;
    // the board block
    private boardC!: Phaser.GameObjects.Container;
    private floor!: Img;
    private discs: Img[] = [];
    private cellDisc: Array<Img | null> = [];
    private falls = new Set<Phaser.Tweens.Tween>();
    private ghost!: Img;
    private landing!: Img;
    private colLight!: Phaser.GameObjects.Rectangle;
    private colFocus!: Phaser.GameObjects.Graphics;
    private lastRing!: Img;
    private winRings: Img[] = [];
    private numbers: Txt[] = [];
    // HUD and status
    private hud!: { streak: HudPill; best: HudPill; level: HudPill; bolts: Img[] };
    private status!: {
      c: Phaser.GameObjects.Container;
      plate: Phaser.GameObjects.Graphics;
      coin: Img;
      text: Txt;
      w: number;
      shown: string;
    };
    // Rowdy
    private mood: Mood = 'idle';
    private reaction: { mood: Mood; until: number } | null = null;
    private posed = '';
    private headParts: Array<{ img: Img; x: number; y: number; scale: number }> = [];
    /** head scale during a reaction's quick pop */
    private pop = { v: 1 };
    private faceKey: FaceKey = 'idle';
    private robot!: Phaser.GameObjects.Container;
    private standing: Img[] = [];
    private stand!: Img;
    private faceImg!: Img;
    private bulb!: Img;
    private bubble!: Phaser.GameObjects.Container;
    private bubbleImg!: Img;
    private bubbleText!: Txt;
    private bubbleUntil = 0;

    constructor() {
      super('play');
    }

    create(): void {
      const tk = this.tk;
      this.makeTextures();
      this.makeScenery();
      this.makeBoard();
      this.makeRobot();
      this.makeHud();
      this.layout();
      this.aiRng = tk.rng.main.fork('ai');
      this.quipRng = tk.rng.main.fork('quips');
      const select = Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [
          `select${i + 1}`,
          { codes: [`Digit${i + 1}`, `Numpad${i + 1}`] },
        ]),
      );
      tk.input.configure({
        actions: {
          left: { codes: ['ArrowLeft', 'KeyA'], repeat: true },
          right: { codes: ['ArrowRight', 'KeyD'], repeat: true },
          first: { codes: ['Home'] },
          last: { codes: ['End'] },
          drop: { codes: ['Enter', 'Space', 'ArrowDown', 'KeyS'] },
          ...select,
        },
      });
      for (const a of ['left', 'right', 'first', 'last', 'drop', ...Object.keys(select)])
        tk.input.on(a, (e) => e.phase === 'press' && this.onKey(a));
      this.bindPointer();
      tk.on('resize', () => this.layout());
      tk.on('inputchange', () => {
        this.refreshInputHints();
        this.layout();
      });
      tk.ui.onRestart(() => this.onMenuRestart());
      this.progressSave = tk.createSave<RowdyProgressV1>({
        key: 'progress',
        defaults: freshProgress,
        validate: isProgressV1,
      });
      this.roundSave = tk.createSave<RowdyRoundV1 | null>({
        key: 'round',
        defaults: () => null,
        validate: isRoundV1,
      });
      this.refreshInputHints();
      tk.deferReady();
      if (tk.attract) {
        this.startAttract();
        tk.ready();
        return;
      }
      Promise.all([this.progressSave.load(), this.roundSave.load()])
        .then(([p, r]) => {
          if (tk.signal.aborted) return; // unmounted while loading: the scene is gone
          this.progress = p.data;
          if (r.issue) tk.ui.toast(strings.restoreFailed);
          this.restore(r.data);
          tk.ready();
        })
        .catch((e: unknown) => {
          tk.reportError(e);
          tk.ready();
        });
    }

    // ─── art ───
    private makeTextures(): void {
      const tex = (
        key: string,
        w: number,
        h: number,
        draw: (ctx: CanvasRenderingContext2D) => void,
      ) => canvasTexture(this, key, w, h, draw);
      const size = (DISC_R + 2) * 2;
      for (const side of ['you', 'bot'] as const)
        tex(DISC_KEY[side], size, size, (ctx) => drawCoin(ctx, side, size / 2, size / 2, DISC_R));
      tex('frame', FRAME.w + 24, FRAME.h + FRAME.lip + 28, (ctx) => {
        ctx.translate(12, 6);
        drawFrame(ctx);
      });
      for (const win of [false, true])
        tex(win ? 'ring-win' : 'ring-last', CELL + 12, CELL + 12, (ctx) =>
          drawRing(ctx, CELL + 12, win),
        );
      // Rowdy, at the largest scale he is shown
      const robot = (
        key: string,
        w: number,
        h: number,
        draw: (ctx: CanvasRenderingContext2D) => void,
      ) =>
        tex(key, w * ROBOT_MAX, h * ROBOT_MAX, (ctx) => {
          ctx.scale(ROBOT_MAX, ROBOT_MAX);
          draw(ctx);
        });
      robot('head', HEAD.w, HEAD.h, drawHead);
      robot('body', BODY.w, BODY.h, drawBody);
      robot('pad', PAD.w, PAD.h, drawPad);
      robot('stand', STAND.w, STAND.h, drawStand);
      robot('bulb', BULB, BULB, drawBulb);
      for (const k of Object.keys(FACES) as FaceKey[])
        robot(`face-${k}`, SCREEN.w, SCREEN.h, (ctx) => drawFace(ctx, FACES[k]));
      for (const k of Object.keys(BUBBLES) as BubbleKey[])
        tex(`bubble-${k}`, BUBBLES[k].w, BUBBLES[k].h, (ctx) => drawBubble(ctx, k));
      for (const on of [true, false])
        tex(`bolt-${on ? 'on' : 'off'}`, 20, 30, (ctx) => drawBolt(ctx, 20, 30, on));
      tex('star', 26, 26, (ctx) => drawStar(ctx, 26));
      // cards
      tex('panel-level', 540, 380, (ctx) => drawPanel(ctx, 540, 380));
      tex('panel-restore', 540, 290, (ctx) => drawPanel(ctx, 540, 290));
      tex('btn-level', 150, 150, (ctx) => drawButton(ctx, 150, 150, 'blue'));
      for (const look of ['sunset', 'raised'] as const) {
        tex(`btn-${look}-card`, 220, 104, (ctx) => drawButton(ctx, 220, 104, look));
        tex(`btn-${look}-bar`, 236, 80, (ctx) => drawButton(ctx, 236, 80, look));
      }
    }

    private makeScenery(): void {
      const { bleed } = this.tk.layout;
      backdrop(this, 'wall', W, H, {
        stops: ['#2A1F66', '#1D1550', '#150E38'],
        glows: [
          [W * 0.3, H * 0.4, 560, colors.blue, 0.16],
          [W * 0.9, H * 0.15, 420, colors.violet, 0.14],
        ],
        draw: (ctx, w, h) => drawWall(ctx, w, h, bleed.x, bleed.y),
      });
      const fw = W + bleed.x * 2;
      canvasTexture(this, 'floor', fw, 80, (ctx) => drawFloor(ctx, fw, 80), { scale: 1 });
      this.floor = this.add.image(-bleed.x, 0, 'floor').setOrigin(0).setDepth(-900);
    }

    /** Everything on the rack lives in one container (block units), so the layout can move and scale it. */
    private makeBoard(): void {
      const back = this.add
        .rectangle(RACK.x - 4, RACK.y - 4, RACK.w + 8, RACK.h + 8, colorNum('#0C0828'))
        .setOrigin(0);
      this.colLight = this.add
        .rectangle(0, RACK.y, CELL, RACK.h, colorNum('sky'), 0.3)
        .setOrigin(0.5, 0)
        .setVisible(false);
      this.landing = canvasImage(this, 0, 0, DISC_KEY.you).setAlpha(0.4).setVisible(false);
      this.discs = Array.from({ length: COLS * ROWS }, () =>
        canvasImage(this, 0, 0, DISC_KEY.you).setVisible(false),
      );
      const frame = canvasImage(this, FRAME.x - 12, FRAME.y - 6, 'frame').setOrigin(0);
      this.lastRing = canvasImage(this, 0, 0, 'ring-last').setVisible(false);
      this.winRings = Array.from({ length: COLS }, () =>
        canvasImage(this, 0, 0, 'ring-win').setVisible(false),
      );
      this.colFocus = this.add
        .graphics()
        .lineStyle(4, colorNum('yellow'), 1)
        .strokeRoundedRect(-CELL / 2 - 1, 3, CELL + 2, RACK.y + RACK.h + 2, 20)
        .setVisible(false);
      this.ghost = canvasImage(this, colX(3), LANE / 2, DISC_KEY.you).setVisible(false);
      this.numbers = Array.from({ length: COLS }, (_, c) =>
        kit
          .text(this, colX(c), RACK.y + RACK.h + 19, String(c + 1), { px: 16, color: OUTLINE })
          .setOrigin(0.5),
      );
      this.boardC = this.add
        .container(0, 0, [
          back,
          this.colLight,
          this.landing,
          ...this.discs,
          frame,
          this.lastRing,
          ...this.winRings,
          this.colFocus,
          this.ghost,
          ...this.numbers,
        ])
        .setDepth(10);
    }

    private makeRobot(): void {
      const part = (key: string, x: number, y: number) => {
        const img = canvasImage(this, x, y, key);
        return img.setScale(img.scaleX / ROBOT_MAX);
      };
      this.standing = [
        part('pad', 0, 159).setOrigin(0.5, 0),
        part('body', 0, -2).setOrigin(0.5, 0),
      ];
      this.stand = part('stand', 0, -2).setOrigin(0.5, 0).setVisible(false);
      this.robot = this.add.container(0, 0, [...this.standing, this.stand]).setDepth(20);
      // The head's three images sit outside the container: poseRobot places them for each mood.
      this.faceImg = part('face-idle', 0, HEAD.faceY - HEAD.h);
      this.bulb = part('bulb', 0, HEAD.bulbY - HEAD.h);
      const head = [part('head', 0, 0).setOrigin(0.5, 1), this.faceImg, this.bulb];
      this.headParts = head.map((img) => ({ img, x: img.x, y: img.y, scale: img.scaleX }));
      head.forEach((img, i) => img.setDepth(21 + i));
      this.bubbleImg = canvasImage(this, 0, 0, 'bubble-down');
      this.bubbleText = kit
        .text(this, 0, 0, '', { px: 22, color: 'ink', align: 'center' })
        .setOrigin(0.5);
      this.bubbleText.setWordWrapWidth(240);
      this.bubble = this.add
        .container(0, 0, [this.bubbleImg, this.bubbleText])
        .setDepth(30)
        .setVisible(false);
    }

    private makeHud(): void {
      this.hud = {
        streak: hudPill(this, 0, 0, {
          icon: 'star',
          accent: colors.gold,
          label: strings.streak,
          value: '0',
          width: PILL.streak,
          height: PILL.h,
        }),
        best: hudPill(this, 0, 0, {
          icon: 'trophy',
          accent: colors.blue,
          label: strings.best,
          value: '0',
          width: PILL.best,
          height: PILL.h,
        }),
        level: hudPill(this, 0, 0, {
          icon: 'bolt',
          accent: colors.orange,
          label: strings.rowdy,
          value: '–',
          width: PILL.level,
          height: PILL.h,
        }),
        bolts: [],
      };
      this.hud.bolts = Array.from({ length: 5 }, (_, i) =>
        canvasImage(this, 188 + i * 21, PILL.h / 2, 'bolt-off'),
      );
      this.hud.level.container.add(this.hud.bolts);
      const plate = this.add.graphics();
      const coin = canvasImage(this, 0, 0, DISC_KEY.you);
      coin.setScale(coin.scaleX * 0.42);
      const text = kit.text(this, 0, 0, '', { px: 26 }).setOrigin(0.5);
      const c = this.add.container(0, 0, [plate, coin, text]).setDepth(500).setVisible(false);
      this.status = { c, plate, coin, text, w: 0, shown: '' };
    }

    // ─── layout ───
    /**
     * Places everything for the current view. Wide frames put the board on the left and a column with the HUD,
     * the status line and Rowdy on the right; tall frames put a strip with Rowdy and the HUD above the board. The
     * board shrinks only when neither fits at full size (frames close to square).
     */
    private layout(): void {
      const { view: v, bleed, cssWidth, cssHeight } = this.tk.layout;
      const right = v.x + v.width;
      const bottom = v.y + v.height;
      const sideS = Math.min((v.width - SIDE.min - 3 * M) / BLOCK.w, (v.height - 2 * M) / BLOCK.h);
      const stackS = Math.min(
        (v.width - 2 * M) / BLOCK.w,
        (v.height - PILL.h * PILL.small - STRIP.min - 4 * M) / BLOCK.h,
      );
      const side = sideS >= stackS;
      const s = clamp(side ? sideS : stackS, 0.3, 1);
      const bw = BLOCK.w * s;
      const bh = BLOCK.h * s;
      const boardY = bottom - M - bh;
      // The pause button (touch only) covers 64 CSS px at the stage's top-right corner.
      const px = Math.min(cssWidth / v.width, cssHeight / v.height);
      const touch = this.tk.env.input.primary === 'touch' && !this.tk.attract;
      const cornerW = touch ? Math.max(0, 64 - (cssWidth - v.width * px) / 2) / px : 0;
      const cornerH = touch ? Math.max(0, 64 - (cssHeight - v.height * px) / 2) / px : 0;
      const { streak, best, level } = this.hud;
      const pair = PILL.streak + PILL.gap + PILL.best;
      /**
       * Places the pills centred on cx at scale ps: Streak and Best, then Rowdy's level below (or beside them).
       * It moves left (not past minX) or down to stay clear of the pause button. Returns the y below the pills.
       */
      const placeHud = (cx: number, y: number, ps: number, oneRow: boolean, minX: number) => {
        const w = (oneRow ? pair + PILL.gap + PILL.level : pair) * ps;
        let x = cx - w / 2;
        if (cornerW > 0 && y < v.y + cornerH && x + w > right - cornerW) {
          x = Math.max(minX, right - cornerW - w);
          if (x + w > right - cornerW) y = v.y + cornerH + 4;
        }
        const step = (PILL.h + PILL.gap) * ps;
        streak.container.setPosition(x, y).setScale(ps);
        best.container.setPosition(x + (PILL.streak + PILL.gap) * ps, y).setScale(ps);
        if (oneRow) level.container.setPosition(x + (pair + PILL.gap) * ps, y);
        else level.container.setPosition(x + (w - PILL.level * ps) / 2, (y += step));
        level.container.setScale(ps);
        return y + step;
      };
      let k: number;
      let bust = false;
      let robotX: number;
      let robotBottom = boardY - 2;
      let plateX: number;
      let plateY: number;
      let plateW: number;
      let tail: BubbleKey = 'left';
      let tipY = 0;
      if (side) {
        // board | column: pills, status line, then Rowdy standing on the floor with room for his bubble
        const cw = Math.min(SIDE.max, v.width - bw - 3 * M);
        const gx = v.x + (v.width - (bw + M + cw)) / 2;
        this.boardC.setPosition(gx, boardY);
        const cx = gx + bw + M + cw / 2;
        let y = placeHud(cx, v.y + M, Math.min(1, cw / pair), false, cx - cw / 2);
        plateW = Math.min(cw, 480);
        plateX = cx;
        plateY = y + PLATE_H / 2;
        y += PLATE_H + PILL.gap;
        robotBottom = bottom - M;
        k = clamp(
          Math.min(cw / ROBOT.fullW, (robotBottom - y - BUBBLES.down.h) / 326),
          0.3,
          ROBOT_MAX,
        );
        robotX = cx;
        tail = 'down';
        tipY = robotBottom - (ROBOT.fullBottom + 112) * k;
      } else {
        this.boardC.setPosition(v.x + (v.width - bw) / 2, boardY);
        let top = v.y + M;
        const roomy = robotBottom - top >= STRIP.roomy;
        // Without a roomy strip the pills take a row of their own and Rowdy may be just a head.
        if (!roomy) {
          const rowW = (pair + PILL.gap + PILL.level) * PILL.small;
          top = placeHud(v.x + M + rowW / 2, top, PILL.small, true, v.x + M);
        }
        const strip = robotBottom - top;
        bust = strip < 300;
        k = clamp(strip / (bust ? ROBOT.bustH : ROBOT.fullH), 0.3, ROBOT_MAX);
        const rw = (bust ? ROBOT.bustW : ROBOT.fullW) * k;
        robotX = v.x + M + 6 + rw / 2;
        // beside Rowdy: his bubble at head height, the pills under it (roomy only), the status line at the bottom
        const ax = robotX + rw / 2 + 12;
        const aw = right - M - ax;
        const b = BUBBLES.left;
        const headY = robotBottom - ((bust ? ROBOT.bustBottom : ROBOT.fullBottom) + 62) * k;
        tipY = clamp(headY, top + b.tip[1], Math.max(top + b.tip[1], robotBottom - b.h + b.tip[1]));
        if (roomy)
          placeHud(ax + aw / 2, tipY + b.h - b.tip[1] + PILL.gap, Math.min(1, aw / pair), false, ax);
        plateW = Math.min(aw, 480);
        plateX = ax + aw / 2;
        plateY = robotBottom - PLATE_H / 2 - 2;
      }
      this.boardC.setScale(s);
      this.floor.setPosition(-bleed.x, boardY + bh - 52 * s);
      const neckY = robotBottom - (bust ? ROBOT.bustBottom : ROBOT.fullBottom) * k;
      this.robot.setPosition(robotX, neckY).setScale(k);
      this.posed = ''; // re-place the head
      for (const part of this.standing) part.setVisible(!bust);
      this.stand.setVisible(bust);
      // speech bubble: above the head in the column, beside it in the strip
      const b = BUBBLES[tail];
      const tipX = tail === 'down' ? robotX - 10 : robotX + 100 * k + 4;
      const minTipX = v.x + M + b.tip[0];
      this.bubbleImg.setTexture(`bubble-${tail}`).setOrigin(b.tip[0] / b.w, b.tip[1] / b.h);
      this.bubbleText.setPosition(b.text[0] - b.tip[0], b.text[1] - b.tip[1]);
      this.bubble.setPosition(
        clamp(tipX, minTipX, Math.max(minTipX, right - M - (b.w - b.tip[0]))),
        tipY,
      );
      // status line
      const st = this.status;
      st.w = plateW;
      st.c.setPosition(plateX, plateY);
      st.plate
        .clear()
        .fillStyle(colorNum('bg'), 0.78)
        .fillRoundedRect(-plateW / 2, -PLATE_H / 2, plateW, PLATE_H, PLATE_H / 2)
        .lineStyle(2, colorNum('line'), 1)
        .strokeRoundedRect(-plateW / 2, -PLATE_H / 2, plateW, PLATE_H, PLATE_H / 2);
      st.shown = '\0'; // re-fit the text to the new width
      const card = this.card;
      if (card && card.kind !== 'round')
        card.layer.setPosition(v.x + v.width / 2, v.y + v.height / 2);
    }

    // ─── restore and rounds ───
    private restore(saved: RowdyRoundV1 | null): void {
      const p = this.progress;
      this.shownSharp = sharpnessFor(p.streak);
      this.drawHud();
      if (saved && saved.roundId <= p.lastRoundId) saved = this.dropRound(false);
      if (
        saved &&
        (saved.roundId !== p.lastRoundId + 1 ||
          saved.level !== p.level ||
          saved.sharpness !== sharpnessFor(p.streak))
      )
        saved = this.dropRound(true);
      if (!saved) return p.level ? this.newRound() : this.openCard('level');
      this.loadRound(saved);
      const r = replay(saved.moves, saved.starter);
      if (r.outcome) return this.finishRound(r.outcome); // closed between the last move and its result
      this.openCard('restore');
    }

    private dropRound(toast: boolean): null {
      this.roundSave.set(null);
      void this.roundSave.flush();
      if (toast) this.tk.ui.toast(strings.restoreFailed);
      return null;
    }

    private loadRound(round: RowdyRoundV1): void {
      this.round = round;
      const r = replay(round.moves, round.starter);
      this.board = r.board;
      this.toMove = r.toMove;
      this.yourDiscs = round.moves.filter(
        (_, i) => (i % 2 === 0) === (round.starter === 'you'),
      ).length;
      this.started = round.moves.length > 0;
      this.clearDiscs();
      const heights = new Array<number>(COLS).fill(0);
      round.moves.forEach((c, i) => {
        const side = i % 2 === 0 ? round.starter : other(round.starter);
        const row = heights[c]!++;
        this.disc(side, c, row).setPosition(colX(c), rowY(row));
        if (i === round.moves.length - 1) this.lastRing.setPosition(colX(c), rowY(row)).setVisible(true);
      });
      this.mood = 'idle';
      this.reaction = null;
      this.result = null;
      this.message = null;
      this.bubble.setVisible(false);
      this.drawHud();
    }

    private newRound(): void {
      const p = this.progress;
      const level = p.level ?? 'easy';
      const sharpness = sharpnessFor(p.streak);
      this.loadRound({
        roundId: p.lastRoundId + 1,
        level,
        sharpness,
        starter: p.nextStarter,
        moves: [],
        aiRng: this.aiRng.state(),
      });
      // Rowdy says so when a longer streak has made him sharper.
      if (sharpness > this.shownSharp) {
        this.say(sharpness === 4 ? strings.fullPower : strings.powerUp, 1800);
        this.hud.level.bump();
      }
      this.shownSharp = sharpness;
      this.continueRound();
    }

    private continueRound(): void {
      this.closeCard();
      if (this.toMove === 'bot') {
        this.phase = 'thinking';
        this.mood = 'thinking';
        this.replyAt = this.sceneMs + BEAT_MS;
        this.startSearch();
      } else this.phase = 'yourTurn';
      this.refreshInputHints();
    }

    private startSearch(): void {
      const round = this.round!;
      if (round.level === 'hard' && !this.table && !this.tableFailed) {
        try {
          this.table = createTable();
        } catch (e) {
          this.tableFailed = true;
          this.tk.reportError(e);
        }
      }
      this.searchAt = this.sceneMs;
      this.searchResult = null;
      this.search = createSearch(
        this.board,
        { level: round.level, sharpness: round.sharpness, rng: this.aiRng, age: round.roundId },
        { now: () => performance.now(), table: this.table },
      );
    }

    /**
     * Plays a move. The rules and the turn advance at once, so you can aim and drop again while Rowdy's coin is
     * still falling; sound, reactions and the round result wait for the coin to land.
     */
    private commit(col: number, side: Side): void {
      const round = this.round!;
      const row = drop(this.board, col, sideValue(side));
      round.moves.push(col);
      const move = round.moves.length;
      if (side === 'you') this.yourDiscs++;
      if (!this.started) {
        this.started = true;
        this.tk.run.begin();
      }
      const line = lineThrough(this.board, col, row);
      const outcome: Outcome = line
        ? { winner: side, line }
        : this.board.count === COLS * ROWS
          ? { winner: 'draw' }
          : null;
      this.toMove = other(side);
      const attract = this.tk.attract !== null;
      if (!attract) {
        round.aiRng = this.aiRng.state();
        this.roundSave.set(round);
        void this.roundSave.flush(); // a reload never undoes a move
      }
      if (outcome) {
        this.phase = 'done';
        this.search = null;
      } else if (attract || side === 'bot') {
        this.phase = 'yourTurn';
        this.mood = attract && side === 'you' ? 'thinking' : 'idle';
      } else {
        this.phase = 'thinking';
        this.mood = 'thinking';
        this.replyAt = Infinity; // set when the coin lands
        this.startSearch();
      }
      const img = this.disc(side, col, row).setPosition(colX(col), LANE / 2);
      this.fall(img, row, () => {
        if (this.round !== round) return;
        this.tk.sfx.play('drop', { detuneCents: side === 'you' ? 0 : -300 });
        if (move === round.moves.length)
          this.lastRing.setPosition(colX(col), rowY(row)).setVisible(true);
        if (outcome) return this.finishRound(outcome);
        if (this.phase === 'done') return; // a later coin already ended the round
        if (side === 'you') {
          if (this.phase === 'thinking') this.replyAt = this.sceneMs + BEAT_MS;
          if (this.blocksFour(col, row))
            this.react('surprised', 1000, this.pick(REACTIONS.blocked));
        } else if (this.openThree(col, row)) {
          this.react('pleased', 1200, this.pick(REACTIONS.three));
          this.lastQuip = true;
        } else {
          const quip = !attract && !this.lastQuip && this.quipRng.chance(0.2);
          this.lastQuip = quip;
          if (quip) this.say(this.quipRng.pick(QUIPS), 1600);
        }
      });
    }

    /** Drops a coin from the lane into its cell: an accelerating fall and one short bounce. */
    private fall(img: Img, row: number, land: () => void): void {
      const y0 = LANE / 2;
      const y1 = rowY(row);
      if (this.tk.motion.reduced) {
        img.setY(y1);
        return land();
      }
      const fallMs = 150 + 30 * (ROWS - row);
      const hit = fallMs / (fallMs + BOUNCE_MS);
      let landed = false;
      const touch = () => {
        if (landed) return;
        landed = true;
        land();
      };
      kit.fps.burst(fallMs + BOUNCE_MS + BEAT_MS + 300);
      const tween = this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: fallMs + BOUNCE_MS,
        onUpdate: (tw) => {
          const p = tw.getValue() ?? 0;
          if (p < hit) return void img.setY(y0 + (y1 - y0) * (p / hit) ** 2);
          img.setY(y1 - Math.sin(((p - hit) / (1 - hit)) * Math.PI) * 9);
          touch();
        },
        onComplete: () => {
          this.falls.delete(tween);
          img.setY(y1);
          touch();
        },
      });
      this.falls.add(tween);
    }

    /** The disc at (c, r) is Rowdy's third in an open line of four. */
    private openThree(c: number, r: number): boolean {
      return LINES.some((l) => {
        if (!l.some(([x, y]) => x === c && y === r)) return false;
        let mine = 0;
        let empty = 0;
        for (const [x, y] of l) {
          const v = at(this.board, x, y);
          if (v === BOT) mine++;
          else if (v === EMPTY) empty++;
        }
        return mine === 3 && empty === 1;
      });
    }

    /** Your disc at (c, r) filled the gap in three of Rowdy's. */
    private blocksFour(c: number, r: number): boolean {
      return LINES.some(
        (l) =>
          l.some(([x, y]) => x === c && y === r) &&
          l.every(([x, y]) => (x === c && y === r) || at(this.board, x, y) === BOT),
      );
    }

    private finishRound(outcome: NonNullable<Outcome>): void {
      this.phase = 'done';
      this.search = null;
      const { sfx } = this.tk;
      if (outcome.winner === 'draw') {
        sfx.play('draw');
        this.result = { text: strings.draw, side: null };
        this.mood = 'idle';
        this.react('surprised', 1200, this.pick(REACTIONS.draw));
      } else {
        const won = outcome.winner === 'you';
        sfx.play(won ? 'win' : 'lose');
        this.result = { text: won ? strings.youWin : strings.rowdyWins, side: outcome.winner };
        this.mood = won ? 'defeated' : 'pleased';
        this.react(this.mood, 0, this.pick(won ? REACTIONS.lose : REACTIONS.win));
        this.highlight(outcome.line, won);
      }
      if (this.tk.attract) return;
      const result = outcome.winner === 'draw' ? 'draw' : outcome.winner === 'you' ? 'win' : 'loss';
      const applied = this.apply(applyResult(this.progress, this.round!, result));
      if (!applied) return this.newRound();
      if (applied.newBest && !this.coinThisStreak) {
        this.coinThisStreak = true;
        sfx.play('coin');
        this.hud.best.bump();
      }
      if (result === 'win') this.hud.streak.bump();
      const calm = this.tk.motion.reduced;
      if (applied.ended) {
        const ended = applied.ended;
        return void this.time.delayedCall(
          calm ? 0 : 900,
          () => void this.streakOver(strings.rowdyWins, ended),
        );
      }
      this.tk.run.end('level_end');
      const title = this.result.text;
      this.time.delayedCall(calm ? 0 : 500, () => this.openCard('round', title));
    }

    /** Saves an applied result and clears the round in the same task (applied exactly once). */
    private apply(a: Applied | null): Applied | null {
      if (!a) return null;
      this.progress = a.progress;
      this.progressSave.set(this.progress);
      this.roundSave.set(null);
      void this.roundSave.flush();
      void this.progressSave.flush();
      this.drawHud();
      return a;
    }

    private async streakOver(
      title: string,
      ended: { streak: number; draws: number },
    ): Promise<void> {
      this.phase = 'over';
      this.closeCard();
      this.coinThisStreak = false;
      const level = this.round?.level ?? this.progress.level ?? 'easy';
      const action = await this.tk.ui.gameOver({
        title,
        scores: ended.streak >= 1 ? [{ board: 'win-streak', value: ended.streak }] : [],
        meta: {
          v: 1,
          level,
          wins: ended.streak,
          draws: ended.draws,
          rounds: ended.streak + ended.draws,
        },
        actions: [{ id: 'level', label: strings.changeLevel }],
      });
      if (this.tk.signal.aborted) return;
      if (action === 'level') this.openCard('level');
      else this.newRound();
    }

    private forfeit(): void {
      const a = this.apply(applyResult(this.progress, this.round!, 'loss'));
      void this.streakOver(strings.forfeited, a?.ended ?? { streak: 0, draws: 0 });
    }

    private onMenuRestart(): void {
      if (!this.round || (this.phase !== 'yourTurn' && this.phase !== 'thinking')) return;
      if (this.yourDiscs > 0) return this.forfeit();
      // Restart before any of your discs: same round again, no result.
      this.dropRound(false);
      this.search = null;
      this.newRound();
    }

    // ─── attract ───
    private startAttract(): void {
      const a = this.tk.attract!;
      this.loadRound({
        roundId: 1,
        level: 'easy',
        sharpness: 0,
        starter: 'you',
        moves: [],
        aiRng: [1, 2, 3, 4],
      });
      for (const c of ATTRACT_MOVES.slice(0, ATTRACT_INSTANT)) {
        const side = this.toMove;
        const row = drop(this.board, c, sideValue(side));
        this.round!.moves.push(c);
        this.disc(side, c, row).setPosition(colX(c), rowY(row));
        this.toMove = other(side);
      }
      this.phase = 'yourTurn';
      this.attractStart = a.step;
      this.attractEnded = false;
      a.setView({ startStep: a.step } satisfies AttractView);
    }

    // ─── input ───
    private onKey(action: string): void {
      const n = /^select(\d)$/.exec(action);
      if (this.tk.attract) {
        if (n && this.phase === 'yourTurn') this.commit(Number(n[1]) - 1, this.toMove);
        return;
      }
      if (this.card) return this.cardKey(action);
      if (n) {
        this.aim = Number(n[1]) - 1;
        return this.tryDrop(this.aim);
      }
      if (action === 'drop') return this.tryDrop(this.aim);
      const next =
        action === 'left'
          ? this.aim - 1
          : action === 'right'
            ? this.aim + 1
            : action === 'first'
              ? 0
              : COLS - 1;
      const clamped = clamp(next, 0, COLS - 1);
      if (clamped !== this.aim) this.tk.sfx.play('click', { volume: 0.5 });
      this.aim = clamped;
      this.aimVisible = true;
    }

    private bindPointer(): void {
      /** pointer position in view units and in the board's block units */
      const locate = (p: Phaser.Input.Pointer) => {
        const w = this.cameras.main.getWorldPoint(p.x, p.y);
        const s = this.boardC.scaleX;
        return { wx: w.x, wy: w.y, x: (w.x - this.boardC.x) / s, y: (w.y - this.boardC.y) / s };
      };
      const live = () => !this.tk.attract && !this.tk.ui.open;
      const onBoard = (x: number, y: number) =>
        x >= 0 && x <= BLOCK.w && y >= -LANE && y <= BLOCK.h;
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (!live() || this.press) return;
        this.press = { id: p.id, at: performance.now() };
        const w = locate(p);
        if (!this.card && onBoard(w.x, w.y)) [this.aim, this.aimVisible] = [colAt(w.x), true];
      });
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (!live() || this.card || (this.press && this.press.id !== p.id)) return;
        if (p.wasTouch && !this.press) return;
        const w = locate(p);
        this.aimVisible = onBoard(w.x, w.y);
        if (this.aimVisible) this.aim = colAt(w.x);
      });
      const up = (p: Phaser.Input.Pointer, outside: boolean) => {
        const press = this.press;
        if (!press || press.id !== p.id) return;
        this.press = null;
        if (!live()) return;
        const w = locate(p);
        if (this.card) return this.cardPointer(w, press.at);
        if (outside || !onBoard(w.x, w.y)) return void (this.aimVisible = false); // cancelled
        this.aim = colAt(w.x);
        this.tryDrop(this.aim);
        if (p.wasTouch) this.aimVisible = false;
      };
      this.input.on('pointerup', (p: Phaser.Input.Pointer) => up(p, false));
      this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => up(p, true));
      this.input.on('gameout', () => {
        if (!this.press) this.aimVisible = false;
      });
    }

    private tryDrop(col: number): void {
      if (this.phase !== 'yourTurn' || this.card || this.tk.ui.open) return;
      if (canPlay(this.board, col)) {
        this.hinted = true;
        return this.commit(col, 'you');
      }
      this.tk.sfx.play('hit');
      this.message = { text: strings.t('columnFull', { n: col + 1 }), until: this.sceneMs + 1200 };
      if (this.tk.motion.reduced) return;
      for (let r = 0; r < ROWS; r++) {
        const d = this.cellDisc[col * ROWS + r];
        if (!d) continue;
        this.tweens.killTweensOf(d);
        d.setX(colX(col));
        this.tweens.add({ targets: d, x: d.x + 6, duration: 45, yoyo: true, repeat: 1 });
      }
    }

    private refreshInputHints(): void {
      const env = this.tk.env;
      for (const n of this.numbers) n.setVisible(env.input.hasKeyboard && !this.tk.attract);
      if (env.input.primary !== 'keyboard') this.aimVisible = false;
    }

    // ─── cards (level picker, restore, round result) ───
    /**
     * The level picker and the restore prompt are panels centred on the view. The round result is a bar over
     * the aiming lane, so the board and the winning line stay in sight.
     */
    private openCard(kind: Card['kind'], title?: string): void {
      this.closeCard();
      if (kind !== 'round') this.phase = 'card';
      const layer = this.add.container(0, 0).setDepth(2000);
      const specs: Array<{ id: string; label: string; sub?: string; stars?: number }> =
        kind === 'level'
          ? LEVELS.map((l, i) => {
              const r = this.progress.records[l];
              return {
                id: l,
                label: strings[l],
                sub: strings.t('record', { best: r.bestStreak, wins: r.wins, losses: r.losses }),
                stars: i + 1,
              };
            })
          : kind === 'restore'
            ? [
                { id: 'continue', label: strings.continue },
                { id: 'forfeit', label: strings.forfeit },
              ]
            : [
                { id: 'next', label: strings.nextRound },
                { id: 'end', label: strings.bankStreak },
              ];
      const heading = title ?? (kind === 'level' ? strings.pickLevel : strings.roundInProgress);
      const [bw, bh, gap] = kind === 'level' ? [150, 150, 20] : kind === 'restore' ? [220, 104, 30] : [236, 80, 10];
      let x0: number;
      let y0: number;
      if (kind === 'round') {
        x0 = BLOCK.w - 4 - specs.length * (bw + gap) + gap;
        y0 = (LANE - bh) / 2;
        layer.add(
          kit
            .text(this, x0 / 2, LANE / 2, heading, { px: 34, stroke: OUTLINE, strokePx: 6 })
            .setOrigin(0.5),
        );
        this.boardC.add(layer);
      } else {
        const ph = kind === 'level' ? 380 : 290;
        x0 = -(specs.length * (bw + gap) - gap) / 2;
        y0 = -ph / 2 + 124;
        layer.add([
          this.add.rectangle(0, 0, 4000, 4000, colorNum('bg'), 0.72),
          canvasImage(this, 0, 0, `panel-${kind}`),
          kit
            .text(this, 0, -ph / 2 + 62, heading, { px: 36, stroke: OUTLINE, strokePx: 6 })
            .setOrigin(0.5),
        ]);
      }
      const buttons = specs.map((spec, i) => {
        const b = { id: spec.id, x: x0 + i * (bw + gap), y: y0, w: bw, h: bh };
        const look = kind === 'level' ? 'blue' : i === 0 ? 'sunset' : 'raised';
        const key =
          kind === 'level' ? 'btn-level' : `btn-${look}-${kind === 'round' ? 'bar' : 'card'}`;
        layer.add(canvasImage(this, b.x, b.y, key).setOrigin(0));
        layer.add(
          kit
            .text(
              this,
              b.x + bw / 2,
              spec.stars ? b.y + bh * 0.36 : b.y + bh / 2 - 3,
              spec.label,
              look === 'sunset'
                ? { px: 30, color: 'ink' }
                : { px: 30, stroke: OUTLINE, strokePx: 5 },
            )
            .setOrigin(0.5),
        );
        for (let n = 0; n < (spec.stars ?? 0); n++)
          layer.add(
            canvasImage(
              this,
              b.x + bw / 2 + (n - (spec.stars! - 1) / 2) * 30,
              b.y + bh * 0.66,
              'star',
            ),
          );
        if (spec.sub)
          layer.add(
            kit
              .text(this, b.x + bw / 2, b.y + bh + 26, spec.sub, {
                px: 17,
                weight: 600,
                color: 'textMuted',
                align: 'center',
              })
              .setOrigin(0.5, 0),
          );
        return b;
      });
      const focusRing = this.add.graphics();
      layer.add(focusRing);
      this.card = { kind, buttons, focus: 0, openedAt: performance.now(), layer, focusRing };
      this.drawFocus();
      this.layout();
    }

    private closeCard(): void {
      this.card?.layer.destroy();
      this.card = null;
    }

    private drawFocus(): void {
      const c = this.card!;
      const b = c.buttons[c.focus]!;
      c.focusRing
        .clear()
        .lineStyle(4, colorNum('yellow'), 1)
        .strokeRoundedRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10, 24);
    }

    private cardKey(action: string): void {
      const c = this.card!;
      if (action === 'left' || action === 'right') {
        c.focus = clamp(c.focus + (action === 'left' ? -1 : 1), 0, c.buttons.length - 1);
        return this.drawFocus();
      }
      const n = /^select(\d)$/.exec(action);
      if (n && c.kind === 'level' && Number(n[1]) <= 3)
        return this.activate(Number(n[1]) - 1, performance.now());
      if (action === 'drop') this.activate(c.focus, performance.now());
    }

    private cardPointer(
      p: { wx: number; wy: number; x: number; y: number },
      pressedAt: number,
    ): void {
      const c = this.card!;
      const [x, y] = c.kind === 'round' ? [p.x, p.y] : [p.wx - c.layer.x, p.wy - c.layer.y];
      const i = c.buttons.findIndex(
        (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
      );
      if (i >= 0) this.activate(i, pressedAt);
    }

    /**
     * Ignores activations in the first 400 ms and presses that began before the card opened. Real time, not the
     * scene clock: the how-to dialog freezes the scene, and the card waiting under it must take the first click.
     */
    private activate(i: number, pressedAt: number): void {
      const c = this.card!;
      if (performance.now() < c.openedAt + GUARD_MS || pressedAt < c.openedAt) return;
      const id = c.buttons[i]!.id;
      this.closeCard();
      if (c.kind === 'level') {
        this.progress = { ...this.progress, level: id as Level };
        this.progressSave.set(this.progress);
        this.newRound();
      } else if (id === 'continue') this.continueRound();
      else if (id === 'forfeit') this.forfeit();
      else if (id === 'next') this.newRound();
      else {
        const a = this.apply(endStreak(this.progress))!;
        void this.streakOver(strings.banked, a.ended!);
      }
    }

    // ─── frame ───
    override update(_t: number, delta: number): void {
      this.sceneMs += delta;
      const a = this.tk.attract;
      if (a && this.phase === 'done' && !this.attractEnded && a.step - this.attractStart >= 300) {
        this.attractEnded = true;
        void this.tk.ui
          .gameOver({ title: '', scores: [] })
          .then(() => !this.tk.signal.aborted && this.startAttract());
      }
      if (this.search && this.searchResult === null) {
        this.searchResult = this.search.step(SLICE_MS);
        if (this.searchResult === null && this.sceneMs - this.searchAt >= HARD_CEILING_MS)
          this.searchResult = this.search.finish();
      }
      if (
        this.phase === 'thinking' &&
        this.searchResult !== null &&
        this.sceneMs >= this.replyAt
      ) {
        let col = this.searchResult;
        this.search = null;
        this.searchResult = null;
        if (!canPlay(this.board, col)) {
          this.tk.reportError(new Error(`rowdy: AI returned illegal column ${String(col)}`));
          col = ORDER.find((c) => canPlay(this.board, c))!;
        }
        this.commit(col, 'bot');
      }
      this.drawAim();
      this.drawStatus();
      this.poseRobot();
    }

    /** The aim preview: your coin above the column, the column lit, and a faint coin where it would land. */
    private drawAim(): void {
      const primary = this.tk.env.input.primary;
      const live = !this.tk.attract && !this.card;
      const yourTurn = live && this.phase === 'yourTurn';
      const aiming =
        (yourTurn || (live && this.phase === 'thinking')) &&
        (this.aimVisible || primary === 'keyboard');
      const x = colX(this.aim);
      const h = this.board.heights[this.aim]!;
      this.ghost
        .setVisible(aiming)
        .setX(x)
        .setAlpha(yourTurn ? 1 : 0.45);
      this.colLight.setVisible(aiming && yourTurn).setX(x);
      this.colFocus.setVisible(aiming && primary === 'keyboard').setX(x);
      this.landing
        .setVisible(aiming && yourTurn && h < ROWS)
        .setPosition(x, rowY(Math.min(h, ROWS - 1)));
    }

    /** Whose turn it is (or how the round ended), with that side's coin. */
    private drawStatus(): void {
      const st = this.status;
      if (this.message && this.sceneMs >= this.message.until) this.message = null;
      let text = '';
      let short = '';
      let side: Side | null = null;
      if (!this.tk.attract && this.phase !== 'boot' && this.phase !== 'card') {
        if (this.message) text = this.message.text;
        else if (this.phase === 'yourTurn') {
          short = strings.yourTurn;
          text = this.hinted ? short : TURN_HINT[this.tk.env.input.primary];
          side = 'you';
        } else if (this.phase === 'thinking') [text, side] = [strings.thinking, 'bot'];
        else if (this.result) [text, side] = [this.result.text, this.result.side];
      }
      const shown = `${text}|${side ?? ''}`;
      if (shown === st.shown) return;
      st.shown = shown;
      st.c.setVisible(text !== '');
      st.text.setText(text);
      const room = st.w - (side ? 88 : 36);
      if (short && st.text.width > room) st.text.setText(short);
      st.coin.setVisible(side !== null);
      if (side) {
        st.coin.setTexture(DISC_KEY[side]).setX(-st.text.width / 2 - 6);
        st.text.setX(21);
      } else st.text.setX(0);
    }

    /** Streak, best, level and sharpness bolts: redrawn when the round or the progress changes. */
    private drawHud(): void {
      const p = this.progress;
      const locale = this.tk.env.locale;
      const level = this.round?.level ?? p.level;
      this.hud.streak.set(formatScore(p.streak, 'integer', locale));
      this.hud.best.set(level ? formatScore(p.records[level].bestStreak, 'integer', locale) : '0');
      this.hud.level.set(level ? strings[level] : '–');
      const s = this.round?.sharpness ?? -1;
      this.hud.bolts.forEach((b, i) => b.setTexture(i <= s ? 'bolt-on' : 'bolt-off'));
    }

    // ─── Rowdy ───
    private pick(lines: readonly string[]): string {
      return lines[this.reactN++ % lines.length]!;
    }

    /** A key moment: a pose for `ms` (0 keeps the current mood), a line of speech and one quick pop. */
    private react(mood: Mood, ms: number, line: string): void {
      this.reaction = ms > 0 ? { mood, until: this.sceneMs + ms } : null;
      this.say(line, Math.max(ms, 1500) + 300);
      if (this.tk.motion.reduced) return;
      this.tweens.killTweensOf(this.pop);
      this.pop.v = 1.07;
      this.tweens.add({ targets: this.pop, v: 1, duration: 160, ease: 'Quad.easeOut' });
    }

    private say(text: string, ms: number): void {
      this.bubbleText.setText(text);
      this.bubble.setVisible(true);
      this.bubbleUntil = this.sceneMs + ms;
    }

    /** Shows the current mood as a still pose; the only idle motion is a blink every few seconds. */
    private poseRobot(): void {
      const t = this.sceneMs;
      if (this.reaction && t >= this.reaction.until) this.reaction = null;
      const mood = this.reaction?.mood ?? this.mood;
      const blink = mood === 'idle' && !this.tk.motion.reduced && t % 5200 < 130;
      const key: FaceKey = blink ? 'blink' : mood;
      if (key !== this.faceKey) {
        this.faceKey = key;
        this.faceImg.setTexture(`face-${key}`);
      }
      const posed = `${mood}:${this.pop.v}`;
      if (posed !== this.posed) {
        this.posed = posed;
        const pose = POSE[mood];
        const k = this.robot.scaleX;
        const pop = this.pop.v;
        for (const p of this.headParts)
          p.img
            .setPosition(
              this.robot.x + k * (pose.dx + p.x * pop),
              this.robot.y + k * (6 + pose.dy + p.y * pop),
            )
            .setScale(p.scale * pop * k);
        this.bulb.setTint(colorNum(pose.bulb));
      }
      if (this.bubble.visible && t >= this.bubbleUntil) this.bubble.setVisible(false);
    }

    /** Rings the winning coins and dims the rest; confetti when the win is yours. */
    private highlight(line: ReadonlyArray<readonly [number, number]>, won: boolean): void {
      const win = new Set(line.map(([c, r]) => c * ROWS + r));
      this.cellDisc.forEach((d, i) => d && !win.has(i) && d.setAlpha(0.35));
      this.lastRing.setVisible(false);
      const calm = this.tk.motion.reduced;
      line.forEach(([c, r], i) => {
        const ring = this.winRings[i];
        if (!ring) return;
        ring.setPosition(colX(c), rowY(r)).setVisible(true);
        if (calm) return;
        const s = 1 / texScale(this, 'ring-win');
        ring.setScale(s * 1.3);
        this.tweens.add({ targets: ring, scale: s, duration: 220, ease: 'Back.easeOut' });
      });
      if (!won) return;
      const b = this.boardC;
      kit.fps.burst(1200);
      burst(this, b.x + (BLOCK.w / 2) * b.scaleX, b.y + LANE * b.scaleX, {
        count: 20,
        shape: 'square',
        distance: 240,
        size: 12,
        gravity: 200,
        spread: Math.PI * 1.3,
        lifeMs: 1000,
      });
    }

    // ─── discs ───
    private disc(side: Side, col: number, row: number): Img {
      const d = this.discs.find((x) => !x.visible)!;
      this.cellDisc[col * ROWS + row] = d;
      return d.setTexture(DISC_KEY[side]).setVisible(true).setAlpha(1);
    }

    private clearDiscs(): void {
      for (const t of this.falls) t.stop();
      this.falls.clear();
      this.tweens.killTweensOf([...this.discs, ...this.winRings]);
      for (const d of [...this.discs, ...this.winRings, this.lastRing]) d.setVisible(false);
      this.cellDisc = new Array<Img | null>(COLS * ROWS).fill(null);
    }
  }

  return [Play];
};
