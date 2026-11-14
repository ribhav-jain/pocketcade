// The Sunset Sprint scene: a sunset sky with parallax layers, the pseudo-3D road (road.ts), Miso's car, effects and
// the HUD. The rules live in sim.ts; this file maps keys and held pointers to steering and braking, steps the sim
// at 60 Hz and draws. All art is drawn once per mount (art.ts); per frame only positions, scales, alphas and
// texture frames of existing images change, and HUD text changes only when its value does.
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
  type HudPill,
  type SceneFactory,
} from '@pocketcade/toolkit/phaser';
import * as art from './art.ts';
import { CAR_KEYS, MARGIN, PROP_KEYS, WARM_ROCK, createRoadView, type RoadView } from './road.ts';
import { freshStats, isStatsV1, withRun, type StatsV1 } from './save.ts';
import { MAX_SPEED, STEP_MS, WOBBLE_MS, createRun, type Run, type SimEvent } from './sim.ts';
import { stageName, strings } from './strings.ts';
import {
  PROP,
  VIEW,
  createTrack,
  curveAt,
  heightAt,
  themeBlend,
  themeOfStage,
  type PropKind,
  type ThemeBlend,
  type Track,
} from './track.ts';

const DBGZ: number = 40 + 1900 + 6000 - 200; const DBGHIT: boolean = false; /*DBG*/
const MAX_STEPS = 6;
/** the run-over moment before the dialog */
const OVER_MS = 900;
const OVER_MS_CALM = 400;
/** after a resume the race waits this long ("Ready…" is the countdown text) */
const RESUME_HOLD_MS = 700;
const BANNER_MS = 1800;
const GO_MS = 700;
/** the controls hint on the first run of a mount: shown until this long after Go */
const HINT_MS = 4500;
const HUD_MS = 100;
/** the HUD row hangs from the top of the view; pointers above this line (measured from the view's top) don't steer */
const HUD_BOTTOM = 92;
const HUD_PAD = 12;
const PILL = { y: 12, h: 60 } as const;
const DIST_W = 196;
const BEST_W = 172;
const TIMER = { y: 6, w: 168, h: 84 } as const;
const SPEED_W = 200;
const PAUSE_W = 164;
/** the bottom-middle brake zone for touch and mouse */
const BRAKE_ZONE = { y: 540, hw: 160 } as const;
/** Miso's car: its tyres stand on this line */
const CAR_Y = 712;
/** the body rolls about a point this high above the road */
const AXLE = 24;
/** body roll at full lock (radians) and how fast the lean follows the steering (per second) */
const ROLL = 0.07;
const LEAN_RATE = 6.5;
/** the suspension spring: stiffness and damping */
const SPRING = 420;
const DAMP = 22;
const HAPPY_MS = 1400;
const DUST = 48;
const STREAKS = 14;
const VANISH = { x: VIEW.w / 2, y: VIEW.horizon } as const;
/** parallax drift per unit of curve at top speed (design units per ms) */
const LAYER_SPEED = { far: 0.015, near: 0.04 } as const;
const SMOKE = ['#F4F1FF', '#D8D2EC', '#FFFFFF'] as const;
const keys = (name: string, n: number): readonly string[] =>
  Array.from({ length: n }, (_, k) => `ss-${name}-${k}`);
const BODY_KEYS = keys('body', art.LEAN_STEPS * 2 + 1);
const TYRE_KEYS = keys('tyre', art.TYRE.frames);
const SCARF_KEYS = keys('scarf', art.SCARF.frames);
const HEAD_KEYS: Record<art.HeadPose, string> = {
  back: 'ss-head-back',
  happy: 'ss-head-happy',
  dizzy: 'ss-head-dizzy',
  sad: 'ss-head-sad',
};

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
  /** sparks fall and shrink; dust and smoke drift and grow */
  spark: boolean;
}
interface Backdrop {
  sky: Img;
  far: Img[];
  near: Img[];
}

export const createScenes: SceneFactory = (_P, kit) => {
  class Sprint extends kit.Scene {
    private sim!: Run;
    private track!: Track;
    private road!: RoadView;
    private stats: StatsV1 = freshStats();
    private statsSave!: Save<StatsV1>;
    /** saved best or the board's top distance, whichever is higher */
    private best = 0;
    private newBest = false;
    /** scene ms: frame time in play, the attract step clock in attract */
    private clock = 0;
    private acc = 0;
    private lastStep = 0;
    private holdUntil = 0;
    /** clock when the run ended, else -1 */
    private endAt = -1;
    private ending = false;
    private runs = 0;
    private goAt = -1;
    private bannerAt = -Infinity;
    private hudAt = -Infinity;
    private rnd = prng(0x5a7e);
    // input
    private mouseDown = false;
    private steer = 0;
    private brake = false;
    // the backdrop: one per theme; `scenery` is the pair now showing (from * 3 + to), −1 before the first frame
    private backdrops: Backdrop[] = [];
    private blend: ThemeBlend = { from: 0, to: 0, k: 0 };
    private scenery = -1;
    private sceneryK = -1;
    private farX = 0;
    private nearX = 0;
    /** scenery reaches this far past the design area: the widest and tallest views plus a shake margin */
    private padX = 0;
    private padY = 0;
    // Miso's car: the tyres and shadow stay on the road; everything in `body` rolls and bounces together
    private shadow!: Img;
    private tyres: Img[] = [];
    private body!: Phaser.GameObjects.Container;
    private bodyImg!: Img;
    private brakeImg!: Img;
    private tail!: Img;
    private scarf!: Img;
    private paw!: Img;
    private head!: Img;
    private stars: Img[] = [];
    /** steering lean −1..1 (eased) and the body frame it picks */
    private lean = 0;
    private frame = 0;
    private headKey = '';
    /** tyre and scarf animation phases (in frames), and the frames showing */
    private spin = 0;
    private flap = 0;
    private tyreFrame = 0;
    private scarfFrame = 0;
    /** suspension: the body's height above rest and its speed (design units, per second) */
    private lift = 0;
    private liftV = 0;
    /** nose-down pitch under braking, 0..1 */
    private pitch = 0;
    private happyUntil = 0;
    private dizzyUntil = 0;
    // effects
    private dust: Bit[] = [];
    private streaks: Bit[] = [];
    private dustSide = 0;
    /** HUD layout (set by layoutHud): its scale, the lines under it and under Pause, and two corners */
    private hudK = 1;
    private hudBottom = 0;
    private pauseBottom = 0;
    private pauseX = 0;
    private bestX = 0;
    private bestY = 0;
    private scarfScale = 1;
    private hud!: {
      dist: HudPill;
      best: HudPill;
      speed: HudPill;
      timerBox: Phaser.GameObjects.Container;
      time: Txt;
      pauseBox: Phaser.GameObjects.Container;
      pauseText: Txt;
      count: Txt;
      stage: Txt;
      banner: Txt;
      sub: Txt;
      hint: Txt;
      hintBrake: Txt;
      arrows: Img[];
      zone: Phaser.GameObjects.Graphics;
    };
    private shown = { secs: -1, low: false, speed: -1, dist: -1, best: -1 };

    constructor() {
      super('sprint');
    }

    create(): void {
      const tk = this.tk;
      this.track = createTrack();
      this.padX = tk.layout.bleed.x + MARGIN;
      this.padY = tk.layout.bleed.y + MARGIN;
      this.makeTextures();
      this.buildBackdrop();
      this.road = createRoadView(this, tk.layout.bleed);
      this.buildCar();
      this.buildFx();
      this.buildHud();
      this.layoutHud();
      tk.on('resize', () => this.layoutHud());
      tk.input.configure({
        // held, not pressed: `repeat` lets the browser's auto-repeat restore a key still held after a blur or pause
        actions: {
          left: { codes: ['ArrowLeft', 'KeyA'], repeat: true },
          right: { codes: ['ArrowRight', 'KeyD'], repeat: true },
          brake: { codes: ['ArrowDown', 'KeyS'], repeat: true },
        },
      });
      this.bindPointer();
      tk.on('pause', () => {
        this.mouseDown = false;
      });
      tk.on('resume', () => {
        if (this.sim?.phase === 'racing' && !tk.attract)
          this.holdUntil = this.clock + RESUME_HOLD_MS;
      });
      tk.on('inputchange', () => this.showHint());
      tk.ui.onRestart(() => {
        // time's up and the car is rolling to a stop: that run counts
        if (this.sim?.phase === 'stopping') this.recordRun();
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
      void Promise.all([this.statsSave.load(), tk.host.scores.top('distance', 1).catch(() => [])])
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
      /** Roadside and traffic sprites: drawn `zoom` × their drawing size, the largest they are shown. */
      const sprite = (
        key: string,
        w: number,
        h: number,
        zoom: number,
        draw: (ctx: CanvasRenderingContext2D) => void,
      ) =>
        crisp(key, w * zoom, h * zoom, (c) => {
          c.scale(zoom, zoom);
          draw(c);
        });
      const { padX, padY } = this;
      for (const t of [0, 1, 2] as const) {
        canvasTexture(
          this,
          `ss-sky-${t}`,
          art.SKY.w + padX * 2,
          art.SKY.h + padY,
          (c) => art.drawSky(c, t, padX, padY),
          { scale: 0.5 },
        );
        canvasTexture(
          this,
          `ss-far-${t}`,
          art.LAYER_W,
          art.FAR.h,
          (c, w, h) => art.drawFar(c, w, h, t),
          { scale: 1 },
        );
        canvasTexture(
          this,
          `ss-near-${t}`,
          art.LAYER_W,
          art.NEAR.h,
          (c, w, h) => art.drawNear(c, w, h, t),
          { scale: Math.min(1.5, kit.renderScale) },
        );
      }
      for (const kind of Object.values(PROP) as PropKind[]) {
        const a = art.PROP_ART[kind];
        sprite(PROP_KEYS[kind]!, a.tw, a.th, a.show / a.tw, (c) =>
          art.drawProp(c, kind, a.tw, a.th),
        );
      }
      const rock = art.PROP_ART[PROP.rock];
      sprite(WARM_ROCK, rock.tw, rock.th, rock.show / rock.tw, (c) =>
        art.drawRock(c, rock.tw, rock.th, true),
      );
      CAR_KEYS.forEach((key, k) =>
        sprite(key, art.CAR_TEX.w, art.CAR_TEX.h, art.CAR_TEX.show / art.CAR_TEX.w, (c) =>
          art.drawTraffic(c, k, art.CAR_TEX.w, art.CAR_TEX.h),
        ),
      );
      BODY_KEYS.forEach((key, k) =>
        crisp(key, art.BODY.w, art.BODY.h, (c) => art.drawMisoBody(c, k - art.LEAN_STEPS)),
      );
      TYRE_KEYS.forEach((key, k) => crisp(key, art.TYRE.w, art.TYRE.h, (c) => art.drawTyre(c, k)));
      SCARF_KEYS.forEach((key, k) =>
        crisp(key, art.SCARF.w, art.SCARF.h, (c) => art.drawScarfEnds(c, k)),
      );
      for (const pose of art.HEADS)
        crisp(HEAD_KEYS[pose], art.HEAD.w, art.HEAD.h, (c) => art.drawHead(c, pose));
      crisp('ss-brake', art.BRAKE.w, art.BRAKE.h, (c) => art.drawBrakeGlow(c));
      crisp('ss-tail', art.TAIL.w, art.TAIL.h, (c) => art.drawTail(c));
      crisp('ss-paw', art.PAW.w, art.PAW.h, (c) => art.drawPaw(c));
      crisp('ss-star', art.STAR, art.STAR, (c) => art.drawStar(c));
      canvasTexture(this, 'ss-shadow', art.SHADOW.w, art.SHADOW.h, (c) => art.drawCarShadow(c), {
        scale: 1,
      });
      canvasTexture(
        this,
        'ss-arch',
        art.ARCH.tw,
        art.ARCH.th,
        (c, w, h) => art.drawArch(c, w, h, strings.arch),
        { scale: Math.min(1.5, kit.renderScale) },
      );
      canvasTexture(this, 'ss-puff', 32, 32, (c) => art.drawPuff(c, 32), { scale: 1 });
      crisp('ss-streak', 6, 120, (c) => art.drawStreak(c, 6, 120));
      crisp('ss-pause', PAUSE_W, PILL.h, (c) => art.drawPauseButton(c, PAUSE_W, PILL.h));
      crisp('ss-timer', TIMER.w, TIMER.h, (c) => art.drawTimer(c, TIMER.w, TIMER.h));
      crisp('ss-arrow', 90, 90, (c) => art.drawHintArrow(c, 90));
    }

    private buildBackdrop(): void {
      for (const t of [0, 1, 2] as const) {
        const sky = canvasImage(this, -this.padX, -this.padY, `ss-sky-${t}`)
          .setOrigin(0)
          .setVisible(false);
        const layer = (key: string) =>
          [0, 1].map(() => canvasImage(this, 0, 0, key).setOrigin(0).setVisible(false));
        this.backdrops.push({ sky, far: layer(`ss-far-${t}`), near: layer(`ss-near-${t}`) });
      }
    }

    private buildCar(): void {
      const part = (key: string, x: number, y: number, ox: number, oy: number) =>
        canvasImage(this, x, y + AXLE, key).setOrigin(ox, oy);
      this.shadow = canvasImage(this, VIEW.w / 2, CAR_Y - 5, 'ss-shadow').setDepth(296);
      this.tyres = [0, 1].map(() =>
        canvasImage(this, 0, CAR_Y, TYRE_KEYS[0]!).setOrigin(0.5, 1).setDepth(297),
      );
      this.bodyImg = part(BODY_KEYS[art.LEAN_STEPS]!, 0, 0, art.BODY.ox / art.BODY.w, 1);
      this.brakeImg = part('ss-brake', 0, art.BRAKE.y, 0.5, 0.5).setVisible(false);
      const tl = art.TAIL;
      this.tail = part('ss-tail', tl.x, tl.y, tl.ox / tl.w, tl.oy / tl.h);
      const sc = art.SCARF;
      this.scarf = part(SCARF_KEYS[0]!, 0, 0, sc.ox / sc.w, sc.oy / sc.h);
      this.paw = part('ss-paw', 0, 0, 0.5, 1).setVisible(false);
      this.head = part(HEAD_KEYS.back, 0, art.HEAD.y, 0.5, 1);
      this.headKey = HEAD_KEYS.back;
      // the parts sit in car coordinates (origin on the road under the rear bumper), raised by AXLE: the roll pivot
      this.body = this.add
        .container(VIEW.w / 2, CAR_Y - AXLE, [
          this.bodyImg,
          this.brakeImg,
          this.tail,
          this.scarf,
          this.paw,
          this.head,
        ])
        .setDepth(300);
      this.scarfScale = this.scarf.scaleX;
      this.stars = [0, 1, 2].map(() =>
        canvasImage(this, 0, 0, 'ss-star').setDepth(302).setVisible(false),
      );
    }

    private buildFx(): void {
      const bit = (key: string, depth: number): Bit => ({
        img: this.add.image(0, 0, key).setDepth(depth).setVisible(false),
        on: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        age: 0,
        life: 1,
        size: 1,
        spark: false,
      });
      this.dust = Array.from({ length: DUST }, () => bit('ss-puff', 290));
      this.streaks = Array.from({ length: STREAKS }, () => {
        const b = bit('ss-streak', 280);
        b.img.setBlendMode('ADD');
        return b;
      });
    }

    private buildHud(): void {
      const pill = (w: number, label: string, icon: 'flag' | 'trophy' | 'bolt', accent: string) =>
        hudPill(this, 0, 0, {
          icon,
          accent,
          label,
          value: '0',
          width: w,
          height: PILL.h,
          depth: 500,
        });
      const ink = colors.ink;
      const big = (y: number, px: number, color: string) =>
        kit
          .text(this, VIEW.w / 2, y, '', { px, color, stroke: ink, strokePx: Math.round(px / 6) })
          .setOrigin(0.5)
          .setDepth(600)
          .setVisible(false);
      const zone = this.add.graphics().setDepth(590).setVisible(false);
      zone.lineStyle(3, 0xffffff, 0.45);
      zone.strokeRoundedRect(
        VIEW.w / 2 - BRAKE_ZONE.hw,
        BRAKE_ZONE.y,
        BRAKE_ZONE.hw * 2,
        VIEW.h - BRAKE_ZONE.y - 8,
        24,
      );
      const time = kit
        .text(this, TIMER.w / 2, 54, '', { px: 44, color: colors.text, stroke: ink, strokePx: 5 })
        .setOrigin(0.5);
      const pauseText = kit
        .text(this, 98, (PILL.h - 6) / 2, strings.pause, { px: 26, color: ink })
        .setOrigin(0.5);
      this.hud = {
        dist: pill(DIST_W, strings.distance, 'flag', art.ACCENT),
        best: pill(BEST_W, strings.best, 'trophy', colors.orange),
        speed: pill(SPEED_W, strings.speed, 'bolt', colors.sky),
        timerBox: this.add
          .container(0, 0, [
            canvasImage(this, 0, 0, 'ss-timer').setOrigin(0),
            kit
              .text(this, TIMER.w / 2, 20, strings.time, {
                px: 18,
                weight: 600,
                color: 'textMuted',
              })
              .setOrigin(0.5),
            time,
          ])
          .setDepth(500),
        time,
        pauseBox: this.add
          .container(0, 0, [canvasImage(this, 0, 0, 'ss-pause').setOrigin(0), pauseText])
          .setDepth(501),
        pauseText,
        count: big(240, 120, colors.gold),
        stage: big(318, 34, colors.text),
        banner: big(176, 52, colors.gold),
        sub: big(232, 32, colors.text),
        hint: kit
          .text(this, VIEW.w / 2, 452, '', { px: 26, stroke: ink, strokePx: 6, align: 'center' })
          .setOrigin(0.5)
          .setDepth(600),
        hintBrake: kit
          .text(this, VIEW.w / 2, BRAKE_ZONE.y - 20, strings.hintPointerBrake, {
            px: 20,
            weight: 600,
            font: 'body',
            stroke: ink,
            strokePx: 5,
          })
          .setOrigin(0.5)
          .setDepth(600),
        arrows: [
          canvasImage(this, 100, 520, 'ss-arrow').setFlipX(true).setDepth(590).setAlpha(0.85),
          canvasImage(this, VIEW.w - 100, 520, 'ss-arrow')
            .setDepth(590)
            .setAlpha(0.85),
        ],
        zone,
      };
    }

    /**
     * Hangs the HUD from the top corners of the view: one row (distance and best on the left, the timer in the
     * middle, speed and Pause on the right), or in a portrait frame, where there is sky to spare, two larger rows.
     */
    private layoutHud(): void {
      const v = this.tk.layout.view;
      const h = this.hud;
      const tall = v.height >= VIEW.h + 240;
      const k = tall ? 1.4 : 1;
      const left = v.x + HUD_PAD;
      const right = v.x + v.width - HUD_PAD;
      const y1 = v.y + PILL.y * k;
      const y2 = tall ? y1 + 96 * k : y1;
      this.hudK = k;
      this.pauseBottom = v.y + HUD_BOTTOM * k;
      this.hudBottom = tall ? y2 + (HUD_BOTTOM - PILL.y) * k : this.pauseBottom;
      this.pauseX = right - PAUSE_W * k;
      this.bestX = tall ? left : left + DIST_W + 8;
      this.bestY = y2;
      h.dist.container.setPosition(left, y1).setScale(k);
      h.best.container.setPosition(this.bestX, y2).setScale(k);
      h.speed.container
        .setPosition(tall ? right - SPEED_W * k : this.pauseX - 12 - SPEED_W, y2)
        .setScale(k);
      h.timerBox.setPosition(VIEW.w / 2 - (TIMER.w * k) / 2, v.y + TIMER.y * k).setScale(k);
      h.pauseBox.setPosition(this.pauseX, y1).setScale(k);
    }

    // ─── input: keys via tk.input; mouse and touch holds via Phaser pointers, read each frame ───
    private live(): boolean {
      return !this.tk.attract && !this.tk.ui.open;
    }

    private bindPointer(): void {
      const z = kit.renderScale;
      this.input.addPointer(1);
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (!this.live()) return;
        // canvas pixels → design units: the view's corner is not (0, 0) in a wide or tall frame
        const v = this.tk.layout.view;
        const x = p.x / z + v.x;
        const y = p.y / z + v.y;
        if (y < this.hudBottom) {
          if (x >= this.pauseX - 6 && y < this.pauseBottom) this.pauseTap();
          return;
        }
        if (!p.wasTouch) this.mouseDown = true;
      });
      this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (!p.wasTouch) this.mouseDown = false;
      });
      // a mouse let go outside the game never sends pointerup here
      this.input.on('gameout', () => {
        this.mouseDown = false;
      });
    }

    private pauseTap(): void {
      this.tk.sfx.play('click');
      bump(this, this.hud.pauseText, 1.15, 160);
      void this.tk.ui.pauseMenu();
    }

    /** Steering and braking from held keys, plus held left / right halves (both, or the bottom middle: brake). */
    private readInput(): void {
      const input = this.tk.input;
      let left = input.isDown('left');
      let right = input.isDown('right');
      let brake = input.isDown('brake');
      if (this.live()) {
        const m = this.input.manager;
        const z = kit.renderScale;
        const v = this.tk.layout.view;
        let pl = false;
        let pr = false;
        for (let k = 0; k < m.pointers.length; k++) {
          const p = m.pointers[k]!;
          if (!(p === m.mousePointer ? this.mouseDown : p.isDown)) continue;
          const x = p.x / z + v.x;
          const y = p.y / z + v.y;
          if (y < this.hudBottom) continue;
          if (y > BRAKE_ZONE.y && Math.abs(x - VIEW.w / 2) < BRAKE_ZONE.hw) brake = true;
          else if (x < VIEW.w / 2) pl = true;
          else pr = true;
        }
        if (pl && pr) brake = true;
        else {
          left ||= pl;
          right ||= pr;
        }
      }
      this.steer = (right ? 1 : 0) - (left ? 1 : 0);
      this.brake = brake;
    }

    // ─── run lifecycle ───
    private newRun(): void {
      const tk = this.tk;
      const seed = `sunset-sprint:run:${tk.rng.main.nextUint32().toString(16)}`;
      this.sim = createRun(tk.rng.create(seed), this.track);
      // the attract reel starts on the move (no countdown)
      while (tk.attract && this.sim.phase === 'countdown') this.sim.step(0, false);
      tk.attract?.setView(this.sim);
      /*DBG*/ if (DBGZ) { this.sim.z = DBGZ; this.sim.nextCp = Math.max(0, Math.ceil((DBGZ - 1940) / 1500)); this.sim.stage = Math.floor(this.sim.nextCp / 2); this.sim.timeLeftMs = 99000; this.sim.speed = 60; }
      this.runs++;
      this.endAt = -1;
      this.ending = false;
      this.newBest = false;
      this.holdUntil = 0;
      this.acc = 0;
      this.lastStep = tk.attract?.step ?? 0;
      this.goAt = -1;
      this.bannerAt = -Infinity;
      this.hudAt = -Infinity;
      this.happyUntil = 0;
      this.dizzyUntil = 0;
      this.mouseDown = false;
      this.lean = 0;
      this.lift = 0;
      this.liftV = 0;
      this.pitch = 0;
      for (const b of [...this.dust, ...this.streaks]) this.free(b);
      const h = this.hud;
      h.best.container.setVisible(!tk.attract);
      h.pauseBox.setVisible(!tk.attract);
      h.best.setLabel(strings.best);
      h.banner.setVisible(false);
      h.sub.setVisible(false);
      h.count.setVisible(false);
      h.stage.setText(stageName(0)).setVisible(this.sim.phase === 'countdown');
      this.shown = { secs: -1, low: false, speed: -1, dist: -1, best: -1 };
      h.time.setColor(colors.text); // the last run ended red at 0 s
      this.showHint();
      this.updateHud(true);
      this.draw(0);
    }

    /** The controls hint, on the first run of a mount until a little after Go. */
    private showHint(): void {
      const h = this.hud;
      const s = this.sim;
      const on =
        !!s &&
        !this.tk.attract &&
        this.runs === 1 &&
        (s.phase === 'countdown' || (s.phase === 'racing' && this.clock < this.goAt + HINT_MS));
      const p = this.tk.env.input.primary;
      const keys = p !== 'touch' && p !== 'pointer';
      h.hint.setVisible(on);
      h.hintBrake.setVisible(on && !keys);
      h.zone.setVisible(on && !keys);
      for (const a of h.arrows) a.setVisible(on && !keys);
      if (!on) return;
      const text = keys ? strings.hintKeyboard : strings.hintPointer;
      if (h.hint.text !== text) h.hint.setText(text);
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
      if (holding !== (count.visible && count.text === strings.ready)) {
        count.setText(strings.ready).setVisible(holding);
      }
      this.readInput();
      for (let i = 0; i < Math.min(steps, MAX_STEPS); i++)
        this.handle(this.sim.step(this.steer, this.brake));
      const wait = this.tk.motion.reduced ? OVER_MS_CALM : OVER_MS;
      if (this.endAt >= 0 && !this.ending && this.clock >= this.endAt + wait) void this.gameOver();
      /*DBG*/ if (DBGHIT && Math.floor(this.clock / 2600) !== Math.floor((this.clock - dt) / 2600)) { this.sim.wobbleMs = WOBBLE_MS; this.sim.ghostMs = 1500; this.onCrash(this.sim.x); }
      this.draw(dt);
    }

    private handle(events: readonly SimEvent[]): void {
      const tk = this.tk;
      for (const e of events) {
        switch (e.type) {
          case 'count':
            tk.sfx.play('click', { volume: 0.8, detuneCents: -400 });
            this.hud.count.setText(String(e.n)).setVisible(true);
            bump(this, this.hud.count, 1.3, 240);
            break;
          case 'go':
            tk.run.begin();
            this.goAt = this.clock;
            tk.sfx.play('coin', { volume: 0.7 });
            this.hud.count.setText(strings.go);
            this.hud.stage.setVisible(false);
            bump(this, this.hud.count, 1.3, 240);
            break;
          case 'checkpoint':
            this.onCheckpoint(e.bonusMs, e.stage, e.newStage);
            break;
          case 'crash':
            this.onCrash(e.car.x);
            break;
          case 'overtake':
            if (e.near) {
              tk.sfx.play('coin', { volume: 0.55, detuneCents: 500 });
              popText(this, VIEW.w / 2, 520, strings.closeOne, {
                color: colors.sky,
                px: 34,
                rise: 40,
              });
              this.happyUntil = this.clock + HAPPY_MS / 2;
            } else tk.sfx.play('coin', { volume: 0.18, detuneCents: 200 });
            break;
          case 'warn':
            tk.sfx.play('click', { volume: 0.9, detuneCents: 600 });
            bump(this, this.hud.time, 1.25, 200);
            break;
          case 'timeout':
            tk.sfx.play('lose');
            this.showBanner(strings.timeUp, '', colors.vermillion);
            break;
          case 'over':
            this.endAt = this.clock;
            this.recordRun();
            break;
        }
      }
    }

    private showBanner(text: string, sub: string, color: string): void {
      const h = this.hud;
      h.banner.setText(text).setColor(color).setVisible(true).setAlpha(1);
      h.sub.setText(sub).setVisible(!!sub).setAlpha(1);
      bump(this, h.banner, 1.25, 260);
      this.bannerAt = this.clock;
    }

    private onCheckpoint(bonus: number, stage: number, newStage: boolean): void {
      this.tk.sfx.play('win', { volume: 0.8 });
      this.showBanner(
        strings.t('checkpoint', { n: Math.round(bonus / 1000) }),
        newStage ? stageName(stage) : '',
        colors.gold,
      );
      flash(this, colors.gold, 260, 0.18);
      burst(this, VIEW.w / 2, 190, { shape: 'star', count: 16, distance: 170, depth: 650 });
      bump(this, this.hud.time, 1.3, 260);
      // Miso looks back, waves, and the car hops
      this.happyUntil = this.clock + HAPPY_MS;
      this.liftV += 320;
    }

    private onCrash(carX: number): void {
      const tk = this.tk;
      tk.sfx.play('hit');
      shake(this, 260, 0.012);
      flash(this, colors.vermillion, 200, 0.16);
      const x = VIEW.w / 2 + Math.max(-1, Math.min(1, carX - this.sim.x)) * 60;
      burst(this, x, CAR_Y - 90, {
        shape: 'star',
        colors: [colors.yellow, '#FFFFFF', colors.orange],
        count: 14,
        distance: 150,
        size: 18,
        depth: 650,
      });
      burst(this, x, CAR_Y - 70, {
        shape: 'dot',
        colors: ['#E4E0F4', '#9A94B8'],
        count: 10,
        distance: 100,
        size: 16,
        depth: 649,
      });
      this.dizzyUntil = this.clock + WOBBLE_MS + 500;
      this.liftV += 240;
    }

    /** Saved when the run ends, not when the dialog opens: a Restart from the pause menu in between would lose it. */
    private recordRun(): void {
      const s = this.sim;
      if (this.tk.attract) return;
      this.stats = withRun(this.stats, { distance: s.distance, stage: s.stage + 1 });
      this.statsSave.set(this.stats);
      this.best = Math.max(this.best, s.distance);
    }

    private async gameOver(): Promise<void> {
      this.ending = true;
      const tk = this.tk;
      const s = this.sim;
      const distance = s.distance;
      await tk.ui.gameOver({
        title: s.overtakes === 1 ? strings.overOne : strings.t('over', { n: s.overtakes }),
        scores: distance >= 1 ? [{ board: 'distance', value: distance }] : [],
        meta: {
          v: 1,
          stage: s.stage + 1,
          checkpoints: s.nextCp,
          overtakes: s.overtakes,
          nearMisses: s.nearMisses,
          crashes: s.crashes,
        },
      });
      if (!tk.signal.aborted) this.newRun();
    }

    // ─── drawing ───
    private draw(dt: number): void {
      const s = this.sim;
      const calm = this.tk.motion.reduced;
      const sp = s.speed / MAX_SPEED;
      this.drawBackdrop(dt, sp);
      this.road.draw(s);
      this.drawCar(dt, sp, calm);
      this.drawDust(dt, calm);
      this.drawStreaks(dt, sp, calm);
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
      if (h.hint.visible && s.phase === 'racing' && this.clock >= this.goAt + HINT_MS)
        this.showHint();
    }

    /** x of the first of two side-by-side layer tiles, scrolled by v, so that they cover the widest view. */
    private tileX(v: number): number {
      const x = (((v % art.LAYER_W) + art.LAYER_W) % art.LAYER_W) - art.LAYER_W;
      return x > -this.padX ? x - art.LAYER_W : x;
    }

    private drawBackdrop(dt: number, sp: number): void {
      const s = this.sim;
      // the layers drift against the curve, and sink as the road climbs
      const curve = curveAt(s.track, s.z);
      this.farX -= curve * sp * dt * LAYER_SPEED.far;
      this.nearX -= curve * sp * dt * LAYER_SPEED.near;
      const lift = heightAt(s.track, s.z);
      const farY = VIEW.horizon - art.FAR.ground + lift * 0.35;
      const nearY = VIEW.horizon - art.NEAR.ground + 4 + lift * 0.8;
      const fx = this.tileX(this.farX);
      const nx = this.tileX(this.nearX);
      // one stage's scenery, turning into the next as the arch between them comes up
      const { from, to, k } = themeBlend(this.blend, s.z);
      const fading = k > 0 && k < 1;
      const pair = fading ? 3 + from : k >= 1 ? to : from;
      if (pair !== this.scenery) {
        this.scenery = pair;
        this.backdrops.forEach((b, t) => {
          const on = fading ? t === from || t === to : t === pair;
          const lift = fading && t === to ? 1 : 0;
          b.sky
            .setVisible(on)
            .setDepth(-1000 + lift)
            .setAlpha(1);
          for (const img of b.far)
            img
              .setVisible(on)
              .setDepth(-900 + lift)
              .setAlpha(1);
          for (const img of b.near)
            img
              .setVisible(on)
              .setDepth(-800 + lift)
              .setAlpha(1);
        });
      }
      for (let t = 0; t < 3; t++) {
        const b = this.backdrops[t]!;
        if (!b.sky.visible) continue;
        b.far[0]!.setPosition(fx, farY);
        b.far[1]!.setPosition(fx + art.LAYER_W, farY);
        b.near[0]!.setPosition(nx, nearY);
        b.near[1]!.setPosition(nx + art.LAYER_W, nearY);
        if (!fading || k === this.sceneryK) continue;
        // the new sky fades in over the old one; the silhouettes cross-fade
        const a = t === to ? k : 1 - k;
        if (t === to) b.sky.setAlpha(k);
        b.far[0]!.setAlpha(a);
        b.far[1]!.setAlpha(a);
        b.near[0]!.setAlpha(a);
        b.near[1]!.setAlpha(a);
      }
      this.sceneryK = k;
    }

    private drawCar(dt: number, sp: number, calm: boolean): void {
      const s = this.sim;
      const t = this.clock;
      // a long frame must not kick the spring
      const sec = Math.min(dt, 34) / 1000;
      const moving = s.speed > 1;
      const hit = s.wobbleMs > 0 ? s.wobbleMs / WOBBLE_MS : 0;
      const dizzy = t < this.dizzyUntil;
      const happy = !dizzy && t < this.happyUntil;
      const braking = (s.phase === 'racing' && s.braking) || s.phase === 'stopping';

      // lean: into the steering and with the bend the road is taking; a hit throws the tail from side to side
      if (hit && !calm) this.lean = Math.sin((1 - hit) * Math.PI * 5) * (0.35 + 0.65 * hit);
      else {
        const bend = (curveAt(s.track, s.z) / 3) * 0.45 * sp;
        const want = moving && !hit ? Math.max(-1, Math.min(1, s.steer * 0.72 + bend)) : 0;
        const most = LEAN_RATE * sec;
        this.lean += Math.max(-most, Math.min(most, want - this.lean));
      }
      const frame = Math.round(this.lean * art.LEAN_STEPS);
      if (frame !== this.frame) {
        this.frame = frame;
        this.bodyImg.setTexture(BODY_KEYS[frame + art.LEAN_STEPS]!);
      }

      // suspension: bumps off the road, a hop at a checkpoint or a hit; the nose dips under braking
      if (calm) {
        this.lift = 0;
        this.liftV = 0;
        this.pitch = braking ? 1 : 0;
      } else {
        if (s.offroad && s.speed > 6 && this.rnd() < 0.3) this.liftV += 50 + this.rnd() * 90;
        this.liftV += (-SPRING * this.lift - DAMP * this.liftV) * sec;
        this.lift += this.liftV * sec;
        this.pitch += Math.max(-8 * sec, Math.min(8 * sec, (braking ? 1 : 0) - this.pitch));
      }
      const up = Math.max(-5, this.lift);
      // the tyres leave the road only on a real hop
      const air = Math.max(0, up - 6);
      const hum = calm || !moving ? 0 : Math.sin(t / 47) * sp;
      const cx = VIEW.w / 2 + (hit && !calm ? Math.sin(t / 28) * 12 * hit : 0);
      const ghost = s.ghostMs > 0 && !hit;
      const alpha = ghost ? (calm ? 0.6 : Math.floor(t / 90) % 2 ? 0.45 : 1) : 1;

      const rearX = cx + art.yawShift(frame, 0.1);
      this.tyres[0]!.setPosition(rearX - art.TYRE.x, CAR_Y - air).setAlpha(alpha);
      this.tyres[1]!.setPosition(rearX + art.TYRE.x, CAR_Y - air).setAlpha(alpha);
      this.spin += Math.min(24, s.speed * 0.6) * sec;
      const tyre = Math.floor(this.spin) % art.TYRE.frames;
      if (tyre !== this.tyreFrame) {
        this.tyreFrame = tyre;
        this.tyres[0]!.setTexture(TYRE_KEYS[tyre]!);
        this.tyres[1]!.setTexture(TYRE_KEYS[tyre]!);
      }
      this.shadow
        .setPosition(cx, CAR_Y - 5)
        .setScale(1 - air * 0.012)
        .setAlpha(alpha * (1 - air * 0.03));
      const rumble = s.offroad && moving && !calm ? (this.rnd() - 0.5) * 0.035 : 0;
      this.body
        .setPosition(cx, CAR_Y - AXLE - up - this.pitch * 4 + hum)
        .setRotation(this.lean * ROLL + rumble)
        .setAlpha(alpha);
      this.brakeImg.setVisible(braking).setX(art.yawShift(frame, 0));

      // Miso: she looks back happy at a checkpoint or a close pass, dizzy after a hit, sad when time is up
      const pose: art.HeadPose =
        s.phase === 'stopping' || s.phase === 'over'
          ? 'sad'
          : dizzy
            ? 'dizzy'
            : happy
              ? 'happy'
              : 'back';
      const headKey = HEAD_KEYS[pose];
      if (headKey !== this.headKey) {
        this.headKey = headKey;
        this.head.setTexture(headKey);
      }
      const hx = art.yawShift(frame, 0.5) + this.lean * 7;
      const hy =
        art.HEAD.y + AXLE + this.pitch * 3 - (happy && !calm ? Math.abs(Math.sin(t / 110)) * 5 : 0);
      const nod = calm ? 0 : dizzy ? Math.sin(t / 85) * 0.14 : happy ? Math.sin(t / 110) * 0.07 : 0;
      const hr = this.lean * 0.12 + nod;
      this.head.setPosition(hx, hy).setRotation(hr);
      // the scarf ends and the paw hang off the neck and turn with the head
      const cos = Math.cos(hr);
      const sin = Math.sin(hr);
      // the scarf hangs at rest and streams out behind her at speed
      const stream = Math.min(1, sp * 1.6);
      if (!calm && sp > 0.04) this.flap += (5 + sp * 13) * sec;
      const scarf = Math.floor(this.flap) % art.SCARF.frames;
      if (scarf !== this.scarfFrame) {
        this.scarfFrame = scarf;
        this.scarf.setTexture(SCARF_KEYS[scarf]!);
      }
      this.scarf
        .setPosition(
          hx + art.SCARF.x * cos - art.SCARF.y * sin,
          hy + art.SCARF.x * sin + art.SCARF.y * cos,
        )
        .setRotation(hr - 1.25 + 1.37 * stream + this.lean * 0.2)
        .setScale(this.scarfScale * (0.78 + 0.22 * stream), this.scarfScale);
      if (happy !== this.paw.visible) this.paw.setVisible(happy);
      if (happy)
        this.paw
          .setPosition(
            hx + art.PAW.x * cos - art.PAW.y * sin,
            hy + art.PAW.x * sin + art.PAW.y * cos,
          )
          .setRotation(hr + 0.3 + (calm ? 0 : Math.sin(t / 75) * 0.35));
      const sway = calm ? 0 : Math.sin(t / 170) * 0.05 + Math.sin(t / 61) * 0.04 * sp;
      this.tail
        .setX(art.TAIL.x + art.yawShift(frame, 0.45))
        .setRotation(sp * 0.16 - this.lean * 0.22 + sway + (happy && !calm ? nod * 2 : 0));
      for (let k = 0; k < 3; k++) {
        const star = this.stars[k]!;
        if (!dizzy) {
          if (star.visible) star.setVisible(false);
          continue;
        }
        const a = (calm ? 0 : t / 130) + (k * Math.PI * 2) / 3;
        star
          .setPosition(
            cx + hx + Math.cos(a) * 42,
            CAR_Y + art.HEAD.y - 98 - up + Math.sin(a) * 10,
          )
          .setVisible(true);
      }

      // dust (or kerb sparks in the city) from both rear tyres off the road; tyre smoke under hard braking or a hit
      if (s.phase !== 'over' && s.speed > 6) {
        if (s.offroad) {
          this.emitDust(cx, false, calm);
          this.emitDust(cx, false, calm);
        } else if (hit || (s.phase === 'racing' && s.braking && s.speed > 16))
          this.emitDust(cx, true, calm);
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

    private emitDust(cx: number, smoke: boolean, calm: boolean): void {
      if (calm && this.rnd() < 0.6) return;
      const b = this.take(this.dust);
      if (!b) return;
      const side = (this.dustSide = 1 - this.dustSide) ? 1 : -1;
      const theme = themeOfStage(this.sim.stage);
      const spark = !smoke && theme === 2;
      const pal = smoke ? SMOKE : art.ROAD[theme].dust;
      b.on = true;
      b.spark = spark;
      b.x = cx + side * art.TYRE.x;
      b.y = CAR_Y - 8;
      b.vx = side * (40 + this.rnd() * 80);
      b.vy = spark ? -160 - this.rnd() * 120 : -30 - this.rnd() * 50;
      b.age = 0;
      b.life = spark ? 360 : smoke ? 420 : 560;
      b.size = spark ? 16 : smoke ? 24 + this.rnd() * 12 : 32 + this.rnd() * 18;
      b.img
        .setTint(colorNum(pal[Math.floor(this.rnd() * pal.length)]!))
        .setBlendMode(spark ? 'ADD' : 'NORMAL')
        .setVisible(true);
    }

    private drawDust(dt: number, calm: boolean): void {
      for (const b of this.dust) {
        if (!b.on) continue;
        b.age += dt;
        if (b.age >= b.life) {
          this.free(b);
          continue;
        }
        const k = b.age / b.life;
        b.x += (b.vx * dt) / 1000;
        b.y += (b.vy * dt) / 1000;
        if (b.spark) b.vy += 900 * (dt / 1000);
        const size = b.size * (calm ? 1 : 1 + k * (b.spark ? -0.5 : 1.4));
        b.img
          .setPosition(b.x, b.y)
          .setDisplaySize(size, size)
          .setAlpha(1 - k);
      }
    }

    private drawStreaks(dt: number, sp: number, calm: boolean): void {
      const s = this.sim;
      const spawn = !calm && s.phase === 'racing' && sp > 0.82;
      if (spawn && this.rnd() < (sp - 0.82) * 2.4) {
        const b = this.take(this.streaks);
        if (b) {
          // fanning out from the vanishing point over the road and its sides, never straight down onto the car;
          // a streak keeps its direction in (x, y) and its starting distance from the vanishing point in vx
          const a = Math.PI / 2 + (this.rnd() < 0.5 ? -1 : 1) * (0.7 + this.rnd() * 1.05);
          b.on = true;
          b.x = Math.cos(a);
          b.y = Math.sin(a);
          b.vx = 140 + this.rnd() * 140;
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
        const r = b.vx + k * 900;
        b.img
          .setPosition(VANISH.x + b.x * r, VANISH.y + b.y * r)
          .setDisplaySize(4, b.size * (0.6 + k))
          .setAlpha(Math.sin(k * Math.PI) * 0.5);
      }
    }

    private updateHud(force: boolean): void {
      const s = this.sim;
      const h = this.hud;
      const sh = this.shown;
      const secs = Math.ceil(s.timeLeftMs / 1000);
      if (secs !== sh.secs) {
        sh.secs = secs;
        h.time.setText(String(secs));
        const low = secs <= 10;
        if (low !== sh.low) {
          sh.low = low;
          h.time.setColor(low ? colors.vermillion : colors.text);
        }
      }
      if (!force && this.clock < this.hudAt + HUD_MS) return;
      this.hudAt = this.clock;
      const locale = this.tk.env.locale;
      const kmh = Math.round((s.speed * 3.6) / 2) * 2;
      if (kmh !== sh.speed) {
        sh.speed = kmh;
        h.speed.set(strings.t('kmh', { n: kmh }));
      }
      const dist = s.distance;
      if (dist !== sh.dist) {
        sh.dist = dist;
        h.dist.set(strings.t('metres', { n: formatScore(dist, 'integer', locale) }));
        if (!this.tk.attract && !this.newBest && this.best > 0 && dist > this.best) {
          this.newBest = true;
          h.best.setLabel(strings.newBest);
          const bx = this.bestX + (BEST_W * this.hudK) / 2;
          popText(this, bx, this.bestY + 92 * this.hudK, strings.newBestPop, {
            color: colors.gold,
            px: 26,
          });
          burst(this, bx, this.bestY + 30 * this.hudK, {
            shape: 'star',
            count: 12,
            distance: 90,
            depth: 700,
          });
        }
      }
      const best = Math.max(this.best, this.newBest ? dist : 0);
      if (best !== sh.best) {
        sh.best = best;
        h.best.set(strings.t('metres', { n: formatScore(best, 'integer', locale) }));
      }
    }
  }

  return [Sprint];
};
