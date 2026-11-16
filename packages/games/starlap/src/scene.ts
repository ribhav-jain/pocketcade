// The Starlap scene: a neon ring over a synthwave horizon, Pip the spark-ball and one glowing star target.
// The rules live in rules.ts; this file maps input to timestamps and draws. All art is drawn once per mount
// (art.ts); per frame only positions, sizes, alphas and tints change.
import type Phaser from 'phaser';
import { colorNum, colors, formatScore, mixHex, prng, type Save } from '@pocketcade/toolkit';
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
import {
  drawBacking,
  drawBull,
  drawFloor,
  drawGlow,
  drawGridLine,
  drawMountains,
  drawPip,
  drawRing,
  drawRingLight,
  drawShock,
  drawSky,
  drawStars,
  drawSun,
  drawZone,
  INK,
  SUN_R,
  ZONES,
  type Face,
} from './art.ts';
import { ATTRACT_START, type AttractView } from './attract.ts';
import {
  clockGranularity,
  COUNTDOWN_MS,
  createRun,
  FREEZE_MS,
  lapMs,
  perfectMs,
  runSeed,
  windowMs,
  ZONE_HITS,
  zoneOf,
  type Run,
  type RunEvent,
} from './rules.ts';
import { isStats, scoreMeta, statsDefaults, withRun, type TapStats } from './save.ts';
import { strings } from './strings.ts';

// The design area is a square the ring fills; scenery and the Best pill follow the view around it.
const W = 600;
const H = 600;
const CX = 300;
const CY = 300;
/** Track radius: the largest that keeps the biggest hit zone (a star coming toward Pip) inside the square. */
const R = 234;
/** radius of the inner guide circle that fills up as the zone progresses */
const GUIDE_R = R - 26;
/** Pip's drawn radius: a target's zone is `chord(window) − PIP_R`, so Pip touches it exactly at the window edge. */
const PIP_R = 20;
const TAIL = 8;
const GRID_LINES = 8;
const HALOS = 4;
const TWINKLES = 14;
/** scenery is drawn this far past the view so a camera shake never shows an edge */
const PAD = 24;
const FLOOR_MAX = 150;
const MOUNTAIN_H = 110;
/**
 * A frame reaches the screen about one refresh after it is drawn, so Pip and the star are drawn where they
 * will be by then. Judging is not affected: it always uses the input event's own time.
 */
const DISPLAY_LEAD_MS = 16;
const DIGIT_COLORS = [colors.sky, colors.orange, colors.pink];
const ZONE_NAMES = [
  strings.zoneSunset,
  strings.zoneDusk,
  strings.zoneNight,
  strings.zoneAurora,
  strings.zoneDawn,
];
/** Any of these keys is the one button: Space, Enter, arrows, letters and digits. */
const KEYS = [
  'Space',
  'Enter',
  'NumpadEnter',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
  ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
];

const rad = (deg: number) => (deg * Math.PI) / 180;
const onRing = (deg: number, r = R): [number, number] => [
  CX + r * Math.sin(rad(deg)),
  CY - r * Math.cos(rad(deg)),
];
/** Chord for an arc of `deg` on the track. */
const chord = (deg: number) => 2 * R * Math.sin(rad(deg) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** An input event's own timestamp on the performance.now() clock, or now when they disagree by > 1 s. */
const stamp = (ts: number | undefined) => {
  const now = performance.now();
  return ts !== undefined && Math.abs(ts - now) <= 1000 ? ts : now;
};
const backOut = (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
const zoneAt = (z: number) => ZONES[z % ZONES.length]!;
/** The sun sinks (or rises) a little with every hit, from one zone's height to the next. */
const sunLift = (n: number) => {
  const z = zoneOf(n);
  const from = zoneAt(z).sun;
  return from + ((zoneAt(z + 1).sun - from) * (n % ZONE_HITS)) / ZONE_HITS;
};

type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
type Gfx = Phaser.GameObjects.Graphics;

export const createScenes: SceneFactory = (_P, kit) => {
  class Play extends kit.Scene {
    private run!: Run;
    private seed = '';
    private g = 0;
    private stats: TapStats = statsDefaults();
    private statsSave!: Save<TapStats>;
    private best = 0;
    private newBest = false;
    private ending = false;
    private paused = false;
    /** presses stamped at or before this are the ones that closed a dialog */
    private guardUntil = -Infinity;
    private countdown: { from: number; digit: number } | null = null;
    private horizon = 0;
    private floorH = 0;
    private sunX = CX;
    private gridPhase = 0.5;
    private lastDraw = 0;
    private spawnAt = -Infinity;
    private sky: Img[] = [];
    private stars!: Img;
    private sun!: Img;
    private sunGlow!: Img;
    private mountains!: Img;
    private floor!: Img;
    private grid: Img[] = [];
    private halos!: Gfx;
    private progress!: Gfx;
    private ringLight!: Img;
    private zone!: Img;
    private zoneGlow!: Img;
    private bull!: Img;
    private trail: Img[] = [];
    private ghost!: Img;
    private shock!: Img;
    private tail: Img[] = [];
    private pip!: Img;
    private pipBase = 1;
    private pipGlow!: Img;
    private faceTimer: Phaser.Time.TimerEvent | null = null;
    private bestPill!: HudPill;
    private hud!: { score: Txt; combo: Txt; label: Txt; hint: Txt; digit: Txt };

    constructor() {
      super('play');
    }

    create(): void {
      const tk = this.tk;
      this.makeTextures();
      this.buildWorld();
      this.buildHud();
      this.layout();
      tk.on('resize', () => this.layout());
      tk.input.configure({ actions: { tap: { codes: KEYS } } });
      tk.input.on('tap', (e) => {
        if (e.phase === 'press') this.onPress(e.source === 'virtual' ? this.clock() : e.time);
      });
      // The whole frame is the button. Phaser's pointerdown carries the browser event, so the tap is judged at
      // the moment the finger landed, not at the next frame.
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (!tk.attract && p.button === 0) this.onPress(stamp(p.event?.timeStamp));
      });
      tk.on('pause', () => {
        this.paused = true;
        this.run?.freeze(this.clock());
        this.countdown = null;
        this.hud.digit.setVisible(false);
        this.hud.score.setVisible(true);
      });
      tk.on('resume', (e) => {
        this.paused = false;
        if (e.source === 'menu' && !tk.attract) this.guardUntil = performance.now();
        if (this.run?.phase === 'frozen' && !tk.ui.open)
          this.countdown = { from: this.clock(), digit: 0 };
      });
      tk.on('inputchange', () => this.showHint());
      tk.ui.onRestart(() => this.newRun());
      if (!tk.attract) {
        this.g = clockGranularity(() => performance.now());
        if (this.g >= 17) tk.ui.toast(strings.coarseTimer);
      }
      this.statsSave = tk.createSave<TapStats>({
        key: 'stats',
        defaults: statsDefaults,
        validate: isStats,
      });
      tk.deferReady();
      const top = tk.attract ? Promise.resolve([]) : tk.host.scores.top('score', 1).catch(() => []);
      void Promise.all([this.statsSave.load(), top]).then(([l, t]) => {
        if (tk.signal.aborted) return; // unmounted while loading: the scene is gone
        this.stats = l.data;
        this.best = Math.max(this.stats.best, t[0]?.value ?? 0);
        this.newRun();
        tk.ready();
      });
    }

    /** ms: the attract step clock in attract (so the demo judges the same every time), else performance.now(). */
    private clock(): number {
      const a = this.tk.attract;
      return a ? (a.step * 1000) / 60 : performance.now();
    }

    // ─── art ───
    private makeTextures(): void {
      const { bleed } = this.tk.layout;
      const fullW = W + 2 * (bleed.x + PAD);
      const fullH = H + 2 * (bleed.y + PAD);
      const x0 = -bleed.x - PAD;
      const crisp = (key: string, s: number, draw: (ctx: CanvasRenderingContext2D) => void) =>
        kit.textures.canvas(this, key, s, s, draw);
      const soft = (
        key: string,
        w: number,
        h: number,
        draw: (ctx: CanvasRenderingContext2D) => void,
      ) => canvasTexture(this, key, w, h, draw, { scale: 1 });
      ZONES.forEach((z, i) => soft(`sky-${i}`, 4, 256, (ctx) => drawSky(ctx, 4, 256, z.sky)));
      soft('stars', fullW, fullH, (ctx) => drawStars(ctx, fullW, fullH));
      crisp('sun', SUN_R * 2, (ctx) => drawSun(ctx, SUN_R * 2));
      // the ridges stay low where the sun sits: behind the ring, or to the right of it on a wide frame
      kit.textures.canvas(this, 'mountains', fullW, MOUNTAIN_H, (ctx) =>
        drawMountains(ctx, fullW, MOUNTAIN_H, [CX - x0, CX + 330 - x0, CX - 330 - x0]),
      );
      kit.textures.canvas(this, 'floor', fullW, FLOOR_MAX + PAD, (ctx) =>
        drawFloor(ctx, fullW, FLOOR_MAX + PAD, CX - x0),
      );
      soft('gridline', fullW, 6, (ctx) => drawGridLine(ctx, fullW));
      soft('backing', 2 * (R + 140), 2 * (R + 140), (ctx) =>
        drawBacking(ctx, 2 * (R + 140), R + 50),
      );
      crisp('ring', 2 * R + 60, (ctx) => drawRing(ctx, 2 * R + 60, R, GUIDE_R));
      soft('ringlight', 2 * R + 60, 2 * R + 60, (ctx) => drawRingLight(ctx, 2 * R + 60, R));
      for (const f of ['idle', 'grin', 'wince'] as const)
        crisp(`pip-${f}`, 60, (ctx) => drawPip(ctx, 60, f, PIP_R));
      crisp('zone', 136, (ctx) => drawZone(ctx, 136));
      crisp('bull', 60, (ctx) => drawBull(ctx, 60));
      soft('glow', 64, 64, (ctx) => drawGlow(ctx, 64));
      soft('shock', 200, 200, (ctx) => drawShock(ctx, 200));
    }

    private buildWorld(): void {
      const { bleed } = this.tk.layout;
      const x0 = -bleed.x - PAD;
      const glow = (color: string, depth: number) =>
        this.add.image(0, 0, 'glow').setBlendMode('ADD').setTint(colorNum(color)).setDepth(depth);
      // sky[1] only shows while a new zone's sky fades in over sky[0]
      this.sky = [0, 1].map((i) =>
        this.add
          .image(0, 0, 'sky-0')
          .setOrigin(0)
          .setDepth(-1000 + i),
      );
      this.stars = this.add
        .image(x0, -bleed.y - PAD, 'stars')
        .setOrigin(0)
        .setDepth(-998);
      const rnd = prng(77);
      for (let i = 0; i < TWINKLES; i++) {
        const x = x0 + rnd() * (W - 2 * x0);
        const y = -bleed.y + rnd() * (bleed.y + 400);
        const size = 9 + rnd() * 9;
        const t = glow('#FFFFFF', -998).setPosition(x, y).setDisplaySize(size, size).setAlpha(0.5);
        if (!this.tk.motion.reduced)
          this.tweens.add({
            targets: t,
            alpha: 0.05,
            duration: 900 + rnd() * 1400,
            delay: rnd() * 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
      }
      this.sunGlow = glow(colors.pink, -997).setDisplaySize(SUN_R * 5, SUN_R * 5);
      this.sun = canvasImage(this, 0, 0, 'sun').setDepth(-996);
      this.mountains = canvasImage(this, x0, 0, 'mountains').setOrigin(0, 1).setDepth(-995);
      this.floor = canvasImage(this, x0, 0, 'floor').setOrigin(0).setDepth(-994);
      this.grid = Array.from({ length: GRID_LINES }, () =>
        this.add.image(x0, 0, 'gridline').setOrigin(0, 0.5).setDepth(-993),
      );
      this.add.image(CX, CY, 'backing').setDepth(-990);
      this.halos = this.add.graphics().setDepth(-989);

      canvasImage(this, CX, CY, 'ring');
      this.progress = this.add.graphics();
      this.ringLight = this.add.image(CX, CY, 'ringlight').setBlendMode('ADD').setAlpha(0);
      this.trail = [20, 15, 10].map((s) =>
        glow(colors.pink, 1).setDisplaySize(s, s).setVisible(false),
      );
      this.zoneGlow = glow(colors.pink, 1);
      this.zone = canvasImage(this, 0, 0, 'zone').setDepth(1);
      this.bull = canvasImage(this, 0, 0, 'bull').setDepth(1);
      this.ghost = canvasImage(this, 0, 0, 'zone')
        .setBlendMode('ADD')
        .setDepth(1)
        .setVisible(false);
      this.tail = Array.from({ length: TAIL }, (_, i) =>
        glow(mixHex(colors.sky, colors.pink, i / (TAIL - 1)), 2)
          .setDisplaySize(40 - i * 3.4, 40 - i * 3.4)
          .setAlpha(0.85 - i * 0.09),
      );
      this.pipGlow = glow(colors.sky, 2).setDisplaySize(76, 76).setAlpha(0.6);
      this.pip = canvasImage(this, 0, 0, 'pip-idle').setDepth(3);
      this.pipBase = this.pip.scaleX;
      this.shock = this.add.image(0, 0, 'shock').setBlendMode('ADD').setDepth(4).setVisible(false);
    }

    private buildHud(): void {
      const line = (y: number, px: number, color: string) =>
        kit
          .text(this, CX, y, '', { px, color, stroke: INK, strokePx: Math.round(px / 4) })
          .setOrigin(0.5)
          .setDepth(5);
      const big = (px: number, depth: number) =>
        kit
          .text(this, CX, CY - 6, '', { px, stroke: colors.pink, strokePx: Math.round(px / 16) })
          .setOrigin(0.5)
          .setDepth(depth);
      this.hud = {
        score: big(96, 5),
        combo: line(CY - 88, 24, colors.gold),
        label: line(CY + 80, 28, colors.text),
        hint: line(CY + 80, 24, colors.text),
        digit: big(150, 6),
      };
      this.bestPill = hudPill(this, 0, 0, {
        icon: 'trophy',
        accent: colors.orange,
        label: strings.best,
        value: '0',
        width: 172,
        height: 58,
      });
      if (!this.tk.motion.reduced)
        this.tweens.add({
          targets: this.hud.hint,
          alpha: 0.45,
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
    }

    /** Fits everything outside the design square to the visible rectangle (again on every resize). */
    private layout(): void {
      const v = this.tk.layout.view;
      const bottom = v.y + v.height;
      this.floorH = Math.round(Math.min(FLOOR_MAX, Math.max(84, v.height * 0.11)));
      this.horizon = bottom - this.floorH;
      // a tall frame has room for the sun under the ring; a wide one has it beside the ring
      this.sunX = v.width >= 880 ? v.x + v.width - 170 : CX;
      for (const s of this.sky)
        s.setPosition(v.x - PAD, v.y - PAD).setDisplaySize(
          v.width + 2 * PAD,
          this.horizon - v.y + PAD,
        );
      this.mountains.setY(this.horizon + 1);
      this.floor.setY(this.horizon);
      this.sunGlow.setPosition(this.sunX, this.horizon);
      this.placeSun(false);
      // full size where the frame has spare room beside or above the ring, smaller in a near-square frame
      this.bestPill.container
        .setPosition(v.x + 12, v.y + 12)
        .setScale(Math.max(v.width, v.height) >= 800 ? 1 : 0.8);
    }

    private placeSun(animate: boolean): void {
      const lift = sunLift(this.run?.n ?? 0);
      const y = this.horizon - lift * SUN_R;
      this.tweens.killTweensOf(this.sun);
      this.sun.setX(this.sunX);
      if (animate && !this.tk.motion.reduced)
        this.tweens.add({ targets: this.sun, y, duration: 500, ease: 'Sine.easeOut' });
      else this.sun.setY(y);
      this.sunGlow.setAlpha(0.55 * clamp01((lift + 1.5) / 1.2));
    }

    /** Dresses the scenery for the run's current zone; `animate` fades the new sky in. */
    private showZone(animate: boolean): void {
      const z = zoneOf(this.run.n);
      const zone = zoneAt(z);
      const key = `sky-${z % ZONES.length}`;
      const [base, over] = this.sky as [Img, Img];
      this.tweens.killTweensOf(over);
      if (animate && !this.tk.motion.reduced) {
        over.setTexture(key).setAlpha(0);
        this.tweens.add({
          targets: over,
          alpha: 1,
          duration: 900,
          onComplete: () => {
            base.setTexture(key);
            over.setAlpha(0);
          },
        });
      } else {
        base.setTexture(key);
        over.setAlpha(0);
      }
      const tint = colorNum(zone.accent);
      for (const img of [this.mountains, this.floor, this.sunGlow, ...this.grid]) img.setTint(tint);
      this.stars.setAlpha(zone.stars);
      // one more ring of light around the track for every zone cleared
      const halos = this.halos.clear();
      for (let i = 0; i < Math.min(HALOS, z); i++)
        halos
          .lineStyle(2, colorNum(zoneAt(i + 1).accent), 0.34)
          .strokeCircle(CX, CY, R + 76 + i * 44);
      this.placeSun(animate);
      this.showProgress();
    }

    /** The inner guide circle fills, in the next zone's colour, as hits add up toward it. */
    private showProgress(): void {
      const n = this.run.n;
      const g = this.progress.clear();
      const k = (n % ZONE_HITS) / ZONE_HITS;
      if (k === 0) return;
      g.lineStyle(3, colorNum(zoneAt(zoneOf(n) + 1).accent), 0.6)
        .beginPath()
        .arc(CX, CY, GUIDE_R, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2)
        .strokePath();
    }

    // ─── run lifecycle ───
    private newRun(): void {
      const tk = this.tk;
      this.seed = runSeed(tk.rng.main);
      const rng = tk.rng.create(this.seed);
      this.run = tk.attract
        ? createRun(rng, { from: ATTRACT_START })
        : createRun(rng, { g: this.g });
      if (tk.attract) this.run.start(this.clock());
      this.ending = false;
      this.newBest = false;
      this.countdown = null;
      this.spawnAt = -Infinity;
      this.guardUntil = tk.attract ? -Infinity : performance.now();
      this.setFace('idle');
      this.zone.setAlpha(1);
      this.bull.setAlpha(1);
      this.zoneGlow.setAlpha(0.8);
      this.tweens.killTweensOf(this.ringLight);
      this.ringLight.setAlpha(0);
      const h = this.hud;
      h.label.setText('');
      h.digit.setVisible(false);
      h.score.setVisible(true);
      this.bestPill.container.setVisible(!tk.attract);
      this.bestPill.setLabel(strings.best);
      this.showZone(false);
      this.showHint();
      this.showScore();
      this.publishView();
      this.draw(this.clock());
    }

    private showHint(): void {
      const p = this.tk.env.input.primary;
      this.hud.hint.setText(
        p === 'touch'
          ? strings.readyTouch
          : p === 'pointer'
            ? strings.readyPointer
            : strings.readyKeyboard,
      );
      this.hud.hint.setVisible(!this.tk.attract && this.run?.phase === 'ready');
    }

    private showScore(): void {
      const r = this.run;
      const fmt = (v: number) => formatScore(v, 'integer', this.tk.env.locale);
      this.hud.score.setText(fmt(r.score));
      this.hud.combo.setText(r.chain >= 2 ? strings.t('combo', { k: r.chain }) : '');
      this.bestPill.set(fmt(this.newBest ? r.score : this.best));
    }

    private onPress(t: number): void {
      if (this.paused || t <= this.guardUntil || this.countdown || this.tk.ui.open) return;
      const star = this.run.dotAt(t);
      this.handle(this.run.press(t), star);
    }

    override update(): void {
      if (!this.run) return;
      const now = this.clock();
      const cd = this.countdown;
      if (cd) {
        const elapsed = now - cd.from;
        if (elapsed >= COUNTDOWN_MS) {
          this.countdown = null;
          this.hud.digit.setVisible(false);
          this.hud.score.setVisible(true);
          this.run.unfreeze(now);
        } else {
          const digit = 3 - Math.floor(elapsed / (COUNTDOWN_MS / 3));
          if (digit !== cd.digit) {
            cd.digit = digit;
            this.tk.sfx.play('click');
            this.hud.digit
              .setText(String(digit))
              .setColor(DIGIT_COLORS[digit - 1] ?? colors.text)
              .setVisible(true);
            this.hud.score.setVisible(false);
            bump(this, this.hud.digit, 1.3, 240);
            this.pulse(colors.text, 0.5);
          }
        }
      }
      this.handle(this.run.tick(now));
      if (this.run.phase === 'missed' && !this.ending && now >= this.run.missAt + FREEZE_MS)
        void this.gameOver();
      this.publishView();
      this.draw(now);
    }

    private publishView(): void {
      const a = this.tk.attract;
      if (!a) return;
      a.setView({
        arrivalStep: Math.round((this.run.arrival() * 60) / 1000),
        hits: this.run.n - ATTRACT_START.n,
      } satisfies AttractView);
    }

    /** `star` is where the star was when the press landed (it has already moved on by the time a hit is shown). */
    private handle(events: RunEvent[], star = 0): void {
      const { sfx } = this.tk;
      for (const e of events) {
        if (e.type === 'start') {
          this.tk.run.begin();
          sfx.play('jump');
          this.hud.hint.setVisible(false);
          this.squash();
        } else if (e.type === 'hit') {
          const perfect = e.judgement === 'perfect';
          // Perfect: a bright chime that climbs with the chain. Good: one soft low blip.
          if (perfect) sfx.play('coin', { detuneCents: 100 * Math.min(e.chain - 1, 4) });
          else sfx.play('good');
          if (e.reversed) sfx.play('swish');
          if (e.zoneUp) sfx.play('win', { volume: 0.6 });
          this.label(
            perfect
              ? strings.perfect
              : strings.t(e.dt < 0 ? 'goodEarly' : 'goodLate', { ms: Math.abs(e.dt) }),
            perfect ? colors.gold : colors.sky,
          );
          if (!this.tk.attract && !this.newBest && this.best > 0 && this.run.score > this.best) {
            this.newBest = true;
            this.bestPill.setLabel(strings.newBest);
            const { x, y } = this.bestPill.container;
            popText(this, x + 86, y + 84, strings.newBestPop, { color: colors.gold, px: 24 });
            burst(this, x + 86, y + 29, { shape: 'star', count: 10, distance: 80 });
          }
          this.showScore();
          this.hitFx(e, star);
          if (e.zoneUp) this.zoneUp();
          else {
            this.placeSun(true);
            this.showProgress();
          }
          this.publishView();
        } else {
          sfx.play('hit');
          this.label(
            e.end === 'passed'
              ? strings.missed
              : strings.t(e.end === 'early' ? 'early' : 'late', { ms: Math.abs(e.dt) }),
            colors.vermillion,
          );
          this.missFx();
        }
      }
    }

    private label(text: string, color: string): void {
      this.hud.label.setText(text).setColor(color);
      bump(this, this.hud.label, 1.25, 220);
    }

    // ─── effects ───
    private setFace(face: Face, ms = 0): void {
      this.pip.setTexture(`pip-${face}`);
      this.faceTimer?.remove();
      this.faceTimer =
        ms > 0 ? this.time.delayedCall(ms, () => this.pip.setTexture('pip-idle')) : null;
    }

    /** Pip squashes on every tap. */
    private squash(): void {
      if (this.tk.motion.reduced) return;
      const b = this.pipBase;
      this.tweens.killTweensOf(this.pip);
      this.pip.setScale(b * 1.4, b * 0.68);
      this.tweens.add({
        targets: this.pip,
        scaleX: b,
        scaleY: b,
        duration: 220,
        ease: 'Back.easeOut',
      });
    }

    /** The whole track lights up in the colour of the judgement: gold, cyan or red. */
    private pulse(color: string, alpha: number, ms = 380): void {
      this.tweens.killTweensOf(this.ringLight);
      this.ringLight.setTint(colorNum(color)).setAlpha(this.tk.motion.reduced ? alpha / 2 : alpha);
      this.tweens.add({ targets: this.ringLight, alpha: 0, duration: ms, ease: 'Quad.easeOut' });
    }

    private hitFx(e: Extract<RunEvent, { type: 'hit' }>, star: number): void {
      const perfect = e.judgement === 'perfect';
      const color = perfect ? colors.gold : colors.sky;
      const [x, y] = onRing(e.angle);
      this.setFace(perfect ? 'grin' : 'idle', perfect ? 520 : 0);
      this.squash();
      bump(this, this.hud.score, perfect ? 1.2 : 1.1, 200);
      this.pulse(color, perfect ? 0.9 : 0.4);
      this.spawnAt = this.clock();
      burst(
        this,
        x,
        y,
        perfect
          ? {
              shape: 'star',
              colors: [colors.gold, '#FFFFFF', colors.yellow],
              count: 12,
              distance: 110,
              size: 16,
            }
          : { shape: 'spark', colors: [colors.sky, '#FFFFFF'], count: 7, distance: 70, size: 12 },
      );
      popText(this, ...onRing(e.angle, R - 66), strings.t('points', { n: e.points }), {
        color,
        px: perfect ? 32 : 22,
      });
      if (!this.tk.motion.reduced) {
        // the old target pops away as the new one scales in
        const [gx, gy] = onRing(star);
        const d = this.zone.displayWidth;
        this.tweens.killTweensOf(this.ghost);
        this.ghost.setPosition(gx, gy).setDisplaySize(d, d).setAlpha(0.9).setVisible(true);
        this.tweens.add({
          targets: this.ghost,
          scaleX: this.ghost.scaleX * 1.6,
          scaleY: this.ghost.scaleY * 1.6,
          alpha: 0,
          duration: 280,
          ease: 'Quad.easeOut',
        });
        if (perfect) {
          this.tweens.killTweensOf(this.shock);
          this.shock.setPosition(x, y).setScale(0.15).setAlpha(1).setVisible(true);
          this.shock.setTint(colorNum(colors.gold));
          this.tweens.add({
            targets: this.shock,
            scale: 1,
            alpha: 0,
            duration: 380,
            ease: 'Cubic.easeOut',
          });
        }
      }
      if (e.reversed) this.whoosh(e.angle);
    }

    /** A new zone: the sky changes, the grid speeds up and one more ring of light appears. */
    private zoneUp(): void {
      const z = zoneOf(this.run.n);
      const accent = zoneAt(z).accent;
      flash(this, colors.text, 280, 0.2);
      popText(this, CX, CY + 132, ZONE_NAMES[z % ZONES.length]!, {
        color: accent,
        px: 30,
        rise: 30,
        ms: 1300,
      });
      burst(this, CX, CY, {
        shape: 'star',
        colors: [accent, '#FFFFFF'],
        count: 16,
        distance: R,
        size: 16,
        lifeMs: 900,
      });
      this.showZone(true);
    }

    /** Reversal: an arrow sweeps the inside of the ring the new way. */
    private whoosh(angle: number): void {
      popText(this, CX, CY - 132, strings.reverse, { color: colors.sky, px: 26 });
      if (this.tk.motion.reduced) return;
      const dir = this.run.dir;
      const r = R - 44;
      const a0 = rad(angle) - Math.PI / 2;
      const a1 = a0 + dir * rad(70);
      const [nx, ny] = [Math.cos(a1), Math.sin(a1)];
      const [tx, ty] = [-ny * dir, nx * dir];
      const g = this.add.graphics({ x: CX, y: CY }).setDepth(4);
      g.lineStyle(6, colorNum('sky'), 1)
        .beginPath()
        .arc(0, 0, r, a0, a1, dir < 0)
        .strokePath()
        .fillStyle(colorNum('sky'), 1)
        .fillTriangle(
          nx * r + tx * 22,
          ny * r + ty * 22,
          nx * (r + 13),
          ny * (r + 13),
          nx * (r - 13),
          ny * (r - 13),
        );
      this.tweens.add({
        targets: g,
        alpha: 0,
        duration: 520,
        ease: 'Quad.easeIn',
        onComplete: () => g.destroy(),
      });
    }

    private missFx(): void {
      const [x, y] = onRing(this.run.pipAt(this.clock()));
      this.setFace('wince');
      this.squash();
      shake(this, 240, 0.012);
      flash(this, colors.vermillion, 220, 0.25);
      this.pulse(colors.vermillion, 1, 700);
      burst(this, x, y, {
        shape: 'dot',
        colors: [colors.vermillion, '#FFFFFF'],
        count: 10,
        distance: 70,
        size: 10,
      });
      this.zone.setAlpha(0.4);
      this.bull.setAlpha(0.5);
      this.zoneGlow.setAlpha(0.2);
    }

    private async gameOver(): Promise<void> {
      this.ending = true;
      const r = this.run;
      const tk = this.tk;
      tk.sfx.play('lose');
      if (!tk.attract) {
        this.stats = withRun(this.stats, {
          score: r.score,
          hits: r.n,
          perfects: r.perfects,
          longestChain: r.longestChain,
          meanOffsetMs: r.meanOffsetMs,
          end: r.end ?? 'passed',
        });
        this.statsSave.set(this.stats);
        this.best = Math.max(this.best, r.score);
      }
      const action = await tk.ui.gameOver({
        title: this.hud.label.text || strings.missed,
        scores: r.score >= 1 ? [{ board: 'score', value: r.score }] : [],
        meta: scoreMeta(this.seed, {
          hits: r.n,
          perfects: r.perfects,
          longestChain: r.longestChain,
          dts: r.dts,
        }),
      });
      if (tk.signal.aborted) return;
      if (action === 'play-again') this.newRun();
    }

    // ─── drawing ───
    private draw(now: number): void {
      const r = this.run;
      const reduced = this.tk.motion.reduced;
      const t = this.tk.attract ? now : now + DISPLAY_LEAD_MS;
      const a = r.pipAt(t);
      const [px, py] = onRing(a);
      this.pip.setPosition(px, py);
      this.pipGlow.setPosition(px, py);
      const moving = r.phase !== 'ready';
      this.tail.forEach((img, i) => {
        img.setVisible(moving);
        if (moving) img.setPosition(...onRing(a - r.dir * 2.4 * (i + 1)));
      });

      const d = r.dotAt(t);
      const [dx, dy] = onRing(d);
      // Pip closes on a drifting star faster or slower than on a still one, so the same time window is a
      // longer or shorter stretch of track
      const perMs = (360 * (1 - r.drift)) / lapMs(r.n);
      const k = reduced ? 1 : backOut(clamp01((now - this.spawnAt) / 220));
      const zr = Math.max(1, (chord(perMs * windowMs(r.n)) - PIP_R) * k);
      const br = Math.max(1, chord(perMs * perfectMs(r.n, this.g)) * k);
      const beat = reduced ? 1 : 1 + 0.08 * Math.sin(now / 150);
      this.zone.setPosition(dx, dy).setDisplaySize(zr * 2, zr * 2);
      this.bull.setPosition(dx, dy).setDisplaySize(br * 2, br * 2);
      this.zoneGlow.setPosition(dx, dy).setDisplaySize(zr * 3 * beat, zr * 3 * beat);
      // a drifting star leaves three dots behind it
      const way = Math.sign(r.drift) * r.dir;
      const behind = (zr / R) * (180 / Math.PI) + 3;
      this.trail.forEach((img, i) => {
        img.setVisible(way !== 0 && r.phase === 'running');
        if (way !== 0) img.setPosition(...onRing(d - way * (behind + i * 5)));
      });

      // the floor scrolls toward the viewer, faster in later zones
      const dt = Math.min(100, Math.max(0, now - this.lastDraw));
      this.lastDraw = now;
      if (!reduced) this.gridPhase = (this.gridPhase + (dt * zoneAt(zoneOf(r.n)).grid) / 1600) % 1;
      this.grid.forEach((img, i) => {
        const z = (i + this.gridPhase) / GRID_LINES;
        img.setY(this.horizon + this.floorH * z ** 2.1).setAlpha(Math.min(1, z * 1.6));
      });
    }
  }

  return [Play];
};
