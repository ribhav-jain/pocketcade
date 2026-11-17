// The single Hue Brew scene: layout, drawing, tap and keyboard input, the pour animation, saves, sound and the
// attract view. The rules live in logic.ts; nothing here decides what a pour does.
import type Phaser from 'phaser';
import { colorNum, colors, prng, type Save } from '@pocketcade/toolkit';
import {
  backdrop,
  burst,
  canvasTexture,
  hudPill,
  texScale,
  type HudPill,
  type SceneFactory,
} from '@pocketcade/toolkit/phaser';
import {
  CORK,
  CURSOR,
  DRINKS,
  GLASS_TEX,
  LAYER,
  SHADOW,
  STAR,
  THEMES,
  WALL,
  WOOD,
  drawButton,
  drawCork,
  drawCursor,
  drawGlassBack,
  drawGlassFront,
  drawGlow,
  drawLayer,
  drawPanel,
  drawPekoe,
  drawShadow,
  drawStar,
  drawWall,
  themeFor,
  type ButtonKind,
  type Mood,
} from './art.ts';
import { ATTRACT_LEVEL, type AttractView } from './attract.ts';
import {
  BOTTLE,
  BOTTLE_MAX,
  BUTTON,
  DESIGN,
  MAX_ROWS,
  PANEL,
  PEKOE,
  PILL,
  SLAB,
  bottleAt,
  buttonAt,
  frameFor,
  neighbourRow,
  type Frame,
} from './layout.ts';
import {
  CAP,
  FLAVOURS,
  MAX_BOTTLES,
  MYSTERY_FROM,
  addBottle,
  fitsLevel,
  isComplete,
  isSolved,
  makeLevel,
  pour,
  solve,
  stars,
  unpour,
  type Brew,
  type Level,
  type Move,
  type Pour,
  type PourOutcome,
} from './logic.ts';
import {
  isProgressV1,
  isRunV1,
  packHistory,
  unpackHistory,
  type ProgressV1,
  type RunV1,
} from './save.ts';
import { strings } from './strings.ts';

type Img = Phaser.GameObjects.Image;
type Box = Phaser.GameObjects.Container;
type Txt = Phaser.GameObjects.Text;
type Bar = Phaser.GameObjects.Rectangle;

interface BottleView {
  box: Box;
  layers: Img[];
  cork: Img;
}

interface Result {
  level: number;
  stars: number;
  moves: number;
  par: number;
  hint: boolean;
  extra: boolean;
}

const BUTTON_KINDS: readonly ButtonKind[] = ['undo', 'restart', 'hint', 'bottle'];
const MOODS: readonly Mood[] = ['wait', 'pleased', 'cheer'];
const THEME_NAMES = [
  strings.themeLantern,
  strings.themeRain,
  strings.themeDawn,
  strings.themeFestival,
];
const MOTES = 12;
/** The "Levels solved" board gets an entry at every multiple of this. */
const BOARD_EVERY = 10;
/** Pour timing in ms: tilt over the target, one beat per layer, swing back. */
const POUR = { tilt: 110, layer: 60, back: 120, angle: 58 } as const;
/** How long the result card stays before the next level starts by itself. */
const NEXT_AFTER_MS = 2600;
/** A tap this soon after the card appears is ignored, so the last pour's tap cannot skip it. */
const SKIP_GUARD_MS = 450;
const RESTART_ARM_MS = 2600;

export const createScenes: SceneFactory = (_P, kit) => {
  class Play extends kit.Scene {
    private progressSave!: Save<ProgressV1>;
    private runSave!: Save<RunV1 | null>;
    private progress: ProgressV1 = { furthest: 0, level: 1, stars: 0 };

    private level!: Level;
    private brew!: Brew;
    private history: Pour[] = [];
    private moves = 0;
    private usedHint = false;
    private usedExtra = false;
    private phase: 'play' | 'clear' = 'play';
    /** the solver's remaining moves from the current state: undefined = not worked out, null = no solution */
    private plan: Move[] | null | undefined;
    private result: Result | null = null;

    private f!: Frame;
    private theme = -1;
    private bg: Img | null = null;
    private motes: Img[] = [];
    private moteX = new Float32Array(MOTES);
    private moteY = new Float32Array(MOTES);
    private clock = 0;
    private shelves: { back: Bar; top: Bar; face: Bar; under: Bar }[] = [];
    private slab!: { top: Bar; face: Bar };
    private pekoe!: Img;
    private pekoeScale = 1;
    private mood: Mood = 'wait';
    private moodTimer: Phaser.Time.TimerEvent | null = null;
    private views: BottleView[] = [];
    private shadows: Img[] = [];
    private layerK = 1;
    private stream!: Bar;
    private cursor!: Img;
    private hud!: { level: HudPill; moves: HudPill };
    private buttons: { box: Box; label: Txt }[] = [];
    private panel!: {
      box: Box;
      title: Txt;
      stars: Img[];
      line: Txt;
      note: Txt;
      total: Txt;
      next: Txt;
    };

    // interaction
    /** the lifted bottle, or -1 */
    private sel = -1;
    /** the keyboard cursor */
    private cur = 0;
    /** the last input was the keyboard: show the cursor */
    private kbd = false;
    /** an animation on the bottles is running; any input finishes it first */
    private busy = false;
    private timers: Phaser.Time.TimerEvent[] = [];
    /** what the running pour still has to do once its animation ends (or is cut short) */
    private afterPour: (() => void) | null = null;
    /** the bottle whose images are being drawn one texture at a time (see drawAlone) */
    private tilted: BottleView | null = null;
    private clearAt = 0;
    private nextTimer: Phaser.Time.TimerEvent | null = null;
    private restartArmed: Phaser.Time.TimerEvent | null = null;
    private teach: Phaser.Time.TimerEvent | null = null;
    /** decoration-only randomness */
    private fxRnd = prng(0xb07713);

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

      this.progressSave = tk.createSave<ProgressV1>({
        key: 'progress',
        defaults: () => ({ furthest: 0, level: 1, stars: 0 }),
        validate: isProgressV1,
      });
      this.runSave = tk.createSave<RunV1 | null>({
        key: 'run',
        defaults: () => null,
        validate: (d): d is RunV1 | null => d === null || isRunV1(d),
        debounceMs: 0,
      });
      const [progress, run] = await Promise.all([
        this.progressSave.load(),
        tk.ctx.launch === 'play' ? this.runSave.load() : null,
      ]);
      if (tk.signal.aborted) return; // unmounted while loading: the scene is gone
      tk.loading(0.8);
      this.progress = progress.data;

      this.bindInput();
      tk.on('resize', () => {
        this.settle();
        this.relayout();
        this.publishView();
      });
      tk.on('pause', () => this.settle());
      tk.ui.setRestartConfirm(strings.restartConfirm);
      tk.ui.onRestart(() => this.restartLevel());
      this.startLevel(tk.attract ? ATTRACT_LEVEL : this.progress.level, run?.data ?? null);
      tk.loading(1);
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

    /** An image of a canvas texture at its design size. */
    private img(key: string): Img {
      return this.add.image(0, 0, key).setScale(1 / texScale(this, key));
    }

    private layerKey(flavour: number, bottom: boolean): string {
      return `hb-layer-${flavour}${bottom ? 'b' : ''}`;
    }

    private build(): void {
      canvasTexture(this, 'hb-glow', 48, 48, (ctx) => drawGlow(ctx, 48), { scale: 1 });
      for (let i = 0; i < MOTES; i++)
        this.motes.push(this.add.image(0, 0, 'hb-glow').setDepth(-900).setBlendMode('ADD'));

      const bar = (color: string, depth: number, alpha = 1) =>
        this.add.rectangle(0, 0, 1, 1, colorNum(color), alpha).setOrigin(0).setDepth(depth);
      for (let i = 0; i < MAX_ROWS; i++)
        this.shelves.push({
          back: bar('#0A0620', -530, 0.46),
          under: bar('#060314', -520, 0.35),
          face: bar(WOOD.face, -510),
          top: bar(WOOD.top, -505),
        });
      this.slab = { face: bar(WOOD.under, -480), top: bar(WOOD.face, -475) };

      // Pekoe and the bottle parts can be shown larger than they are measured, so they are drawn larger too.
      const big = (
        key: string,
        w: number,
        h: number,
        draw: (ctx: CanvasRenderingContext2D) => void,
      ) => canvasTexture(this, key, w, h, draw, { scale: kit.renderScale * BOTTLE_MAX });
      for (const mood of MOODS)
        big(`hb-pekoe-${mood}`, PEKOE.w, PEKOE.h, (ctx) => drawPekoe(ctx, mood));
      this.pekoe = this.add.image(0, 0, 'hb-pekoe-wait').setOrigin(0.5, 1).setDepth(-470);

      const shadow = big('hb-shadow', SHADOW.w, SHADOW.h, drawShadow);
      for (let i = 0; i < MAX_BOTTLES; i++)
        this.shadows.push(this.img(shadow).setDepth(8).setVisible(false));
      const back = big('hb-glass-back', GLASS_TEX.w, GLASS_TEX.h, drawGlassBack);
      const front = big('hb-glass-front', GLASS_TEX.w, GLASS_TEX.h, drawGlassFront);
      const cork = big('hb-cork', CORK.w, CORK.h, drawCork);
      for (let f = 0; f <= FLAVOURS; f++)
        for (const bottom of [false, true])
          big(this.layerKey(f, bottom), LAYER.w, LAYER.h, (ctx) => drawLayer(ctx, f, bottom));
      this.layerK = 1 / texScale(this, this.layerKey(0, false));
      for (let i = 0; i < MAX_BOTTLES; i++) {
        const layers: Img[] = [];
        for (let k = 0; k < CAP; k++)
          layers.push(
            this.add
              .image(0, -WALL - k * LAYER.step, this.layerKey(0, k === 0))
              .setOrigin(0.5, 1)
              .setScale(this.layerK),
          );
        const corkImg = this.img(cork);
        const box = this.add
          .container(0, 0, [
            this.img(back).setPosition(0, -BOTTLE.h / 2),
            ...layers,
            corkImg,
            this.img(front).setPosition(0, -BOTTLE.h / 2),
          ])
          .setVisible(false);
        this.views.push({ box, layers, cork: corkImg });
      }
      this.stream = this.add.rectangle(0, 0, 8, 8, 0xffffff).setOrigin(0.5, 0).setVisible(false);
      this.cursor = this.img(big('hb-cursor', CURSOR.w, CURSOR.h, drawCursor))
        .setDepth(5)
        .setVisible(false);

      // HUD
      this.hud = {
        level: hudPill(this, 0, 0, {
          width: PILL.level,
          height: PILL.h,
          icon: 'flag',
          accent: '#4FB02E',
          value: '',
        }),
        moves: hudPill(this, 0, 0, {
          width: PILL.moves,
          height: PILL.h,
          icon: 'moves',
          accent: colors.blue,
          value: '',
        }),
      };
      const labels = [strings.undo, strings.restart, strings.hint, strings.bottle];
      BUTTON_KINDS.forEach((kind, i) => {
        const key = this.tex(`hb-button-${kind}`, BUTTON, BUTTON, (ctx) => drawButton(ctx, kind));
        const label = kit
          .text(this, 0, BUTTON / 2 + 2, labels[i]!, {
            px: Math.round(BUTTON * 0.22),
            weight: 600,
            shadow: true,
          })
          .setOrigin(0.5, 0);
        const box = this.add.container(0, 0, [this.img(key), label]).setDepth(500);
        this.buttons.push({ box, label });
      });

      // result card
      const panelKey = this.tex('hb-panel', PANEL.w, PANEL.h, drawPanel);
      this.tex('hb-star-on', STAR, STAR, (ctx) => drawStar(ctx, true));
      this.tex('hb-star-off', STAR, STAR, (ctx) => drawStar(ctx, false));
      const text = (y: number, px: number, color: string) =>
        kit.text(this, 0, y, '', { px, color, align: 'center' }).setOrigin(0.5);
      const title = text(-136, 44, colors.text);
      const starImgs = [-112, 0, 112].map((x) => this.img('hb-star-off').setPosition(x, -54));
      const line = text(0, 30, colors.text);
      const note = text(0, 26, colors.gold);
      const total = text(0, 24, colors.textMuted);
      const next = text(150, 26, colors.textMuted);
      const box = this.add
        .container(0, 0, [this.img(panelKey), title, ...starImgs, line, note, total, next])
        .setDepth(800)
        .setVisible(false);
      this.panel = { box, title, stars: starImgs, line, note, total, next };
    }

    /** Swaps the wall for a level's theme. The wall is drawn when it is first needed. */
    private setTheme(theme: number): void {
      if (theme === this.theme) return;
      if (this.bg) {
        const old = this.bg.texture.key;
        this.bg.destroy();
        this.textures.remove(old);
      }
      this.theme = theme;
      const { bleed } = this.tk.layout;
      const spec = THEMES[theme]!;
      this.bg = backdrop(this, `hb-wall-${theme}`, DESIGN.width, DESIGN.height, {
        stops: spec.stops,
        draw: (ctx) =>
          drawWall(
            ctx,
            theme,
            -bleed.x,
            -bleed.y,
            DESIGN.width + bleed.x * 2,
            DESIGN.height + bleed.y * 2,
          ),
      });
      for (const m of this.motes) m.setTint(colorNum(spec.mote));
    }

    // ─── levels ───
    private startLevel(n: number, saved: RunV1 | null = null): void {
      this.settle();
      this.nextTimer?.remove(false);
      this.nextTimer = null;
      this.level = makeLevel(n);
      this.brew = this.level.brew;
      this.history = [];
      this.moves = 0;
      this.usedHint = false;
      this.usedExtra = false;
      let resumed = false;
      if (saved && saved.level === n) {
        const brew = { bottles: saved.bottles, veil: saved.veil };
        if (fitsLevel(this.level, brew, saved.extra) && !isSolved(brew)) {
          this.brew = brew;
          this.history = unpackHistory(saved.history);
          this.moves = saved.moves;
          this.usedHint = saved.hint;
          this.usedExtra = saved.extra;
          resumed = true;
        }
      }
      this.phase = 'play';
      this.sel = -1;
      this.plan = undefined;
      this.result = null;
      this.cur = Math.min(this.cur, this.brew.bottles.length - 1);
      this.panel.box.setVisible(false);
      this.disarmRestart();
      this.setTheme(themeFor(n));
      this.setMood('wait', true);
      this.relayout();
      this.updateHud();
      if (!this.tk.attract) {
        if (this.progress.level !== n) {
          this.progress = { ...this.progress, level: n };
          this.progressSave.set(this.progress);
        }
        this.saveRun();
        if (!resumed) this.announce(n);
      }
      this.arrive();
      this.publishView();

      // The first level shows the first pour until the player makes one.
      this.teach?.remove(false);
      this.teach = null;
      if (n === 1 && this.moves === 0 && !this.tk.attract)
        this.teach = this.time.addEvent({
          delay: 4200,
          startAt: 2800,
          loop: true,
          callback: () => {
            const move = this.busy || this.sel >= 0 ? undefined : this.getPlan()?.[0];
            if (move && this.moves === 0 && this.phase === 'play') this.nudge(move, true);
          },
        });
    }

    /** A toast for what is new on this level: a change of scenery, or the first mystery layers. */
    private announce(n: number): void {
      if (n === MYSTERY_FROM) this.tk.ui.toast(strings.mysteryIntro, { durationMs: 3600 });
      else if (n > 1 && n % 10 === 1) this.tk.ui.toast(THEME_NAMES[themeFor(n)] ?? '');
    }

    /** The bottles of a new level pop onto the shelves. */
    private arrive(): void {
      if (this.tk.motion.reduced) return;
      this.animate(500);
      this.brew.bottles.forEach((_, i) => {
        const box = this.views[i]!.box;
        box.setScale(this.f.scale * 0.82).setAlpha(0);
        this.tweens.add({
          targets: box,
          scale: this.f.scale,
          alpha: 1,
          duration: 200,
          delay: i * 18,
          ease: 'Back.easeOut',
        });
      });
    }

    private saveRun(): void {
      if (this.tk.attract) return;
      this.runSave.set({
        level: this.level.level,
        bottles: this.brew.bottles.map((b) => b.slice()),
        veil: this.brew.veil.slice(),
        moves: this.moves,
        history: packHistory(this.history),
        hint: this.usedHint,
        extra: this.usedExtra,
      });
    }

    // ─── layout ───
    private relayout(): void {
      const { view, cssWidth, cssHeight } = this.tk.layout;
      const css = Math.min(cssWidth / view.width, cssHeight / view.height);
      const f = (this.f = frameFor(view, css, this.brew.bottles.length));

      this.shelves.forEach((s, r) => {
        const rect = f.shelves[r];
        for (const part of [s.back, s.top, s.face, s.under]) part.setVisible(rect !== undefined);
        if (!rect) return;
        const tall = BOTTLE.h * f.scale + f.lift + 4;
        s.back.setPosition(rect.x + 8, rect.y - tall).setSize(rect.w - 16, tall);
        s.top.setPosition(rect.x, rect.y).setSize(rect.w, rect.h * 0.4);
        s.face.setPosition(rect.x, rect.y + rect.h * 0.4).setSize(rect.w, rect.h * 0.6);
        s.under.setPosition(rect.x + 6, rect.y + rect.h).setSize(rect.w - 12, 8);
      });
      this.slab.top.setPosition(view.x, f.counter).setSize(view.width, SLAB * 0.4);
      this.slab.face.setPosition(view.x, f.counter + SLAB * 0.4).setSize(view.width, SLAB * 0.6);

      this.pekoe.setVisible(f.pekoe !== null);
      if (f.pekoe) {
        this.pekoeScale = f.pekoe.h / PEKOE.h / texScale(this, 'hb-pekoe-wait');
        this.pekoe.setPosition(f.pekoe.x, f.pekoe.y);
        this.setMood(this.mood, true);
      }

      this.hud.level.container.setPosition(f.level.x, f.level.y).setScale(f.pillScale);
      this.hud.moves.container.setPosition(f.moves.x, f.moves.y).setScale(f.pillScale);
      this.buttons.forEach((b, i) => {
        const at = f.buttons[i]!;
        b.box.setPosition(at.x, at.y).setScale(f.buttonSize / BUTTON);
      });
      this.panel.box.setPosition(f.panel.x, f.panel.y).setScale(f.panel.scale);

      const rnd = prng(31 + this.theme);
      this.motes.forEach((m, i) => {
        this.moteX[i] = view.x + rnd() * view.width;
        this.moteY[i] = view.y + rnd() * view.height;
        m.setPosition(this.moteX[i], this.moteY[i]);
      });
      this.styleMotes();
      this.renderAll();
    }

    private styleMotes(): void {
      const rain = THEMES[this.theme]?.rain === true;
      const rnd = prng(7);
      for (const m of this.motes) {
        const s = 0.35 + rnd() * 0.5;
        m.setScale(rain ? 0.12 : s, rain ? 0.9 : s).setAlpha(rain ? 0.5 : 0.55);
      }
    }

    // ─── rendering the state ───
    /** Puts bottle `i` exactly as the state has it: place, layers, cork. */
    private renderBottle(i: number): void {
      const v = this.views[i];
      if (!v) return;
      const b = this.brew.bottles[i];
      const spot = this.f.spots[i];
      const shadow = this.shadows[i]!;
      shadow.setVisible(b !== undefined && spot !== undefined);
      if (!b || !spot) {
        v.box.setVisible(false);
        return;
      }
      shadow.setPosition(spot.x, spot.y).setScale(this.f.scale / texScale(this, 'hb-shadow'));
      v.box
        .setPosition(spot.x, spot.y - (i === this.sel ? this.f.lift : 0))
        .setAngle(0)
        .setScale(this.f.scale)
        .setAlpha(1)
        .setDepth(10 + i)
        .setVisible(true);
      const veil = this.brew.veil[i] ?? 0;
      v.layers.forEach((img, k) => {
        const flavour = b[k];
        img.setVisible(flavour !== undefined).setScale(this.layerK);
        if (flavour !== undefined) img.setTexture(this.layerKey(k < veil ? 0 : flavour, k === 0));
      });
      v.cork
        .setVisible(isComplete(b))
        .setPosition(0, -BOTTLE.h + CORK.y)
        .setAlpha(1);
    }

    private renderAll(): void {
      for (let i = 0; i < MAX_BOTTLES; i++) this.renderBottle(i);
      this.showCursor();
    }

    private showCursor(): void {
      const spot = this.f.spots[this.cur];
      const on = this.kbd && this.phase === 'play' && spot !== undefined;
      this.cursor.setVisible(on);
      if (!on) return;
      this.cursor
        .setPosition(spot.x, spot.y - (BOTTLE.h * this.f.scale) / 2 - 2)
        .setScale(this.f.scale / texScale(this, 'hb-cursor'));
    }

    private updateHud(pop = false): void {
      const { level, par } = this.level;
      this.hud.level.set(strings.t('level', { n: level }));
      this.hud.moves.set(strings.t('moves', { moves: this.moves, par }));
      if (pop) this.hud.moves.bump();
      const dim = [this.history.length === 0, false, false, this.usedExtra];
      this.buttons.forEach((b, i) => b.box.setAlpha(dim[i] ? 0.45 : 1));
    }

    private getPlan(): Move[] | null {
      if (this.plan === undefined) this.plan = solve(this.brew);
      return this.plan;
    }

    private centreOf(i: number): { x: number; y: number } {
      const spot = this.f.spots[i]!;
      return { x: spot.x, y: spot.y - (BOTTLE.h * this.f.scale) / 2 };
    }

    private publishView(): void {
      const a = this.tk.attract;
      if (!a) return;
      const move = this.phase === 'play' ? this.getPlan()?.[0] : undefined;
      if (!move) return a.setView(null);
      a.setView({
        from: this.centreOf(move.from),
        to: this.centreOf(move.to),
      } satisfies AttractView);
    }

    // ─── Pekoe ───
    private setMood(mood: Mood, force = false): void {
      if (mood === this.mood && !force) return;
      const changed = mood !== this.mood;
      this.mood = mood;
      this.tweens.killTweensOf(this.pekoe);
      this.pekoe.setTexture(`hb-pekoe-${mood}`).setScale(this.pekoeScale);
      if (this.tk.motion.reduced) return;
      if (changed) {
        this.pekoe.setScale(this.pekoeScale, this.pekoeScale * (mood === 'wait' ? 0.95 : 1.1));
        this.tweens.add({
          targets: this.pekoe,
          scaleY: this.pekoeScale,
          duration: 260,
          ease: 'Back.easeOut',
        });
      }
    }

    private pleased(): void {
      if (this.phase === 'clear') return;
      this.setMood('pleased');
      this.moodTimer?.remove(false);
      this.moodTimer = this.time.delayedCall(1500, () => {
        this.moodTimer = null;
        if (this.phase === 'play') this.setMood('wait');
      });
    }

    // ─── input ───
    private bindInput(): void {
      const { input } = this.tk;
      input.configure({
        actions: {
          left: { codes: ['ArrowLeft', 'KeyA'], repeat: true },
          right: { codes: ['ArrowRight', 'KeyD'], repeat: true },
          up: { codes: ['ArrowUp', 'KeyW'], repeat: true },
          down: { codes: ['ArrowDown', 'KeyS'], repeat: true },
          act: { codes: ['Enter', 'NumpadEnter', 'Space'] },
          undo: { codes: ['KeyU'] },
          undoZ: { codes: ['KeyZ'], modifiers: { ctrl: true, meta: true } },
          restart: { codes: ['KeyR'] },
          hint: { codes: ['KeyH'] },
          bottle: { codes: ['KeyB'] },
        },
      });
      const press = (action: string, run: () => void) =>
        input.on(action, (e) => {
          if (e.phase !== 'press') return;
          this.kbd = true;
          run();
          this.showCursor();
        });
      press('left', () => this.moveCursor(-1, 0));
      press('right', () => this.moveCursor(1, 0));
      press('up', () => this.moveCursor(0, -1));
      press('down', () => this.moveCursor(0, 1));
      press('act', () => this.onAct());
      press('undo', () => this.undo());
      press('undoZ', () => this.undo());
      press('restart', () => void this.tk.ui.pauseMenu());
      press('hint', () => this.showHint());
      press('bottle', () => this.extraBottle());
      input.onGesture('tap', (e) => this.onTap(e.x, e.y));
    }

    private moveCursor(dx: number, dy: number): void {
      if (this.phase !== 'play') return;
      const count = this.brew.bottles.length;
      if (dx !== 0) this.cur = (this.cur + dx + count) % count;
      else this.cur = neighbourRow(this.f, this.cur, dy < 0 ? -1 : 1);
    }

    private onAct(): void {
      if (this.phase === 'clear') return this.skip();
      this.settle();
      this.tapBottle(this.cur);
    }

    private onTap(x: number, y: number): void {
      this.kbd = false;
      this.showCursor();
      if (this.phase === 'clear') return this.skip();
      this.settle();
      const button = buttonAt(this.f, x, y);
      if (button >= 0) return this.pressButton(button);
      const i = bottleAt(this.f, x, y);
      if (i >= 0) return this.tapBottle(i);
      if (this.sel >= 0) this.putDown();
    }

    /** During the celebration any input moves on, once the card has been up for a moment. */
    private skip(): void {
      this.settle();
      if (this.result && this.time.now - this.clearAt > SKIP_GUARD_MS) this.nextLevel();
    }

    private pressButton(i: number): void {
      const box = this.buttons[i]!.box;
      if (!this.tk.motion.reduced) {
        const s = this.f.buttonSize / BUTTON;
        this.tweens.killTweensOf(box);
        box.setScale(s * 0.9);
        this.tweens.add({ targets: box, scale: s, duration: 160, ease: 'Back.easeOut' });
        kit.fps.burst(200);
      }
      if (i !== 1) this.disarmRestart();
      if (i === 0) this.undo();
      else if (i === 1) this.pressRestart();
      else if (i === 2) this.showHint();
      else this.extraBottle();
    }

    private tapBottle(i: number): void {
      const b = this.brew.bottles[i];
      if (!b) return;
      this.disarmRestart();
      if (this.sel < 0) {
        if (isComplete(b)) return this.refuse(i);
        if (b.length > 0) this.lift(i);
      } else if (i === this.sel) this.putDown();
      else if (!this.commit(this.sel, i)) {
        const was = this.sel;
        this.sel = -1;
        this.refuse(was);
      }
    }

    private lift(i: number): void {
      this.sel = i;
      this.tk.sfx.play('lift');
      const spot = this.f.spots[i]!;
      const box = this.views[i]!.box;
      const ms = this.tk.motion.reduced ? 0 : 90;
      if (ms === 0) return this.renderBottle(i);
      this.animate(ms + 60);
      this.tweens.add({
        targets: box,
        y: spot.y - this.f.lift,
        duration: ms,
        ease: 'Back.easeOut',
      });
    }

    private putDown(): void {
      const i = this.sel;
      this.sel = -1;
      this.tk.sfx.play('set');
      const spot = this.f.spots[i];
      if (!spot || this.tk.motion.reduced) return this.renderBottle(i);
      this.animate(150);
      this.tweens.add({
        targets: this.views[i]!.box,
        y: spot.y,
        duration: 90,
        ease: 'Sine.easeOut',
      });
    }

    /** A pour that cannot happen: the bottle goes back down with a shake of the head and a low note. */
    private refuse(i: number): void {
      this.tk.sfx.play('nope');
      this.renderBottle(i);
      const spot = this.f.spots[i];
      if (!spot || this.tk.motion.reduced) return;
      this.animate(320);
      this.tweens.add({
        targets: this.views[i]!.box,
        x: spot.x + 7 * this.f.scale + 2,
        duration: 45,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
    }

    /** Runs `fn` after `ms`, unless the animation is cut short first. */
    private later(ms: number, fn: () => void): void {
      this.timers.push(this.time.delayedCall(ms, fn));
    }

    /** Marks a short bottle animation as running for `ms`. It ends by itself, or at once on the next input. */
    private animate(ms: number): void {
      this.busy = true;
      kit.fps.burst(ms + 100);
      this.later(ms, () => this.settle());
    }

    /** Ends any bottle animation at once: every bottle jumps to where the state has it. */
    private settle(): void {
      if (!this.busy) return;
      this.busy = false;
      for (const t of this.timers) t.remove(false);
      this.timers.length = 0;
      for (const v of this.views) {
        this.tweens.killTweensOf(v.box);
        this.tweens.killTweensOf(v.layers);
        this.tweens.killTweensOf(v.cork);
      }
      this.stream.setVisible(false);
      this.drawAlone(null);
      this.renderAll();
      const after = this.afterPour;
      this.afterPour = null;
      after?.();
    }

    /**
     * Phaser draws sprites that use different textures in one batch and tells them apart with a number passed
     * through the shader. On some renderers that number is not exact across a rotated sprite, and parts of it
     * vanish. A tilted bottle is therefore drawn one texture at a time, which needs no such number.
     */
    private drawAlone(v: BottleView | null): void {
      if (this.tilted === v) return;
      for (const child of (this.tilted?.box.list ?? []) as Img[])
        child.setRenderNodeRole('BatchHandler', null);
      for (const child of (v?.box.list ?? []) as Img[])
        child.setRenderNodeRole('BatchHandler', 'BatchHandlerQuadSingle');
      this.tilted = v;
    }

    // ─── a pour ───
    private commit(from: number, to: number): boolean {
      const before = this.brew;
      const out = pour(before, from, to);
      if (!out) return false;
      const tk = this.tk;
      tk.run.begin();
      this.brew = out.brew;
      this.history.push(out.pour);
      this.moves++;
      this.sel = -1;
      const planned = this.plan?.[0];
      this.plan =
        this.plan && planned && planned.from === from && planned.to === to
          ? this.plan.slice(1)
          : undefined;
      this.teach?.remove(false);
      this.teach = null;
      const solved = isSolved(this.brew);
      if (solved) this.finishLevel();
      else this.saveRun();
      this.updateHud(true);
      this.animatePour(before, out, solved);
      this.publishView();
      return true;
    }

    private animatePour(before: Brew, out: PourOutcome, solved: boolean): void {
      const { from, to, n } = out.pour;
      const sfx = this.tk.sfx;
      const source = before.bottles[from]!;
      const flavour = source[source.length - 1]!;
      const la = source.length;
      const lb = before.bottles[to]!.length;
      const finish = () => {
        if (out.revealed) this.revealPop(from);
        if (out.completed) this.corkPop(to);
        if (solved) this.celebrate();
      };
      if (this.tk.motion.reduced) {
        sfx.play('glug', { detuneCents: (lb + n - 1) * 140 });
        this.renderBottle(from);
        this.renderBottle(to);
        return finish();
      }

      const A = this.views[from]!;
      const B = this.views[to]!;
      const { view } = this.tk.layout;
      const s = this.f.scale;
      const h = BOTTLE.h * s;
      const w = BOTTLE.w * s;
      const sa = this.f.spots[from]!;
      const sb = this.f.spots[to]!;
      // The source tilts over the target from its own side, or from the other side when it would leave the view.
      const reach = h * Math.sin((POUR.angle * Math.PI) / 180);
      let dir =
        sa.x < sb.x - 1 ? 1 : sa.x > sb.x + 1 ? -1 : sb.x > view.x + view.width / 2 ? 1 : -1;
      const fits = (d: number) => {
        const x = sb.x - d * (w * 0.1 + reach);
        return x > view.x + w * 0.4 && x < view.x + view.width - w * 0.4;
      };
      if (!fits(dir) && fits(-dir)) dir = -dir;
      const angle = dir * POUR.angle;
      const rad = (angle * Math.PI) / 180;
      const mx = sb.x - dir * w * 0.1;
      const my = sb.y - h * 1.06;

      this.busy = true;
      this.afterPour = finish;
      const pourMs = n * POUR.layer;
      kit.fps.burst(POUR.tilt + pourMs + POUR.back + 500);
      A.box.setDepth(200);
      this.drawAlone(A);
      this.tweens.add({
        targets: A.box,
        x: mx - h * Math.sin(rad),
        y: my + h * Math.cos(rad),
        angle,
        duration: POUR.tilt,
        ease: 'Sine.easeOut',
      });
      this.later(POUR.tilt, () => {
        const surface = sb.y - (WALL + lb * LAYER.step) * s;
        this.stream
          .setPosition(mx, my)
          .setSize(Math.max(6, w * 0.09), Math.max(4, surface - my))
          .setFillStyle(colorNum(DRINKS[flavour - 1]!.color))
          .setDepth(B.box.depth - 0.5)
          .setVisible(true);
      });
      for (let j = 0; j < n; j++)
        this.later(POUR.tilt + j * POUR.layer, () => {
          sfx.play('glug', { detuneCents: (lb + j) * 140 });
          this.tweens.add({ targets: A.layers[la - 1 - j]!, scaleY: 0, duration: POUR.layer });
          const dst = B.layers[lb + j]!;
          dst
            .setTexture(this.layerKey(flavour, lb + j === 0))
            .setScale(this.layerK, 0)
            .setVisible(true);
          this.tweens.add({ targets: dst, scaleY: this.layerK, duration: POUR.layer });
        });
      this.later(POUR.tilt + pourMs, () => {
        this.stream.setVisible(false);
        this.tweens.add({
          targets: A.box,
          x: sa.x,
          y: sa.y,
          angle: 0,
          duration: POUR.back,
          ease: 'Sine.easeInOut',
        });
      });
      this.later(POUR.tilt + pourMs + POUR.back, () => this.settle());
    }

    /** A mystery layer that just came to the top shows itself with a small flash. */
    private revealPop(i: number): void {
      const b = this.brew.bottles[i]!;
      const spot = this.f.spots[i]!;
      const drink = DRINKS[b[b.length - 1]! - 1]!;
      const y = spot.y - (WALL + (b.length - 0.5) * LAYER.step) * this.f.scale;
      burst(this, spot.x, y, {
        count: 6,
        shape: 'spark',
        colors: ['#FFFFFF', drink.color],
        distance: 46 * this.f.scale + 16,
        size: 12,
        lifeMs: 380,
        depth: 300,
      });
    }

    /** A finished bottle: the cork drops in, with a pop, a sparkle and a chime. */
    private corkPop(i: number): void {
      const v = this.views[i]!;
      const spot = this.f.spots[i]!;
      const b = this.brew.bottles[i]!;
      const sfx = this.tk.sfx;
      sfx.play('pop');
      this.time.delayedCall(90, () => sfx.play('chime'));
      this.pleased();
      const top = spot.y - BOTTLE.h * this.f.scale;
      burst(this, spot.x, top, {
        count: 10,
        shape: 'star',
        colors: [colors.gold, '#FFFFFF', DRINKS[b[0]! - 1]!.color],
        distance: 70 * this.f.scale + 20,
        size: 15,
        lifeMs: 520,
        depth: 300,
      });
      if (this.tk.motion.reduced) return;
      this.animate(600);
      const rest = -BOTTLE.h + CORK.y;
      v.cork.setY(rest - 70).setAlpha(0);
      this.tweens.add({
        targets: v.cork,
        y: rest,
        alpha: 1,
        duration: 170,
        ease: 'Back.easeOut',
      });
    }

    // ─── helpers ───
    private undo(): void {
      this.settle();
      if (this.phase !== 'play') return;
      const last = this.history.pop();
      if (!last) return this.tk.sfx.play('nope', { volume: 0.5 });
      this.brew = unpour(this.brew, last);
      this.moves = Math.max(0, this.moves - 1);
      this.sel = -1;
      this.plan = undefined;
      this.tk.sfx.play('undo');
      this.renderAll();
      this.bumpBottles([last.from, last.to]);
      this.saveRun();
      this.updateHud(true);
      this.publishView();
    }

    private bumpBottles(list: readonly number[], delay = 0): void {
      if (this.tk.motion.reduced) return;
      this.animate(300 + delay * list.length);
      list.forEach((i, k) => {
        const box = this.views[i]?.box;
        const spot = this.f.spots[i];
        if (!box || !spot) return;
        this.tweens.add({
          targets: box,
          y: spot.y - this.f.lift * 0.8,
          duration: 120,
          delay: k * delay,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      });
    }

    private disarmRestart(): void {
      if (!this.restartArmed) return;
      this.restartArmed.remove(false);
      this.restartArmed = null;
      this.buttons[1]!.label.setText(strings.restart);
    }

    /** The Restart button asks once more before it throws the level's pours away. */
    private pressRestart(): void {
      if (this.phase !== 'play') return;
      if (this.history.length === 0 && !this.usedExtra) return this.tk.sfx.play('click');
      if (this.restartArmed) return this.restartLevel();
      this.tk.sfx.play('click');
      this.buttons[1]!.label.setText(strings.restartSure);
      this.restartArmed = this.time.delayedCall(RESTART_ARM_MS, () => {
        this.restartArmed = null;
        this.buttons[1]!.label.setText(strings.restart);
      });
    }

    private restartLevel(): void {
      if (this.tk.signal.aborted || this.phase !== 'play') return;
      this.settle();
      this.disarmRestart();
      this.brew = this.level.brew;
      this.history = [];
      this.moves = 0;
      this.usedHint = false;
      this.usedExtra = false;
      this.sel = -1;
      this.plan = undefined;
      this.cur = Math.min(this.cur, this.brew.bottles.length - 1);
      this.tk.sfx.play('undo');
      this.relayout();
      this.arrive();
      this.saveRun();
      this.updateHud();
      this.publishView();
    }

    /** Nudges the two bottles of a move, the one to lift first. */
    private nudge(move: Move, quiet = false): void {
      if (!quiet) this.tk.sfx.play('hint');
      this.bumpBottles([move.from, move.to], 190);
    }

    private showHint(): void {
      this.settle();
      if (this.phase !== 'play') return;
      if (this.sel >= 0) {
        this.sel = -1;
        this.renderAll();
      }
      const move = this.getPlan()?.[0];
      if (!move) {
        this.tk.sfx.play('nope');
        this.tk.ui.toast(strings.stuck, { tone: 'warning' });
        return;
      }
      if (!this.usedHint) {
        this.usedHint = true;
        this.saveRun();
      }
      this.nudge(move);
    }

    private extraBottle(): void {
      this.settle();
      if (this.phase !== 'play') return;
      if (this.usedExtra) {
        this.tk.sfx.play('nope', { volume: 0.5 });
        this.tk.ui.toast(strings.bottleUsed);
        return;
      }
      this.brew = addBottle(this.brew);
      this.usedExtra = true;
      this.sel = -1;
      this.plan = undefined;
      this.tk.sfx.play('pop');
      this.relayout();
      const box = this.views[this.brew.bottles.length - 1]!.box;
      if (!this.tk.motion.reduced) {
        this.animate(320);
        box.setScale(0);
        this.tweens.add({
          targets: box,
          scale: this.f.scale,
          duration: 240,
          ease: 'Back.easeOut',
        });
      }
      this.saveRun();
      this.updateHud();
      this.publishView();
    }

    // ─── a solved level ───
    /** Records the result the moment the last pour is made, so leaving during the celebration loses nothing. */
    private finishLevel(): void {
      const tk = this.tk;
      const n = this.level.level;
      const earned = stars(this.moves, this.level.par);
      this.phase = 'clear';
      this.result = {
        level: n,
        stars: earned,
        moves: this.moves,
        par: this.level.par,
        hint: this.usedHint,
        extra: this.usedExtra,
      };
      if (tk.attract) return;
      const further = n > this.progress.furthest;
      this.progress = {
        furthest: Math.max(this.progress.furthest, n),
        level: n + 1,
        stars: this.progress.stars + (further ? earned : 0),
      };
      this.progressSave.set(this.progress);
      this.runSave.set(null);
      tk.run.end('level_end');
      // The board gets an entry every tenth level (when the tea house changes), not after each one: every entry
      // makes the portal ask for initials, which would interrupt each level.
      if (further && n % BOARD_EVERY === 0)
        void tk.host.scores
          .submit({
            board: 'levels-solved',
            value: n,
            meta: { stars: this.progress.stars, moves: this.moves, par: this.level.par },
          })
          .catch(() => {});
    }

    private celebrate(): void {
      const r = this.result;
      if (!r) return;
      const { sfx, motion } = this.tk;
      const { view } = this.tk.layout;
      this.clearAt = this.time.now;
      this.moodTimer?.remove(false);
      this.moodTimer = null;
      this.setMood('cheer');
      this.showCursor();
      sfx.play('win');

      const p = this.panel;
      p.title.setText(strings.t('clearTitle', { n: r.level }));
      p.line.setText(
        r.moves === 1
          ? strings.t('clearOneMove', { par: r.par })
          : strings.t('clearMoves', { moves: r.moves, par: r.par }),
      );
      p.note.setText(
        r.hint && r.extra
          ? strings.usedBoth
          : r.hint
            ? strings.usedHint
            : r.extra
              ? strings.usedBottle
              : '',
      );
      const sum = this.tk.attract ? 0 : this.progress.stars;
      p.total.setText(
        sum === 0 ? '' : sum === 1 ? strings.oneStar : strings.t('starsSoFar', { n: sum }),
      );
      // the rows under the stars close up when one of them is empty
      let y = 22;
      for (const row of [p.line, p.note, p.total]) {
        row.setY(y);
        if (row.text !== '') y += 40;
      }
      p.next.setText(this.kbd ? strings.nextKey : strings.next);
      const starK = 1 / texScale(this, 'hb-star-on');
      p.stars.forEach((img, i) => {
        this.tweens.killTweensOf(img);
        img.setTexture(i < r.stars ? 'hb-star-on' : 'hb-star-off').setScale(starK);
      });
      this.tweens.killTweensOf(p.box);
      p.box.setVisible(true).setAlpha(1).setScale(this.f.panel.scale);
      if (!motion.reduced) {
        kit.fps.burst(1400);
        p.box.setScale(this.f.panel.scale * 0.7).setAlpha(0);
        this.tweens.add({
          targets: p.box,
          scale: this.f.panel.scale,
          alpha: 1,
          duration: 200,
          ease: 'Back.easeOut',
        });
        p.stars.forEach((img, i) => {
          if (i >= r.stars) return;
          img.setScale(0);
          this.tweens.add({
            targets: img,
            scale: starK,
            duration: 240,
            delay: 180 + i * 150,
            ease: 'Back.easeOut',
            onStart: () => sfx.play('coin', { detuneCents: i * 200, volume: 0.6 }),
          });
        });
      }
      const cx = view.x + view.width / 2;
      for (const dx of [-0.3, 0, 0.3])
        burst(this, cx + dx * view.width, this.f.panel.y - 40, {
          count: 14,
          shape: 'star',
          distance: 200,
          size: 18,
          lifeMs: 900,
          gravity: 120,
          depth: 790,
        });
      this.nextTimer?.remove(false);
      this.nextTimer = this.time.delayedCall(NEXT_AFTER_MS, () => this.nextLevel());
    }

    private nextLevel(): void {
      if (this.phase !== 'clear' || this.tk.signal.aborted) return;
      this.startLevel(this.level.level + 1);
    }

    override update(_time: number, delta: number): void {
      if (this.tk.motion.reduced) return;
      // lights drift slowly; on the rainy wall they fall instead
      const dt = Math.min(50, delta) / 1000;
      this.clock += dt;
      const { view } = this.tk.layout;
      const rain = THEMES[this.theme]?.rain === true;
      for (let i = 0; i < MOTES; i++) {
        const m = this.motes[i]!;
        if (rain) {
          let y = m.y + (260 + i * 22) * dt;
          if (y > view.y + view.height + 30) {
            y = view.y - 30;
            m.x = view.x + this.fxRnd() * view.width;
          }
          m.y = y;
          continue;
        }
        const t = this.clock * 0.22 + i * 1.9;
        m.setPosition(this.moteX[i]! + Math.sin(t) * 40, this.moteY[i]! + Math.cos(t * 0.7) * 30);
        m.setAlpha(0.35 + 0.25 * Math.sin(t * 2.3));
      }
    }
  }

  return [Play];
};
