// Firefly Flip scene: a moonlit meadow where Lumi the firefly hosts two memory games. Mode select, Pairs (glass
// jars) and Follow (song lanterns) run over the pure rules in pairs.ts / follow.ts. All art is drawn once per mount
// (art.ts); motion is tweens and fx bursts.
import type Phaser from 'phaser';
import { colorNum, colors, type Save } from '@pocketcade/toolkit';
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
import type { AttractView } from './attract.ts';
import {
  boughY,
  drawBadge,
  drawBranch,
  drawBubble,
  drawChip,
  drawDigitChip,
  drawGlow,
  drawGlyph,
  drawJar,
  drawJarGlow,
  drawLantern,
  drawLumi,
  drawMeadow,
  drawModesButton,
  drawPanel,
  drawWing,
  INK,
  LANTERN_COLORS,
  type Mood,
} from './art.ts';
import { createFollow, LANTERNS, type Follow, type FollowEvent } from './follow.ts';
import {
  createPairs,
  deal,
  GRIDS,
  MOTIFS,
  TURN_MS,
  type GridId,
  type Pairs,
  type PairsEvent,
} from './pairs.ts';
import { betterPairs, defaultSave, GRID_IDS, isSaveV1, type FlipFollowSaveV1 } from './save.ts';
import { strings } from './strings.ts';

type Img = Phaser.GameObjects.Image;
type Box = Phaser.GameObjects.Container;
type View = 'menu' | 'pairs' | 'follow';
type Card = {
  box: Box;
  back: Img;
  face: Img;
  glyph: Img;
  glow: Img;
  badge: Img;
  x: number;
  y: number;
};
type Lantern = { box: Box; img: Img; halo: Img; core: Img; badge: Img };

const CARD_SIZE: Record<GridId, number> = { '4x4': 139, '4x5': 134, '6x6': 91 };
const HUD_H = 120;
const GAP = 6;
const LANTERN_X = [120, 280, 440, 600];
const LANTERN_TOP = 284;
/** lantern body centre */
const LANTERN_Y = LANTERN_TOP + 128;
const MODES = { x: 80, y: 60, w: 132, h: 60 };
/** Mode-select buttons (centre x, centre y, w, h): the three Pairs grid chips, then Follow's Play chip. */
const MENU_ITEMS = [
  [103, 620, 88, 84],
  [195, 620, 88, 84],
  [287, 620, 88, 84],
  [525, 620, 272, 84],
] as const;
const PAIRS_CARD = { x: 40, y: 262, w: 310, h: 430 };
const FOLLOW_CARD = { x: 370, y: 262, w: 310, h: 430 };
const LUMI_MENU = [360, 172] as const;
const CLEAR_DELAY_MS = 900;
const DIM = 0x4c4878;
const SPARKS = [colors.yellow, colors.lime, '#FFFFFF'];

const hex16 = (n: () => number) => [n(), n()].map((v) => v.toString(16).padStart(8, '0')).join('');
const mmss = (ms: number) =>
  `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const inside = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
/** Shows a jar closed (its back) or open (lit face and glyph). */
const setOpen = (back: Img, face: Img, glyph: Img, open: boolean) => {
  back.setVisible(!open);
  face.setVisible(open);
  glyph.setVisible(open);
};
/** What the Follow view currently shows (syncFollow touches objects only when the state differs). */
const unshown = () => ({
  lit: -1,
  phase: '',
  progress: -1,
  length: -1,
  look: true,
  mark: null as Follow['mark'],
});

export const createScenes: SceneFactory = (_P, kit) => {
  class Play extends kit.Scene {
    private save: FlipFollowSaveV1 = defaultSave();
    private store!: Save<FlipFollowSaveV1>;
    private view: View = 'menu';
    private clock = 0;
    private cursor = 0;
    /** bumps on every view change, so delayed effects for old objects are skipped */
    private gen = 0;
    private loops: Phaser.Time.TimerEvent[] = [];
    private layer!: Box;
    private dots!: Phaser.GameObjects.Graphics;
    private ring!: Phaser.GameObjects.Graphics;
    private cursorRing!: Phaser.GameObjects.Graphics;
    private modesBtn!: Box;
    private pills!: Record<'moves' | 'found' | 'time' | 'length' | 'best' | 'look', HudPill>;
    private lumi!: {
      root: Box;
      rig: Box;
      body: Img;
      hop: { y: number };
      timer: Phaser.Time.TimerEvent | null;
    };
    private bubble!: Box;
    private bubbleText!: Phaser.GameObjects.Text;
    // pairs
    private grid: GridId = '4x4';
    private pairs: Pairs | null = null;
    private seed = '';
    private elapsedMs = 0;
    /** the whole second the time pill shows */
    private shownSec = -1;
    private started = false;
    private log: number[] | null = [];
    private cards: Card[] = [];
    private size = 139;
    private rows = 4;
    private cols = 4;
    // follow
    private follow: Follow | null = null;
    private lanterns: Lantern[] = [];
    private shown = unshown();
    private lastModesAt = -Infinity;
    private ending = false;

    constructor() {
      super('play');
    }

    create(): void {
      const tk = this.tk;
      const { bleed } = tk.layout;
      this.makeTextures();
      backdrop(this, 'ff-sky', 720, 720, {
        stops: ['#0A0724', '#17114C', '#2A2876', '#3A4894', '#26276A'],
        glows: [
          [360, 610, 430, '#7B5CFF', 0.32],
          [110, 540, 260, '#FF4FA3', 0.1],
        ],
        stars: 80,
        seed: 11,
        draw: (ctx, w, h) => drawMeadow(ctx, w, h, bleed),
      });
      this.makeFireflies();
      this.layer = this.add.container(0, 0);
      this.ring = this.add.graphics().setDepth(5);
      this.dots = this.add.graphics().setDepth(5);
      this.cursorRing = this.add.graphics().setDepth(40);
      this.makeHud();
      this.makeLumi();
      tk.input.configure({
        actions: {
          up: { codes: ['ArrowUp', 'KeyW'] },
          down: { codes: ['ArrowDown', 'KeyS'] },
          left: { codes: ['ArrowLeft', 'KeyA'] },
          right: { codes: ['ArrowRight', 'KeyD'] },
          select: { codes: ['Space', 'Enter', 'NumpadEnter'] },
          modes: { codes: ['KeyM'] },
          ...Object.fromEntries(
            [1, 2, 3, 4].map((n) => [`d${n}`, { codes: [`Digit${n}`, `Numpad${n}`] }]),
          ),
        },
      });
      const press = (a: string, fn: () => void) =>
        tk.input.on(a, (e) => e.phase === 'press' && fn());
      press('up', () => this.moveCursor(0, -1));
      press('down', () => this.moveCursor(0, 1));
      press('left', () => this.moveCursor(-1, 0));
      press('right', () => this.moveCursor(1, 0));
      press('select', () => this.activate(this.cursor));
      press('modes', () => this.onModes());
      for (const n of [1, 2, 3, 4])
        press(`d${n}`, () => (this.view === 'pairs' ? undefined : this.activate(n - 1)));
      tk.input.onGesture('tap', ({ x, y }) => this.onTap(x, y));
      tk.on('resume', () => this.follow?.replay(this.clock));
      tk.ui.onRestart(() =>
        this.view === 'follow'
          ? this.startFollow()
          : this.view === 'pairs'
            ? this.startPairs(this.grid, true)
            : undefined,
      );

      this.store = tk.createSave<FlipFollowSaveV1>({
        key: 'save',
        defaults: defaultSave,
        validate: isSaveV1,
      });
      tk.deferReady();
      this.store
        .load()
        .then((l) => {
          if (tk.signal.aborted) return; // unmounted while loading: the scene is gone
          this.save = l.data;
          if (tk.attract) this.startPairs('4x4', true);
          else this.showMenu();
          tk.ready();
        })
        .catch((e: unknown) => {
          tk.reportError(e);
          tk.ready();
        });
    }

    // ─── art ───
    private makeTextures(): void {
      const c = (
        key: string,
        w: number,
        h: number,
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
      ) => kit.textures.canvas(this, key, w, h, draw);
      canvasTexture(this, 'ff-glow', 64, 64, (ctx) => drawGlow(ctx, 64), { scale: 1 });
      canvasTexture(this, 'jar-glow', 180, 180, drawJarGlow, { scale: 1 });
      for (const m of ['idle', 'happy', 'sad'] as const)
        c(`lumi-${m}`, 120, 120, (ctx) => drawLumi(ctx, m));
      c('lumi-wing', 64, 52, drawWing);
      c('jar-back', 140, 140, (ctx) => drawJar(ctx, 'back'));
      c('jar-face', 140, 140, (ctx) => drawJar(ctx, 'face'));
      for (let i = 0; i < MOTIFS; i++) c(`glyph${i}`, 80, 80, (ctx) => drawGlyph(ctx, i));
      c('badge-tick', 32, 32, (ctx) => drawBadge(ctx, 'tick'));
      c('badge-cross', 32, 32, (ctx) => drawBadge(ctx, 'cross'));
      for (let i = 0; i < LANTERNS; i++) c(`lantern${i}`, 150, 230, (ctx) => drawLantern(ctx, i));
      c('panel', PAIRS_CARD.w, PAIRS_CARD.h, drawPanel);
      c('chip', 88, 84, drawChip);
      c('chip-wide', 272, 84, drawChip);
      c('modes-btn', MODES.w, MODES.h, drawModesButton);
      c('bubble', 230, 84, drawBubble);
      c('branch', 720, 80, drawBranch);
      c('digit', 40, 40, drawDigitChip);
    }

    /** Drifting firefly bokeh behind everything (decoration; its own seeded stream). */
    private makeFireflies(): void {
      const rng = this.tk.rng.create('cosmetic');
      const { x: bx, y: by } = this.tk.layout.bleed;
      const overhang = bx > 0 || by > 0 ? 8 : 0; // a few more, outside the design area
      for (let i = 0; i < 16 + overhang; i++) {
        let [x, y] = [rng.int(16, 704), rng.int(110, 700)];
        if (i >= 16) {
          // pick a spot in the view that lies outside the design area
          do [x, y] = [rng.int(16 - bx, 704 + bx), rng.int(16 - by, 704 + by)];
          while (x >= 0 && x <= 720 && y >= 0 && y <= 720);
        }
        const f = this.add
          .image(x, y, 'ff-glow')
          .setBlendMode('ADD')
          .setTint(colorNum(i % 3 ? 'yellow' : 'lime'))
          .setScale(0.32 + rng.next() * 0.3)
          .setAlpha(0.85)
          .setDepth(-500);
        if (this.tk.motion.reduced) continue;
        this.tweens.add({
          targets: f,
          x: x + rng.int(-70, 70),
          y: y + rng.int(-60, 30),
          duration: rng.int(3200, 6400),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.tweens.add({
          targets: f,
          alpha: 0.12,
          duration: rng.int(700, 1500),
          delay: rng.int(0, 1200),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    private makeHud(): void {
      const pill = (
        icon: 'moves' | 'star' | 'clock' | 'flag' | 'trophy',
        accent: string,
        label: string,
        width = 108,
      ) => hudPill(this, 0, 0, { icon, accent, label, value: '0', width, height: 54 });
      this.pills = {
        moves: pill('moves', colors.orange, strings.moves),
        found: pill('star', colors.pink, strings.found),
        time: pill('clock', colors.sky, strings.time),
        length: pill('flag', colors.green, strings.length, 124),
        best: pill('trophy', colors.orange, strings.best, 124),
        look: hudPill(this, 0, 0, {
          icon: 'heart',
          accent: colors.pink,
          value: strings.secondLookReady,
          width: 296,
          height: 46,
        }),
      };
      for (const pill of Object.values(this.pills)) pill.container.setVisible(false);
      const label = kit.text(this, 20, 0, strings.modes, { px: 21 }).setOrigin(0.5);
      this.modesBtn = this.add
        .container(MODES.x, MODES.y, [canvasImage(this, 0, 0, 'modes-btn'), label])
        .setDepth(500);
      this.bubbleText = kit.text(this, 121, -4, '', { px: 28, color: INK }).setOrigin(0.5);
      this.bubble = this.add
        .container(200, 186, [canvasImage(this, 0, 0, 'bubble').setOrigin(0, 0.5), this.bubbleText])
        .setDepth(30)
        .setVisible(false);
      this.modesBtn.setVisible(false);
    }

    private makeLumi(): void {
      const wing = (right: boolean) =>
        canvasImage(this, right ? 12 : -12, -20, 'lumi-wing')
          .setOrigin(right ? 0.094 : 0.906, 0.885)
          .setFlipX(right);
      const halo = this.add
        .image(0, 34, 'ff-glow')
        .setBlendMode('ADD')
        .setTint(colorNum('yellow'))
        .setScale(2.1)
        .setAlpha(0.85);
      const wings = [wing(false), wing(true)];
      const body = canvasImage(this, 0, 0, 'lumi-idle').setOrigin(0.5, 56 / 120);
      const rig = this.add.container(0, 0, [halo, ...wings, body]);
      const root = this.add.container(LUMI_MENU[0], LUMI_MENU[1], [rig]).setDepth(30);
      this.lumi = { root, rig, body, hop: { y: 0 }, timer: null };
      if (this.tk.motion.reduced) return;
      for (const w of wings)
        this.tweens.add({
          targets: w,
          scaleY: w.scaleY * 0.62,
          duration: 120,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      this.tweens.add({
        targets: halo,
        alpha: 0.45,
        scale: 1.7,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    /** Lumi reacts: cheers (happy) or droops (sad), then settles back to idle. */
    private lumiMood(mood: Mood, ms = 900): void {
      const l = this.lumi;
      l.body.setTexture(`lumi-${mood}`);
      l.timer?.remove();
      l.timer = this.time.delayedCall(ms, () => l.body.setTexture('lumi-idle'));
      if (this.tk.motion.reduced) return;
      kit.fps.burst(ms);
      this.tweens.killTweensOf([l.rig, l.hop]);
      l.rig.setScale(1);
      l.hop.y = 0;
      if (mood === 'happy') {
        this.tweens.add({
          targets: l.hop,
          y: -18,
          duration: 150,
          yoyo: true,
          repeat: 1,
          ease: 'Quad.easeOut',
        });
        this.tweens.add({
          targets: l.rig,
          scaleX: 1.1,
          scaleY: 0.92,
          duration: 150,
          yoyo: true,
          repeat: 1,
          onComplete: () => l.rig.setScale(1),
        });
      } else if (mood === 'sad') {
        const hold = Math.max(0, ms - 450);
        this.tweens.add({
          targets: l.hop,
          y: 9,
          duration: 220,
          hold,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
        this.tweens.add({
          targets: l.rig,
          scaleX: 1.05,
          scaleY: 0.92,
          duration: 220,
          hold,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      }
    }

    private layoutHud(): void {
      const p = this.pills;
      for (const pill of Object.values(p)) pill.container.setVisible(false);
      this.modesBtn.setVisible(this.view !== 'menu' && !this.tk.attract);
      this.bubble.setVisible(this.view === 'follow');
      const place = (x: number, y: number, s: number) =>
        this.lumi.root.setPosition(x, y).setScale(s);
      if (this.view === 'pairs') {
        [p.moves, p.found, p.time].forEach((pl, i) =>
          pl.container.setPosition(250 + i * 116, 33).setVisible(true),
        );
        place(196, 66, 0.74);
      } else if (this.view === 'follow') {
        p.length.container.setPosition(250, 33).setVisible(true);
        p.best.container.setPosition(382, 33).setVisible(true);
        p.look.container.setPosition(212, 640).setVisible(true);
        place(124, 196, 1);
      } else place(LUMI_MENU[0], LUMI_MENU[1], 1.2);
    }

    // ─── views ───
    private clearLayer(): void {
      this.gen++;
      for (const t of this.loops) t.remove();
      this.loops = [];
      this.tweens.killTweensOf(this.layer.list);
      this.layer.removeAll(true);
      this.cards = [];
      this.lanterns = [];
      this.dots.clear();
      this.ring.clear();
      this.cursorRing.clear();
      this.shown = unshown();
    }

    private loop(ms: number, fn: () => void): void {
      if (!this.tk.motion.reduced)
        this.loops.push(this.time.addEvent({ delay: ms, loop: true, callback: fn }));
    }

    /** A jar's layers at `size`: back, face and glyph (centred on 0, 0). */
    private jarLayers(size: number, glyph: number): [Img, Img, Img] {
      return [
        this.add.image(0, 0, 'jar-back').setDisplaySize(size, size),
        this.add.image(0, 0, 'jar-face').setDisplaySize(size, size),
        this.add.image(0, size * 0.07, `glyph${glyph}`).setDisplaySize(size * 0.62, size * 0.62),
      ];
    }

    /** A small jar (card art) for the menu illustration. */
    private jarIcon(x: number, y: number, size: number, glyph: number | null, angle: number): Box {
      const layers = this.jarLayers(size, glyph ?? 0);
      setOpen(...layers, glyph !== null);
      return this.add.container(x, y, layers).setAngle(angle);
    }

    private showMenu(): void {
      this.view = 'menu';
      this.pairs = null;
      this.follow = null;
      this.clearLayer();
      this.layoutHud();
      const L = this.layer;
      L.add(
        this.add
          .image(360, 64, 'ff-glow')
          .setBlendMode('ADD')
          .setTint(colorNum('yellow'))
          .setAlpha(0.3)
          .setScale(7.5, 1.7),
      );
      L.add(
        kit
          .text(this, 360, 60, strings.title, {
            px: 64,
            color: 'yellow',
            stroke: INK,
            strokePx: 10,
            shadow: true,
          })
          .setOrigin(0.5),
      );
      for (const [card, accent] of [
        [PAIRS_CARD, 'yellow'],
        [FOLLOW_CARD, 'purple'],
      ] as const) {
        const cx = card.x + card.w / 2;
        L.add(canvasImage(this, cx, card.y + card.h / 2, 'panel'));
        L.add(
          this.add
            .image(cx, card.y + 120, 'ff-glow')
            .setBlendMode('ADD')
            .setTint(colorNum(accent))
            .setAlpha(0.32)
            .setScale(4.4, 3.2),
        );
        const isPairs = card === PAIRS_CARD;
        L.add(
          kit
            .text(this, cx, card.y + 212, isPairs ? strings.pairs : strings.follow, {
              px: 40,
              stroke: INK,
              strokePx: 7,
              shadow: true,
            })
            .setOrigin(0.5),
        );
        L.add(
          kit
            .text(this, cx, card.y + 252, isPairs ? strings.pairsBlurb : strings.followBlurb, {
              px: 18,
              weight: 600,
              font: 'body',
              color: 'textMuted',
            })
            .setOrigin(0.5),
        );
      }
      // Pairs: three jars, the middle one flipping now and then
      L.add([this.jarIcon(117, 378, 92, null, -10), this.jarIcon(273, 378, 92, 17, 10)]);
      const mid = this.jarIcon(195, 356, 100, 6, 0);
      L.add(mid);
      let up = true;
      this.loop(2200, () => {
        up = !up;
        const [back, face, glyph] = mid.list as [Img, Img, Img];
        this.tweens.add({
          targets: mid,
          scaleX: 0,
          duration: TURN_MS / 2,
          yoyo: true,
          onYoyo: () => setOpen(back, face, glyph, up),
        });
      });
      GRID_IDS.forEach((g, i) => {
        const [x, y] = MENU_ITEMS[i]!;
        const board = this.save.boards[g];
        const best = this.save.bests.pairs[g];
        const sub = board
          ? strings.chipResume
          : best
            ? strings.t('chipBest', { n: best.moves })
            : strings.chipNew;
        L.add([
          canvasImage(this, x, y, 'chip'),
          kit.text(this, x, y - 14, g.replace('x', '×'), { px: 28, color: INK }).setOrigin(0.5),
          kit.text(this, x, y + 16, sub, { px: 15, weight: 600, color: '#5A3C00' }).setOrigin(0.5),
        ]);
      });
      // Follow: four little lanterns singing in turn
      const fx = FOLLOW_CARD.x + FOLLOW_CARD.w / 2;
      L.add(
        this.add
          .rectangle(fx, 312, 260, 5, colorNum('#0E0A2C'))
          .setStrokeStyle(1.5, colorNum('line')),
      );
      const minis = LANTERN_COLORS.map((col, i) => {
        const x = fx - 105 + i * 70;
        const halo = this.add
          .image(x, 372, 'ff-glow')
          .setBlendMode('ADD')
          .setTint(colorNum(col))
          .setScale(2.4)
          .setAlpha(0);
        const img = canvasImage(this, x, 312, `lantern${i}`).setOrigin(0.5, 0);
        img.setScale(img.scaleX * 0.42).setTint(DIM);
        L.add([halo, img]);
        return { halo, img };
      });
      let lit = 0;
      const sing = () => {
        minis.forEach((m, i) => {
          m.halo.setAlpha(i === lit ? 0.9 : 0);
          if (i === lit) m.img.clearTint();
          else m.img.setTint(DIM);
        });
        lit = (lit + 1) % 4;
      };
      sing();
      this.loop(560, sing);
      const fb = this.save.bests.follow;
      const [px, py] = MENU_ITEMS[3];
      L.add([
        canvasImage(this, px, py, 'chip-wide'),
        kit.text(this, px, py - 14, strings.play, { px: 30, color: INK }).setOrigin(0.5),
        kit
          .text(
            this,
            px,
            py + 16,
            fb ? strings.t('bestLength', { n: fb.length }) : strings.chipNew,
            { px: 15, weight: 600, color: '#5A3C00' },
          )
          .setOrigin(0.5),
      ]);
      this.cursor = Math.min(this.cursor, 3);
      this.drawCursor();
    }

    // ─── Pairs ───
    private startPairs(grid: GridId, fresh = false): void {
      if (this.tk.run.active) this.tk.run.end('menu');
      this.view = 'pairs';
      this.grid = grid;
      this.clearLayer();
      this.layoutHud();
      const saved = fresh ? null : this.save.boards[grid];
      this.seed = saved?.seed ?? hex16(() => this.tk.rng.main.nextUint32());
      const faces = saved?.faces ?? deal(this.tk.rng.create(`pairs:${this.seed}`), grid);
      this.pairs = createPairs({
        faces,
        matched: saved?.matched ?? faces.map(() => false),
        moves: saved?.moves ?? 0,
      });
      this.elapsedMs = saved?.elapsedMs ?? 0;
      this.log = saved?.log ?? [];
      this.started = !!saved;
      this.ending = false;
      if (!this.tk.attract) {
        this.save = { ...this.save, prefs: { lastMode: 'pairs', lastGrid: grid } };
        this.persistBoard();
      }
      const { rows, cols } = GRIDS[grid];
      const S = (this.size = CARD_SIZE[grid]);
      const w = cols * S + (cols - 1) * GAP;
      const x0 = (720 - w) / 2;
      const y0 = HUD_H + 12;
      faces.forEach((f, i) => {
        const x = x0 + (i % cols) * (S + GAP) + S / 2;
        const y = y0 + Math.floor(i / cols) * (S + GAP) + S / 2;
        const glow = this.add
          .image(0, S * 0.04, 'jar-glow')
          .setBlendMode('ADD')
          .setDisplaySize(S * 1.32, S * 1.32)
          .setVisible(false);
        const [back, face, glyph] = this.jarLayers(S, f);
        setOpen(back, face, glyph, false);
        const badge = this.add
          .image(S * 0.37, -S * 0.25, 'badge-tick')
          .setDisplaySize(S * 0.27, S * 0.27)
          .setVisible(false);
        const box = this.add.container(x, y, [glow, back, face, glyph, badge]);
        this.layer.add(box);
        this.cards.push({ box, back, face, glyph, glow, badge, x, y });
        if (this.pairs!.matched[i]) this.showCard(i, 'match', false);
      });
      this.rows = rows;
      this.cols = cols;
      this.cursor = 0;
      this.drawCursor();
      this.updateHud();
      this.publishView();
    }

    /** Saves the board in play (a cleared board is never saved: pairsOver records it). */
    private persistBoard(): void {
      if (this.tk.attract || !this.pairs || this.pairs.cleared) return;
      const p = this.pairs;
      this.save = {
        ...this.save,
        boards: {
          ...this.save.boards,
          [this.grid]: {
            seed: this.seed,
            faces: [...p.faces],
            matched: [...p.matched],
            moves: p.moves,
            elapsedMs: Math.round(this.elapsedMs),
            log: this.log,
          },
        },
      };
      this.store.set(this.save);
    }

    /** Runs `fn` after `ms` (at once with reduced motion), unless the view changed meanwhile. */
    private later(ms: number, fn: () => void): void {
      if (this.tk.motion.reduced) return fn();
      const gen = this.gen;
      this.time.delayedCall(ms, () => gen === this.gen && fn());
    }

    /** The real flip: squash to an edge (scaleX → 0), swap sides, open back out. */
    private flip(i: number, up: boolean): void {
      const c = this.cards[i]!;
      const set = () => setOpen(c.back, c.face, c.glyph, up);
      if (this.tk.motion.reduced) return set();
      kit.fps.burst(TURN_MS + 300);
      this.tweens.add({
        targets: c.box,
        scaleX: 0,
        scaleY: 1.08,
        duration: TURN_MS / 2,
        ease: 'Sine.easeIn',
        onComplete: () => {
          set();
          this.tweens.add({
            targets: c.box,
            scaleX: 1,
            scaleY: 1,
            duration: TURN_MS / 2,
            ease: 'Sine.easeOut',
          });
        },
      });
    }

    private showCard(i: number, state: 'match' | 'mismatch' | 'down', animate = true): void {
      const c = this.cards[i]!;
      if (state === 'down') {
        c.badge.setVisible(false);
        return;
      }
      if (!animate) setOpen(c.back, c.face, c.glyph, true);
      c.badge.setTexture(state === 'match' ? 'badge-tick' : 'badge-cross').setVisible(true);
      const fx = animate && !this.tk.motion.reduced;
      if (state === 'match') {
        c.glow.setVisible(true);
        if (!fx) return;
        c.glow.setAlpha(0);
        this.tweens.add({ targets: c.glow, alpha: 1, duration: 260, ease: 'Quad.easeOut' });
        bump(this, c.glyph, 1.3, 320);
        bump(this, c.badge, 1.6, 260);
        burst(this, c.x, c.y, {
          shape: 'spark',
          colors: SPARKS,
          count: 10,
          distance: this.size * 0.8,
          size: 15,
          lifeMs: 720,
        });
      } else if (fx) {
        bump(this, c.badge, 1.5, 220);
        this.tweens.add({
          targets: c.box,
          x: c.x + 7,
          duration: 45,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
          onComplete: () => c.box.setX(c.x),
        });
      }
    }

    private handlePairs(events: PairsEvent[]): void {
      const sfx = this.tk.sfx;
      for (const e of events) {
        if (e.type === 'open') {
          if (!this.started) {
            this.started = true;
            this.tk.run.begin();
          }
          if (this.log) this.log = this.log.length < 400 ? [...this.log, e.cell] : null;
          sfx.play('click');
          this.flip(e.cell, true);
        } else if (e.type === 'match') {
          sfx.play('coin');
          this.pills.moves.bump();
          this.later(TURN_MS, () => {
            for (const i of e.cells) this.showCard(i, 'match');
            this.pills.found.bump();
            this.lumiMood('happy', 800);
          });
          this.persistBoard();
        } else if (e.type === 'mismatch') {
          sfx.play('hit', { volume: 0.25 });
          this.pills.moves.bump();
          this.later(TURN_MS, () => {
            for (const i of e.cells)
              if (this.pairs?.held?.includes(i)) this.showCard(i, 'mismatch');
            this.lumiMood('sad', 1000);
          });
          this.persistBoard();
        } else if (e.type === 'close') {
          for (const i of e.cells) {
            this.showCard(i, 'down');
            this.flip(i, false);
          }
        } else if (e.type === 'cleared') {
          this.later(TURN_MS + 120, () => this.celebrate());
          // not later(): the beat keeps its length with reduced motion
          const gen = this.gen;
          this.time.delayedCall(CLEAR_DELAY_MS, () => gen === this.gen && void this.pairsOver());
        }
      }
      this.updateHud();
      this.publishView();
    }

    /** Every jar aglow: fireflies burst across the board. */
    private celebrate(): void {
      flash(this, colors.yellow, 320, 0.22);
      this.lumiMood('happy', 1500);
      popText(this, 360, 420, strings.allAglow, {
        px: 56,
        color: colors.yellow,
        rise: 60,
        ms: 1300,
      });
      const step = Math.max(1, Math.ceil(this.cards.length / 8));
      for (let k = 0; k < this.cards.length; k += step) {
        const c = this.cards[k]!;
        this.later(k * 18, () =>
          burst(this, c.x, c.y, {
            shape: 'spark',
            colors: SPARKS,
            count: 9,
            distance: 130,
            size: 18,
            lifeMs: 900,
          }),
        );
      }
    }

    private async pairsOver(): Promise<void> {
      if (this.ending || !this.pairs) return;
      this.ending = true;
      const moves = this.pairs.moves;
      const timeMs = Math.round(this.elapsedMs);
      const g = this.grid;
      if (!this.tk.attract) {
        const best = this.save.bests.pairs[g];
        this.save = {
          ...this.save,
          boards: { ...this.save.boards, [g]: null },
          bests: {
            ...this.save.bests,
            pairs: {
              ...this.save.bests.pairs,
              [g]: betterPairs(best, moves, timeMs)
                ? { moves, timeMs, at: new Date().toISOString() }
                : best,
            },
          },
          stats: {
            ...this.save.stats,
            boardsCleared: {
              ...this.save.stats.boardsCleared,
              [g]: this.save.stats.boardsCleared[g] + 1,
            },
          },
        };
        this.store.set(this.save);
        this.tk.sfx.play('win');
      }
      const meta = {
        grid: g,
        timeMs,
        runSeed: this.seed,
        ...(this.log && JSON.stringify(this.log).length < 1800 ? { log: this.log } : {}),
      };
      const action = await this.tk.ui.gameOver({
        title: strings.t('cleared', { moves }),
        scores: g === '6x6' ? [{ board: 'pairs-moves', value: moves }] : [],
        meta,
        actions: [{ id: 'modes', label: strings.changeMode }],
      });
      if (this.tk.signal.aborted) return;
      if (action === 'modes') this.showMenu();
      else this.startPairs(g, true);
    }

    // ─── Follow ───
    private startFollow(): void {
      if (this.tk.run.active) this.tk.run.end('menu');
      this.view = 'follow';
      this.clearLayer();
      this.layoutHud();
      this.seed = hex16(() => this.tk.rng.main.nextUint32());
      this.follow = createFollow(this.tk.rng.create(`follow:${this.seed}`));
      this.ending = false;
      this.save = { ...this.save, prefs: { ...this.save.prefs, lastMode: 'follow' } };
      this.store.set(this.save);
      this.pills.best.set(String(this.save.bests.follow?.length ?? 0));
      this.layer.add(canvasImage(this, 360, LANTERN_TOP, 'branch'));
      const reduced = this.tk.motion.reduced;
      LANTERN_X.forEach((x, i) => {
        const halo = this.add
          .image(0, 128, 'ff-glow')
          .setBlendMode('ADD')
          .setTint(colorNum(LANTERN_COLORS[i]!))
          .setScale(4.8)
          .setAlpha(0);
        const img = canvasImage(this, 0, 0, `lantern${i}`).setOrigin(0.5, 0).setTint(DIM);
        const core = this.add.image(0, 120, 'ff-glow').setBlendMode('ADD').setScale(3).setAlpha(0);
        const badge = canvasImage(this, 48, 70, 'badge-cross').setVisible(false);
        badge.setScale(badge.scaleX * 1.3);
        const box = this.add.container(x, LANTERN_TOP + boughY(x) - 2, [halo, img, core, badge]);
        // a gentle bob on the breeze (no rotation: rotating these big textures tore them under SwiftShader)
        if (!reduced)
          this.tweens.add({
            targets: box,
            y: box.y + 5,
            duration: 1500 + i * 230,
            delay: i * 180,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        this.layer.add([
          box,
          canvasImage(this, x, 548, 'digit'),
          kit.text(this, x, 548, String(i + 1), { px: 22, color: 'textMuted' }).setOrigin(0.5),
        ]);
        this.lanterns.push({ box, img, halo, core, badge });
      });
      this.cursor = 0;
      this.drawCursor();
      this.handleFollow(this.follow.begin(this.clock));
    }

    private setBubble(text: string): void {
      this.bubble.setVisible(!!text);
      if (text && this.bubbleText.text !== text) {
        this.bubbleText.setText(text);
        bump(this, this.bubble, 1.08, 200);
      }
    }

    /** Lights (or dims) lantern i: glow halo, hot core and a little swell. */
    private lightLantern(i: number, on: boolean): void {
      const l = this.lanterns[i];
      if (!l) return;
      l.halo.setAlpha(on ? 0.95 : 0);
      l.core.setAlpha(on ? 0.45 : 0);
      if (on) l.img.clearTint();
      else l.img.setTint(DIM);
    }

    /** A swarm of fireflies around a singing lantern (and a little swell). */
    private swarm(i: number, count = 9): void {
      kit.fps.burst(700);
      const l = this.lanterns[i];
      if (l && count > 6) bump(this, l.img, 1.07, 240);
      burst(this, LANTERN_X[i]!, LANTERN_Y, {
        shape: 'spark',
        colors: [LANTERN_COLORS[i]!, colors.yellow, '#FFFFFF'],
        count,
        distance: 100,
        size: 14,
        lifeMs: 680,
      });
    }

    private handleFollow(events: FollowEvent[]): void {
      for (const e of events) {
        if (e.type === 'tone') {
          this.tk.sfx.play(`pad${e.lantern + 1}`);
          this.swarm(e.lantern);
        } else if (e.type === 'correct' && !this.tk.run.active) this.tk.run.begin();
        else if (e.type === 'round-clear') {
          this.tk.sfx.play('coin');
          this.lumiMood('happy', 700);
          for (let i = 0; i < LANTERNS; i++) this.swarm(i, 5);
        } else if (e.type === 'round') this.pills.length.bump();
        else if (e.type === 'wrong') {
          this.tk.sfx.play('hit');
          this.lumiMood('sad', 900);
          shake(this, 180, 0.006);
          this.setBubble(e.secondLook ? strings.secondLookNow : '');
          const box = this.lanterns[e.lantern]?.box;
          if (box && !this.tk.motion.reduced)
            this.tweens.add({ targets: box, x: box.x + 8, duration: 45, yoyo: true, repeat: 2 });
        } else if (e.type === 'over') void this.followOver(e.score);
      }
    }

    private async followOver(score: number): Promise<void> {
      if (this.ending) return;
      this.ending = true;
      const best = this.save.bests.follow?.length ?? 0;
      this.tk.sfx.play(score > best ? 'win' : 'lose');
      this.lumiMood(score > best ? 'happy' : 'sad', 1400);
      this.setBubble('');
      this.save = {
        ...this.save,
        bests: {
          ...this.save.bests,
          follow:
            score > best ? { length: score, at: new Date().toISOString() } : this.save.bests.follow,
        },
        stats: { ...this.save.stats, followRuns: this.save.stats.followRuns + 1 },
      };
      this.store.set(this.save);
      const action = await this.tk.ui.gameOver({
        title: strings.t('followOver', { n: score }),
        scores: score >= 1 ? [{ board: 'sequence-length', value: score }] : [],
        meta: { runSeed: this.seed, secondLookAt: this.follow?.secondLookAt ?? null },
        actions: [{ id: 'modes', label: strings.changeMode }],
      });
      if (this.tk.signal.aborted) return;
      if (action === 'modes') this.showMenu();
      else this.startFollow();
    }

    /** Mirrors the Follow state into the view, touching objects only when something changed. */
    private syncFollow(): void {
      const f = this.follow!;
      const s = this.shown;
      const lit = f.lit ?? -1;
      if (lit !== s.lit) {
        if (s.lit >= 0) this.lightLantern(s.lit, false);
        if (lit >= 0) this.lightLantern(lit, true);
        s.lit = lit;
      }
      if (f.phase !== s.phase) {
        s.phase = f.phase;
        if (f.phase === 'leadin' || f.phase === 'watch') this.setBubble(strings.watch);
        else if (f.phase === 'repeat') this.setBubble(strings.yourTurn);
        else if (f.phase === 'cleared') this.setBubble(strings.bright);
        else if (f.phase === 'over') this.setBubble('');
      }
      if (f.progress !== s.progress || f.length !== s.length) {
        s.progress = f.progress;
        s.length = f.length;
        this.pills.length.set(String(f.length));
        const d = this.dots.clear();
        const n = Math.min(20, f.length);
        d.fillStyle(colorNum('bg'), 0.55).fillRoundedRect(
          360 - n * 14 - 12,
          586,
          n * 28 + 24,
          36,
          18,
        );
        for (let i = 0; i < n; i++) {
          const x = 360 + (i - (n - 1) / 2) * 28;
          if (i < f.progress) {
            d.fillStyle(colorNum('yellow'), 0.3).fillCircle(x, 604, 13);
            d.fillStyle(colorNum('yellow'), 1).fillCircle(x, 604, 8);
            d.fillStyle(0xffffff, 0.9).fillCircle(x - 2.5, 601.5, 2.8);
          } else d.lineStyle(3, colorNum('textMuted'), 0.8).strokeCircle(x, 604, 7.5);
        }
      }
      if (f.secondLookLeft !== s.look) {
        s.look = f.secondLookLeft;
        this.pills.look.set(f.secondLookLeft ? strings.secondLookReady : strings.secondLookUsed);
        this.pills.look.container.setAlpha(f.secondLookLeft ? 1 : 0.7);
        this.pills.look.bump();
      }
      const m = f.mark?.kind === 'wrong' ? f.mark : null;
      if (m !== s.mark) {
        s.mark = m;
        const g = this.ring.clear();
        this.lanterns.forEach((l, i) => l.badge.setVisible(i === m?.lantern));
        if (m) {
          const x = LANTERN_X[m.expected]!;
          g.lineStyle(12, 0xffffff, 0.22).strokeRoundedRect(x - 80, LANTERN_Y - 90, 160, 190, 30);
          g.lineStyle(5, 0xffffff, 1).strokeRoundedRect(x - 80, LANTERN_Y - 90, 160, 190, 30);
        }
      }
    }

    // ─── input ───
    private onTap(x: number, y: number): void {
      if (
        this.view !== 'menu' &&
        !this.tk.attract &&
        Math.abs(x - MODES.x) < MODES.w / 2 + 6 &&
        Math.abs(y - MODES.y) < MODES.h / 2 + 8
      )
        return this.onModes();
      if (this.view === 'menu') {
        const hit = MENU_ITEMS.findIndex(
          ([cx, cy, w, h]) => Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2,
        );
        if (hit >= 0) this.activate(hit);
        else if (inside(PAIRS_CARD, x, y))
          this.activate(GRID_IDS.indexOf(this.save.prefs.lastGrid));
        else if (inside(FOLLOW_CARD, x, y)) this.activate(3);
        else if (Math.abs(x - LUMI_MENU[0]) < 70 && Math.abs(y - LUMI_MENU[1]) < 75)
          this.lumiMood('happy', 700);
      } else if (this.view === 'pairs') {
        const i = this.cards.findIndex(
          (c) => Math.abs(c.x - x) <= this.size / 2 && Math.abs(c.y - y) <= this.size / 2,
        );
        if (i >= 0) this.activate(i);
      } else {
        const i = LANTERN_X.findIndex(
          (lx) => Math.abs(lx - x) < 78 && Math.abs(LANTERN_Y - y) < 110,
        );
        if (i >= 0) this.activate(i);
      }
    }

    private activate(i: number): void {
      if (this.view === 'menu') {
        this.cursor = i;
        if (i < 3) this.startPairs(GRID_IDS[i]!);
        else this.startFollow();
      } else if (this.view === 'pairs' && this.pairs) {
        this.cursor = i;
        this.drawCursor();
        this.handlePairs(this.pairs.tap(i, this.clock));
      } else if (this.view === 'follow' && this.follow && i < LANTERNS) {
        this.cursor = i;
        this.drawCursor();
        this.handleFollow(this.follow.press(i, this.clock));
      }
    }

    private onModes(): void {
      if (this.view === 'pairs') {
        if (this.pairs?.cleared) return; // the result card is on its way
        this.persistBoard();
        if (this.tk.run.active) this.tk.run.end('menu');
        this.showMenu();
      } else if (this.view === 'follow' && this.follow) {
        const playing = this.follow.phase !== 'over' && this.follow.length > 1;
        if (!playing) return this.showMenu();
        if (this.clock - this.lastModesAt <= 3000) this.handleFollow(this.follow.quit());
        else {
          this.lastModesAt = this.clock;
          this.tk.ui.toast(strings.quitHint);
        }
      }
    }

    private moveCursor(dx: number, dy: number): void {
      if (this.view === 'menu') this.cursor = Math.max(0, Math.min(3, this.cursor + dy + dx));
      else if (this.view === 'pairs') {
        const r = Math.max(0, Math.min(this.rows - 1, Math.floor(this.cursor / this.cols) + dy));
        const c = Math.max(0, Math.min(this.cols - 1, (this.cursor % this.cols) + dx));
        this.cursor = r * this.cols + c;
      } else this.cursor = Math.max(0, Math.min(3, this.cursor + dx));
      this.drawCursor();
    }

    private drawCursor(): void {
      const g = this.cursorRing.clear();
      if (this.tk.attract || this.tk.env.input.primary !== 'keyboard') return;
      g.lineStyle(4, colorNum('yellow'), 1);
      if (this.view === 'menu') {
        const [x, y, w, h] = MENU_ITEMS[this.cursor]!;
        g.strokeRoundedRect(x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 12, 22);
      } else if (this.view === 'pairs') {
        const c = this.cards[this.cursor];
        if (c)
          g.strokeRoundedRect(
            c.x - this.size / 2 - 4,
            c.y - this.size / 2 - 4,
            this.size + 8,
            this.size + 8,
            18,
          );
      } else g.strokeRoundedRect(LANTERN_X[this.cursor]! - 84, LANTERN_Y - 96, 168, 202, 32);
    }

    // ─── frame ───
    override update(_time: number, delta: number): void {
      const dt = Math.min(delta, 100);
      this.clock += dt;
      const l = this.lumi;
      l.rig.y = (this.tk.motion.reduced ? 0 : Math.sin(this.clock / 650) * 5) + l.hop.y;
      if (this.view === 'pairs' && this.pairs) {
        if (this.started && !this.pairs.cleared) this.elapsedMs += dt;
        const ev = this.pairs.tick(this.clock);
        if (ev.length) this.handlePairs(ev);
        else this.updateTime();
      } else if (this.view === 'follow' && this.follow) {
        this.handleFollow(this.follow.tick(this.clock));
        this.syncFollow();
      }
    }

    private updateHud(): void {
      if (this.view !== 'pairs' || !this.pairs) return;
      const p = this.pairs;
      this.pills.moves.set(String(p.moves));
      this.pills.found.set(`${p.matched.filter(Boolean).length / 2}/${GRIDS[this.grid].pairs}`);
      this.updateTime();
    }

    /** The time pill, touched only when its second changes (it runs every frame). */
    private updateTime(): void {
      const sec = Math.floor(this.elapsedMs / 1000);
      if (sec === this.shownSec) return;
      this.shownSec = sec;
      this.pills.time.set(mmss(this.elapsedMs));
    }

    private publishView(): void {
      if (!this.tk.attract || !this.pairs) return;
      this.tk.attract.setView({
        faces: this.pairs.faces,
        matched: this.pairs.matched,
        open: this.pairs.open,
        centres: this.cards.map((c) => [c.x, c.y] as const),
      } satisfies AttractView);
    }
  }

  return [Play];
};
