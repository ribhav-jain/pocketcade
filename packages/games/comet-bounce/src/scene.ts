// The Comet Bounce scene: steps the pure simulation at 60 Hz and draws it. All art is drawn once per mount (art.ts);
// per frame we only move, tint and fade images. Effects use decoration-only randomness, never game state.
import type Phaser from 'phaser';
import { colorNum, colors, formatScore, mixHex, prng, shade, type Save } from '@pocketcade/toolkit';
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
import { LEVELS, zoneOf, zoneStart } from './levels.ts';
import { isRunSlotV1, type RunSlotV1 } from './save.ts';
import {
  CEIL,
  GRID,
  STAGE,
  WALL_L,
  WALL_R,
  createRun,
  type Brick,
  type CometRun,
  type RunState,
  type SimEvent,
} from './sim.ts';
import { strings } from './strings.ts';

const MAX_STEPS_PER_FRAME = 6;
const STEP_MS = 1000 / 60;
const TRAIL = 12;
const SHIELD_Y = -6.5;
const SKY = colorNum('sky');
const TRAIL_TINTS = [
  '#E6FCFF',
  '#BFF6FF',
  '#7FE6FF',
  colors.sky,
  colors.sky,
  '#8FA0FF',
  colors.pink,
  colors.pink,
  '#C86BFF',
  colors.violet,
  colors.violet,
  colors.violet,
].map(colorNum);
const STASIS_TINT = colorNum('#B9C3FF');
const ZONE_FADE_MS = 900;

type Img = Phaser.GameObjects.Image;
type Text = Phaser.GameObjects.Text;
interface Comet {
  core: Img;
  glow: Img;
  trail: Img[];
  pts: { x: number; y: number }[];
  vx: number;
  vy: number;
  squash: number;
  axis: 'x' | 'y';
}
interface Skiff {
  root: Phaser.GameObjects.Container;
  wingL: Img;
  wingR: Img;
  pilot: Img;
  shield: Img;
  glow: Img;
  under: Img;
  flames: Img[];
}

/** Texture key for a brick in its current state (frost and prism crystals crack as they lose hit points). */
const brickKey = (b: Brick) =>
  b.type === '#'
    ? 'cc-plate'
    : b.type === 'f'
      ? 'cc-mine'
      : b.type === 'w' || b.type === 'x' || b.type === 'z'
        ? `cc-charm-${b.type}`
        : `cc-crystal-${b.type}-${b.hp}`;
const centre = (b: Brick) => ({ x: b.x + GRID.brickW / 2, y: b.y + GRID.brickH / 2 });

export const createScenes: SceneFactory = (_P, kit) => {
  class Wall extends kit.Scene {
    private sim!: CometRun;
    private runSave!: Save<RunSlotV1>;
    private acc = 0;
    private launch = false;
    private pointerX: number | null = null;
    private dragDx = 0;
    private press: { x: number; y: number; t: number; lastX: number; touch: boolean } | null = null;
    private ending = false;
    private rnd = prng(0xc0e7);
    private bricks = new Map<number, Img>();
    private mineGlows = new Map<number, Img>();
    private comets: Comet[] = [];
    private pods: { img: Img; glow: Img }[] = [];
    private skiff!: Skiff;
    private tilt = 0;
    private hop = 0;
    private mood: art.Mood = 'idle';
    private moodUntil = 0;
    private stars: {
      img: Img;
      x: number;
      y: number;
      speed: number;
      par: number;
      twinkle: number;
    }[] = [];
    private glint!: Img;
    private nextGlint = 0;
    /** nebula cloud sprites, tinted by the current zone */
    private clouds: { img: Img; x: number; y: number }[] = [];
    private planets: Img[] = [];
    private zone = -1;
    /** the star field's wrap box: the design area plus the bleed */
    private voidGlow!: Img;
    private sky: { x: number; y: number; w: number; h: number } = {
      x: 0,
      y: 0,
      w: STAGE.width,
      h: STAGE.height,
    };
    private hud!: {
      score: HudPill;
      mult: Text;
      wall: HudPill;
      ships: HudPill;
      shipIcons: Img[];
      chips: Record<'w' | 'z', HudPill>;
    };
    private shown = { score: -1, lives: -1, mult: 1, level: -1 };
    private prompt!: Text;
    private intro!: { root: Phaser.GameObjects.Container; label: Text; name: Text };
    private banner!: { root: Phaser.GameObjects.Container; title: Text; lines: Text };

    constructor() {
      super('wall');
    }

    create(): void {
      const tk = this.tk;
      this.makeTextures();
      this.drawStage();
      this.buildSkiff();
      this.buildHud();
      tk.input.configure({
        actions: {
          left: { codes: ['ArrowLeft', 'KeyA'] },
          right: { codes: ['ArrowRight', 'KeyD'] },
          fine: { codes: ['ShiftLeft', 'ShiftRight'] },
          launch: { codes: ['Space', 'Enter', 'ArrowUp', 'KeyW'] },
        },
      });
      tk.input.on('launch', (e) => e.phase === 'press' && (this.launch = true));
      for (const a of ['left', 'right'] as const) tk.input.on(a, () => (this.pointerX = null)); // last-used input wins
      this.bindPointer();
      tk.ui.onRestart(() => this.newRun(1));
      tk.on('resize', () => this.placeFloor());
      this.runSave = tk.createSave<RunSlotV1>({
        key: 'run',
        defaults: () => null,
        validate: isRunSlotV1,
      });
      tk.deferReady();
      void this.runSave
        .load()
        .then((r) => {
          if (tk.signal.aborted) return; // unmounted while loading: the scene is gone
          const cp = tk.attract ? null : r.data;
          if (cp) {
            this.startRun({
              level: cp.level,
              score: cp.scoreAtLevelStart,
              lives: cp.lives,
              startLevel: cp.startLevel,
              levelsCleared: cp.levelsCleared,
              cleanLevels: cp.cleanLevels,
            });
            if (cp.level > 1) tk.ui.toast(strings.t('continuing', { n: cp.level }));
          } else this.newRun(tk.attract ? 7 : 1);
          tk.ready();
        })
        .catch((e: unknown) => tk.reportError(e, true));
    }

    // ─── art ───
    private makeTextures(): void {
      const crisp = (
        key: string,
        w: number,
        h: number,
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
      ) => canvasTexture(this, key, w, h, draw);
      const soft = (
        key: string,
        w: number,
        h: number,
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
      ) => canvasTexture(this, key, w, h, draw, { scale: 1 });
      const { brickW: w, brickH: h } = GRID;
      for (const type of ['1', '2', '3'] as const)
        for (let hp = 1; hp <= Number(type); hp++)
          crisp(`cc-crystal-${type}-${hp}`, w, h, (c) => art.drawCrystal(c, w, h, type, hp));
      crisp('cc-plate', w, h, art.drawPlate);
      crisp('cc-mine', w, h, art.drawMine);
      for (const k of ['w', 'x', 'z'] as const) {
        crisp(`cc-charm-${k}`, w, h, (c) => art.drawCharmBrick(c, w, h, k));
        crisp(`cc-pod-${k}`, 56, 30, (c, cw, ch) => art.drawFallingPod(c, cw, ch, k));
        crisp(`cc-badge-${k}`, 32, 32, (c, cw) => art.drawBadge(c, cw, k));
      }
      const sw = art.SKIFF_H;
      crisp('cc-hull', art.HULL_W, sw, (c, cw) => art.drawHull(c, cw));
      crisp('cc-canopy', art.HULL_W, sw, (c, cw) => art.drawCanopy(c, cw));
      for (const m of ['idle', 'happy', 'oops'] as const)
        crisp(`cc-pilot-${m}`, art.HULL_W, sw, (c, cw) => art.drawPilot(c, cw, m));
      crisp('cc-wing-l', art.WING_W, sw, (c, cw) => art.drawWing(c, cw, true));
      crisp('cc-wing-r', art.WING_W, sw, (c, cw) => art.drawWing(c, cw, false));
      crisp('cc-shield', 64, 9, art.drawShield);
      crisp('cc-flame', 12, 26, art.drawFlame);
      crisp('cc-ship-on', 30, 18, (c, cw, ch) => art.drawShipIcon(c, cw, ch, true));
      crisp('cc-ship-off', 30, 18, (c, cw, ch) => art.drawShipIcon(c, cw, ch, false));
      crisp('cc-comet', 22, 22, (c, cw) => art.drawCometCore(c, cw));
      crisp('cc-shard', 10, 18, art.drawShard);
      crisp('cc-panel', 460, 200, art.drawPanel);
      soft('cc-comet-glow', 96, 96, (c, cw) => art.drawCometGlow(c, cw));
      soft('cc-soft', 64, 64, art.drawSoft);
      soft('cc-glint', 32, 32, art.drawGlint);
      soft('cc-ring', 96, 96, (c, cw) => art.drawRing(c, cw));
      soft('cc-cloud', 128, 128, (c, cw) => art.drawCloud(c, cw));
      soft('cc-shade-h', 32, 32, art.drawShade);
      soft('cc-void', 32, 32, art.drawVoid);
      art.ZONES.forEach((z, i) =>
        crisp(`cc-planet-${i}`, art.PLANET_W, art.PLANET_H, (c) => art.drawPlanet(c, z.planet)),
      );
    }

    /**
     * The arena (rails, ceiling) is the design area; the frame may show up to `bleed` more on each side, which
     * gets the same nebula, a darkening shade and the rails running on to the frame edge.
     */
    private drawStage(): void {
      const { width: W, height: H } = STAGE;
      const { x: bx, y: by } = this.tk.layout.bleed;
      // The camera keeps world y 0 at the top of the view, so a tall frame shows extra space below (see update).
      const fullH = H + by * 2;
      this.sky = { x: -bx, y: 0, w: W + bx * 2, h: fullH };
      canvasTexture(this, 'cc-space', W + bx * 2, fullH, (c) => art.drawSpace(c, W, fullH, bx), {
        scale: 1,
      });
      this.add.image(-bx, 0, 'cc-space').setOrigin(0).setDepth(-1000);
      this.voidGlow = this.add.image(-bx, 0, 'cc-void').setOrigin(0).setDepth(-890);
      for (const [x, y, r, a] of art.CLOUDS) {
        const img = this.add
          .image(x, y, 'cc-cloud')
          .setDepth(-980)
          .setBlendMode('ADD')
          .setAlpha(a)
          .setScale((r * 2) / 128);
        this.clouds.push({ img, x, y });
      }
      this.planets = art.ZONES.map((z, i) =>
        canvasImage(this, z.planet.x, z.planet.y, `cc-planet-${i}`)
          .setDepth(-960)
          .setVisible(false),
      );
      if (bx > 0)
        for (const left of [true, false])
          this.add
            .image(left ? -bx : W, 0, 'cc-shade-h')
            .setOrigin(0)
            .setFlipX(left)
            .setDisplaySize(bx, fullH)
            .setDepth(-890);
      // two parallax layers of drifting stars (small sprites, so almost no overdraw); some near ones twinkle
      const tints = [0xffffff, 0xffffff, 0xbff6ff, 0xffb3da];
      const count = Math.min(110, Math.round((52 * this.sky.w * this.sky.h) / (W * H)));
      for (let i = 0; i < count; i++) {
        const near = i >= count * 0.58;
        const glint = i >= count * 0.85;
        const img = this.add
          .image(0, 0, glint ? 'cc-glint' : 'cc-soft')
          .setDepth(-900)
          .setBlendMode('ADD');
        img
          .setTint(tints[i % 4]!)
          .setScale(glint ? 0.3 + this.rnd() * 0.25 : (near ? 0.09 : 0.05) + this.rnd() * 0.05)
          .setAlpha(0.45 + this.rnd() * 0.5);
        this.stars.push({
          img,
          x: this.sky.x + this.rnd() * this.sky.w,
          y: this.sky.y + this.rnd() * (this.sky.h + 20),
          speed: near ? 15 : 5,
          par: near ? 1 : 0.4,
          twinkle: glint ? 0.8 + this.rnd() * 1.4 : 0,
        });
      }
      const railH = fullH - 56;
      canvasTexture(this, 'cc-rail-l', WALL_L, railH, (c, w, h) => art.drawRail(c, w, h, true));
      canvasTexture(this, 'cc-rail-r', W - WALL_R, railH, (c, w, h) =>
        art.drawRail(c, w, h, false),
      );
      canvasTexture(this, 'cc-ceiling', W, CEIL - 56, art.drawCeiling);
      canvasImage(this, 0, 56, 'cc-rail-l').setOrigin(0).setDepth(20);
      canvasImage(this, WALL_R, 56, 'cc-rail-r').setOrigin(0).setDepth(20);
      canvasImage(this, 0, 56, 'cc-ceiling').setOrigin(0).setDepth(21);
      this.glint = this.add
        .image(0, 0, 'cc-glint')
        .setDepth(4)
        .setBlendMode('ADD')
        .setVisible(false);
    }

    private buildSkiff(): void {
      const part = (key: string, ox: number) =>
        canvasImage(this, 0, 0, key).setOrigin(ox, art.SKIFF_OY / art.SKIFF_H);
      const under = this.add
        .image(0, 26, 'cc-soft')
        .setBlendMode('ADD')
        .setTint(colorNum('violet'))
        .setAlpha(0.55);
      const flames = [-21, 21].map((x) =>
        canvasImage(this, x, 22, 'cc-flame').setOrigin(0.5, 0).setBlendMode('ADD'),
      );
      const tip = 5.75 / art.WING_W;
      const wingL = part('cc-wing-l', tip);
      const wingR = part('cc-wing-r', 1 - tip);
      const hull = part('cc-hull', 0.5);
      const pilot = part('cc-pilot-idle', 0.5);
      const canopy = part('cc-canopy', 0.5);
      const glow = this.add
        .image(0, SHIELD_Y, 'cc-soft')
        .setBlendMode('ADD')
        .setTint(SKY)
        .setAlpha(0.35);
      const shield = canvasImage(this, 0, SHIELD_Y, 'cc-shield');
      const root = this.add
        .container(STAGE.width / 2, STAGE.height - 56, [
          under,
          ...flames,
          wingL,
          wingR,
          hull,
          pilot,
          canopy,
          glow,
          shield,
        ])
        .setDepth(6);
      this.skiff = { root, wingL, wingR, pilot, shield, glow, under, flames };
    }

    private buildHud(): void {
      const h = 44;
      const score = hudPill(this, 16, 6, {
        icon: 'star',
        accent: colors.gold,
        label: strings.score,
        value: '0',
        width: 178,
        height: h,
      });
      const mult = kit
        .text(this, 186, 28, '', { px: 20, color: 'gold', stroke: '#120C2C', strokePx: 4 })
        .setOrigin(1, 0.5)
        .setDepth(510);
      const wall = hudPill(this, 202, 6, {
        icon: 'flag',
        accent: colors.sky,
        label: '',
        value: '',
        width: 262,
        height: h,
      });
      const ships = hudPill(this, 472, 6, { label: strings.ships, width: 128, height: h });
      const shipIcons = [0, 1, 2].map((i) => canvasImage(this, 34 + i * 32, 29, 'cc-ship-on'));
      ships.container.add(shipIcons);
      const chip = (k: 'w' | 'z', label: string) => {
        const c = hudPill(this, 608, 6, {
          icon: 'clock',
          accent: art.POD[k],
          label,
          value: '',
          width: 98,
          height: h,
        });
        c.container.add(canvasImage(this, 22, 22, `cc-badge-${k}`));
        return c;
      };
      this.hud = {
        score,
        mult,
        wall,
        ships,
        shipIcons,
        chips: { w: chip('w', strings.wingspan), z: chip('z', strings.stasis) },
      };
      this.prompt = kit
        .text(this, 480, 606, '', {
          px: 22,
          color: 'text',
          stroke: '#120C2C',
          strokePx: 5,
          shadow: true,
        })
        .setOrigin(0.5)
        .setDepth(520);
      const bar = (x: number) => this.add.rectangle(x, -26, 56, 3, SKY).setAlpha(0.9);
      const label = kit
        .text(this, 0, -26, '', { px: 18, color: 'sky', stroke: '#120C2C', strokePx: 4 })
        .setOrigin(0.5);
      const name = kit
        .text(this, 0, 10, '', {
          px: 44,
          color: 'text',
          stroke: '#120C2C',
          strokePx: 7,
          shadow: true,
        })
        .setOrigin(0.5);
      this.intro = {
        root: this.add
          .container(480, 500, [bar(-92), bar(92), label, name])
          .setDepth(600)
          .setVisible(false),
        label,
        name,
      };
      const title = kit
        .text(this, 0, -44, '', {
          px: 34,
          color: 'gold',
          stroke: '#120C2C',
          strokePx: 6,
          shadow: true,
        })
        .setOrigin(0.5);
      const lines = kit
        .text(this, 0, 22, '', { px: 21, color: 'text', align: 'center' })
        .setOrigin(0.5, 0);
      lines.setLineSpacing(6);
      this.banner = {
        root: this.add
          .container(480, 470, [canvasImage(this, 0, 0, 'cc-panel'), title, lines])
          .setDepth(600)
          .setVisible(false),
        title,
        lines,
      };
    }

    // ─── input: keyboard via tk.input; mouse steers absolutely, touch drags relatively; a short tap launches ───
    private bindPointer(): void {
      const live = () => !this.tk.attract && !this.tk.ui.open;
      const world = (p: Phaser.Input.Pointer) => this.cameras.main.getWorldPoint(p.x, p.y).x;
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (!live()) return;
        const e = p.event as PointerEvent;
        this.press = {
          x: e.clientX,
          y: e.clientY,
          t: this.time.now,
          lastX: world(p),
          touch: p.wasTouch,
        };
      });
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (!live()) return;
        if (p.wasTouch) {
          if (!this.press) return;
          const x = world(p);
          this.dragDx += x - this.press.lastX;
          this.press.lastX = x;
        } else this.pointerX = world(p);
      });
      this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
        const pr = this.press;
        this.press = null;
        if (!pr || !live()) return;
        const e = p.event as PointerEvent;
        if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) <= 8 && this.time.now - pr.t < 450)
          this.launch = true;
      });
    }

    // ─── run lifecycle ───
    private newRun(level: number): void {
      this.startRun({
        level,
        score: 0,
        lives: 3,
        startLevel: level,
        levelsCleared: 0,
        cleanLevels: 0,
      });
    }

    private startRun(state: RunState): void {
      const seed = `${this.tk.meta.id}:run:${this.tk.rng.main.nextUint32().toString(16)}`;
      this.sim = createRun(this.tk.rng.create(seed), state, {
        attract: !!this.tk.attract,
        reducedMotion: this.tk.motion.reduced,
        floor: this.floorForView(),
      });
      this.placeFloor();
      this.ending = false;
      this.acc = 0;
      this.launch = false;
      this.shown = { score: -1, lives: state.lives, mult: 1, level: -1 };
      const { score, mult, wall, ships, chips } = this.hud;
      for (const o of [
        score.container,
        mult,
        wall.container,
        ships.container,
        chips.w.container,
        chips.z.container,
      ])
        o.setVisible(!this.tk.attract);
      this.handle(this.sim.begin());
      this.render(0);
    }

    /** The arena floor for the current frame: the design floor, or near the bottom of a taller view. */
    private floorForView(): number {
      const h = this.tk.layout.view.height;
      return h > STAGE.height ? h - 40 : STAGE.height;
    }

    /** Pin the camera's top to world y 0 and move the floor-relative pieces after a resize. */
    private placeFloor(): void {
      this.cameras.main.scrollY = 0;
      if (!this.sim) return;
      this.sim.setFloor(this.floorForView());
      const a = this.sim.arena;
      this.prompt.setY(a.batY - 58);
      this.voidGlow.setY(a.floor - 44).setDisplaySize(this.sky.w, 60);
    }

    override update(time: number, delta: number): void {
      this.cameras.main.scrollY = 0;
      if (!this.sim) return;
      this.acc = Math.min(this.acc + delta, MAX_STEPS_PER_FRAME * STEP_MS);
      while (this.acc >= STEP_MS) {
        this.acc -= STEP_MS;
        const input = this.tk.input;
        const events = this.sim.step({
          left: input.isDown('left'),
          right: input.isDown('right'),
          fine: input.isDown('fine'),
          pointerX: this.pointerX,
          dragDx: this.dragDx,
          launch: this.launch,
        });
        this.dragDx = 0;
        this.launch = false;
        this.handle(events);
        this.track();
        this.tk.attract?.setView({
          batX: this.sim.bat.x,
          batWidth: this.sim.bat.w,
          balls: this.sim.balls,
          hpByColumn: this.sim.hpByColumn(),
          ready: this.sim.phase === 'ready',
          restY: this.sim.arena.restY,
        } satisfies AttractView);
      }
      this.render(delta, time);
    }

    private checkpoint(): void {
      if (this.tk.attract) return;
      const s = this.sim.state;
      this.runSave.set({
        level: s.level,
        scoreAtLevelStart: this.sim.scoreAtLevelStart,
        lives: s.lives,
        startLevel: s.startLevel,
        levelsCleared: s.levelsCleared,
        cleanLevels: s.cleanLevels,
      });
    }

    private handle(events: SimEvent[]): void {
      const { sfx } = this.tk;
      for (const e of events) {
        switch (e.type) {
          case 'level-start':
            this.onLevelStart(e.level);
            this.checkpoint();
            break;
          case 'launch':
            this.tk.run.begin();
            sfx.play('jump', { volume: 0.3 });
            burst(this, this.sim.bat.x, this.sim.arena.batY - 14, {
              count: 8,
              colors: ['#FFFFFF', colors.sky, colors.pink],
              shape: 'spark',
              distance: 46,
              size: 14,
              lifeMs: 360,
              angle: -Math.PI / 2,
              spread: 1.6,
              depth: 40,
            });
            break;
          case 'bat':
            sfx.play('bat');
            this.shieldPulse(e.x);
            break;
          case 'wall':
            sfx.play('click', { volume: 0.15 });
            this.wallSpark(e.x, e.y);
            break;
          case 'keystone':
            sfx.play('clank');
            this.plateHit(e.brick);
            break;
          case 'crack':
            sfx.play('hit', { volume: 0.4, detuneCents: 300 });
            this.crack(e.brick);
            break;
          case 'break':
            sfx.play('crumble', { detuneCents: 150 * (e.multiplier - 1) });
            this.shatter(e.brick, e.points, e.multiplier);
            break;
          case 'fuse':
            sfx.play('explode', { volume: 0.25, detuneCents: Math.min(1200, 100 * e.link) });
            break;
          case 'pod':
            sfx.play('coin', { volume: 0.45 });
            this.podCaught(e.kind, e.x, e.y);
            break;
          case 'fizzle':
            this.fizzle(e.x);
            break;
          case 'effect-end':
            sfx.play('fade');
            break;
          case 'life-lost':
            sfx.play('drop');
            this.onLifeLost();
            if (this.sim.state.lives > 0) this.checkpoint();
            break;
          case 'clear':
            sfx.play('win');
            this.onClear(e);
            break;
          case 'over':
          case 'complete':
            void this.gameOver(e.type === 'complete');
            break;
        }
      }
    }

    private onClear(e: Extract<SimEvent, { type: 'clear' }>): void {
      const lines = [strings.clearBonus];
      if (e.speedBonus > 0) lines.push(strings.t('speedBonus', { n: e.speedBonus }));
      if (e.clean) lines.push(strings.cleanBonus);
      if (e.repaired) lines.push(strings.shipRepaired);
      this.celebrate(strings.t('wallDown', { n: e.level }), lines);
      if (!this.tk.attract) this.tk.run.end('level_end');
    }

    private async gameOver(complete: boolean): Promise<void> {
      if (this.ending) return;
      this.ending = true;
      const s = this.sim.state;
      if (!this.tk.attract) {
        this.runSave.set(null);
        if (complete) this.fireworks(8);
        else this.tk.sfx.play('lose');
      }
      // A lost run can pick up again at the first wall of the zone it reached, with a fresh score.
      const resume = complete ? 1 : zoneStart(s.level);
      const action = await this.tk.ui.gameOver({
        title: complete ? strings.everyWall : strings.outOfShips,
        scores: [{ board: 'score', value: s.score }],
        meta: {
          v: 1,
          startLevel: s.startLevel,
          endLevel: s.level,
          levelsCleared: s.levelsCleared,
          cleanLevels: s.cleanLevels,
        },
        actions:
          resume > 1 ? [{ id: 'continue', label: strings.t('continueFrom', { n: resume }) }] : [],
      });
      if (this.tk.signal.aborted) return;
      if (this.tk.attract) this.newRun(7);
      else if (action === 'continue') this.newRun(resume);
      else if (action === 'play-again') this.newRun(1);
    }

    // ─── moments and effects ───
    private get calm(): boolean {
      return this.tk.motion.reduced;
    }

    private setMood(m: art.Mood, ms: number): void {
      if (this.mood === 'oops' && m === 'happy' && this.time.now < this.moodUntil) return;
      this.mood = m;
      this.moodUntil = this.time.now + ms;
      this.skiff.pilot.setTexture(`cc-pilot-${m}`);
    }

    private onLevelStart(level: number): void {
      this.setZone(zoneOf(level));
      for (const img of this.bricks.values()) img.destroy();
      for (const img of this.mineGlows.values()) img.destroy();
      this.bricks.clear();
      this.mineGlows.clear();
      this.buildBricks();
      this.banner.root.setVisible(false);
      for (const c of this.comets) c.pts.length = 0;
      if (this.tk.attract) return;
      const { root, label, name } = this.intro;
      label.setText(strings.t('wall', { n: level }).toUpperCase());
      name.setText(LEVELS[level - 1]!.name);
      this.tweens.killTweensOf(root);
      root
        .setVisible(true)
        .setAlpha(0)
        .setY(this.calm ? 500 : 524);
      this.tweens.add({ targets: root, alpha: 1, y: 500, duration: 320, ease: 'Back.easeOut' });
      this.tweens.add({
        targets: root,
        alpha: 0,
        delay: 1700,
        duration: 450,
        onComplete: () => root.setVisible(false),
      });
    }

    /** Recolour the nebula and swap the planet for a zone; a crossfade when the zone changes mid-run. */
    private setZone(zone: number): void {
      if (zone === this.zone) return;
      const from = this.zone;
      this.zone = zone;
      const tints = art.ZONES[zone]!.clouds;
      const target = (i: number) => tints[i % tints.length]!;
      const old = from >= 0 && !this.calm ? art.ZONES[from]!.clouds : null;
      this.planets.forEach((p, i) => {
        this.tweens.killTweensOf(p);
        if (i !== zone && i !== from) p.setVisible(false);
      });
      if (!old) {
        this.clouds.forEach((c, i) => c.img.setTint(colorNum(target(i))));
        this.planets.forEach((p, i) => p.setVisible(i === zone).setAlpha(1));
        return;
      }
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: ZONE_FADE_MS,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 1;
          this.clouds.forEach((c, i) =>
            c.img.setTint(colorNum(mixHex(old[i % old.length]!, target(i), k))),
          );
        },
      });
      const prev = this.planets[from]!;
      const next = this.planets[zone]!.setAlpha(0);
      this.tweens.add({ targets: next, alpha: 1, duration: ZONE_FADE_MS });
      this.tweens.add({
        targets: prev,
        alpha: 0,
        duration: ZONE_FADE_MS,
        onComplete: () => prev.setVisible(false),
      });
    }

    private celebrate(title: string, lines: string[]): void {
      this.setMood('happy', 1600);
      flash(this, '#BFF6FF', 260, 0.3);
      this.fireworks(4);
      if (!this.calm)
        this.tweens.add({
          targets: this,
          hop: -12,
          duration: 180,
          yoyo: true,
          ease: 'Quad.easeOut',
        });
      this.tweens.killTweensOf(this.intro.root);
      this.intro.root.setVisible(false);
      const { root } = this.banner;
      // centre the title and its lines in the panel whatever the line count
      const top = -(46 + lines.length * 27) / 2;
      this.banner.title.setText(title).setY(top + 20);
      this.banner.lines.setText(lines.join('\n')).setY(top + 46);
      this.tweens.killTweensOf(root);
      root
        .setVisible(true)
        .setAlpha(1)
        .setScale(this.calm ? 1 : 0.6);
      if (!this.calm)
        this.tweens.add({ targets: root, scale: 1, duration: 320, ease: 'Back.easeOut' });
    }

    private fireworks(n: number): void {
      for (let i = 0; i < n; i++) {
        const x = 140 + this.rnd() * 680;
        const y = 150 + this.rnd() * 260;
        this.time.delayedCall(i * 220, () => {
          burst(this, x, y, {
            count: 16,
            shape: 'star',
            distance: 130,
            size: 16,
            lifeMs: 900,
            gravity: 40,
            depth: 650,
          }); // default candy colours
          burst(this, x, y, {
            count: 8,
            colors: ['#FFFFFF', colors.sky],
            shape: 'spark',
            distance: 70,
            size: 22,
            lifeMs: 500,
            depth: 650,
          });
        });
      }
    }

    private onLifeLost(): void {
      this.setMood('oops', 1300);
      flash(this, colors.vermillion, 260, 0.22);
      shake(this, 220, 0.008);
      const lives = this.sim.state.lives;
      const ships = this.hud.ships.container;
      if (lives < 3 && !this.tk.attract)
        burst(this, ships.x + 34 + lives * 32, ships.y + 29, {
          count: 8,
          colors: [colors.vermillion, colors.pink, '#FFFFFF'],
          shape: 'spark',
          distance: 40,
          size: 12,
          lifeMs: 420,
          depth: 700,
        });
    }

    private fizzle(x: number): void {
      this.tk.sfx.play('fade', { volume: 0.4 });
      const y = this.sim.arena.floor - 10;
      burst(this, x, y, {
        count: 16,
        colors: [colors.pink, colors.violet, '#FFFFFF', colors.sky],
        shape: 'spark',
        distance: 130,
        size: 22,
        lifeMs: 700,
        angle: -Math.PI / 2,
        spread: 1.4,
        depth: 40,
      });
      burst(this, x, y, {
        count: 6,
        colors: [colors.pink, '#FFFFFF'],
        shape: 'star',
        distance: 80,
        size: 14,
        lifeMs: 650,
        angle: -Math.PI / 2,
        spread: 2,
        depth: 41,
      });
      this.ring(x, y, colors.pink, 2);
    }

    private shieldPulse(x: number): void {
      const { glow, shield } = this.skiff;
      this.tweens.killTweensOf(glow);
      glow.setAlpha(1);
      this.tweens.add({ targets: glow, alpha: 0.35, duration: 260, ease: 'Quad.easeOut' });
      shield.setAlpha(1);
      burst(this, x, this.sim.arena.batY + SHIELD_Y, {
        count: 5,
        colors: ['#FFFFFF', colors.sky],
        shape: 'spark',
        distance: 34,
        size: 12,
        lifeMs: 300,
        angle: -Math.PI / 2,
        spread: 2.2,
        depth: 40,
      });
    }

    private wallSpark(x: number, y: number): void {
      const px = x < WALL_L + 16 ? WALL_L : x > WALL_R - 16 ? WALL_R : x;
      const py = px === x ? CEIL : y;
      const angle = px === WALL_L ? 0 : px === WALL_R ? Math.PI : Math.PI / 2;
      burst(this, px, py, {
        count: 4,
        colors: ['#FFFFFF', colors.sky],
        shape: 'spark',
        distance: 30,
        size: 12,
        lifeMs: 260,
        angle,
        spread: 2,
        depth: 40,
      });
    }

    private flashAt(b: Brick, alpha = 0.9): void {
      const { x, y } = centre(b);
      const f = this.add
        .image(x, y, 'cc-soft')
        .setDepth(30)
        .setBlendMode('ADD')
        .setAlpha(alpha)
        .setScale(1.25, 0.6);
      this.tweens.add({
        targets: f,
        alpha: 0,
        scaleX: 1.7,
        scaleY: 0.9,
        duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => f.destroy(),
      });
    }

    private ring(x: number, y: number, color: string, to: number): void {
      const r = this.add
        .image(x, y, 'cc-ring')
        .setDepth(35)
        .setBlendMode('ADD')
        .setTint(colorNum(color))
        .setScale(0.2);
      this.tweens.add({
        targets: r,
        scale: this.calm ? 0.5 : to,
        alpha: 0,
        duration: 420,
        ease: 'Cubic.easeOut',
        onComplete: () => r.destroy(),
      });
    }

    private shards(x: number, y: number, color: string, n: number): void {
      const k = 1 / texScale(this, 'cc-shard');
      const tints = [color, shade(color, 0.45), shade(color, -0.2), '#FFFFFF'].map(colorNum);
      const count = this.calm ? 3 : n;
      for (let i = 0; i < count; i++) {
        const img = this.add.image(
          x + (this.rnd() - 0.5) * 44,
          y + (this.rnd() - 0.5) * 12,
          'cc-shard',
        );
        img
          .setDepth(32)
          .setTint(tints[i % tints.length]!)
          .setScale(k * (0.9 + this.rnd() * 0.8))
          .setAngle(this.rnd() * 360);
        const a = this.rnd() * Math.PI * 2;
        const d = this.calm ? 10 : 44 + this.rnd() * 64;
        this.tweens.add({
          targets: img,
          x: img.x + Math.cos(a) * d,
          y: { value: img.y + Math.sin(a) * d * 0.6 + (this.calm ? 0 : 60), ease: 'Quad.easeIn' },
          angle: img.angle + (this.rnd() - 0.5) * 420,
          alpha: 0,
          duration: 480 + this.rnd() * 260,
          ease: 'Cubic.easeOut',
          onComplete: () => img.destroy(),
        });
      }
    }

    private popBrick(b: Brick): void {
      const img = this.bricks.get(b.idx);
      if (!img || this.calm) return;
      const k = 1 / texScale(this, brickKey(b));
      this.tweens.add({
        targets: img,
        scale: { from: k * 1.14, to: k },
        duration: 160,
        ease: 'Back.easeOut',
      });
    }

    private crack(b: Brick): void {
      this.bricks.get(b.idx)?.setTexture(brickKey(b));
      const { x, y } = centre(b);
      this.flashAt(b, 0.6);
      this.shards(x, y, art.brickColor(b.type), 3);
      this.popBrick(b);
    }

    private plateHit(b: Brick): void {
      const { x, y } = centre(b);
      const near = this.sim.balls.reduce<{ x: number; y: number } | null>(
        (a, p) => (!a || Math.hypot(p.x - x, p.y - y) < Math.hypot(a.x - x, a.y - y) ? p : a),
        null,
      );
      const cx = near ? Math.max(b.x, Math.min(b.x + GRID.brickW, near.x)) : x;
      const cy = near ? Math.max(b.y, Math.min(b.y + GRID.brickH, near.y)) : y;
      this.flashAt(b, 0.45);
      burst(this, cx, cy, {
        count: 6,
        colors: ['#FFFFFF', colors.gold, '#FFE9A8'],
        shape: 'spark',
        distance: 38,
        size: 10,
        lifeMs: 300,
        depth: 40,
      });
      shake(this, 60, 0.0025);
    }

    private shatter(b: Brick, points: number, mult: number): void {
      this.bricks.get(b.idx)?.setVisible(false);
      this.mineGlows.get(b.idx)?.destroy();
      this.mineGlows.delete(b.idx);
      const { x, y } = centre(b);
      const color = art.brickColor(b.type);
      this.flashAt(b);
      this.shards(x, y, color, b.type === 'f' ? 5 : 8);
      burst(this, x, y, {
        count: 5,
        colors: [color, '#FFFFFF'],
        shape: 'spark',
        distance: 52,
        size: 14,
        lifeMs: 380,
        depth: 40,
      });
      if (b.type === 'f') {
        this.ring(x, y, colors.orange, 1.5);
        burst(this, x, y, {
          count: 8,
          colors: [colors.orange, colors.yellow, colors.vermillion],
          shape: 'dot',
          distance: 70,
          size: 9,
          lifeMs: 460,
          depth: 41,
        });
        shake(this, 120, 0.004);
      } else if (b.type === 'w' || b.type === 'x' || b.type === 'z') {
        burst(this, x, y, {
          count: 8,
          colors: [color, '#FFFFFF'],
          shape: 'star',
          distance: 50,
          size: 12,
          lifeMs: 500,
          depth: 41,
        });
      }
      popText(this, x, y - 4, `+${points}`, {
        px: mult > 1 ? 20 : 16,
        color: mult > 1 ? colors.gold : colors.text,
        rise: 26,
        ms: 560,
        depth: 45,
      });
      this.setMood('happy', 450);
    }

    private podCaught(kind: art.PodKind, x: number, y: number): void {
      const color = art.POD[kind];
      burst(this, x, y, {
        count: 12,
        colors: [color, '#FFFFFF', colors.gold],
        shape: 'star',
        distance: 70,
        size: 14,
        lifeMs: 600,
        depth: 40,
      });
      popText(
        this,
        x,
        this.sim.arena.batY - 44,
        kind === 'w' ? strings.wingspan : kind === 'x' ? strings.scatter : strings.stasis,
        { px: 22, color, rise: 40, ms: 900, depth: 45 },
      );
      this.setMood('happy', 800);
      if (kind === 'x') for (const b of this.sim.balls) this.ring(b.x, b.y, colors.purple, 0.9);
      if (kind === 'z') flash(this, '#9FB0FF', 260, 0.16);
    }

    // ─── drawing (every frame; sim state is only read) ───
    private render(delta: number, time = this.time.now): void {
      const s = this.sim;
      const t = time / 1000;
      const calm = this.calm;
      this.mineGlows.forEach((glow, idx) =>
        glow.setAlpha(calm ? 0.35 : 0.3 + 0.25 * Math.sin(t * 5 + idx)),
      );
      this.renderComets(delta, t, calm);
      this.renderSkiff(delta, t, calm);
      while (this.pods.length < s.pods.length)
        this.pods.push({
          glow: this.add.image(0, 0, 'cc-soft').setBlendMode('ADD').setDepth(4).setAlpha(0.7),
          img: canvasImage(this, 0, 0, 'cc-pod-w').setDepth(5),
        });
      this.pods.forEach((p, i) => {
        const m = s.pods[i];
        p.img.setVisible(!!m);
        p.glow.setVisible(!!m);
        if (!m) return;
        p.img
          .setTexture(`cc-pod-${m.kind}`)
          .setPosition(m.x, m.y)
          .setRotation(calm ? 0 : Math.sin(m.t * 5) * 0.1);
        p.glow
          .setPosition(m.x, m.y)
          .setTint(colorNum(art.POD[m.kind]))
          .setScale(1.1 + (calm ? 0 : Math.sin(m.t * 8) * 0.12), 0.8);
      });
      if (!calm)
        this.clouds.forEach((c, i) =>
          c.img.setPosition(
            c.x + Math.sin(t * 0.07 + i * 1.3) * 40,
            c.y + Math.cos(t * 0.05 + i) * 24,
          ),
        );
      // drifting parallax stars (they follow the Skiff a little) and twinkles
      const drift = calm ? 0 : t;
      const dx = calm ? 0 : (STAGE.width / 2 - s.bat.x) * 0.03;
      for (const st of this.stars) {
        const sky = this.sky;
        st.img.setPosition(
          st.x + dx * st.par,
          sky.y + ((st.y - sky.y + drift * st.speed) % (sky.h + 20)) - 10,
        );
        if (st.twinkle && !calm)
          st.img.setAlpha(0.2 + 0.8 * Math.max(0, Math.sin(t * st.twinkle + st.x)));
      }
      if (!calm && time > this.nextGlint) this.shimmer(time);
      const primary = this.tk.env.input.primary;
      this.prompt
        .setVisible(s.phase === 'ready' && !this.tk.attract)
        .setText(
          primary === 'touch'
            ? strings.launchTouch
            : primary === 'pointer'
              ? strings.launchPointer
              : strings.launchKeyboard,
        );
      this.prompt.setAlpha(calm ? 1 : 0.65 + 0.35 * Math.sin(t * 4));
      if (s.phase !== 'clear') this.banner.root.setVisible(false);
      if (!this.tk.attract) this.renderHud();
    }

    /** A level's brick images (and a glow per mine), popping in row by row. After this only crack and break events touch them. */
    private buildBricks(): void {
      for (const b of this.sim.bricks) {
        const { x, y } = centre(b);
        const img = canvasImage(this, x, y, brickKey(b)).setDepth(2);
        this.bricks.set(b.idx, img);
        if (b.type === 'f')
          this.mineGlows.set(
            b.idx,
            this.add
              .image(x, y, 'cc-soft')
              .setBlendMode('ADD')
              .setTint(colorNum(art.MINE))
              .setScale(1.15, 0.6)
              .setDepth(3),
          );
        if (this.calm) continue;
        const k = img.scaleX;
        img.setAlpha(0).setScale(k * 0.3);
        this.tweens.add({
          targets: img,
          alpha: 1,
          scale: k,
          delay: b.row * 45 + Math.abs(b.col - 6.5) * 14,
          duration: 340,
          ease: 'Back.easeOut',
        });
      }
    }

    private growComets(): void {
      while (this.comets.length < this.sim.balls.length) {
        const trail = Array.from({ length: TRAIL }, (_, j) =>
          this.add.image(0, 0, 'cc-soft').setBlendMode('ADD').setDepth(7).setTint(TRAIL_TINTS[j]!),
        );
        this.comets.push({
          glow: this.add.image(0, 0, 'cc-comet-glow').setBlendMode('ADD').setDepth(8),
          core: canvasImage(this, 0, 0, 'cc-comet').setDepth(9),
          trail,
          pts: [],
          vx: 0,
          vy: 0,
          squash: 0,
          axis: 'y',
        });
      }
    }

    /** Once per 60 Hz step, so trails and squash follow the simulation whatever the frame rate. */
    private track(): void {
      const s = this.sim;
      this.growComets();
      this.comets.forEach((c, i) => {
        const b = s.balls[i];
        if (!b || s.phase !== 'play') {
          c.pts.length = 0;
          c.vx = c.vy = 0;
          return;
        }
        const last = c.pts[0];
        if (last && Math.hypot(b.x - last.x, b.y - last.y) > 70) c.pts.length = 0;
        c.pts.unshift({ x: b.x, y: b.y });
        if (c.pts.length > TRAIL + 1) c.pts.pop();
        const flipX = c.vx !== 0 && Math.sign(b.vx) !== Math.sign(c.vx);
        const flipY = c.vy !== 0 && Math.sign(b.vy) !== Math.sign(c.vy);
        if (!this.calm && (flipX || flipY)) {
          c.squash = 1;
          c.axis = flipY ? 'y' : 'x';
        }
        c.vx = b.vx;
        c.vy = b.vy;
      });
    }

    private renderComets(delta: number, t: number, calm: boolean): void {
      const s = this.sim;
      const slow = s.stasisMs > 0;
      this.growComets();
      const k = 1 / texScale(this, 'cc-comet');
      this.comets.forEach((c, i) => {
        const b = s.balls[i];
        c.core.setVisible(!!b);
        c.glow.setVisible(!!b);
        for (const img of c.trail) img.setVisible(false);
        if (!b) return;
        c.squash = Math.max(0, c.squash - delta / 130);
        const q = 0.32 * c.squash;
        c.core
          .setPosition(b.x, b.y)
          .setScale(k * (c.axis === 'y' ? 1 + q : 1 - q), k * (c.axis === 'y' ? 1 - q : 1 + q));
        const moving = b.vx !== 0 || b.vy !== 0;
        const flicker = calm ? 1 : 1 + 0.07 * Math.sin(t * (slow ? 9 : 31) + i);
        const g = (slow ? 0.48 : 0.6) * flicker;
        c.glow
          .setPosition(b.x, b.y)
          .setRotation(moving ? Math.atan2(b.vy, b.vx) : 0)
          .setScale(g * (moving && !slow ? 1.35 : 1), g)
          .setTint(slow ? STASIS_TINT : 0xffffff);
        const n = slow ? TRAIL / 2 : TRAIL;
        c.trail.forEach((img, j) => {
          const p = c.pts[j + 1];
          if (!p || j >= n) return;
          img.setVisible(true);
          const f = 1 - j / n;
          img
            .setPosition(p.x, p.y)
            .setScale(((3 + 19 * f) / 64) * 2)
            .setAlpha((slow ? 0.3 : 0.55) * f)
            .setTint(slow ? STASIS_TINT : TRAIL_TINTS[j]!);
        });
      });
    }

    private renderSkiff(delta: number, t: number, calm: boolean): void {
      const s = this.sim;
      const { root, wingL, wingR, shield, glow, under, flames, pilot } = this.skiff;
      const w = s.bat.w;
      const target = calm ? 0 : Math.max(-1, Math.min(1, s.bat.vx / 1800)) * 0.07;
      this.tilt += (target - this.tilt) * Math.min(1, delta / 90);
      root.setPosition(s.bat.x, this.sim.arena.batY + this.hop).setRotation(this.tilt);
      wingL.setX(-w / 2 + 1);
      wingR.setX(w / 2 - 1);
      const blink = s.wingMs > 0 && s.wingMs < 2000 && Math.floor(s.wingMs / 250) % 2 === 0;
      wingL.setAlpha(blink ? 0.55 : 1);
      wingR.setAlpha(blink ? 0.55 : 1);
      shield.setScale(w / 64 / texScale(this, 'cc-shield'), 1 / texScale(this, 'cc-shield'));
      glow.setScale((w * 1.15) / 64, 26 / 64);
      under.setScale((w * 1.2) / 64, 30 / 64);
      const kf = 1 / texScale(this, 'cc-flame');
      flames.forEach((f, i) =>
        f.setScale(
          kf,
          kf * (calm ? 0.9 : 0.75 + 0.3 * Math.abs(Math.sin(t * 37 + i * 1.7)) + 0.1 * this.rnd()),
        ),
      );
      root.setAlpha(s.phase === 'beat' ? (calm ? 0.5 : Math.floor(t * 12) % 2 ? 0.3 : 0.9) : 1);
      if (this.mood !== 'idle' && this.time.now > this.moodUntil) {
        this.mood = 'idle';
        pilot.setTexture('cc-pilot-idle');
      }
    }

    private shimmer(time: number): void {
      this.nextGlint = time + 700 + this.rnd() * 600;
      const crystals = this.sim.bricks.filter(
        (b) => b.alive && (b.type === '1' || b.type === '2' || b.type === '3'),
      );
      const b = crystals[Math.floor(this.rnd() * crystals.length)];
      if (!b) return;
      this.tweens.killTweensOf(this.glint);
      this.glint
        .setVisible(true)
        .setPosition(b.x + 8 + this.rnd() * 44, b.y + 5)
        .setScale(0)
        .setAlpha(1);
      this.tweens.add({
        targets: this.glint,
        scale: 0.75,
        angle: 45,
        duration: 220,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => this.glint.setVisible(false),
      });
    }

    private renderHud(): void {
      const s = this.sim;
      const st = s.state;
      const { score, mult, wall, shipIcons, chips } = this.hud;
      if (st.score !== this.shown.score) {
        if (this.shown.score >= 0 && st.score > this.shown.score) score.bump();
        this.shown.score = st.score;
        score.set(formatScore(st.score, 'integer', this.tk.env.locale));
      }
      if (s.multiplier !== this.shown.mult) {
        mult.setText(s.multiplier > 1 ? `×${s.multiplier}` : '');
        if (s.multiplier > this.shown.mult) bump(this, mult, 1.5, 220);
        this.shown.mult = s.multiplier;
      }
      if (st.level !== this.shown.level) {
        this.shown.level = st.level;
        wall.setLabel(strings.t('wall', { n: st.level }));
        wall.set(LEVELS[st.level - 1]!.name);
      }
      if (st.lives !== this.shown.lives) {
        this.shown.lives = st.lives;
        shipIcons.forEach((img, i) => img.setTexture(i < st.lives ? 'cc-ship-on' : 'cc-ship-off'));
      }
      let x = 608;
      for (const [kind, ms] of [
        ['w', s.wingMs],
        ['z', s.stasisMs],
      ] as const) {
        const chip = chips[kind];
        chip.container.setVisible(ms > 0);
        if (ms <= 0) continue;
        chip.set(strings.t('seconds', { s: Math.ceil(ms / 1000) }));
        chip.container.setX(x).setAlpha(ms < 2000 && Math.floor(ms / 250) % 2 === 0 ? 0.55 : 1);
        x += 104;
      }
    }
  }

  return [Wall];
};
