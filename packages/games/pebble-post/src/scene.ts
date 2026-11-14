// The Pebble Post scene: each zone's sky with two parallax layers, the pseudo-3D ice canyon (road.ts), Pebble,
// effects and the HUD. The rules live in sim.ts; this file maps keys and swipes to moves, steps the sim at 60 Hz
// and draws. All art is drawn once per mount (art.ts); per frame only positions, scales and alphas of pooled
// images change, and HUD text changes only when its value does. Scenery covers the whole view, so the frame can
// be as tall as a phone or as wide as a desktop; the HUD is laid out again whenever the view changes.
import type Phaser from 'phaser';
import { colorNum, colors, formatScore, prng, type Save } from '@pocketcade/toolkit';
import {
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
import {
  HAZE_KEY,
  LETTER_KEY,
  MARGIN,
  OBSTACLE_KEYS,
  PICKUP_KEYS,
  createRoadView,
  propKey,
  type RoadView,
} from './road.ts';
import { freshStats, isStatsV1, withRun, type StatsV1 } from './save.ts';
import {
  BONUS_POINTS,
  HOP_V,
  POWER_MS,
  STEP_MS,
  TOP_SPEED,
  TUMBLE_MS,
  createRun,
  zoneAt,
  type BonusKind,
  type Move,
  type PowerKind,
  type Run,
  type SimEvent,
} from './sim.ts';
import { strings, zoneName } from './strings.ts';
import {
  LANE_W,
  PEBBLE_SCALE,
  PEBBLE_Y,
  PROP,
  VIEW,
  curveAt,
  skyMix,
  type PropKind,
  type SkyMix,
} from './track.ts';

const MAX_STEPS = 6;
/** after the tumble, before the dialog */
const OVER_MS = 500;
const OVER_MS_CALM = 250;
/** "Ready…" before each run starts and after any resume */
const START_HOLD_MS = 1000;
const RESUME_HOLD_MS = 700;
const GO_MS = 600;
const BANNER_MS = 2200;
/** the controls hint on the first run of a mount: until this long after Go (the first row arrives at about 4 s),
 * or this many moves */
const HINT_MS = 3500;
const HINT_MOVES = 3;
const HUD_MS = 100;
const HUD_BOTTOM = 96;
// first row: score, letters, Pause; second row: best and the power-up's time
const PILL = { y: 12, h: 60 } as const;
const SCORE = { w: 180 } as const;
const LETTERS = { w: 144 } as const;
const PAUSE = { w: 176 } as const;
const BEST = { y: 80, w: 160, h: 52 } as const;
const POWER = { w: 196, h: 52 } as const;
const HUD_PAD = 12;
const HUD_GAP = 8;
/** on a wide frame the HUD spreads at most this far past the design area, so it stays near the action */
const HUD_REACH = 220;
/** a drag this long (CSS px) is a move, without waiting for the finger to lift */
const SWIPE_PX = 26;
const SPRAY = 32;
const SPARKS = 18;
const STREAKS = 12;
const FLAKES = 34;
const CLOUD_COUNT = 7;
const VANISH = { x: VIEW.w / 2, y: VIEW.horizon } as const;
/** the nearer ridge's drift per unit of curve at top speed (design units per ms); the far peaks drift less */
const LAYER_SPEED = 0.03;
const FAR_DRIFT = 0.4;
/** clouds drift this fast (design units per second) */
const CLOUD_SPEED = 7;
/** drifting snow: fall and wind (design units per second), and how strongly it streams past with speed */
const SNOW = { fall: 70, wind: -28, rush: 1.1 } as const;
/** the hint's cross of arrows */
const HINT = { x: VIEW.w / 2, y: 480, r: 100 } as const;
/** a bonus label floats up for this long */
const POP_MS = 750;
/** Pebble squashes for this long after landing */
const LAND_MS = 140;

type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
interface Bit {
  img: Img;
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
}
interface Flake {
  img: Img;
  x: number;
  y: number;
  /** nearness, 0.4 (far, small, slow) to 1 */
  d: number;
}
interface Backdrop {
  box: Phaser.GameObjects.Container;
  far: Img[];
  near: Img[];
  clouds: Img[];
  aurora: Img[];
}
interface Pop {
  text: Txt;
  at: number;
  y: number;
}

const MOVES: readonly Move[] = ['left', 'right', 'hop', 'tuck'];
const BONUSES: readonly BonusKind[] = ['hop', 'tuck', 'close'];
const POSE_KEYS = Object.fromEntries(art.POSES.map((p) => [p, `pp-peb-${p}`])) as Record<
  art.Pose,
  string
>;

export const createScenes: SceneFactory = (_P, kit) => {
  class Slide extends kit.Scene {
    private sim!: Run;
    private road!: RoadView;
    private stats: StatsV1 = freshStats();
    private statsSave!: Save<StatsV1>;
    /** saved best or the board's top score, whichever is higher */
    private best = 0;
    private newBest = false;
    /** scene ms: frame time in play, the attract step clock in attract */
    private clock = 0;
    private acc = 0;
    private lastStep = 0;
    private holdUntil = 0;
    private started = false;
    /** clock when the run ended, else -1 */
    private endAt = -1;
    private ending = false;
    private runs = 0;
    private moves = 0;
    private goAt = -1;
    private crashAt = -1;
    private landAt = -Infinity;
    private bannerAt = -Infinity;
    private hudAt = -Infinity;
    private rnd = prng(0x9e6b);
    private drag: { fired: boolean; hud: boolean } | null = null;
    // the backdrop: half its width (the widest view plus a margin), one per zone, and which ones show
    private half = VIEW.w / 2;
    private backdrops: Backdrop[] = [];
    private mix: SkyMix = { from: 0, to: 0, k: 1 };
    private zone = -1;
    private farX = 0;
    // Pebble
    private pebble!: Img;
    private shadow!: Img;
    private scarf!: Img;
    /** the scarf flying off when it saves her */
    private lostScarf!: Img;
    private aura!: Img;
    private pebBase = 1;
    private scarfBase = 1;
    private poseKey = '';
    private sprayAt = 0;
    // effects
    private spray: Bit[] = [];
    private sparks: Bit[] = [];
    private streaks: Bit[] = [];
    private flakes: Flake[] = [];
    private pops: Pop[] = [];
    private pauseX = 0;
    private hud!: {
      score: HudPill;
      best: HudPill;
      letters: HudPill;
      power: HudPill;
      powerIcon: Img;
      pause: Img;
      pauseText: Txt;
      count: Txt;
      banner: Txt;
      sub: Txt;
      hint: Txt;
      arrows: Img[];
      labels: Txt[];
    };
    private shown = { score: -1, best: -1, letters: -1, secs: -1, power: '' };

    constructor() {
      super('slide');
    }

    create(): void {
      const tk = this.tk;
      this.half = Math.ceil(VIEW.w / 2 + tk.layout.bleed.x + MARGIN);
      this.makeTextures();
      this.buildBackdrop();
      this.road = createRoadView(this);
      this.buildPebble();
      this.buildFx();
      this.buildHud();
      tk.input.configure({
        actions: {
          left: { codes: ['ArrowLeft', 'KeyA'] },
          right: { codes: ['ArrowRight', 'KeyD'] },
          hop: { codes: ['ArrowUp', 'KeyW', 'Space'] },
          tuck: { codes: ['ArrowDown', 'KeyS'] },
        },
      });
      for (const m of MOVES) tk.input.on(m, (e) => e.phase === 'press' && this.move(m));
      tk.input.onGesture('tap', (e) => this.onTap(e.x, e.y));
      tk.input.onGesture('dragstart', (e) => {
        this.drag = { fired: false, hud: e.y < HUD_BOTTOM };
      });
      tk.input.onGesture('drag', (e) => this.onDrag(e.dx, e.dy));
      tk.input.onGesture('swipe', (e) => {
        if (this.drag && !this.drag.fired && !this.drag.hud)
          this.move(e.dir === 'up' ? 'hop' : e.dir === 'down' ? 'tuck' : e.dir);
        this.drag = null;
      });
      tk.on('pause', () => {
        this.drag = null;
      });
      tk.on('resume', () => {
        if (this.sim?.phase === 'run' && !tk.attract)
          this.holdUntil = Math.max(this.holdUntil, this.clock + RESUME_HOLD_MS);
      });
      tk.on('resize', () => {
        this.layoutHud();
        this.scatterSnow();
      });
      tk.on('inputchange', () => this.showHint());
      tk.ui.onRestart(() => {
        // she crashed and is tumbling: that run counts
        if (this.sim?.phase === 'tumble') this.recordRun();
        this.newRun();
      });
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
      type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
      const crisp = (key: string, w: number, h: number, draw: Draw) =>
        kit.textures.canvas(this, key, w, h, draw);
      // world sprites are drawn at ≤ 1.5× to keep texture memory down; skies and far layers are soft, at 1× or less
      const sprite = (key: string, w: number, h: number, draw: Draw) =>
        canvasTexture(this, key, w, h, draw, { scale: Math.min(1.5, kit.renderScale) });
      const soft = (key: string, w: number, h: number, draw: Draw, scale = 1) =>
        canvasTexture(this, key, w, h, draw, { scale });
      for (let z = 0; z < 3; z++) {
        // the night sky keeps its stars sharp; the other two are plain gradients and glows
        const sky: Draw = (c, w, h) => art.drawSky(c, w, h, z);
        soft(`pp-sky-${z}`, this.half * 2, art.SKY_H, sky, z === 1 ? 1 : 0.5);
        soft(`pp-far-${z}`, art.LAYER_W, art.FAR_H, (c, w, h) => art.drawFar(c, w, h, z));
        soft(`pp-near-${z}`, art.LAYER_W, art.NEAR_H, (c, w, h) => art.drawNear(c, w, h, z));
      }
      sprite('pp-sun', art.SUN.size, art.SUN.size, (c) => art.drawSun(c, art.SUN.size));
      sprite('pp-moon', art.MOON.size, art.MOON.size, (c) => art.drawMoon(c, art.MOON.size));
      art.CLOUDS.forEach((cl, k) =>
        sprite(`pp-cloud-${k}`, cl.w, cl.h, (c, w, h) => art.drawCloud(c, w, h, 5 + k)),
      );
      soft('pp-aurora', this.half, art.AURORA_H, art.drawAurora);
      sprite('pp-ceiling', this.half, art.CEILING_H, art.drawCeiling);
      soft(HAZE_KEY, 4, art.HAZE.h, art.drawHaze);
      for (let s = 1; s <= 3; s++)
        for (let look = 0; look < 2; look++) {
          const a = art.OBSTACLE_ART[s]![look]!;
          sprite(OBSTACLE_KEYS[s]![look]!, a.tw, a.th, (c) =>
            art.drawObstacle(c, s, look, a.tw, a.th),
          );
        }
      for (const kind of Object.values(PROP) as PropKind[]) {
        const a = art.PROP_ART[kind];
        sprite(propKey(kind), a.tw, a.th, (c) => art.drawProp(c, kind, a.tw, a.th));
      }
      sprite(LETTER_KEY, art.LETTER_ART.tw, art.LETTER_ART.th, (c) =>
        art.drawLetter(c, art.LETTER_ART.tw, art.LETTER_ART.th),
      );
      for (const kind of ['scarf', 'bell'] as const) {
        sprite(PICKUP_KEYS[kind], art.PICKUP_ART.tw, art.PICKUP_ART.th, (c) =>
          art.drawPickup(c, art.PICKUP_ART.tw, kind),
        );
        crisp(`pp-badge-${kind}`, 43, 43, (c) => art.drawBadge(c, 43, kind));
      }
      crisp('pp-badge-letter', 43, 43, (c) => art.drawBadge(c, 43, 'letter'));
      for (const pose of art.POSES)
        crisp(POSE_KEYS[pose], art.PEB.w, art.PEB.h, (c) => art.drawPebble(c, pose));
      crisp('pp-scarf', art.SCARF.w, art.SCARF.h, (c) => art.drawScarf(c));
      soft('pp-puff', 32, 32, (c) => art.drawPuff(c, 32));
      soft('pp-shadow', 128, 40, art.drawShadow);
      soft('pp-streak', 6, 120, art.drawStreak);
      crisp('pp-pause', PAUSE.w, PILL.h, (c) => art.drawPauseButton(c, PAUSE.w, PILL.h));
      crisp('pp-arrow', 90, 90, (c) => art.drawHintArrow(c, 90));
    }

    /** One backdrop per zone, as wide as the widest view: sky, its sun, clouds, aurora or cave ceiling, and
     * two rows of wrapping tiles on the horizon. */
    private buildBackdrop(): void {
      const full = this.half * 2;
      const x0 = VIEW.w / 2 - this.half;
      const tiles = Math.ceil(full / art.LAYER_W) + 1;
      const row = (key: string, h: number, sink: number) =>
        Array.from({ length: tiles }, () =>
          this.add.image(0, VIEW.horizon - h + sink, key).setOrigin(0),
        );
      /** two copies side by side from the middle, the right one mirrored, so they join without a seam */
      const mirrored = (key: string, y: number) =>
        [0, 1].map((k) =>
          canvasImage(this, VIEW.w / 2, y, key)
            .setOrigin(k ? 0 : 1, 0)
            .setFlipX(!!k),
        );
      for (let z = 0; z < 3; z++) {
        const box = this.add.container(0, 0).setDepth(-1000);
        box.add(
          this.add
            .image(x0, art.SKY_TOP, `pp-sky-${z}`)
            .setOrigin(0)
            .setDisplaySize(full, art.SKY_H),
        );
        let clouds: Img[] = [];
        let aurora: Img[] = [];
        if (z === 0) {
          box.add(canvasImage(this, art.SUN.x, art.SUN.y, 'pp-sun'));
          clouds = Array.from({ length: CLOUD_COUNT }, (_, k) =>
            canvasImage(
              this,
              x0 + ((k + this.rnd() * 0.6) / CLOUD_COUNT) * full,
              36 + this.rnd() * 110,
              `pp-cloud-${k % 2}`,
            ).setAlpha(0.85),
          );
          box.add(clouds);
        } else if (z === 1) {
          aurora = mirrored('pp-aurora', art.SKY_TOP + 16);
          box.add(aurora);
          box.add(canvasImage(this, art.MOON.x, art.MOON.y, 'pp-moon'));
        } else box.add(mirrored('pp-ceiling', art.SKY_TOP));
        const far = row(`pp-far-${z}`, art.FAR_H, 8);
        const near = row(`pp-near-${z}`, art.NEAR_H, 12);
        box.add(far);
        box.add(near);
        this.backdrops.push({ box, far, near, clouds, aurora });
      }
    }

    private buildPebble(): void {
      this.shadow = this.add.image(0, PEBBLE_Y, 'pp-shadow').setDepth(290);
      this.aura = this.add
        .image(0, 0, 'pp-puff')
        .setBlendMode('ADD')
        .setTint(colorNum(colors.gold))
        .setDepth(295)
        .setVisible(false);
      this.pebble = canvasImage(this, 0, PEBBLE_Y, 'pp-peb-slide').setOrigin(0.5, 1).setDepth(300);
      this.pebBase = this.pebble.scaleX * art.PEB_SCALE;
      this.pebble.setScale(this.pebBase);
      this.poseKey = 'pp-peb-slide';
      this.scarf = canvasImage(this, 0, 0, 'pp-scarf').setOrigin(0.5, 0.12).setDepth(301);
      this.scarfBase = this.scarf.scaleX * art.PEB_SCALE;
      this.scarf.setScale(this.scarfBase).setVisible(false);
      this.lostScarf = this.add.image(0, 0, 'pp-scarf').setDepth(660).setVisible(false);
    }

    private buildFx(): void {
      const bit = (key: string, depth: number, add = false): Bit => {
        const img = this.add.image(0, 0, key).setDepth(depth).setVisible(false);
        if (add) img.setBlendMode('ADD');
        return { img, on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1 };
      };
      this.spray = Array.from({ length: SPRAY }, () => bit('pp-puff', 299));
      this.sparks = Array.from({ length: SPARKS }, () => bit('pp-puff', 650, true));
      for (const b of this.sparks) b.img.setTint(colorNum(colors.yellow));
      this.streaks = Array.from({ length: STREAKS }, () => bit('pp-streak', 280, true));
      this.flakes = Array.from({ length: FLAKES }, () => ({
        img: this.add.image(0, 0, 'pp-puff').setDepth(450),
        x: 0,
        y: 0,
        d: 1,
      }));
      this.scatterSnow();
      // one label per kind of bonus, shown again each time it is earned
      const label = { hop: 'bonusHop', tuck: 'bonusTuck', close: 'bonusClose' } as const;
      this.pops = BONUSES.map((kind) => ({
        text: kit
          .text(this, 0, 0, strings.t(label[kind], { n: BONUS_POINTS }), {
            px: kind === 'close' ? 30 : 26,
            color: kind === 'close' ? colors.gold : colors.text,
            stroke: colors.ink,
            strokePx: 6,
          })
          .setOrigin(0.5)
          .setDepth(655)
          .setVisible(false),
        at: 0,
        y: 0,
      }));
    }

    private buildHud(): void {
      const pill = (
        w: number,
        label: string,
        icon: 'star' | 'trophy' | 'clock',
        accent: string,
        h: number = PILL.h,
      ) =>
        hudPill(this, 0, 0, { icon, accent, label, value: '0', width: w, height: h, depth: 500 });
      /** swaps a pill's stock icon for one of our badges (same size) */
      const badge = (p: HudPill, key: string) =>
        (p.container.list[1] as Img).setTexture(key).setScale(1 / texScale(this, key));
      const ink = colors.ink;
      const big = (y: number, px: number, color: string) =>
        kit
          .text(this, VIEW.w / 2, y, '', { px, color, stroke: ink, strokePx: Math.round(px / 6) })
          .setOrigin(0.5)
          .setDepth(600)
          .setVisible(false);
      const letters = pill(LETTERS.w, strings.letters, 'star', art.ACCENT);
      badge(letters, 'pp-badge-letter');
      const power = pill(POWER.w, strings.scarf, 'clock', colors.gold, POWER.h);
      power.set('');
      const powerIcon = badge(power, 'pp-badge-scarf');
      powerIcon.setScale(POWER.h / PILL.h / texScale(this, 'pp-badge-scarf'));
      power.container.setVisible(false);
      const arrows = [0, 90, 180, 270].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return canvasImage(
          this,
          HINT.x + Math.cos(a) * HINT.r,
          HINT.y + Math.sin(a) * HINT.r,
          'pp-arrow',
        )
          .setAngle(deg)
          .setDepth(590)
          .setAlpha(0.75);
      });
      const label = (x: number, y: number, text: string) =>
        kit
          .text(this, x, y, text, { px: 26, stroke: ink, strokePx: 6 })
          .setOrigin(0.5)
          .setDepth(600);
      this.hud = {
        score: pill(SCORE.w, strings.score, 'star', colors.gold),
        best: pill(BEST.w, strings.best, 'trophy', colors.orange, BEST.h),
        letters,
        power,
        powerIcon,
        pause: canvasImage(this, 0, PILL.y, 'pp-pause').setOrigin(0).setDepth(501),
        pauseText: kit
          .text(this, 0, PILL.y + (PILL.h - 6) / 2, strings.pause, { px: 26, color: ink })
          .setOrigin(0.5)
          .setDepth(502),
        count: big(236, 72, colors.text),
        banner: big(178, 56, colors.gold),
        sub: big(236, 30, colors.text),
        hint: kit
          .text(this, VIEW.w / 2, 330, '', { px: 28, stroke: ink, strokePx: 7, align: 'center' })
          .setOrigin(0.5)
          .setDepth(600),
        arrows,
        labels: [
          label(HINT.x + HINT.r, HINT.y + 66, strings.hintLane),
          label(HINT.x - HINT.r, HINT.y + 66, strings.hintLane),
          label(HINT.x + 76, HINT.y - HINT.r, strings.hintHop),
          label(HINT.x + 82, HINT.y + HINT.r, strings.hintTuck),
        ],
      };
      this.layoutHud();
    }

    /** Score, letters, best and the power-up sit at the view's top left, Pause at its top right. */
    private layoutHud(): void {
      const v = this.tk.layout.view;
      const h = this.hud;
      const x = Math.max(v.x, -HUD_REACH) + HUD_PAD;
      h.score.container.setPosition(x, PILL.y);
      h.letters.container.setPosition(x + SCORE.w + HUD_GAP, PILL.y);
      h.best.container.setPosition(x, BEST.y);
      h.power.container.setPosition(x + BEST.w + HUD_GAP, BEST.y);
      this.pauseX = Math.min(v.x + v.width, VIEW.w + HUD_REACH) - HUD_PAD - PAUSE.w;
      h.pause.setX(this.pauseX);
      h.pauseText.setX(this.pauseX + 104);
    }

    // ─── input ───
    private move(m: Move): void {
      const s = this.sim;
      if (!s || s.phase !== 'run' || this.clock < this.holdUntil) return;
      this.moves++;
      this.handle(s.input(m));
    }

    private onDrag(dx: number, dy: number): void {
      const d = this.drag;
      if (!d || d.fired || d.hud) return;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      // long enough, and clearly more one way than the other
      if (Math.max(ax, ay) < SWIPE_PX || Math.max(ax, ay) < 1.2 * Math.min(ax, ay)) return;
      d.fired = true;
      this.move(ax > ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'tuck' : 'hop');
    }

    /** A tap does nothing in play, except on the HUD Pause button. */
    private onTap(x: number, y: number): void {
      if (this.tk.attract || y >= HUD_BOTTOM) return;
      if (x < this.pauseX - 6 || x > this.pauseX + PAUSE.w + 6) return;
      this.tk.sfx.play('click');
      bump(this, this.hud.pauseText, 1.15, 160);
      void this.tk.ui.pauseMenu();
    }

    // ─── run lifecycle ───
    private newRun(): void {
      const tk = this.tk;
      const seed = `pebble-post:run:${tk.rng.main.nextUint32().toString(16)}`;
      this.sim = createRun(tk.rng.create(seed));
      tk.attract?.setView(this.sim);
      this.runs++;
      this.moves = 0;
      this.endAt = -1;
      this.ending = false;
      this.newBest = false;
      this.started = !!tk.attract;
      this.holdUntil = tk.attract ? 0 : this.clock + START_HOLD_MS;
      this.acc = 0;
      this.lastStep = tk.attract?.step ?? 0;
      this.goAt = tk.attract ? this.clock : -1;
      this.crashAt = -1;
      this.landAt = -Infinity;
      this.bannerAt = -Infinity;
      this.hudAt = -Infinity;
      this.drag = null;
      for (const b of this.spray) this.free(b);
      for (const b of this.sparks) this.free(b);
      for (const b of this.streaks) this.free(b);
      for (const p of this.pops) p.text.setVisible(false);
      this.setZone(zoneAt(this.sim.distance));
      const h = this.hud;
      for (const o of [h.best.container, h.pause, h.pauseText]) o.setVisible(!tk.attract);
      h.best.setLabel(strings.best);
      h.power.container.setVisible(false);
      h.banner.setVisible(false);
      h.sub.setVisible(false);
      h.count.setVisible(false);
      this.shown = { score: -1, best: -1, letters: -1, secs: -1, power: '' };
      this.showHint();
      this.updateHud(true);
      this.draw(0);
    }

    /** The controls hint, on the first run of a mount: during Ready and a few seconds after Go. */
    private showHint(): void {
      const h = this.hud;
      const s = this.sim;
      const on =
        !!s &&
        !this.tk.attract &&
        this.runs === 1 &&
        s.phase === 'run' &&
        this.moves < HINT_MOVES &&
        (!this.started || this.clock < this.goAt + HINT_MS);
      const p = this.tk.env.input.primary;
      const keys = p !== 'touch' && p !== 'pointer';
      h.hint.setVisible(on);
      for (const o of [...h.arrows, ...h.labels]) o.setVisible(on && !keys);
      if (!on) return;
      const text = keys
        ? strings.hintKeyboard
        : p === 'touch'
          ? strings.hintTouch
          : strings.hintPointer;
      if (h.hint.text !== text) h.hint.setText(text);
      h.hint.setY(keys ? HINT.y : 330);
    }

    /** The zone Pebble is in tints the drifting snow (and her spray). */
    private setZone(z: number): void {
      if (z === this.zone) return;
      this.zone = z;
      const tint = colorNum(art.ZONE_ART[z]!.flake);
      for (const f of this.flakes) f.img.setTint(tint);
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
      const holding = this.clock < this.holdUntil;
      if (holding) steps = 0;
      const count = this.hud.count;
      if (holding !== (count.visible && count.text === strings.ready))
        count.setText(strings.ready).setVisible(holding);
      if (!holding && !this.started) {
        this.started = true;
        this.goAt = this.clock;
        this.tk.run.begin();
        this.tk.sfx.play('coin', { volume: 0.6 });
        count.setText(strings.go).setVisible(true);
        bump(this, count, 1.3, 240);
      }
      for (let i = 0; i < Math.min(steps, MAX_STEPS); i++) this.handle(this.sim.step());
      const wait = this.tk.motion.reduced ? OVER_MS_CALM : OVER_MS;
      if (this.endAt >= 0 && !this.ending && this.clock >= this.endAt + wait) void this.gameOver();
      this.draw(dt);
    }

    private handle(events: readonly SimEvent[]): void {
      const tk = this.tk;
      for (const e of events) {
        switch (e.type) {
          case 'hop':
            tk.sfx.play('jump', { volume: 0.25 });
            this.puffs(6);
            break;
          case 'land':
            this.landAt = this.clock;
            this.puffs(5);
            break;
          case 'letter':
            tk.sfx.play('coin', { volume: 0.2, detuneCents: (this.sim.letters % 4) * 100 });
            this.hud.letters.bump();
            this.sparkle(this.pebX(), PEBBLE_Y - 150 - this.sim.y * PEBBLE_SCALE);
            break;
          case 'bonus':
            this.onBonus(e.kind);
            break;
          case 'power':
            this.onPower(e.kind);
            break;
          case 'power-end':
            tk.sfx.play('click', { volume: 0.6, detuneCents: -500 });
            break;
          case 'scarf-save':
            this.onScarfSave();
            break;
          case 'crash':
            this.onCrash();
            break;
          case 'zone':
            this.onZone(e.zone);
            break;
          case 'over':
            tk.sfx.play('lose');
            this.endAt = this.clock;
            this.recordRun();
            break;
          default:
            break;
        }
      }
    }

    private pebX(): number {
      return this.road.pebble.roadX + (this.sim.x - 1) * LANE_W * PEBBLE_SCALE;
    }

    /** A bonus label floats up from above Pebble's head; a close call sits higher and rings. */
    private onBonus(kind: BonusKind): void {
      const p = this.pops[BONUSES.indexOf(kind)]!;
      const close = kind === 'close';
      p.at = this.clock;
      p.y = PEBBLE_Y - (close ? 250 : 205) - this.sim.y * PEBBLE_SCALE;
      p.text.setPosition(this.pebX(), p.y).setVisible(true);
      if (close) this.tk.sfx.play('coin', { volume: 0.35, detuneCents: 1200 });
      else this.tk.sfx.play('click', { volume: 0.5, detuneCents: 500 });
      this.hud.score.bump();
    }

    private onPower(kind: PowerKind): void {
      const x = this.pebX();
      this.tk.sfx.play('power');
      flash(this, kind === 'bell' ? colors.gold : art.ACCENT, 220, 0.2);
      burst(this, x, PEBBLE_Y - 80, {
        shape: 'star',
        colors: kind === 'bell' ? [colors.gold, colors.yellow, '#FFFFFF'] : [art.ACCENT, '#FFFFFF'],
        count: 14,
        distance: 130,
        depth: 650,
      });
      popText(this, x, PEBBLE_Y - 190, kind === 'bell' ? strings.bellGot : strings.scarfGot, {
        color: kind === 'bell' ? colors.gold : colors.text,
        px: 34,
        rise: 50,
      });
    }

    private onScarfSave(): void {
      const x = this.pebX();
      const tk = this.tk;
      tk.sfx.play('hit', { volume: 0.7 });
      tk.sfx.play('power', { volume: 0.5, detuneCents: -700 });
      shake(this, 180, 0.008);
      flash(this, '#FFFFFF', 200, 0.35);
      // the obstacle shatters into ice, and the scarf flies off over her shoulder
      burst(this, x, PEBBLE_Y - 70, {
        shape: 'square',
        colors: ['#FFFFFF', '#BDEBFF', '#7FC4EE'],
        count: 22,
        distance: 230,
        size: 22,
        lifeMs: 750,
        depth: 650,
      });
      const s = this.scarf;
      const dir = this.sim.x > 1 ? -1 : 1;
      const lost = this.lostScarf;
      this.tweens.killTweensOf(lost);
      lost
        .setPosition(s.x, s.y + 20)
        .setScale(this.scarfBase * 1.2)
        .setAngle(0)
        .setAlpha(1)
        .setVisible(true);
      this.tweens.add({
        targets: lost,
        x: s.x + (this.tk.motion.reduced ? 0 : dir * 190),
        y: s.y - (this.tk.motion.reduced ? 0 : 230),
        angle: this.tk.motion.reduced ? 0 : dir * 220,
        scale: this.scarfBase * 0.7,
        alpha: 0,
        duration: 900,
        ease: 'Cubic.easeOut',
        onComplete: () => lost.setVisible(false),
      });
      burst(this, s.x, s.y + 10, {
        shape: 'square',
        colors: [art.ACCENT, '#FFF6EA'],
        count: 10,
        distance: 120,
        size: 14,
        gravity: 80,
        depth: 651,
      });
      popText(this, x, PEBBLE_Y - 220, strings.scarfSaved, {
        color: colors.text,
        px: 36,
        rise: 50,
        ms: 1100,
      });
    }

    private onCrash(): void {
      const x = this.pebX();
      this.crashAt = this.clock;
      this.tk.sfx.play('hit');
      shake(this, 300, 0.012);
      flash(this, colors.vermillion, 220, 0.25);
      burst(this, x, PEBBLE_Y - 110, {
        shape: 'star',
        colors: [colors.yellow, '#FFFFFF', colors.orange],
        count: 16,
        distance: 170,
        size: 20,
        depth: 650,
      });
      this.puffs(12);
    }

    private onZone(zone: number): void {
      this.tk.sfx.play('win', { volume: 0.45 });
      const h = this.hud;
      h.banner.setText(zoneName(zone)).setVisible(true).setAlpha(1);
      const metres = formatScore(this.sim.distance, 'integer', this.tk.env.locale);
      h.sub
        .setText(strings.t('zoneSub', { n: metres }))
        .setVisible(true)
        .setAlpha(1);
      bump(this, h.banner, 1.25, 260);
      burst(this, VIEW.w / 2, 178, { shape: 'star', count: 14, distance: 170, depth: 650 });
      this.bannerAt = this.clock;
      this.setZone(zone);
    }

    /** Saved when the run ends, not when the dialog opens: a Restart from the pause menu in between would lose it. */
    private recordRun(): void {
      const s = this.sim;
      if (this.tk.attract) return;
      this.stats = withRun(this.stats, {
        score: s.score,
        distance: s.distance,
        letters: s.letters,
      });
      this.statsSave.set(this.stats);
      this.best = Math.max(this.best, s.score);
    }

    private async gameOver(): Promise<void> {
      this.ending = true;
      const tk = this.tk;
      const s = this.sim;
      const score = s.score;
      await tk.ui.gameOver({
        title: s.letters === 1 ? strings.overOne : strings.t('over', { n: s.letters }),
        scores: score >= 1 ? [{ board: 'score', value: score }] : [],
        meta: { v: 1, distance: s.distance, letters: s.letters, zone: s.zoneIndex % 3 },
      });
      if (!tk.signal.aborted) this.newRun();
    }

    // ─── drawing ───
    private draw(dt: number): void {
      const s = this.sim;
      const calm = this.tk.motion.reduced;
      const sp = s.speed / TOP_SPEED;
      const v = this.tk.layout.view;
      this.drawBackdrop(dt, sp, calm);
      this.road.draw(s, this.clock, v.x, v.x + v.width);
      this.drawPebble(dt, calm);
      this.stepBits(this.spray, dt, 0.8);
      this.stepBits(this.sparks, dt, 1);
      this.drawStreaks(dt, s.speed, calm);
      this.drawSnow(dt, sp, calm);
      this.drawPops(calm);
      this.updateHud(false);
      const h = this.hud;
      if (h.count.visible && h.count.text === strings.go && this.clock > this.goAt + GO_MS)
        h.count.setVisible(false);
      if (h.banner.visible) {
        const k = (this.clock - this.bannerAt) / BANNER_MS;
        const a = k < 0.75 ? 1 : Math.max(0, (1 - k) / 0.25);
        h.banner.setAlpha(a);
        h.sub.setAlpha(a);
        if (k >= 1) {
          h.banner.setVisible(false);
          h.sub.setVisible(false);
        }
      }
      if (
        h.hint.visible &&
        (this.moves >= HINT_MOVES || (this.started && this.clock >= this.goAt + HINT_MS))
      )
        this.showHint();
    }

    /** Lays a row of wrapping tiles from the backdrop's left edge, shifted by `drift`. */
    private tile(row: Img[], drift: number): void {
      const w = art.LAYER_W;
      const x = VIEW.w / 2 - this.half - (((drift % w) + w) % w);
      for (let k = 0; k < row.length; k++) row[k]!.setX(x + k * w);
    }

    private drawBackdrop(dt: number, sp: number, calm: boolean): void {
      // the ridges drift against the bend ahead, the nearer one faster
      this.farX += curveAt(this.sim.z + 40) * sp * dt * LAYER_SPEED;
      const mix = skyMix(this.mix, this.sim.z);
      const fading = mix.from !== mix.to;
      const k = mix.k * mix.k * (3 - 2 * mix.k);
      for (let z = 0; z < this.backdrops.length; z++) {
        const b = this.backdrops[z]!;
        const on = z === mix.from || z === mix.to;
        if (b.box.visible !== on) b.box.setVisible(on);
        if (!on) continue;
        // the next zone's sky fades in over this one's
        const over = fading && z === mix.to;
        b.box.setAlpha(over ? k : 1).setDepth(over ? -990 : -1000);
        this.tile(b.far, this.farX * FAR_DRIFT);
        this.tile(b.near, this.farX);
        if (calm) continue;
        const edge = VIEW.w / 2 + this.half + 130;
        for (const c of b.clouds) {
          c.x += (CLOUD_SPEED * dt) / 1000;
          if (c.x > edge) c.x -= this.half * 2 + 260;
        }
        for (let i = 0; i < b.aurora.length; i++)
          b.aurora[i]!.setAlpha(0.8 + 0.2 * Math.sin(this.clock / 900 + i * 2));
      }
    }

    private drawPebble(dt: number, calm: boolean): void {
      const s = this.sim;
      const t = this.clock;
      let x = this.pebX();
      let y = PEBBLE_Y - s.y * PEBBLE_SCALE;
      let pose: art.Pose;
      let flip = false;
      let lean = 0;
      // stretch while rising or falling fast, squash for a moment on landing
      let sx = 1;
      let sy = 1;
      if (s.phase !== 'run') {
        // tumble: a bounce while flipping side to side, then lie still
        pose = 'tumble';
        const k = Math.min(1, (t - this.crashAt) / TUMBLE_MS);
        if (!calm) {
          y -= Math.abs(Math.sin(k * Math.PI * 2)) * 70 * (1 - k);
          x += Math.sin(k * Math.PI * 3) * 14 * (1 - k);
          lean = Math.sin(k * Math.PI * 4) * 0.25 * (1 - k);
          flip = k < 0.8 && Math.floor(t / 110) % 2 === 1;
        }
      } else {
        if (s.tucked) pose = 'tuck';
        else if (s.airborne) pose = 'hop';
        else if (s.laneT < 1) pose = 'lean';
        else pose = 'slide';
        if (s.laneT < 1) {
          flip = s.x > s.lane;
          if (!calm) lean = (flip ? -1 : 1) * 0.08 * Math.sin(Math.PI * s.laneT);
        }
        if (!calm && s.airborne) {
          const v = Math.min(1, Math.abs(s.vy) / HOP_V);
          sx = 1 - 0.06 * v;
          sy = 1 + 0.1 * v;
        } else if (!calm && t < this.landAt + LAND_MS) {
          const k = 1 - (t - this.landAt) / LAND_MS;
          sx = 1 + 0.1 * k;
          sy = 1 - 0.14 * k;
        }
      }
      const key = POSE_KEYS[pose];
      if (key !== this.poseKey) {
        this.poseKey = key;
        this.pebble.setTexture(key);
      }
      // a little wobble as she slides
      const wob = calm || pose !== 'slide' ? 0 : Math.sin(t / 70) * 1.6;
      const ghost = s.ghostMs > 0 && Math.floor(t / 90) % 2 === 0;
      this.pebble
        .setPosition(x, y + wob)
        .setFlipX(pose === 'lean' && flip)
        .setRotation(lean)
        .setScale(this.pebBase * sx, this.pebBase * sy)
        .setAlpha(ghost ? (calm ? 0.6 : 0.35) : 1);
      if (pose === 'tumble') this.pebble.setFlipX(flip);
      const lift = Math.min(1, s.y / 2);
      this.shadow
        .setPosition(x, PEBBLE_Y + 4)
        .setDisplaySize(130 * (1 - lift * 0.4), 34 * (1 - lift * 0.4))
        .setAlpha(1 - lift * 0.5);
      // the scarf at her neck, its ends fluttering
      const scarfOn = s.power === 'scarf' && s.phase === 'run';
      this.scarf.setVisible(scarfOn);
      if (scarfOn) {
        const neck = art.NECK[pose];
        const sc = art.PEB_SCALE;
        const flipped = pose === 'lean' && flip;
        this.scarf
          .setPosition(
            x + (neck.x - art.PEB.w / 2) * sc * (flipped ? -1 : 1),
            y + wob - (art.PEB.h - neck.y) * sc * sy,
          )
          .setFlipX(flipped)
          .setScale(this.scarfBase, this.scarfBase * (calm ? 1 : 1 + Math.sin(t / 60) * 0.06))
          .setAlpha(this.pebble.alpha);
      }
      // the mail bell's golden glow
      const bell = s.power === 'bell' && s.phase === 'run';
      this.aura.setVisible(bell);
      if (bell) {
        const left = s.powerMs / POWER_MS.bell;
        const pulse = calm ? 0.5 : 0.45 + Math.sin(t / 120) * 0.15;
        this.aura
          .setPosition(x, y - 70)
          .setDisplaySize(260, 260)
          .setAlpha(pulse * (left < 0.25 && Math.floor(t / 150) % 2 ? 0.4 : 1));
      }
      // snow spray from her belly while she slides on the ice
      this.sprayAt -= dt;
      if (s.phase === 'run' && !s.airborne && this.sprayAt <= 0) {
        this.sprayAt = calm ? 90 : 35;
        this.emitSpray(x, -1, calm);
        this.emitSpray(x, 1, calm);
      }
    }

    private take(pool: Bit[]): Bit | null {
      for (const b of pool) if (!b.on) return b;
      return null;
    }

    private free(b: Bit): void {
      b.on = false;
      b.img.setVisible(false);
    }

    private emitSpray(x: number, side: number, calm: boolean): void {
      const b = this.take(this.spray);
      if (!b) return;
      b.on = true;
      b.x = x + side * (36 + this.rnd() * 10);
      b.y = PEBBLE_Y - 6;
      b.vx = side * (60 + this.rnd() * 90);
      b.vy = 40 + this.rnd() * 60;
      b.age = 0;
      b.life = calm ? 300 : 420;
      b.size = 18 + this.rnd() * 14;
      b.img.setTint(colorNum(art.ZONE_ART[this.zone]!.spray)).setVisible(true);
    }

    /** A puff of snow around Pebble's belly (hops, landings, crashes). */
    private puffs(n: number): void {
      const x = this.pebX();
      for (let i = 0; i < n; i++) {
        const b = this.take(this.spray);
        if (!b) return;
        const a = Math.PI + this.rnd() * Math.PI;
        b.on = true;
        b.x = x + Math.cos(a) * 30;
        b.y = PEBBLE_Y - 4;
        b.vx = Math.cos(a) * (80 + this.rnd() * 80);
        b.vy = Math.sin(a) * (40 + this.rnd() * 60);
        b.age = 0;
        b.life = 380;
        b.size = 22 + this.rnd() * 16;
        b.img.setTint(colorNum(art.ZONE_ART[this.zone]!.spray)).setVisible(true);
      }
    }

    /** A few gold sparks where a letter was picked up. */
    private sparkle(x: number, y: number): void {
      for (let i = 0; i < (this.tk.motion.reduced ? 1 : 3); i++) {
        const b = this.take(this.sparks);
        if (!b) return;
        const a = -Math.PI / 2 + (this.rnd() - 0.5) * 2.4;
        b.on = true;
        b.x = x;
        b.y = y;
        b.vx = Math.cos(a) * (90 + this.rnd() * 80);
        b.vy = Math.sin(a) * (90 + this.rnd() * 80);
        b.age = 0;
        b.life = 320;
        b.size = 12 + this.rnd() * 8;
        b.img.setVisible(true);
      }
    }

    /** Moves a pool of puffs or sparks: each drifts, grows and fades out. */
    private stepBits(pool: Bit[], dt: number, alpha: number): void {
      for (const b of pool) {
        if (!b.on) continue;
        b.age += dt;
        if (b.age >= b.life) {
          this.free(b);
          continue;
        }
        const k = b.age / b.life;
        b.x += (b.vx * dt) / 1000;
        b.y += (b.vy * dt) / 1000;
        const size = b.size * (1 + k);
        b.img
          .setPosition(b.x, b.y)
          .setDisplaySize(size, size)
          .setAlpha(alpha * (1 - k));
      }
    }

    private drawStreaks(dt: number, speed: number, calm: boolean): void {
      const s = this.sim;
      const fast = (speed - 24) / (TOP_SPEED - 24);
      if (!calm && s.phase === 'run' && fast > 0 && this.rnd() < fast * 0.5) {
        const b = this.take(this.streaks);
        if (b) {
          // anywhere around the vanishing point except straight down onto Pebble; a streak keeps its direction
          // in (x, y) and its starting distance from the vanishing point in vx
          let a = this.rnd() * Math.PI * 2;
          if (Math.abs(a - Math.PI / 2) < 0.7) a += Math.PI;
          b.on = true;
          b.x = Math.cos(a);
          b.y = Math.sin(a);
          b.vx = 120 + this.rnd() * 120;
          b.age = 0;
          b.life = 380;
          b.size = 70 + this.rnd() * 90;
          b.img.setRotation(a + Math.PI / 2).setVisible(true);
        }
      }
      for (const b of this.streaks) {
        if (!b.on) continue;
        b.age += dt;
        if (b.age >= b.life || calm) {
          this.free(b);
          continue;
        }
        const k = b.age / b.life;
        const r = b.vx + k * 800;
        b.img
          .setPosition(VANISH.x + b.x * r, VANISH.y + b.y * r)
          .setDisplaySize(4, b.size * (0.6 + k))
          .setAlpha(Math.sin(k * Math.PI) * 0.45);
      }
    }

    /** Puts a snowflake somewhere new in the view. */
    private dropFlake(f: Flake, anywhere: boolean): void {
      const v = this.tk.layout.view;
      f.d = 0.4 + this.rnd() * 0.6;
      f.x = v.x + this.rnd() * v.width;
      f.y = anywhere ? this.rnd() * VIEW.h : -20 + this.rnd() * VIEW.h * 0.7;
      const size = 4 + 9 * f.d;
      f.img
        .setPosition(f.x, f.y)
        .setDisplaySize(size, size)
        .setAlpha(0.3 + 0.5 * f.d);
    }

    private scatterSnow(): void {
      for (const f of this.flakes) this.dropFlake(f, true);
    }

    /** Snow drifts down on the wind and streams past faster the faster Pebble slides. */
    private drawSnow(dt: number, sp: number, calm: boolean): void {
      const show = !calm;
      if (this.flakes[0]!.img.visible !== show) for (const f of this.flakes) f.img.setVisible(show);
      if (!show) return;
      const v = this.tk.layout.view;
      const left = v.x - 20;
      const right = v.x + v.width + 20;
      const k = dt / 1000;
      const rush = SNOW.rush * sp;
      for (const f of this.flakes) {
        f.x += (SNOW.wind + (f.x - VANISH.x) * rush) * f.d * k;
        f.y += (SNOW.fall + (f.y - VANISH.y) * rush) * f.d * k;
        if (f.y > VIEW.h + 20 || f.y < -30 || f.x < left || f.x > right) this.dropFlake(f, false);
        else f.img.setPosition(f.x, f.y);
      }
    }

    private drawPops(calm: boolean): void {
      for (const p of this.pops) {
        if (!p.text.visible) continue;
        const k = (this.clock - p.at) / POP_MS;
        if (k >= 1) {
          p.text.setVisible(false);
          continue;
        }
        p.text
          .setY(p.y - (calm ? 0 : 44 * k))
          .setAlpha(k < 0.6 ? 1 : (1 - k) / 0.4)
          .setScale(calm || k > 0.15 ? 1 : 0.6 + (0.4 * k) / 0.15);
      }
    }

    private updateHud(force: boolean): void {
      const s = this.sim;
      const h = this.hud;
      const sh = this.shown;
      const locale = this.tk.env.locale;
      // the power-up pill: which one, and whole seconds left
      const power = s.phase === 'run' ? (s.power ?? '') : '';
      if (power !== sh.power) {
        sh.power = power;
        sh.secs = -1;
        h.power.container.setVisible(!!power && !this.tk.attract);
        if (power) {
          const key = `pp-badge-${power}`;
          h.powerIcon.setTexture(key);
          h.power.setLabel(power === 'bell' ? strings.bell : strings.scarf);
          bump(this, h.power.container, 1.12, 220);
        }
      }
      if (power) {
        const secs = Math.ceil(s.powerMs / 1000);
        if (secs !== sh.secs) {
          sh.secs = secs;
          h.power.set(strings.t('secs', { n: secs }));
        }
      }
      if (s.letters !== sh.letters) {
        sh.letters = s.letters;
        h.letters.set(formatScore(s.letters, 'integer', locale));
      }
      if (!force && this.clock < this.hudAt + HUD_MS) return;
      this.hudAt = this.clock;
      const score = s.score;
      if (score !== sh.score) {
        sh.score = score;
        h.score.set(formatScore(score, 'integer', locale));
        if (!this.tk.attract && !this.newBest && this.best > 0 && score > this.best) {
          this.newBest = true;
          h.best.setLabel(strings.newBest);
          const at = h.best.container;
          popText(this, at.x + BEST.w / 2, at.y + BEST.h + 24, strings.newBestPop, {
            color: colors.gold,
            px: 26,
          });
          burst(this, at.x + BEST.w / 2, at.y + BEST.h / 2, {
            shape: 'star',
            count: 12,
            distance: 90,
            depth: 700,
          });
        }
      }
      const best = Math.max(this.best, this.newBest ? score : 0);
      if (best !== sh.best) {
        sh.best = best;
        h.best.set(formatScore(best, 'integer', locale));
      }
    }
  }

  return [Slide];
};
