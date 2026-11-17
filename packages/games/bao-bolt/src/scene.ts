// The Bao Bolt scene: steps the pure simulation at 60 Hz and draws it: Bao's run cycle, squash and stretch and moods,
// Gulp the gull, the districts' scenery, the HUD and the effects. Every texture is drawn once per mount (art.ts,
// themes.ts); per frame only positions, frames and alphas change.
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
import type { AttractView } from './attract.ts';
import { ATTRACT_REEL } from './chunks.ts';
import { DEFAULT_STATS, isStatsV1, withRun, type RunStatsV1 } from './save.ts';
import { createSim, type Intents, type Sim, type SimEvent } from './sim.ts';
import { districts, strings } from './strings.ts';
import * as themes from './themes.ts';
import { THEMES, type Ambient, type Anchor } from './themes.ts';
import {
  BUN_X,
  DESIGN,
  GROUND_TOP,
  HITBOX,
  MAX_STEPS_PER_FRAME,
  STEP_MS,
  STUMBLE,
  WU,
  nextDistrictAt,
} from './tuning.ts';

const GROUND_Y = GROUND_TOP * WU; // 450 design px
const BAO_X = BUN_X * WU;
const SIGN_TOP = GROUND_Y - HITBOX.shelf.bottom * WU - art.SIGN_H;
const SIGN_WIDTHS = [1, 1.3, 1.6] as const;
/** The skyline layers sit on this line, just under the rooftop's edge. */
const HORIZON = GROUND_Y + 5;
/** Skyline tiles: height and how fast they scroll compared with the rooftop. */
const FAR = { h: 240, f: 0.08 } as const;
const MID = { h: 260, f: 0.3 } as const;
const TILE_W = DESIGN.width;
const ROOF_W = 240;
/** Scenery is drawn this far past the widest view, so a camera shake never shows the bare canvas. */
const PAD = 24;
/** Touch: a finger down this long without dragging starts a jump. */
const TAP_JUMP_MS = 100;
/** Touch: dragging down this many CSS px, within this long of touching, is a slide. */
const SWIPE_DOWN_PX = 10;
const SWIPE_WINDOW_MS = 300;

/** Bao's rig pivots at his middle (26 px above the feet) so the jump spin turns him in place. */
const PIVOT = 26;
/** Bao is drawn 10 % larger than his hitbox (scaled about his feet): forgiving, and he's the star. */
const BAO_SCALE = 1.1;
const NEVER = -1e9;
const TAU = Math.PI * 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** x wrapped into [0, period). */
const wrap = (x: number, period: number) => ((x % period) + period) % period;
const CRUMBS = ['#FFF4E0', '#F2D3A0', '#FFFFFF'];
const DUST = ['#FFF4E0', '#E6DCF5', '#FFD9B8'];
const SPARKS = ['#FFE14D', '#FFC83D', '#FFFFFF'];
const EMBERS = [0xffb45c, 0xff7a59, 0xffe14d];
const FLAP = [0, 1, 2, 1] as const;
/** What drifts through each kind of air: how many sprites, and their texture. */
const AMBIENT: Record<Ambient, { count: number; key: string }> = {
  embers: { count: 14, key: 'glow' },
  rain: { count: 22, key: 'rain' },
  birds: { count: 5, key: 'bird-0' },
  petals: { count: 12, key: 'petal' },
};
const AMBIENT_MAX = 22;

type Img = Phaser.GameObjects.Image;
type Container = Phaser.GameObjects.Container;
type Tile = { t: Phaser.GameObjects.TileSprite; f: number; z: number };

/** One district's scenery. Everything but the rooftop lives in `box`, so a district fades in as a whole. */
interface Backdrop {
  box: Container;
  layers: Tile[];
  clouds: { img: Img; x: number; v: number }[];
  anchors: readonly Anchor[];
  lights: Img[];
  roof: Tile;
}

interface Mote {
  img: Img;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  ph: number;
  frame: number;
}

interface Anim {
  cycle: number;
  vy: number;
  jumpAt: number;
  landAt: number;
  spinAt: number;
  spun: boolean;
  dustAt: number;
  stumbleAt: number;
  gulpIn: number;
  gulpOut: number;
  eatenAt: number;
  gulpFrom: { x: number; y: number };
  lift: number;
}
const freshAnim = (): Anim => ({
  cycle: 0,
  vy: 0,
  jumpAt: NEVER,
  landAt: NEVER,
  spinAt: NEVER,
  spun: false,
  dustAt: NEVER,
  stumbleAt: NEVER,
  gulpIn: NEVER,
  gulpOut: NEVER,
  eatenAt: NEVER,
  gulpFrom: { x: -200, y: 200 },
  lift: 0,
});

export const createScenes: SceneFactory = (_P, kit) => {
  class Run extends kit.Scene {
    private sim!: Sim;
    private stats: RunStatsV1 = DEFAULT_STATS;
    private statsSave!: Save<RunStatsV1>;
    private acc = 0;
    private intents: Intents = {};
    /** a finger that is down: where and when it landed, and whether its jump has already started */
    private touch: { t: number; y: number; jumped: boolean } | null = null;
    private jumpKind: AttractView['jumpKind'] = null;
    private ending = false;
    private anim: Anim = freshAnim();
    private rnd = prng(77);
    /** the drawn area in design units: the widest and tallest view plus PAD */
    private ext = { x0: 0, x1: 960, y0: 0, y1: 540 };
    private sets: Backdrop[] = [];
    private theme = 0;
    /** the self-playing demo starts each run one district further on, to show them all */
    private demoRuns = 0;
    private themeShift = 0;
    private ambient: Ambient = 'embers';
    private ambientAt = 0;
    /** metres at which the gate on screen (or the next one to arrive) stands */
    private gateM = 0;
    private world!: {
      motes: Mote[];
      speed: { img: Img; x: number; y: number }[];
      flag: Img;
      gate: Img;
    };
    private bao!: {
      rig: Container;
      spin: Container;
      body: Img;
      face: Img;
      slide: Img;
      tails: Img;
      bootF: Img;
      bootB: Img;
      shadow: Img;
      stars: Img[];
    };
    private gulp!: Img;
    private anchors: Anchor[][] = [];
    private sprites = new Map<number, Img>();
    private pools = new Map<string, Img[]>();
    private knocked = new Map<number, number>();
    /** sprite ids drawn this frame (reused) */
    private live = new Set<number>();
    /** what the HUD shows, so text is only re-formatted on change */
    private shown = { metres: -1, crumbs: -1, ring: '' };
    private hud!: {
      score: HudPill;
      dist: HudPill;
      coins: HudPill;
      mult: Container;
      multText: Phaser.GameObjects.Text;
      ring: Phaser.GameObjects.Graphics;
      warn: Container;
      bar: Phaser.GameObjects.Rectangle;
      root: Container;
    };
    private banner!: { box: Container; name: Phaser.GameObjects.Text; x: number; y: number };
    private ready!: Container;
    private readyTitle!: Img;
    private readyPill!: Container;
    private readyBest!: Phaser.GameObjects.Text;
    private readyPrompt!: Phaser.GameObjects.Text;

    constructor() {
      super('run');
    }

    create(): void {
      const tk = this.tk;
      // Phaser picks each sprite's texture inside a batch by comparing an interpolated number for equality. On
      // software WebGL (no GPU acceleration, headless capture) that test fails across parts of a rotated sprite
      // and leaves holes in it: Bao tilts as he runs, so chunks of him went missing. One texture per batch, which
      // Phaser already uses on phones, takes that test out of the shader.
      if ('renderNodes' in this.renderer) this.renderer.renderNodes.setMaxParallelTextureUnits(1);
      const { bleed } = tk.layout;
      this.ext = {
        x0: -bleed.x - PAD,
        x1: DESIGN.width + bleed.x + PAD,
        y0: -bleed.y - PAD,
        y1: DESIGN.height + bleed.y + PAD,
      };
      this.makeTextures();
      this.drawWorld();
      this.drawBao();
      this.drawHud();
      this.layoutUi();
      tk.on('resize', () => this.layoutUi());
      tk.input.configure({
        actions: {
          jump: { codes: ['Space', 'ArrowUp', 'KeyW'] },
          slide: { codes: ['ArrowDown', 'KeyS'] },
        },
      });
      tk.input.on('jump', (e) =>
        e.phase === 'press' ? (this.intents.jumpDown = true) : (this.intents.jumpUp = true),
      );
      tk.input.on('slide', (e) => e.phase === 'press' && (this.intents.slide = true));
      this.bindPointer();
      tk.ui.onRestart(() => this.newRun());
      this.statsSave = tk.createSave<RunStatsV1>({
        key: 'stats',
        defaults: () => DEFAULT_STATS,
        validate: isStatsV1,
      });
      tk.deferReady();
      void this.statsSave
        .load()
        .then((l) => {
          if (tk.signal.aborted) return; // unmounted while loading: the scene is gone
          this.stats = l.data;
          this.newRun();
          tk.ready();
        })
        .catch((e: unknown) => tk.reportError(e, true));
    }

    // ─── art (drawn once per mount) ───
    private makeTextures(): void {
      const c = (
        key: string,
        w: number,
        h: number,
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
      ) => kit.textures.canvas(this, key, w, h, draw);
      c('bao-body', art.BAO.w, art.BAO.h, art.drawBaoBody);
      for (const f of art.FACES) c(`bao-face-${f}`, art.BAO.w, art.BAO.h, art.drawBaoFace(f));
      c('bao-slide', art.SLIDE_POSE.w, art.SLIDE_POSE.h, art.drawBaoSlide);
      c('bao-boot', 18, 12, art.drawBaoBoot);
      for (let i = 0; i < 3; i++)
        c(`bao-tails-${i}`, art.TAILS.w, art.TAILS.h, (ctx) => art.drawTails(ctx, (i * TAU) / 3));
      [0.95, 0.15, -0.65].forEach((a, i) =>
        c(`gulp-${i}`, art.GULP.w, art.GULP.h, (ctx) => art.drawGulp(ctx, a, false)),
      );
      c('gulp-chomp', art.GULP.w, art.GULP.h, (ctx) => art.drawGulp(ctx, 0.7, true));
      for (let i = 0; i < 2; i++) c(`crab-${i}`, 58, 38, (ctx) => art.drawCrab(ctx, i));
      c('steamers', 56, 96, art.drawSteamers);
      c('steam', 44, 56, art.drawSteam);
      SIGN_WIDTHS.forEach((w, i) => {
        c(`sign-${w}`, w * WU, art.SIGN_H, (ctx) => art.drawSign(ctx, w * WU, i));
        c(`ropes-${w}`, w * WU, 8, (ctx) => art.drawRopes(ctx, w * WU, 8));
      });
      c('coin', 32, 32, art.drawCoin);
      c('twinkle', 16, 16, art.drawTwinkle);
      c('dizzy', 18, 18, art.drawDizzyStar);
      c('shadow', 64, 16, (ctx, w, h) => art.drawShadow(ctx, w, h));
      c('glow', 24, 24, (ctx, w) => art.drawGlow(ctx, w));
      c('speedline', 150, 4, (ctx, w, h) => art.drawSpeedLine(ctx, w, h));
      c('bestflag', 40, 112, art.drawBestFlag);
      c('title', 600, 140, (ctx, w, h) => art.drawTitle(ctx, w, h, strings.title));
      c('prompt', 340, 60, (ctx, w, h) => art.drawPromptPill(ctx, w, h));
      c('warn', 236, 42, (ctx, w, h) => art.drawWarnPill(ctx, w, h));
      c('mult-badge', 44, 44, (ctx) => art.drawMultBadge(ctx));
      c('banner', 340, 64, (ctx, w, h) => themes.drawBanner(ctx, w, h));
      c('moon', 260, 260, (ctx, w) => themes.drawMoon(ctx, w));
      c('cloud', 260, 72, (ctx, w, h) => themes.drawCloud(ctx, w, h));
      c('gate', 240, 320, (ctx, w, h) => themes.drawGate(ctx, w, h));
      c('rain', 10, 30, themes.drawRain);
      c('petal', 12, 9, themes.drawPetal);
      for (let i = 0; i < 2; i++) c(`bird-${i}`, 30, 16, (ctx) => themes.drawBird(ctx, i === 0));
      canvasTexture(this, 'sun', 360, 360, (ctx, w) => themes.drawSun(ctx, w), { scale: 1 });
      canvasTexture(this, 'stars', 512, 512, themes.drawStars, { scale: 1 });
      // Tiling layers need a scale that keeps their pixel width whole, or the repeat shows a seam. The far
      // skyline is hazy on purpose and stays at 1; the sky is a plain gradient, one column stretched sideways.
      const e = this.ext;
      const midScale = kit.renderScale > 1.25 ? 1.5 : 1;
      const roofScale = Math.max(1, Math.ceil(kit.renderScale));
      THEMES.forEach((t, i) => {
        c(`lantern-${i}`, 30, 42, (ctx) => themes.drawLantern(ctx, t.lantern));
        canvasTexture(
          this,
          `sky-${i}`,
          8,
          e.y1 - e.y0,
          (ctx, w, h) => themes.drawSky(ctx, w, h, t, e.y0),
          { scale: 1 },
        );
        canvasTexture(this, `far-${i}`, TILE_W, FAR.h, t.far, { scale: 1 });
        canvasTexture(
          this,
          `mid-${i}`,
          TILE_W,
          MID.h,
          (ctx, w, h) => {
            this.anchors[i] = t.mid(ctx, w, h);
          },
          { scale: midScale },
        );
        canvasTexture(
          this,
          `roof-${i}`,
          ROOF_W,
          e.y1 - GROUND_Y,
          (ctx, w, h) => themes.drawRoof(ctx, w, h, t.roof),
          { scale: roofScale },
        );
      });
    }

    private tile(key: string, y: number, h: number, f: number): Tile {
      const e = this.ext;
      const z = texScale(this, key);
      const t = this.add
        .tileSprite(e.x0, y, e.x1 - e.x0, h, key)
        .setOrigin(0)
        .setTileScale(1 / z);
      return { t, f, z };
    }

    private drawBackdrop(i: number): Backdrop {
      const t = THEMES[i]!;
      const e = this.ext;
      const sky = this.add
        .image(e.x0, e.y0, `sky-${i}`)
        .setOrigin(0)
        .setDisplaySize(e.x1 - e.x0, e.y1 - e.y0);
      const parts: Phaser.GameObjects.GameObject[] = [sky];
      const layers: Tile[] = [];
      if (t.stars > 0) {
        const stars = this.tile('stars', e.y0, 330 - e.y0, 0.02);
        stars.t.setAlpha(t.stars);
        layers.push(stars);
        parts.push(stars.t);
      }
      const orb = t.orb.kind === 'moon' ? 'moon' : 'sun';
      parts.push(
        canvasImage(this, t.orb.x, t.orb.y, orb)
          .setScale(t.orb.scale / texScale(this, orb))
          .setAlpha(t.orb.alpha),
      );
      // half the clouds over the design area, the rest up in the extra sky a taller view shows
      const clouds = Array.from({ length: e.y0 < -100 ? 6 : 3 }, (_, k) => {
        const y = k < 3 ? 50 + k * 70 + this.rnd() * 30 : e.y0 + 70 + this.rnd() * (-e.y0 - 90);
        const x = e.x0 + this.rnd() * (e.x1 - e.x0);
        const img = canvasImage(this, x, y, 'cloud').setTint(t.cloud.tint).setAlpha(t.cloud.alpha);
        img.setScale((0.55 + this.rnd() * 0.45) * img.scaleX);
        parts.push(img);
        return { img, x, v: 4 + this.rnd() * 9 };
      });
      const far = this.tile(`far-${i}`, HORIZON - FAR.h, FAR.h, FAR.f);
      const mid = this.tile(`mid-${i}`, HORIZON - MID.h, MID.h, MID.f);
      layers.push(far, mid);
      parts.push(far.t, mid.t);
      const anchors = this.anchors[i] ?? [];
      // two sprites per hanging point: the view can be wider than one repeat of the skyline
      const lights = [...anchors, ...anchors].map(() =>
        canvasImage(this, 0, 0, `lantern-${i}`).setOrigin(0.5, 0),
      );
      parts.push(...lights);
      const box = this.add.container(0, 0, parts).setDepth(-1000).setVisible(false);
      const roof = this.tile(`roof-${i}`, GROUND_Y, e.y1 - GROUND_Y, 1);
      roof.t.setDepth(0).setVisible(false);
      return { box, layers, clouds, anchors, lights, roof };
    }

    private drawWorld(): void {
      this.sets = THEMES.map((_, i) => this.drawBackdrop(i));
      const motes = Array.from({ length: AMBIENT_MAX }, () => ({
        img: canvasImage(this, 0, 0, 'glow').setDepth(-800).setVisible(false),
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        a: 1,
        ph: 0,
        frame: 0,
      }));
      const speed = Array.from({ length: 6 }, () => ({
        img: canvasImage(this, 0, 0, 'speedline').setDepth(-700).setOrigin(0, 0.5),
        x: this.rnd() * DESIGN.width,
        y: 150 + this.rnd() * 280,
      }));
      // the gate stands behind the ridge, so its posts never read as something to jump
      const gate = canvasImage(this, 0, GROUND_Y + 14, 'gate')
        .setOrigin(0.5, 1)
        .setDepth(-50)
        .setVisible(false);
      const flag = canvasImage(this, 0, GROUND_Y, 'bestflag')
        .setOrigin(5.5 / 40, 1)
        .setDepth(2)
        .setVisible(false);
      this.world = { motes, speed, flag, gate };
      this.gulp = canvasImage(this, -300, 200, 'gulp-0').setDepth(7).setVisible(false);
    }

    private drawBao(): void {
      const at = (key: string, x: number, y: number, ox: number, oy: number) =>
        canvasImage(this, x, y + PIVOT, key).setOrigin(ox, oy);
      const tails = at(
        'bao-tails-0',
        -25,
        -31,
        art.TAILS.kx / art.TAILS.w,
        art.TAILS.ky / art.TAILS.h,
      );
      const bootB = at('bao-boot', -7, 0, 0.5, 11 / 12).setTint(0xb8a8c8);
      const body = at('bao-body', 0, -5, 0.5, art.BAO.feetY / art.BAO.h);
      const face = at('bao-face-run', 0, -5, 0.5, art.BAO.feetY / art.BAO.h);
      const bootF = at('bao-boot', 7, 0, 0.5, 11 / 12);
      const slide = at(
        'bao-slide',
        0,
        0,
        art.SLIDE_POSE.cx / art.SLIDE_POSE.w,
        art.SLIDE_POSE.bottom / art.SLIDE_POSE.h,
      ).setVisible(false);
      const spin = this.add.container(0, -PIVOT, [tails, bootB, body, face, bootF, slide]);
      const rig = this.add.container(BAO_X, GROUND_Y, [spin]).setDepth(6);
      const shadow = canvasImage(this, BAO_X, GROUND_Y + 3, 'shadow').setDepth(1);
      const stars = [0, 1, 2].map(() =>
        canvasImage(this, 0, 0, 'dizzy').setDepth(8).setVisible(false),
      );
      this.bao = { rig, spin, body, face, slide, tails, bootF, bootB, shadow, stars };
    }

    private drawHud(): void {
      const D = 30;
      const score = hudPill(this, 14, 12, {
        icon: 'star',
        accent: colors.orange,
        label: strings.scoreLabel,
        value: '0',
        width: 184,
        height: 52,
        depth: D,
      });
      const dist = hudPill(this, 14, 70, {
        icon: 'flag',
        accent: colors.sky,
        label: strings.distanceLabel,
        value: '0 m',
        width: 150,
        height: 42,
        depth: D,
      });
      const coins = hudPill(this, 170, 70, {
        icon: 'coin',
        accent: colors.gold,
        label: strings.coinsLabel,
        value: '0',
        width: 116,
        height: 42,
        depth: D,
      });
      const ring = this.add.graphics();
      const badge = canvasImage(this, 0, 0, 'mult-badge');
      const multText = kit
        .text(this, 0, 0, '×1', { px: 18, weight: 700, color: 'ink' })
        .setOrigin(0.5);
      const mult = this.add.container(232, 38, [ring, badge, multText]).setDepth(D);
      const bar = this.add.rectangle(46, 31, 176, 5, colorNum('vermillion')).setOrigin(0, 0.5);
      const warn = this.add
        .container(14, 120, [
          canvasImage(this, 0, 0, 'warn').setOrigin(0),
          kit
            .text(this, 46, 15, strings.gulpClose, { px: 16, weight: 700, color: 'text' })
            .setOrigin(0, 0.5),
          this.add.rectangle(46, 31, 176, 5, colorNum('ink'), 0.7).setOrigin(0, 0.5),
          bar,
        ])
        .setDepth(D)
        .setVisible(false);
      // one parent for the HUD, so it can sit in the view's corner and grow on a narrow frame
      const root = this.add
        .container(0, 0, [score.container, dist.container, coins.container, mult, warn])
        .setDepth(D);
      this.hud = { score, dist, coins, mult, multText, ring, warn, bar, root };
      const name = kit.text(this, 0, 9, '', { px: 26, weight: 700, color: 'text' }).setOrigin(0.5);
      const box = this.add
        .container(480, 60, [
          canvasImage(this, 0, 0, 'banner'),
          kit
            .text(this, 0, -15, strings.entering.toUpperCase(), {
              px: 13,
              weight: 700,
              color: colors.gold,
            })
            .setOrigin(0.5),
          name,
        ])
        .setDepth(35)
        .setVisible(false);
      this.banner = { box, name, x: 480, y: 60 };
      this.readyTitle = canvasImage(this, 0, -76, 'title');
      this.readyPrompt = kit
        .text(this, 0, -4, '', { px: 22, weight: 700, color: 'ink' })
        .setOrigin(0.5);
      this.readyPill = this.add.container(0, 28, [
        canvasImage(this, 0, 0, 'prompt'),
        this.readyPrompt,
      ]);
      this.readyBest = kit
        .text(this, 0, 80, '', {
          px: 18,
          weight: 600,
          color: 'text',
          stroke: 'ink',
          strokePx: 4,
        })
        .setOrigin(0.5);
      this.ready = this.add
        .container(480, 234, [this.readyTitle, this.readyPill, this.readyBest])
        .setDepth(40);
    }

    /** Pins the HUD to the view's top-left corner and enlarges the interface when the frame is narrow. */
    private layoutUi(): void {
      const { view, cssWidth } = this.tk.layout;
      const s = Math.max(1, Math.min(1.5, 560 / Math.max(1, cssWidth)));
      this.hud.root.setPosition(view.x, view.y).setScale(s);
      this.ready.setScale(s);
      // the call-out goes beside the HUD, or under it when the view is tall enough to have sky to spare
      const b = this.banner;
      const tall = view.height > 640;
      b.x = tall ? 480 : Math.max(480, view.x + 472 * s);
      b.y = view.y + (tall ? 216 : 46) * s;
      b.box.setScale(s).setPosition(b.x, b.y);
    }

    // ─── input: keyboard via tk.input, mouse/touch via Phaser pointer events (gated here) ───
    private bindPointer(): void {
      const tk = this.tk;
      const live = () => !tk.attract && !tk.ui.open;
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (!live()) return;
        if (p.rightButtonDown()) return void (this.intents.slide = true);
        // Phaser's own pointer position works for touch and mouse alike (a TouchEvent has no clientY).
        // Times are the events' own timestamps (the clock the frame loop uses), so a slow frame cannot eat the
        // swipe window.
        if (p.wasTouch) this.touch = { t: p.downTime, y: p.y, jumped: false };
        else this.intents.jumpDown = true;
      });
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        const touch = this.touch;
        if (!touch || !p.isDown || p.moveTime - touch.t > SWIPE_WINDOW_MS) return;
        // A finger that drags down is a slide. If its jump has already started, the slide drops Bao at once.
        const dragged = (p.y - touch.y) / this.scale.displayScale.y;
        if (dragged > SWIPE_DOWN_PX) {
          this.touch = null;
          this.intents.slide = true;
          if (touch.jumped) this.intents.jumpUp = true;
        }
      });
      this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.wasTouch && this.touch) {
          if (!this.touch.jumped) this.intents.jumpDown = true;
          this.touch = null;
          this.intents.jumpUp = true;
        } else if (!p.rightButtonReleased()) this.intents.jumpUp = true;
      });
    }

    // ─── run lifecycle ───
    private newRun(): void {
      const attract = !!this.tk.attract;
      // Each run draws its own seed from tk.rng.main (attract: seeded and deterministic).
      const seed = `${this.tk.meta.id}:run:${this.tk.rng.main.nextUint32().toString(16)}`;
      this.sim = createSim(this.tk.rng.create(seed), {
        bestMetres: attract ? 0 : this.stats.bestMetres,
        ...(attract ? { reel: ATTRACT_REEL, autoStart: true } : {}),
      });
      this.ending = false;
      this.acc = 0;
      this.intents = {};
      this.jumpKind = null;
      this.anim = freshAnim();
      for (const s of this.sprites.values()) s.setVisible(false);
      this.sprites.clear();
      this.knocked.clear();
      this.themeShift = attract ? this.demoRuns++ % THEMES.length : 0;
      this.gateM = nextDistrictAt(0);
      this.tweens.killTweensOf(this.banner.box);
      this.banner.box.setVisible(false);
      this.showTheme(this.themeShift, true);
      const primary = this.tk.env.input.primary;
      const locale = this.tk.env.locale;
      this.readyPrompt.setText(
        primary === 'touch'
          ? strings.readyTouch
          : primary === 'pointer'
            ? strings.readyPointer
            : strings.readyKeyboard,
      );
      this.readyBest.setText(
        this.stats.bestPoints > 0
          ? strings.t('best', { best: formatScore(this.stats.bestPoints, 'integer', locale) })
          : '',
      );
      this.hud.score.setLabel(
        this.stats.bestPoints > 0
          ? strings.t('scoreLabelBest', {
              best: formatScore(this.stats.bestPoints, 'integer', locale),
            })
          : strings.scoreLabel,
      );
      this.ready.setVisible(!attract).setAlpha(1);
      this.hud.root.setVisible(!attract);
      this.hud.warn.setVisible(false);
      this.shown = { metres: -1, crumbs: -1, ring: '' };
      this.render(0);
    }

    override update(_time: number, delta: number): void {
      if (!this.sim) return;
      // A finger that has not started dragging down after a short beat is a jump. It stays tracked, so a swipe
      // that begins a little late still turns into a slide.
      if (this.touch && !this.touch.jumped && this.game.loop.now - this.touch.t >= TAP_JUMP_MS) {
        this.touch.jumped = true;
        this.intents.jumpDown = true;
      }
      this.acc = Math.min(this.acc + delta, MAX_STEPS_PER_FRAME * STEP_MS);
      while (this.acc >= STEP_MS) {
        this.acc -= STEP_MS;
        const intents = this.intents;
        this.intents = {};
        if (intents.jumpDown) this.jumpKind = this.sim.next()?.kind ?? null;
        const h = this.sim.h;
        const events = this.sim.step(intents);
        this.anim.vy = (this.sim.h - h) * 60;
        this.handle(events);
        this.publishView();
      }
      this.render(Math.min(0.05, delta / 1000));
    }

    private publishView(): void {
      this.tk.attract?.setView({
        next: this.sim.next(),
        move: this.sim.move,
        jumpKind: this.jumpKind,
      } satisfies AttractView);
    }

    /** HUD-local coordinates to design coordinates. */
    private hudX(x: number): number {
      return this.hud.root.x + x * this.hud.root.scaleX;
    }
    private hudY(y: number): number {
      return this.hud.root.y + y * this.hud.root.scaleY;
    }

    private feetY(): number {
      return GROUND_Y - this.sim.h * WU - this.anim.lift;
    }

    private handle(events: SimEvent[]): void {
      const { sfx } = this.tk;
      const now = this.time.now;
      const a = this.anim;
      let crumb = false;
      for (const e of events) {
        switch (e.type) {
          case 'start':
            this.tk.run.begin();
            this.tweens.add({
              targets: this.ready,
              alpha: 0,
              duration: this.tk.motion.ms('base'),
              onComplete: () => this.ready.setVisible(false),
            });
            break;
          case 'jump':
            sfx.play('jump');
            a.jumpAt = now;
            a.spun = false;
            burst(this, BAO_X, GROUND_Y - 2, {
              count: 4,
              colors: DUST,
              distance: 22,
              size: 8,
              lifeMs: 300,
              angle: Math.PI,
              spread: 1.2,
              depth: 5,
            });
            break;
          case 'land':
            a.landAt = now;
            a.spinAt = NEVER;
            burst(this, BAO_X, GROUND_Y - 3, {
              count: 7,
              colors: DUST,
              distance: 30,
              size: 9,
              lifeMs: 380,
              spread: Math.PI * 0.9,
              depth: 5,
            });
            break;
          case 'slide':
            sfx.play('slide');
            break;
          case 'crumb':
            sfx.play('coin', { detuneCents: Math.min(360, 40 * (e.streak % 10)) });
            crumb = true;
            break;
          case 'mult':
            sfx.play('mult');
            popText(this, BAO_X + 10, this.feetY() - 78, `×${e.multiplier}`, {
              px: 34,
              color: colors.orange,
              rise: 44,
            });
            burst(this, this.hudX(this.hud.mult.x), this.hudY(this.hud.mult.y), {
              count: 12,
              shape: 'star',
              colors: SPARKS,
              distance: 50,
              size: 10,
            });
            bump(this, this.hud.mult, 1.35, 260);
            break;
          case 'stumble':
            sfx.play('hit');
            this.time.delayedCall(150, () => sfx.play('squawk'));
            shake(this, 220, 0.01);
            flash(this, colors.vermillion, 200, 0.25);
            burst(this, BAO_X, this.feetY() - 28, {
              count: 10,
              colors: CRUMBS,
              distance: 60,
              size: 8,
              gravity: 30,
              lifeMs: 600,
              depth: 7,
            });
            a.stumbleAt = now;
            a.gulpIn = now;
            a.gulpOut = NEVER;
            this.time.delayedCall(260, () =>
              popText(this, 120, 236, strings.squawk, {
                px: 24,
                color: colors.text,
                rise: 30,
                ms: 800,
                depth: 1001,
              }),
            );
            break;
          case 'gulp-leaves':
            a.gulpOut = now;
            break;
          case 'eaten':
            sfx.play('lose');
            a.eatenAt = now;
            a.gulpFrom = { x: this.gulp.x, y: this.gulp.y };
            flash(this, colors.text, 260, 0.6);
            shake(this, 320, 0.014);
            burst(this, BAO_X, this.feetY() - 30, {
              count: 14,
              shape: 'star',
              colors: SPARKS,
              distance: 80,
              size: 11,
              lifeMs: 700,
              depth: 9,
            });
            break;
          case 'district': {
            const i = (e.index + this.themeShift) % THEMES.length;
            sfx.play('mult', { detuneCents: -700 });
            this.showTheme(i, false);
            this.announce(districts[i]!);
            break;
          }
          case 'best':
            this.tk.ui.toast(strings.pastBest, { tone: 'success' });
            burst(this, BAO_X, this.feetY() - 60, {
              count: 18,
              shape: 'star',
              distance: 90,
              size: 11,
            });
            break;
          case 'over':
            void this.gameOver();
            break;
        }
      }
      if (crumb) {
        // a taken coin stays in the list until the next step, so each pickup is seen here exactly once
        for (const c of this.sim.crumbList) {
          if (!c.taken) continue;
          const x = c.x * WU;
          const y = GROUND_Y - c.y * WU;
          burst(this, x, y, {
            count: 6,
            shape: 'star',
            colors: SPARKS,
            distance: 34,
            size: 9,
            lifeMs: 420,
            depth: 9,
          });
          popText(this, x, y - 14, '+1', {
            px: 16,
            color: colors.gold,
            rise: 26,
            ms: 520,
            depth: 9,
          });
        }
        this.hud.coins.bump();
      }
    }

    /** Switches district: the new scenery fades in over the old, which is then put away. */
    private showTheme(i: number, instant: boolean): void {
      const from = this.sets[this.theme]!;
      const to = this.sets[i]!;
      const settle = () => {
        for (const b of this.sets) {
          const on = b === to;
          b.box.setVisible(on).setAlpha(1).setDepth(-1000);
          b.roof.t.setVisible(on).setAlpha(1).setDepth(0);
        }
      };
      for (const b of this.sets) this.tweens.killTweensOf([b.box, b.roof.t]);
      this.theme = i;
      const kind = THEMES[i]!.ambient;
      if (kind !== this.ambient || instant) this.seedMotes(kind);
      settle();
      if (instant || this.tk.motion.reduced || from === to) return;
      from.box.setVisible(true);
      from.roof.t.setVisible(true);
      to.box.setAlpha(0).setDepth(-990);
      to.roof.t.setAlpha(0).setDepth(0.5);
      this.tweens.add({
        targets: [to.box, to.roof.t],
        alpha: 1,
        duration: 1400,
        ease: 'Sine.easeInOut',
        onComplete: settle,
      });
    }

    private announce(name: string): void {
      const b = this.banner;
      const reduced = this.tk.motion.reduced;
      this.tweens.killTweensOf(b.box);
      b.name.setText(name);
      b.box
        .setVisible(true)
        .setAlpha(0)
        .setPosition(b.x, reduced ? b.y : b.y - 16);
      this.tweens.add({ targets: b.box, alpha: 1, y: b.y, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({
        targets: b.box,
        alpha: 0,
        delay: 2300,
        duration: 400,
        onComplete: () => b.box.setVisible(false),
      });
    }

    /** Hands the drifting sprites to a district's kind of air and scatters them over the view. */
    private seedMotes(kind: Ambient): void {
      const { count, key } = AMBIENT[kind];
      const e = this.ext;
      const top = this.tk.layout.view.y;
      this.ambient = kind;
      this.ambientAt = this.time.now;
      this.world.motes.forEach((m, i) => {
        m.img.setVisible(false);
        if (i >= count) return;
        m.img
          .setTexture(key)
          .setAngle(0)
          .setAlpha(0)
          .setBlendMode(kind === 'embers' ? 'ADD' : 'NORMAL')
          .setTint(kind === 'embers' ? EMBERS[i % 3]! : 0xffffff)
          .setScale((kind === 'embers' ? 0.2 + this.rnd() * 0.3 : 1) / texScale(this, key));
        m.x = e.x0 + this.rnd() * (e.x1 - e.x0);
        m.ph = this.rnd() * TAU;
        m.a = 0.5 + this.rnd() * 0.5;
        m.frame = -1;
        if (kind === 'embers') {
          m.y = 160 + this.rnd() * 280;
          m.vx = 8 + this.rnd() * 16;
          m.vy = 10 + this.rnd() * 18;
        } else if (kind === 'rain') {
          m.y = top + this.rnd() * (GROUND_Y - top);
          m.vx = 230;
          m.vy = 820 + this.rnd() * 160;
        } else if (kind === 'birds') {
          m.y = Math.max(top + 30, -160) + this.rnd() * 150;
          m.vx = 20 + this.rnd() * 16;
          m.vy = 0;
        } else {
          m.y = top + this.rnd() * (GROUND_Y - top);
          m.vx = 18 + this.rnd() * 30;
          m.vy = 24 + this.rnd() * 26;
        }
      });
    }

    private async gameOver(): Promise<void> {
      if (this.ending) return;
      this.ending = true;
      const s = this.sim;
      if (!this.tk.attract) {
        this.stats = withRun(this.stats, {
          points: s.points,
          metres: s.metres,
          crumbs: s.crumbs,
          maxMultiplier: s.maxMultiplier,
          at: new Date().toISOString(),
        });
        this.statsSave.set(this.stats);
      }
      // let the gulp land: Gulp lifts Bao off the roof before the dialog covers the scene
      await new Promise<void>((resolve) =>
        this.time.delayedCall(this.tk.motion.reduced ? 300 : 750, resolve),
      );
      if (this.tk.signal.aborted || !this.ending) return;
      const action = await this.tk.ui.gameOver({
        title: strings.t('gameOver', { m: s.metres, crumbs: s.crumbs }),
        scores: [{ board: 'distance', value: s.points }],
        meta: {
          v: 1,
          metres: s.metres,
          crumbs: s.crumbs,
          maxMultiplier: s.maxMultiplier,
          runSteps: s.steps,
          chunks: s.chunkIds.length,
        },
      });
      if (this.tk.signal.aborted) return;
      if (action === 'play-again') this.newRun();
    }

    // ─── drawing ───
    /** The pooled image for a sim object; an image is free exactly while it is hidden. */
    private sprite(id: number, pool: string, key = pool, depth = 3): Img {
      let s = this.sprites.get(id);
      if (s) return s;
      let list = this.pools.get(pool);
      if (!list) this.pools.set(pool, (list = []));
      s = list.find((x) => !x.visible);
      if (!s) {
        s = this.add.image(0, 0, key).setDepth(depth); // set once: every setDepth() re-sorts the display list
        list.push(s);
      }
      s.setTexture(key)
        .setVisible(true)
        .setAlpha(1)
        .setAngle(0)
        .setFlipY(false)
        .setOrigin(0.5)
        .setScale(1 / texScale(this, key));
      this.sprites.set(id, s);
      return s;
    }

    private render(dt: number): void {
      const now = this.time.now;
      this.renderWorld(now, dt);
      this.renderThings(now);
      this.renderBao(now, dt);
      this.renderGulp(now);
      this.renderHud(now);
    }

    private renderWorld(now: number, dt: number): void {
      const s = this.sim;
      const w = this.world;
      const e = this.ext;
      const reduced = this.tk.motion.reduced;
      const px = s.distance * WU;
      const running = s.phase === 'running';
      for (const b of this.sets) {
        // the rooftop is the ground Bao runs on, so it scrolls even with reduced motion; the skyline does not
        if (b.roof.t.visible) b.roof.t.tilePositionX = wrap(px + e.x0, ROOF_W) * b.roof.z;
        if (!b.box.visible) continue;
        for (const { t, f, z } of b.layers)
          t.tilePositionX = wrap((reduced ? 0 : px * f) + e.x0, TILE_W) * z;
        const scroll = reduced ? 0 : px * MID.f;
        const n = b.anchors.length;
        for (let i = 0; i < b.lights.length; i++) {
          const an = b.anchors[i % n]!;
          const x = e.x0 + wrap(an.x - scroll - e.x0, TILE_W) + (i >= n ? TILE_W : 0);
          const l = b.lights[i]!;
          l.setVisible(x < e.x1 + 20);
          if (l.visible)
            l.setPosition(x, HORIZON - MID.h + an.y).setAngle(
              reduced ? 0 : Math.sin(now / 650 + i * 1.7) * 9,
            );
        }
        if (!reduced)
          for (const c of b.clouds) {
            c.x -= (c.v + (running ? s.speed * 0.6 : 0)) * dt;
            if (c.x < e.x0 - 140) c.x = e.x1 + 140;
            c.img.setX(c.x);
          }
      }
      this.renderMotes(now, dt, running && !reduced ? s.speed * WU * 0.3 : 0);
      const fast = running && !reduced ? clamp01((s.speed - 9.5) / 3.5) : 0;
      for (const l of w.speed) {
        l.img.setVisible(fast > 0);
        if (!fast) continue;
        l.x -= s.speed * WU * 1.9 * dt;
        if (l.x < e.x0 - 160) {
          l.x = e.x1 + this.rnd() * 300;
          l.y = 140 + this.rnd() * 290;
        }
        l.img.setPosition(l.x, l.y).setAlpha(fast * 0.5);
      }
      let gateX = (BUN_X + (this.gateM - s.distance)) * WU;
      if (gateX < e.x0 - 140) {
        this.gateM = nextDistrictAt(s.metres);
        gateX = (BUN_X + (this.gateM - s.distance)) * WU;
      }
      w.gate.setVisible(gateX < e.x1 + 140).setX(gateX);
      const bestX = (BUN_X + (s.bestMetres - s.distance)) * WU;
      w.flag.setVisible(s.bestMetres > 0 && bestX > e.x0 - 60 && bestX < e.x1 + 60).setX(bestX);
    }

    /** Embers, rain, gulls or petals, whichever the district has. `drift` is how fast the run sweeps them back. */
    private renderMotes(now: number, dt: number, drift: number): void {
      const e = this.ext;
      const top = this.tk.layout.view.y;
      const kind = this.ambient;
      const count = this.tk.motion.reduced ? 0 : AMBIENT[kind].count;
      const fade = clamp01((now - this.ambientAt) / 900);
      for (let i = 0; i < AMBIENT_MAX; i++) {
        const m = this.world.motes[i]!;
        if (i >= count) {
          if (m.img.visible) m.img.setVisible(false);
          continue;
        }
        m.img.setVisible(true);
        if (kind === 'embers') {
          m.x -= (m.vx + drift) * dt;
          m.y -= m.vy * dt;
          if (m.x < e.x0 - 20 || m.y < 110) {
            m.x = e.x1 + 10 + this.rnd() * 60;
            m.y = 260 + this.rnd() * 190;
          }
          m.img
            .setPosition(m.x + Math.sin(now / 900 + m.ph) * 8, m.y)
            .setAlpha(fade * m.a * (0.55 + 0.45 * Math.sin(now / 280 + m.ph)));
        } else if (kind === 'rain') {
          m.x -= (m.vx + drift * 0.5) * dt;
          m.y += m.vy * dt;
          if (m.y > GROUND_Y - 10) {
            m.y = top - 30 - this.rnd() * 60;
            m.x = e.x0 + this.rnd() * (e.x1 - e.x0 + 260);
          }
          m.img.setPosition(m.x, m.y).setAlpha(fade * m.a * 0.6);
        } else if (kind === 'birds') {
          m.x += (m.vx - drift * 0.08) * dt;
          if (m.x > e.x1 + 30 || m.x < e.x0 - 300) {
            m.x = e.x0 - 30 - this.rnd() * 200;
            m.y = Math.max(top + 30, -160) + this.rnd() * 150;
          }
          const frame = Math.floor(now / 240 + m.ph) % 2;
          if (frame !== m.frame) m.img.setTexture(`bird-${(m.frame = frame)}`);
          m.img.setPosition(m.x, m.y + Math.sin(now / 700 + m.ph) * 6).setAlpha(fade);
        } else {
          m.x -= (m.vx + drift * 0.5) * dt;
          m.y += m.vy * dt;
          if (m.y > GROUND_Y - 6 || m.x < e.x0 - 20) {
            m.y = top - 12 - this.rnd() * 40;
            m.x = e.x0 + this.rnd() * (e.x1 - e.x0 + 300);
          }
          m.img
            .setPosition(m.x + Math.sin(now / 600 + m.ph) * 14, m.y)
            .setAngle((now / 9 + m.ph * 60) % 360)
            .setAlpha(fade * (0.6 + 0.4 * m.a));
        }
      }
    }

    private renderThings(now: number): void {
      const s = this.sim;
      const reduced = this.tk.motion.reduced;
      const live = this.live;
      live.clear();
      const crab = `crab-${reduced ? 0 : Math.floor(now / 90) % 2}`;
      for (const o of s.obstacles) {
        live.add(o.id);
        const x = o.x * WU;
        let t = 0;
        if (o.knocked) {
          let at = this.knocked.get(o.id);
          if (at === undefined) this.knocked.set(o.id, (at = now));
          t = now - at;
        }
        if (o.kind === 'pin') {
          const img = this.sprite(o.id, 'crab', crab).setOrigin(0, 1);
          if (!o.knocked) img.setTexture(crab).setPosition(x, GROUND_Y + 1);
          else
            img
              .setFlipY(true)
              .setPosition(x, GROUND_Y + 1 - 46 * Math.sin(clamp01(t / 480) * Math.PI))
              .setAlpha(0.85); // bowled over
        } else if (o.kind === 'tins') {
          const img = this.sprite(o.id, 'steamers')
            .setOrigin(0, 1)
            .setPosition(x - 1, GROUND_Y + 1);
          if (o.knocked) img.setAngle(easeOut(clamp01(t / 260)) * 14).setAlpha(0.8);
          const steam = this.sprite(-(o.id + 1), 'steam');
          live.add(-(o.id + 1));
          const ph = (now / 1500 + o.id * 0.37) % 1;
          steam
            .setOrigin(0.5, 1)
            .setPosition(x + 27, GROUND_Y - 86 - (reduced ? 0 : ph * 12))
            .setAlpha(o.knocked ? 0 : reduced ? 0.6 : Math.sin(ph * Math.PI) * 0.9); // alpha, not visible: hidden = free in the pool
        } else {
          const pw = o.w * WU;
          const img = this.sprite(o.id, `sign-${o.w}`)
            .setOrigin(0.5, 0)
            .setPosition(x + pw / 2, SIGN_TOP);
          if (o.knocked)
            img.setAngle(reduced ? 0 : Math.sin(t / 110) * 16 * Math.exp(-t / 700)).setAlpha(0.8);
          const ropes = `ropes-${o.w}`;
          const z = texScale(this, ropes);
          this.sprite(-(o.id + 1), ropes)
            .setOrigin(0.5, 1)
            .setPosition(x + pw / 2, SIGN_TOP + 4)
            .setScale(1 / z, (SIGN_TOP + 4 - this.ext.y0) / (8 * z));
          live.add(-(o.id + 1));
        }
      }
      const z = texScale(this, 'coin');
      const zt = texScale(this, 'twinkle');
      for (const c of s.crumbList) {
        if (c.taken) continue;
        live.add(c.id).add(-(c.id + 1));
        const spin = reduced ? 1 : Math.abs(Math.cos(now / 210 + c.id * 0.6));
        const y = GROUND_Y - c.y * WU + (reduced ? 0 : Math.sin(now / 260 + c.id) * 2);
        const coin = this.sprite(c.id, 'coin')
          .setPosition(c.x * WU, y)
          .setScale((0.18 + 0.82 * spin) / z, 1 / z);
        const tw = Math.max(0, Math.sin(now / 240 + c.id * 1.9)) ** 14;
        this.sprite(-(c.id + 1), 'twinkle', 'twinkle', 4)
          .setPosition(coin.x + 7, y - 8)
          .setAlpha(reduced ? 0 : tw)
          .setScale((0.5 + tw * 0.7) / zt);
      }
      for (const [id, img] of this.sprites) {
        if (live.has(id)) continue;
        img.setVisible(false);
        this.sprites.delete(id);
        this.knocked.delete(id);
      }
    }

    private renderBao(now: number, dt: number): void {
      const s = this.sim;
      const b = this.bao;
      const a = this.anim;
      const reduced = this.tk.motion.reduced;
      const running = s.phase === 'running';
      const air = s.move === 'airborne' || s.move === 'fastdrop';
      const sliding = running && s.move === 'sliding';
      const caught = s.phase === 'eaten' || s.phase === 'over';
      const tStumble = now - a.stumbleAt;
      if (running && !air) a.cycle += dt * (2.2 + s.speed * 0.4) * TAU;
      const p = a.cycle;

      let sx = 1;
      let sy = 1;
      let tilt = 0;
      let bob = 0;
      let spin = 0;
      let front = { x: 7, y: 0 };
      let back = { x: -7, y: 0 };
      let face: art.Face = 'run';
      let tailFrame = Math.floor(now / 70) % 3;
      let tailAngle = 10 + Math.sin(now / 90) * 6;
      a.lift = 0;

      if (s.phase === 'ready') {
        const br = reduced ? 0 : Math.sin(now / 420) * 0.03;
        sx = 1 - br;
        sy = 1 + br;
        tailFrame = Math.floor(now / 240) % 3;
        tailAngle = -20 + Math.sin(now / 500) * 6;
      } else if (caught) {
        const te = now - a.eatenAt;
        const k = reduced ? 1 : clamp01(te / 160);
        face = 'sad';
        sx = 1 + 0.16 * k;
        sy = 1 - 0.18 * k;
        tilt = -6 * k;
        tailAngle = -30;
        const tl = te - 420;
        if (tl > 0) {
          // Gulp has him by the swirl: up he goes, boots dangling
          a.lift = reduced ? 60 : 90 * easeOut(clamp01(tl / 900));
          sx = 0.96;
          sy = 1.06;
          tilt = reduced ? 0 : Math.sin(tl / 260) * 7;
          front = { x: 6, y: 3 };
          back = { x: -6, y: 2 };
        }
      } else if (air) {
        const st = Math.max(-0.1, Math.min(0.14, a.vy / 70));
        sx = 1 - st * 0.6;
        sy = 1 + st;
        tilt = a.vy > 0 ? -4 : 6;
        front = { x: 9, y: -5 };
        back = { x: -5, y: -3 };
        tailAngle = a.vy > 0 ? -24 : 28;
        if (a.vy > 1) face = 'joy';
        if (!a.spun && !reduced && s.h > 1.85 && a.vy > 0) {
          a.spun = true;
          a.spinAt = now;
        }
        if (a.spinAt !== NEVER) {
          const t = (now - a.spinAt) / 440;
          if (t >= 1) a.spinAt = NEVER;
          else {
            spin = 360 * easeInOut(t);
            front = { x: 5, y: -10 };
            back = { x: -5, y: -9 };
            sx = sy = 0.92;
            face = 'joy';
          }
        }
      } else if (running && !sliding) {
        front = { x: 4 + Math.cos(p) * 8, y: -Math.max(0, Math.sin(p)) * 6 };
        back = { x: -4 + Math.cos(p + Math.PI) * 8, y: -Math.max(0, -Math.sin(p)) * 6 };
        bob = Math.abs(Math.sin(p)) * 3;
        tilt = 7 + Math.sin(p * 2) * 2;
      }
      if (sliding) {
        tailFrame = Math.floor(now / 45) % 3;
        tailAngle = 4 + Math.sin(now / 60) * 4;
        if (!reduced && now - a.dustAt > 90) {
          a.dustAt = now;
          burst(this, BAO_X - 26, GROUND_Y - 3, {
            count: 2,
            colors: DUST,
            distance: 34,
            size: 8,
            lifeMs: 320,
            angle: Math.PI,
            spread: 0.7,
            depth: 5,
          });
        }
      }
      if (!reduced && !caught) {
        const tj = now - a.jumpAt;
        const tl = now - a.landAt;
        if (tj < 200) {
          const k = 0.22 * (1 - tj / 200);
          sx -= k;
          sy += k;
        }
        if (tl < 260) {
          const k = 0.26 * Math.exp(-tl / 70) * Math.cos(tl / 40);
          sx += k;
          sy -= k;
        }
      }
      if (!caught) {
        if (tStumble < 1000) {
          face = 'dizzy';
          if (!reduced) tilt += Math.sin(tStumble / 50) * 16 * (1 - tStumble / 1000);
        } else if (s.gulpMs > 0 && face !== 'joy') face = 'yikes';
        else if (face === 'run' && now % 3300 < 110) face = 'blink';
      }

      const feetY = GROUND_Y - s.h * WU - a.lift;
      b.rig.setPosition(BAO_X, feetY).setScale(sx * BAO_SCALE, sy * BAO_SCALE);
      b.rig.setAlpha(
        running && s.invulnMs > 0 && Math.floor(s.invulnMs / 120) % 2 === 0 ? 0.55 : 1,
      );
      b.spin.setAngle(sliding ? 0 : tilt + spin).setY(-PIVOT - bob);
      for (const o of [b.body, b.face, b.bootF, b.bootB]) o.setVisible(!sliding);
      b.slide.setVisible(sliding);
      b.face.setTexture(`bao-face-${face}`);
      b.bootF.setPosition(front.x, front.y + PIVOT + bob);
      b.bootB.setPosition(back.x, back.y + PIVOT + bob);
      b.tails.setTexture(`bao-tails-${tailFrame}`).setAngle(reduced ? 0 : tailAngle);
      if (sliding) b.tails.setPosition(-32, PIVOT - 14);
      else b.tails.setPosition(-25, PIVOT - 31);
      const zs = texScale(this, 'shadow');
      const far = clamp01((s.h * WU + a.lift) / 180);
      b.shadow
        .setScale(((sliding ? 1.25 : 1) - far * 0.55) / zs, (1 - far * 0.4) / zs)
        .setAlpha(1 - far * 0.6);

      const dizzy = !caught && tStumble < 1100;
      b.stars.forEach((st, i) => {
        st.setVisible(dizzy);
        if (!dizzy) return;
        const ang = (reduced ? 0 : now / 170) + (i * TAU) / 3;
        const front = Math.sin(ang) > 0;
        st.setPosition(BAO_X + Math.cos(ang) * 24, feetY - 70 + Math.sin(ang) * 6).setAlpha(
          front ? 1 : 0.7,
        );
        if (st.depth !== (front ? 8 : 5)) st.setDepth(front ? 8 : 5); // setDepth() re-sorts the display list
      });
    }

    private renderGulp(now: number): void {
      const s = this.sim;
      const a = this.anim;
      const g = this.gulp;
      const reduced = this.tk.motion.reduced;
      const caught = s.phase === 'eaten' || s.phase === 'over';
      const chasing = s.phase === 'running' && s.gulpMs > 0;
      const leaving = s.phase === 'running' && now - a.gulpOut < 1000;
      g.setVisible(chasing || leaving || caught);
      if (!g.visible) return;
      const flap = FLAP[Math.floor(now / (caught ? 70 : 85)) % 4]!;
      let key = `gulp-${reduced ? 1 : flap}`;
      let x: number;
      let y: number;
      if (caught) {
        const te = now - a.eatenAt;
        const u = reduced ? 1 : clamp01(te / 400);
        // the beak tip (57, -11 from Gulp's centre) closes on Bao's swirl
        const tx = BAO_X - 61;
        const ty = this.feetY() - 53;
        x = a.gulpFrom.x + (tx - a.gulpFrom.x) * u * u;
        y = a.gulpFrom.y + (ty - a.gulpFrom.y) * u * u;
        if (te > 180 && te < 420) key = 'gulp-chomp';
      } else {
        const tin = reduced ? 1 : easeOut(clamp01((now - a.gulpIn) / 700));
        const lunge = reduced ? 0 : Math.max(0, Math.sin(now / 520)) ** 10 * 34;
        const from = this.ext.x0 - 90;
        x = from + (80 - from) * tin + (reduced ? 0 : Math.sin(now / 700) * 12) + lunge;
        y = 200 + 130 * tin + (reduced ? 0 : Math.sin(now / 230) * 10);
        if (!chasing) {
          const t = (now - a.gulpOut) / 1000;
          x -= 320 * t * t;
          y -= 260 * t;
        } else if (lunge > 22) key = 'gulp-chomp';
      }
      g.setTexture(key).setPosition(x, y);
    }

    private renderHud(now: number): void {
      if (this.tk.attract) return;
      const s = this.sim;
      const locale = this.tk.env.locale;
      if (this.ready.visible && !this.tk.motion.reduced) {
        this.readyTitle.setY(-76 + Math.sin(now / 600) * 5);
        this.readyPill.setScale(1 + Math.sin(now / 280) * 0.03);
      }
      const h = this.hud;
      const shown = this.shown;
      // points only change with metres
      if (s.metres !== shown.metres || s.crumbs !== shown.crumbs) {
        shown.metres = s.metres;
        shown.crumbs = s.crumbs;
        h.score.set(formatScore(s.points, 'integer', locale));
        h.dist.set(strings.t('metres', { m: formatScore(s.metres, 'integer', locale) }));
        h.coins.set(formatScore(s.crumbs, 'integer', locale));
      }
      const max = s.multiplier >= 5;
      const filled = max ? 10 : s.streak % 10;
      const ring = `${s.multiplier}:${filled}`;
      if (ring !== shown.ring) {
        shown.ring = ring;
        h.multText.setText(max ? strings.max : `×${s.multiplier}`).setFontSize(max ? 13 : 18);
        const g = h.ring.clear();
        g.fillStyle(colorNum('bg'), 0.7).fillCircle(0, 0, 31);
        for (let i = 0; i < 10; i++) {
          const ang = -Math.PI / 2 + (i * Math.PI) / 5;
          const on = i < filled;
          g.lineStyle(on ? 6 : 4, colorNum(on ? 'gold' : 'line'), 1)
            .beginPath()
            .arc(0, 0, 26, ang + 0.08, ang + Math.PI / 5 - 0.08)
            .strokePath();
        }
      }
      const warn = s.phase === 'running' && s.gulpMs > 0;
      h.warn.setVisible(warn);
      if (warn) {
        h.bar.setScale(s.gulpMs / STUMBLE.gulpMs, 1);
        h.warn.setAlpha(this.tk.motion.reduced ? 1 : 0.8 + 0.2 * Math.sin(now / 120));
      }
    }
  }

  return [Run];
};
