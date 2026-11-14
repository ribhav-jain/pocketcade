// The Sourdough Solitaire table: deal, drag and drop, tap-to-move, two-tap select, keyboard cursor, undo, hints,
// auto-finish, the timer and saves. Rules live in klondike.ts, positions in layout.ts (recomputed whenever the view
// changes), card art in cards.ts, table art in art.ts. Card sprites use a centre origin so they can flip; layout
// positions are top-left.
import type Phaser from 'phaser';
import { colorNum, colors, formatScore, prng, type Save } from '@pocketcade/toolkit';
import {
  burst,
  canvasImage,
  canvasTexture,
  flash,
  iconTexture,
  popText,
  texScale,
  type SceneFactory,
} from '@pocketcade/toolkit/phaser';
import { attractTarget, type AttractView } from './attract.ts';
import {
  drawBrass,
  drawButton,
  drawCardGlow,
  drawFelt,
  drawLantern,
  drawNugget,
  drawPill,
  drawRail,
  drawShade,
  drawShadow,
  drawSlot,
  drawSoftGlow,
  drawVignette,
} from './art.ts';
import { drawBack, drawFace } from './cards.ts';
import {
  apply,
  deckHelps,
  encode,
  faceUpFrom,
  finishMoves,
  hint,
  invariantOk,
  isTab,
  isVault,
  isWon,
  layoutDeal,
  legal,
  rankOf,
  replay,
  shuffled,
  STOCK,
  TAB0,
  tapMove,
  WASTE,
  type Move,
  type State,
} from './klondike.ts';
import {
  ART_H,
  ART_W,
  cardXY,
  centre,
  fan,
  hitCard,
  HUD,
  MAX_CARD_W,
  pileAt,
  tableFor,
  UI_MAX,
  type Table as Geometry,
} from './layout.ts';
import { meta } from './meta.ts';
import {
  freshPrefs,
  freshStats,
  isGameV1,
  isPrefsV1,
  isStatsV1,
  startOf,
  TRIM_AT,
  TRIM_BY,
  withAbandon,
  withPlayed,
  withWin,
  type SolGameV1,
  type SolPrefsV1,
  type SolStatsV1,
} from './save.ts';
import { strings } from './strings.ts';

const MAX_MS = 359_999_999;
const ART_K = MAX_CARD_W / ART_W; // card art box → card texture size
type Phase = 'dealing' | 'ready' | 'playing' | 'auto' | 'won';
type Pick = { pile: number; index: number };
type HudId = 'chip' | 'hint' | 'undo' | 'new' | 'pause';
const ACTIONS = [
  { id: 'hint', color: colors.gold, label: strings.hint },
  { id: 'undo', color: colors.sky, label: strings.undo },
  { id: 'new', color: colors.orange, label: strings.newClaim },
] as const;
const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] } as const;

/** m:ss, or h:mm:ss from one hour (HUD). */
function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

export const createScenes: SceneFactory = (_P, kit) => {
  class Table extends kit.Scene {
    private s!: State;
    private g!: Geometry;
    private current!: SolGameV1;
    private phase: Phase = 'dealing';
    private running = false;
    private elapsed = 0;
    private sceneMs = 0;
    private stats: SolStatsV1 = freshStats();
    private prefs: SolPrefsV1 = freshPrefs();
    private gameSave!: Save<SolGameV1 | null>;
    private statsSave!: Save<SolStatsV1>;
    private prefsSave!: Save<SolPrefsV1>;
    private sprites: Phaser.GameObjects.Image[] = [];
    private selected: Pick | null = null;
    private held: (Pick & { ox: number; oy: number }) | null = null;
    private cursor: Pick = { pile: TAB0, index: 0 };
    private cursorShown = false;
    private newConfirmUntil = -1;
    private hintMove: { from: number; to: number } | null = null;
    private hintUntil = 0;
    private dealEndsAt = 0;
    private auto: { moves: Move[]; next: number; step: number } | null = null;
    private winTimer: Phaser.Time.TimerEvent | null = null;
    /** card sprite scale (texture → table card size) */
    private cs = 1;
    /** decoration only; its randomness never touches game state */
    private rnd = prng(0x51ed);
    private fx!: Phaser.GameObjects.Graphics;
    private hintG!: Phaser.GameObjects.Graphics;
    private fxSig = '';
    private lift!: Phaser.GameObjects.Image;
    private slots: Phaser.GameObjects.Image[] = [];
    private vaultGlow: Phaser.GameObjects.Image[] = [];
    private stockMark!: Phaser.GameObjects.Text;
    private scenery!: {
      vignette: Phaser.GameObjects.Image;
      rails: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
      brass: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
      shades: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
      lantern: Phaser.GameObjects.Container;
      lanternGlow: Phaser.GameObjects.Image;
    };
    private hud!: {
      chip: Phaser.GameObjects.Container;
      chipText: Phaser.GameObjects.Text;
      time: Phaser.GameObjects.Container;
      timeText: Phaser.GameObjects.Text;
      moves: Phaser.GameObjects.Container;
      movesText: Phaser.GameObjects.Text;
      pause: Phaser.GameObjects.Container;
      /** Hint / Undo / New in the top bar (wide and square views) and in the bottom bar (tall views) */
      small: Phaser.GameObjects.Container[];
      big: Phaser.GameObjects.Container[];
    };
    private hits: Array<{ id: HudId; x: number; y: number; w: number; h: number }> = [];

    constructor() {
      super('table');
    }

    create(): void {
      const tk = this.tk;
      this.makeTextures();
      this.buildScenery();
      this.buildHud();
      this.sprites = Array.from({ length: 52 }, () => this.add.image(0, 0, 'back'));
      this.lift = canvasImage(this, 0, 0, 'lift').setDepth(990).setAlpha(0.85).setVisible(false);
      this.fx = this.add.graphics().setDepth(900);
      this.hintG = this.add.graphics().setDepth(960);
      this.relayout();
      tk.on('resize', () => {
        if (this.held) this.onDragEnd(0, 0, true);
        this.relayout();
      });
      tk.input.configure({
        actions: {
          left: { codes: ['ArrowLeft'], repeat: true },
          right: { codes: ['ArrowRight'], repeat: true },
          up: { codes: ['ArrowUp'], repeat: true },
          down: { codes: ['ArrowDown'], repeat: true },
          pick: { codes: ['Space'] },
          send: { codes: ['Enter', 'NumpadEnter'] },
          draw: { codes: ['KeyD'] },
          undo: { codes: ['KeyU', 'KeyZ'], modifiers: { ctrl: true, meta: true } },
          hint: { codes: ['KeyH'] },
          newClaim: { codes: ['KeyN'] },
          mode: { codes: ['KeyM'] },
        },
      });
      for (const a of [
        'left',
        'right',
        'up',
        'down',
        'pick',
        'send',
        'draw',
        'undo',
        'hint',
        'newClaim',
        'mode',
      ])
        tk.input.on(a, (e) => e.phase === 'press' && this.onKey(a));
      tk.input.onGesture('tap', (e) => this.onTap(e.x, e.y));
      tk.input.onGesture('dragstart', (e) => this.onDragStart(e.x, e.y));
      tk.input.onGesture('drag', (e) => this.onDrag(e.x, e.y));
      tk.input.onGesture('dragend', (e) => this.onDragEnd(e.x, e.y, e.cancelled));
      tk.on('pause', () => {
        this.held = null;
        this.selected = null;
        this.lift.setVisible(false);
        if (this.s) this.render(false);
      });
      tk.on('inputchange', ({ primary }) => (this.cursorShown = primary === 'keyboard'));
      tk.ui.onRestart(() => {
        this.running = false;
        this.newClaim(this.current.draw, this.current.claim); // replay the same claim
      });
      this.gameSave = tk.createSave<SolGameV1 | null>({
        key: 'game',
        defaults: () => null,
        validate: isGameV1,
        debounceMs: 300,
      });
      this.statsSave = tk.createSave<SolStatsV1>({
        key: 'stats',
        defaults: freshStats,
        validate: isStatsV1,
      });
      this.prefsSave = tk.createSave<SolPrefsV1>({
        key: 'prefs',
        defaults: freshPrefs,
        validate: isPrefsV1,
      });
      this.cursorShown = tk.env.input.primary === 'keyboard';
      tk.deferReady();
      if (tk.attract) {
        this.newClaim(1);
        tk.ready();
        return;
      }
      void Promise.all([this.gameSave.load(), this.statsSave.load(), this.prefsSave.load()])
        .then(([g, st, pr]) => {
          if (tk.signal.aborted) return; // unmounted while loading
          this.stats = st.data;
          this.prefs = pr.data;
          const saved = g.data;
          if (tk.ctx.launch === 'restart' && saved) this.newClaim(saved.draw, saved.claim, saved);
          else if (saved) this.restore(saved);
          else this.newClaim(this.prefs.draw);
        })
        .catch((e: unknown) => {
          tk.reportError(e);
          if (!tk.signal.aborted) this.newClaim(this.prefs.draw);
        })
        .finally(() => tk.ready());
    }

    // ─── art ───
    private makeTextures(): void {
      const rs = Math.max(1, kit.renderScale);
      // Cards are drawn once at the largest size any view shows them, capped to keep texture memory modest.
      const cardScale = Math.min(1.6, rs);
      const hudScale = rs * UI_MAX;
      const tex = (
        key: string,
        w: number,
        h: number,
        draw: (ctx: CanvasRenderingContext2D) => void,
        scale: number,
      ) => canvasTexture(this, key, w, h, draw, { scale });
      /** a texture of the card art box (plus `pad` art units around it), at card texture size */
      const art = (
        key: string,
        pad: number,
        draw: (ctx: CanvasRenderingContext2D) => void,
        scale = cardScale,
      ) =>
        tex(
          key,
          (ART_W + pad) * ART_K,
          (ART_H + pad) * ART_K,
          (ctx) => {
            ctx.scale(ART_K, ART_K);
            draw(ctx);
          },
          scale,
        );
      for (let id = 0; id < 52; id++) art(`card${id}`, 0, (ctx) => drawFace(ctx, id));
      art('back', 0, (ctx) => drawBack(ctx));
      for (const kind of ['vault', 'king', 'plain'] as const)
        art(`slot-${kind}`, 0, (ctx) => drawSlot(ctx, kind));
      art('card-glow', 48, (ctx) => drawCardGlow(ctx, ART_W + 48), 0.5);
      art('lift', 28, (ctx) => drawShadow(ctx, ART_W + 28, ART_H + 28), 0.5);
      const { x: bx, y: by } = this.tk.layout.bleed;
      const [fw, fh] = [1000 + 2 * bx, 1000 + 2 * by];
      tex('felt', fw, fh, (ctx) => drawFelt(ctx, fw, fh, bx, by), 0.5);
      tex('vignette', 128, 128, (ctx) => drawVignette(ctx, 128), 1);
      tex('shade', 8, 32, (ctx) => drawShade(ctx, 8, 32), 1);
      tex('brass', 8, 6, (ctx) => drawBrass(ctx, 8, 6), 1);
      tex(
        'rail',
        fw,
        HUD.bottomBar * UI_MAX,
        (ctx) => drawRail(ctx, fw, HUD.bottomBar * UI_MAX),
        Math.min(1.5, rs),
      );
      tex('lantern', 40, 64, (ctx) => drawLantern(ctx), hudScale);
      tex('glow', 64, 64, (ctx) => drawSoftGlow(ctx, 64), 1);
      for (let v = 0; v < 3; v++)
        tex(`nugget${v}`, 22, 18, (ctx) => drawNugget(ctx, 22, 18, v), 1.5);
      tex('pill', HUD.pillW, HUD.h, (ctx) => drawPill(ctx, HUD.pillW, HUD.h), hudScale);
      const button = (key: string, w: number, color: string) =>
        tex(key, w, HUD.h, (ctx) => drawButton(ctx, w, HUD.h, color), hudScale);
      button('btn-chip', HUD.chipW, colors.violet);
      button('btn-pause', HUD.btnW, colors.lime);
      for (const b of ACTIONS) {
        button(`btn-${b.id}`, HUD.btnW, b.color);
        button(`btnw-${b.id}`, HUD.wideBtnW, b.color);
      }
    }

    private buildScenery(): void {
      const { x: bx, y: by } = this.tk.layout.bleed;
      canvasImage(this, -bx, -by, 'felt').setOrigin(0).setDepth(-1000);
      const rail = () => canvasImage(this, 0, 0, 'rail').setOrigin(0).setDepth(-890);
      const strip = (key: string, depth: number) =>
        this.add.image(0, 0, key).setOrigin(0).setDepth(depth);
      const lantern = this.add
        .container(0, 0, [canvasImage(this, 0, 0, 'lantern').setOrigin(0.5, 0)])
        .setDepth(8);
      this.scenery = {
        vignette: strip('vignette', -950),
        rails: [rail(), rail()],
        brass: [strip('brass', -880), strip('brass', -880)],
        shades: [strip('shade', -900), strip('shade', -900).setFlipY(true)],
        lantern,
        lanternGlow: this.add
          .image(0, 0, 'glow')
          .setTint(colorNum(colors.orange))
          .setBlendMode('ADD')
          .setDepth(7),
      };
      for (let p = 0; p < 13; p++) {
        if (isVault(p))
          this.vaultGlow.push(
            this.add
              .image(0, 0, 'card-glow')
              .setTint(colorNum(colors.gold))
              .setBlendMode('ADD')
              .setAlpha(0)
              .setDepth(-5),
          );
        this.slots.push(
          this.add
            .image(0, 0, `slot-${isVault(p) ? 'vault' : isTab(p) ? 'king' : 'plain'}`)
            .setOrigin(0)
            .setDepth(-10),
        );
      }
      this.stockMark = kit
        .text(this, 0, 0, '', { px: 52, color: '#FFD866', stroke: '#2A1606', strokePx: 5 })
        .setOrigin(0.5)
        .setDepth(1);
      this.stockMark.setResolution(Math.ceil(Math.max(1, kit.renderScale) * 1.3));
    }

    private hudText(x: number, y: number, value: string, px: number, color = 'ink') {
      const t = kit.text(this, x, y, value, { px, color }).setOrigin(0.5);
      t.setResolution(Math.ceil(Math.max(1, kit.renderScale) * UI_MAX));
      return t;
    }

    private buildHud(): void {
      const H = HUD.h;
      const box = (key: string, w: number, label: string, px = 25) => {
        const text = this.hudText(w / 2, H / 2 - 3, label, px);
        const c = this.add
          .container(0, 0, [canvasImage(this, 0, 0, key).setOrigin(0), text])
          .setDepth(10);
        return { c, text };
      };
      const pill = (icon: 'clock' | 'moves', accent: string) => {
        const size = Math.round((H - 14) * UI_MAX);
        const badge = canvasImage(
          this,
          7 + (H - 14) / 2,
          H / 2,
          iconTexture(this, icon, accent, size),
        );
        badge.setScale(badge.scaleX / UI_MAX);
        const text = this.hudText(H - 4, H / 2, '', 27, 'text').setOrigin(0, 0.5);
        const c = this.add
          .container(0, 0, [canvasImage(this, 0, 0, 'pill').setOrigin(0), badge, text])
          .setDepth(10);
        return { c, text };
      };
      const chip = box('btn-chip', HUD.chipW, '');
      chip.text.setColor(colors.text).setStroke('#2B1A6B', 4);
      const time = pill('clock', colors.sky);
      const moves = pill('moves', colors.purple);
      this.hud = {
        chip: chip.c,
        chipText: chip.text,
        time: time.c,
        timeText: time.text,
        moves: moves.c,
        movesText: moves.text,
        pause: box('btn-pause', HUD.btnW, strings.pause).c,
        small: ACTIONS.map((b) => box(`btn-${b.id}`, HUD.btnW, b.label).c),
        big: ACTIONS.map((b) => box(`btnw-${b.id}`, HUD.wideBtnW, b.label, 28).c),
      };
    }

    /** Recomputes the table for the current view and moves everything onto it. */
    private relayout(): void {
      const { view } = this.tk.layout;
      const size = this.tk.env.size;
      const cssPerUnit = Math.min(size.width / view.width, size.height / view.height);
      const g = (this.g = tableFor(view, cssPerUnit));
      this.cs = g.w / MAX_CARD_W / texScale(this, 'back');
      const sc = this.scenery;
      sc.vignette.setPosition(view.x, view.y).setDisplaySize(view.width, view.height);
      const railZ = texScale(this, 'rail');
      const bars = [g.top, g.bottom] as const;
      bars.forEach((bar, i) => {
        const [rail, brass, shade] = [sc.rails[i]!, sc.brass[i]!, sc.shades[i]!];
        for (const o of [rail, brass, shade]) o.setVisible(!!bar);
        if (!bar) return;
        const edge = 6 * g.ui;
        rail.setPosition(bar.x, bar.y).setCrop(0, 0, bar.width * railZ, bar.height * railZ);
        brass
          .setPosition(bar.x, i ? bar.y : bar.y + bar.height - edge)
          .setDisplaySize(bar.width, edge);
        const sh = 26 * g.ui;
        shade.setPosition(bar.x, i ? bar.y - sh : bar.y + bar.height).setDisplaySize(bar.width, sh);
      });
      this.placeHud();
      g.slots.forEach((xy, p) => this.slots[p]!.setPosition(xy.x, xy.y).setScale(this.cs));
      const glowScale = g.w / MAX_CARD_W / texScale(this, 'card-glow');
      this.vaultGlow.forEach((img, k) => {
        const xy = g.slots[2 + k]!;
        img.setPosition(xy.x + g.w / 2, xy.y + g.h / 2).setScale(glowScale);
      });
      const st = g.slots[STOCK]!;
      this.stockMark.setPosition(st.x + g.w / 2, st.y + g.h / 2).setScale(g.w / ART_W);
      this.lift.setVisible(false);
      this.fxSig = '';
      if (!this.s) return;
      if (this.phase === 'dealing') {
        this.tweens.killTweensOf(this.sprites);
        this.dealEndsAt = 0;
        this.phase = 'ready';
      }
      this.render(false);
      this.publishView();
    }

    private placeHud(): void {
      const { top, bottom, ui } = this.g;
      const h = this.hud;
      const H = HUD.h * ui;
      const cy = top.y + (top.height - 6 * ui) / 2;
      this.hits = [];
      const put = (
        c: Phaser.GameObjects.Container,
        x: number,
        y: number,
        w: number,
        id?: HudId,
      ) => {
        this.tweens.killTweensOf(c);
        c.setPosition(x, y).setScale(ui).setVisible(true);
        if (id) this.hits.push({ id, x, y, w: w * ui, h: H });
      };
      let x = top.x + 12 * ui;
      put(h.chip, x, cy - H / 2, HUD.chipW, 'chip');
      x += (HUD.chipW + HUD.gap) * ui;
      put(h.time, x, cy - H / 2, HUD.pillW);
      x += (HUD.pillW + HUD.gap) * ui;
      put(h.moves, x, cy - H / 2, HUD.pillW);
      let rx = top.x + top.width - (12 + HUD.lanternW) * ui;
      this.scenery.lantern.setPosition(rx + (HUD.lanternW * ui) / 2, top.y).setScale(ui);
      this.scenery.lanternGlow.setPosition(rx + (HUD.lanternW * ui) / 2, top.y + 38 * ui);
      this.scenery.lanternGlow.setScale(2.2 * ui);
      rx -= HUD.btnW * ui;
      put(h.pause, rx, cy - H / 2, HUD.btnW, 'pause');
      for (let k = ACTIONS.length - 1; k >= 0; k--) {
        h.small[k]!.setVisible(!bottom);
        h.big[k]!.setVisible(!!bottom);
        if (bottom) {
          const space = (bottom.width - ACTIONS.length * HUD.wideBtnW * ui) / (ACTIONS.length + 1);
          const bx = bottom.x + space + k * (HUD.wideBtnW * ui + space);
          const by = bottom.y + 6 * ui + (bottom.height - 6 * ui - H) / 2;
          put(h.big[k]!, bx, by, HUD.wideBtnW, ACTIONS[k]!.id);
        } else {
          rx -= (HUD.btnW + HUD.gap) * ui;
          put(h.small[k]!, rx, cy - H / 2, HUD.btnW, ACTIONS[k]!.id);
        }
      }
    }

    // ─── claims ───
    private newClaim(draw: 1 | 3, claim?: string, previous?: SolGameV1): void {
      const tk = this.tk;
      const prev = previous ?? this.current;
      if (!tk.attract && prev?.counted && this.phase !== 'won') {
        this.stats = withAbandon(this.stats, prev.draw);
        this.statsSave.set(this.stats);
        if (this.running) tk.run.end('gameover');
        this.running = false;
      }
      const code =
        claim ??
        [tk.rng.main.nextUint32(), tk.rng.main.nextUint32()]
          .map((x) => x.toString(16).padStart(8, '0'))
          .join('');
      const deal = shuffled(code);
      this.current = {
        rules: 1,
        claim: code,
        draw,
        deal,
        snapshot: null,
        log: '',
        moves: 0,
        undos: 0,
        hints: 0,
        elapsedMs: 0,
        counted: false,
      };
      this.s = layoutDeal(deal, draw);
      this.elapsed = 0;
      this.selected = this.held = null;
      this.hintMove = null;
      this.lift.setVisible(false);
      this.fxSig = '';
      this.auto = null;
      this.winTimer?.remove();
      this.winTimer = null;
      for (const g of this.vaultGlow) g.setAlpha(0);
      this.cursor = { pile: TAB0, index: 0 };
      if (!tk.attract) {
        this.gameSave.set(this.current);
        void this.gameSave.flush();
      }
      tk.sfx.play('riffle');
      this.deal();
    }

    private restore(g: SolGameV1): void {
      this.current = g;
      this.s = replay(startOf(g), g.log)!;
      this.elapsed = g.elapsedMs;
      this.phase = 'ready';
      this.fxSig = '';
      this.tk.ui.toast(strings.restored);
      this.render(false);
    }

    private deal(): void {
      const tk = this.tk;
      this.tweens.killTweensOf(this.sprites);
      const stock = centre(this.g, this.s, STOCK, 0);
      for (const sp of this.sprites)
        sp.setPosition(stock.x, stock.y).setTexture('back').setScale(this.cs);
      if (tk.motion.reduced) {
        this.phase = 'ready';
        return this.afterChange(false);
      }
      this.phase = 'dealing';
      this.render(false, true);
      const every = 26;
      kit.fps.burst(28 * every + 400);
      let k = 0;
      for (let r = 0; r < 7; r++)
        for (let c = r; c < 7; c++) {
          const id = this.s.piles[TAB0 + c]![r]!;
          const to = cardXY(this.g, this.s, TAB0 + c, r);
          const sp = this.sprites[id]!.setPosition(stock.x, stock.y).setDepth(300 + r);
          this.tweens.add({
            targets: sp,
            x: to.x + this.g.w / 2,
            y: to.y + this.g.h / 2,
            delay: k++ * every,
            duration: 200,
            ease: 'Cubic.easeOut',
          });
        }
      this.dealEndsAt = this.sceneMs + 28 * every + 200;
      this.publishView();
    }

    /** Finishes the deal, the auto-finish or the win celebration at once; true if there was one. */
    private skipAnimations(): boolean {
      if (this.phase === 'dealing') {
        this.tweens.killTweensOf(this.sprites);
        this.dealEndsAt = 0;
        this.phase = 'ready';
        this.render(false);
        return true;
      }
      if (this.phase === 'auto' && this.auto) {
        for (const m of this.auto.moves) apply(this.s, m);
        this.auto = null;
        this.render(false);
        this.win();
        return true;
      }
      if (this.phase === 'won' && this.winTimer && !this.tk.attract) {
        this.winTimer.remove();
        this.winTimer = null;
        void this.gameOver();
        return true;
      }
      return false;
    }

    // ─── moves ───
    private firstAction(): void {
      const tk = this.tk;
      if (this.phase === 'ready') this.phase = 'playing';
      if (!this.running) {
        this.running = true;
        tk.run.begin();
      }
      if (!tk.attract && !this.current.counted) {
        this.current.counted = true;
        this.stats = withPlayed(this.stats, this.current.draw);
        this.statsSave.set(this.stats);
      }
    }

    private doMove(m: Move): void {
      if (!legal(this.s, m)) return this.illegal();
      this.firstAction();
      const r = apply(this.s, m);
      this.current.log += encode(m, r);
      this.current.moves++;
      if (this.current.log.length / 3 >= TRIM_AT) {
        const folded = replay(startOf(this.current), this.current.log.slice(0, TRIM_BY * 3))!;
        this.current.snapshot = { piles: folded.piles, faceDown: folded.faceDown };
        this.current.log = this.current.log.slice(TRIM_BY * 3);
      }
      const { sfx } = this.tk;
      if (m.type === 'draw') sfx.play('cardFlip');
      else if (m.type === 'recycle') sfx.play('riffle');
      else if (isVault(m.to))
        sfx.play('coin', { detuneCents: (rankOf(this.s.piles[m.to]!.at(-1)!) - 1) * 50 });
      else sfx.play('cardPlace');
      if (r.flip) sfx.play('cardFlip');
      if (m.type === 'move' && !invariantOk(this.s))
        this.tk.reportError(new Error('sourdough: rules invariant failed'));
      this.selected = null;
      this.hintMove = null;
      this.afterChange(true);
      if (m.type === 'move' && isVault(m.to)) {
        const to = m.to;
        this.time.delayedCall(this.tk.motion.reduced ? 0 : 140, () => this.bankFx(to, 12));
      }
    }

    private tryMove(from: number, index: number, to: number): void {
      const count = this.s.piles[from]!.length - index;
      const m: Move = { type: 'move', from, to, count };
      if (legal(this.s, m)) this.doMove(m);
      else this.illegal();
    }

    private illegal(): void {
      this.tk.sfx.play('hit', { volume: 0.5 });
      this.selected = null;
      this.render(true);
    }

    private undo(): void {
      if (!this.current.log) return;
      this.firstAction();
      this.current.log = this.current.log.slice(0, -3);
      this.s = replay(startOf(this.current), this.current.log)!;
      this.current.moves = Math.max(0, this.current.moves - 1);
      this.current.undos++;
      this.selected = null;
      this.hintMove = null;
      this.tk.sfx.play('cardPlace');
      this.afterChange(true);
    }

    private showHint(): void {
      this.current.hints++;
      const h = hint(this.s);
      if (h?.type === 'move') this.hintMove = { from: h.from, to: h.to };
      else if (deckHelps(this.s)) this.hintMove = { from: STOCK, to: WASTE };
      else this.tk.ui.toast(strings.noMoves);
      this.hintUntil = this.sceneMs + 1600;
      this.save();
    }

    private afterChange(animate: boolean): void {
      this.render(animate);
      this.save();
      this.publishView();
      if (isWon(this.s)) return this.win();
      if (this.phase === 'playing' && this.s.faceDown.every((n) => n === 0)) {
        const moves = finishMoves(this.s);
        if (moves) return this.startAuto(moves);
      }
      // The demo starts over once nothing useful is left to do.
      if (this.tk.attract && this.phase === 'playing' && !hint(this.s) && !deckHelps(this.s))
        this.attractRestart();
    }

    private startAuto(moves: Move[]): void {
      if (this.tk.motion.reduced) {
        for (const m of moves) apply(this.s, m);
        this.render(false);
        return this.win();
      }
      this.phase = 'auto';
      this.auto = {
        moves,
        next: this.sceneMs + 250,
        step: Math.max(16, Math.min(60, 3500 / moves.length)),
      };
    }

    private win(): void {
      const tk = this.tk;
      this.phase = 'won';
      this.selected = null;
      tk.sfx.play('win');
      if (!tk.attract) {
        this.stats = withWin(
          this.stats,
          this.current.draw,
          Math.floor(this.elapsed),
          this.current.moves,
        );
        this.statsSave.set(this.stats);
        this.gameSave.set(null);
        void this.gameSave.flush();
      }
      this.syncHud();
      this.celebrate();
      // A tap or key skips the rest of the celebration.
      this.winTimer = this.time.delayedCall(tk.motion.reduced ? 0 : 1800, () => {
        this.winTimer = null;
        void this.gameOver();
      });
    }

    private async gameOver(): Promise<void> {
      const tk = this.tk;
      if (tk.attract) return this.attractRestart();
      const ms = Math.floor(this.elapsed);
      const other: 1 | 3 = this.current.draw === 1 ? 3 : 1;
      const action = await tk.ui.gameOver({
        title: strings.won,
        scores: [
          ...(ms < MAX_MS ? [{ board: 'time', value: Math.max(1, ms) }] : []),
          { board: 'wins', value: this.stats.totalWins },
        ],
        meta: {
          draw: this.current.draw,
          moves: this.current.moves,
          undos: this.current.undos,
          hints: this.current.hints,
          claim: this.current.claim,
          v: meta.version,
        },
        actions: [
          { id: 'replay', label: strings.replay },
          { id: 'switch', label: strings.t('switchTo', { n: other }) },
        ],
      });
      if (tk.signal.aborted) return;
      this.running = false;
      if (action === 'replay') return this.newClaim(this.current.draw, this.current.claim);
      if (action === 'switch') this.setDraw(other);
      this.newClaim(this.prefs.draw);
    }

    private attractRestart(): void {
      if (this.phase === 'dealing') return;
      this.phase = 'dealing';
      void this.tk.ui
        .gameOver({ title: '', scores: [] })
        .then(() => !this.tk.signal.aborted && this.newClaim(1));
    }

    private setDraw(draw: 1 | 3): void {
      this.prefs = { ...this.prefs, draw };
      this.prefsSave.set(this.prefs);
    }

    private save(): void {
      if (this.tk.attract) return;
      this.current.elapsedMs = Math.floor(this.elapsed);
      this.gameSave.set({ ...this.current });
    }

    private publishView(): void {
      const a = this.tk.attract;
      if (!a || !this.s) return;
      const t = attractTarget(this.s);
      const at = centre(this.g, this.s, t.pile, t.index);
      // A card under others in a column is tapped on its visible top strip, not its covered centre.
      if (isTab(t.pile) && t.index < this.s.piles[t.pile]!.length - 1)
        at.y = cardXY(this.g, this.s, t.pile, t.index).y + 0.06 * this.g.h;
      a.setView(at satisfies AttractView);
    }

    // ─── feedback ───
    /** Gold nuggets tumbling from (x, y). */
    private nuggets(
      x: number,
      y: number,
      n: number,
      spread: number,
      fall: number,
      lifeMs: number,
    ): void {
      const calm = this.tk.motion.reduced;
      for (let i = 0; i < (calm ? Math.min(3, n) : n); i++) {
        const img = canvasImage(this, x, y, `nugget${i % 3}`).setDepth(1200);
        const s = img.scaleX * (0.7 + this.rnd() * 0.7);
        img.setScale(s).setAngle(this.rnd() * 360);
        const dx = (this.rnd() - 0.5) * spread * (calm ? 0.2 : 1);
        const up = calm ? 0 : 30 + this.rnd() * 60;
        const ms = lifeMs * (0.7 + this.rnd() * 0.5);
        this.tweens.add({
          targets: img,
          x: x + dx,
          angle: img.angle + (this.rnd() - 0.5) * 540,
          duration: ms,
          ease: 'Sine.easeOut',
        });
        this.tweens.add({
          targets: img,
          y: y - up,
          duration: ms * 0.3,
          ease: 'Quad.easeOut',
          onComplete: () =>
            this.tweens.add({
              targets: img,
              y: y + fall,
              alpha: 0,
              duration: ms * 0.7,
              ease: 'Quad.easeIn',
              onComplete: () => img.destroy(),
            }),
        });
      }
    }

    private bankFx(vault: number, n: number): void {
      const g = this.vaultGlow[vault - 2]!;
      const c = centre(this.g, this.s, vault, 0);
      this.tweens.killTweensOf(g);
      g.setAlpha(1);
      this.tweens.add({ targets: g, alpha: 0.18, duration: 700, ease: 'Quad.easeOut' });
      this.nuggets(c.x, c.y - 20, n, 150, 140, 750);
      burst(this, c.x, c.y, {
        count: 8,
        shape: 'star',
        colors: [colors.gold, colors.yellow, colors.text],
        distance: 80,
        size: 13,
        depth: 1201,
      });
      kit.fps.burst(900);
    }

    private celebrate(): void {
      const calm = this.tk.motion.reduced;
      const { view, top } = this.g;
      for (const g of this.vaultGlow) {
        this.tweens.killTweensOf(g);
        g.setAlpha(1);
        if (!calm)
          this.tweens.add({ targets: g, alpha: 0.4, duration: 450, yoyo: true, repeat: 3 });
      }
      flash(this, colors.gold, 260, 0.3);
      for (let p = 2; p < 6; p++) {
        const c = centre(this.g, this.s, p, 0);
        burst(this, c.x, c.y, {
          count: 14,
          shape: 'star',
          colors: [colors.gold, colors.yellow, colors.orange, colors.text],
          distance: 160,
          size: 16,
          depth: 1201,
        });
      }
      if (!calm)
        for (let i = 0; i < 6; i++)
          this.time.delayedCall(i * 150, () =>
            this.nuggets(
              view.x + 80 + this.rnd() * (view.width - 160),
              top.y + top.height,
              8,
              260,
              view.height * 0.9,
              1500,
            ),
          );
      popText(this, view.x + view.width / 2, view.y + view.height / 2, strings.won, {
        px: 76,
        color: colors.gold,
        rise: 40,
        ms: 1800,
        depth: 1300,
      });
      kit.fps.burst(2400);
    }

    /** A quick press pop on a HUD button. */
    private press(c: Phaser.GameObjects.Container): void {
      if (this.tk.motion.reduced) return;
      const ui = this.g.ui;
      this.tweens.killTweensOf(c);
      c.setScale(ui * 0.92);
      this.tweens.add({ targets: c, scale: ui, duration: 140, ease: 'Back.easeOut' });
    }

    // ─── input ───
    private pickable(p: Pick): boolean {
      const pile = this.s.piles[p.pile]!;
      if (p.pile === STOCK || !pile.length || p.index < faceUpFrom(this.s, p.pile)) return false;
      return isTab(p.pile) || p.index === pile.length - 1;
    }

    private live(): boolean {
      return this.phase === 'ready' || this.phase === 'playing';
    }

    private onTap(x: number, y: number): void {
      if (!this.s) return;
      const id = this.hudButton(x, y);
      // Pause works while dealing and during auto-finish too, like the pause keys.
      if (id === 'pause') {
        this.tk.sfx.play('click');
        this.press(this.hud.pause);
        void this.tk.ui.pauseMenu();
        return;
      }
      if (this.skipAnimations() || !this.live()) return;
      if (!this.tk.attract) this.cursorShown = false;
      if (id) return this.hudTap(id);
      const hit = hitCard(this.g, this.s, x, y);
      const sel = this.selected;
      if (sel) {
        const to = hit ? hit.pile : pileAt(this.g, this.s, x, y);
        if (to === null || to === sel.pile) {
          this.selected = null;
          return this.render(true);
        }
        return this.tryMove(sel.pile, sel.index, to);
      }
      if (!hit) return;
      if (hit.pile === STOCK) return this.stockAction();
      const m = tapMove(this.s, hit.pile, hit.index);
      if (m) return this.doMove(m);
      if (this.pickable(hit)) {
        this.selected = hit;
        this.tk.sfx.play('click');
        this.render(true);
      }
    }

    /** The HUD button under (x, y), with a little slack around each. */
    private hudButton(x: number, y: number): HudId | null {
      const pad = 6;
      return (
        this.hits.find(
          (r) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad,
        )?.id ?? null
      );
    }

    private hudTap(id: HudId): void {
      this.tk.sfx.play('click');
      const h = this.hud;
      const k = ACTIONS.findIndex((b) => b.id === id);
      this.press(id === 'chip' ? h.chip : (this.g.bottom ? h.big : h.small)[k]!);
      if (id === 'chip') this.toggleDraw();
      else if (id === 'hint') this.showHint();
      else if (id === 'undo') this.undo();
      else if (id === 'new') this.askNew();
    }

    private stockAction(): void {
      const m: Move = this.s.piles[STOCK]!.length ? { type: 'draw' } : { type: 'recycle' };
      if (legal(this.s, m)) this.doMove(m);
    }

    /** Switches Draw 1 / Draw 3: at once on an untouched deal (same cards), else from the next claim. */
    private toggleDraw(): void {
      const next: 1 | 3 = this.prefs.draw === 1 ? 3 : 1;
      this.setDraw(next);
      if (!this.current.log && !this.current.counted)
        return this.newClaim(next, this.current.claim);
      this.tk.ui.toast(strings.t('nextClaim', { n: next }));
    }

    private askNew(): void {
      if (this.current.moves >= 1 && this.sceneMs > this.newConfirmUntil) {
        this.newConfirmUntil = this.sceneMs + 3000;
        return this.tk.ui.toast(strings.confirmNew);
      }
      this.newConfirmUntil = -1;
      this.newClaim(this.prefs.draw);
    }

    private onDragStart(x: number, y: number): void {
      if (!this.s || !this.live() || this.tk.attract) return;
      const hit = hitCard(this.g, this.s, x, y);
      if (!hit || !this.pickable(hit)) return;
      const at = cardXY(this.g, this.s, hit.pile, hit.index);
      this.held = { ...hit, ox: x - at.x, oy: y - at.y };
      this.selected = null;
      this.cursorShown = false;
      kit.fps.burst(60_000);
    }

    private onDrag(x: number, y: number): void {
      const h = this.held;
      if (!h) return;
      const { w, h: ch } = this.g;
      const step = isTab(h.pile) ? fan(this.g, this.s, h.pile).up : 0;
      const cards = this.s.piles[h.pile]!.slice(h.index);
      const lifted = this.cs * (this.tk.motion.reduced ? 1 : 1.06);
      cards.forEach((id, k) => {
        const sp = this.sprites[id]!;
        this.tweens.killTweensOf(sp);
        // a card picked up mid-flip shows its face at once
        sp.setTexture(`card${id}`);
        sp.setPosition(x - h.ox + w / 2, y - h.oy + ch / 2 + k * step).setScale(lifted);
        if (sp.depth !== 1000 + k) sp.setDepth(1000 + k); // any depth change queues a display-list sort
      });
      const span = (cards.length - 1) * step;
      const pad = (28 * w) / ART_W;
      this.lift
        .setVisible(true)
        .setPosition(x - h.ox + w / 2 + pad / 2, y - h.oy + ch / 2 + pad * 0.8 + span / 2)
        .setDisplaySize(w + pad, ch + pad + span);
    }

    private onDragEnd(x: number, y: number, cancelled = false): void {
      const h = this.held;
      if (!h) return;
      this.held = null;
      this.lift.setVisible(false);
      kit.fps.burst(400);
      // a touch the OS took away puts the card back
      const to = cancelled ? null : pileAt(this.g, this.s, x, y);
      if (to !== null && to !== h.pile) this.tryMove(h.pile, h.index, to);
      else this.render(true);
    }

    /** The pile next to the cursor's pile in a direction, by slot positions (works for both arrangements). */
    private neighbour(from: number, dir: keyof typeof DIRS): number | null {
      const [ux, uy] = DIRS[dir];
      const a = this.g.slots[from]!;
      let best: number | null = null;
      let bestScore = Infinity;
      this.g.slots.forEach((b, p) => {
        if (p === from) return;
        const [dx, dy] = [b.x - a.x, b.y - a.y];
        const along = dx * ux + dy * uy;
        if (along <= 1) return;
        const score = along + 2 * Math.abs(dx * uy - dy * ux);
        if (score < bestScore) [best, bestScore] = [p, score];
      });
      return best;
    }

    private onKey(action: string): void {
      if (!this.s || this.skipAnimations() || !this.live()) return;
      this.cursorShown = true;
      const c = this.cursor;
      const len = this.s.piles[c.pile]!.length;
      const go = (pile: number | null) => {
        if (pile !== null)
          this.cursor = { pile, index: Math.max(0, this.s.piles[pile]!.length - 1) };
      };
      switch (action) {
        case 'left':
        case 'right':
          go(this.neighbour(c.pile, action));
          break;
        case 'up':
          if (isTab(c.pile) && c.index - 1 >= faceUpFrom(this.s, c.pile))
            this.cursor = { ...c, index: c.index - 1 };
          else go(this.neighbour(c.pile, 'up'));
          break;
        case 'down':
          if (isTab(c.pile) && c.index + 1 <= len - 1) this.cursor = { ...c, index: c.index + 1 };
          else go(this.neighbour(c.pile, 'down'));
          break;
        case 'pick':
        case 'send': {
          if (this.selected) {
            if (this.selected.pile === c.pile) this.selected = null;
            else return this.tryMove(this.selected.pile, this.selected.index, c.pile);
            break;
          }
          if (c.pile === STOCK) return this.stockAction();
          const m = action === 'send' ? tapMove(this.s, c.pile, c.index) : null;
          if (m) return this.doMove(m);
          if (this.pickable(c)) {
            this.selected = { ...c };
            this.tk.sfx.play('click');
          }
          break;
        }
        case 'draw':
          return this.stockAction();
        case 'undo':
          return this.undo();
        case 'hint':
          return this.showHint();
        case 'newClaim':
          return this.askNew();
        case 'mode':
          return this.toggleDraw();
      }
      this.render(true);
    }

    // ─── frame and drawing ───
    override update(_t: number, delta: number): void {
      if (!this.s) return;
      this.sceneMs += delta;
      if (this.phase === 'playing' && this.running) this.elapsed += delta;
      if (
        this.phase === 'dealing' &&
        this.dealEndsAt &&
        this.sceneMs >= this.dealEndsAt &&
        !this.tk.ui.open
      ) {
        this.dealEndsAt = 0;
        this.phase = 'ready';
        this.render(false);
      }
      const a = this.auto;
      if (a && this.sceneMs >= a.next) {
        const m = a.moves.shift()!;
        apply(this.s, m);
        if (m.type === 'move')
          this.tk.sfx.play('coin', { detuneCents: (rankOf(this.s.piles[m.to]!.at(-1)!) - 1) * 50 });
        a.next = this.sceneMs + a.step;
        this.render(true, false, 160);
        if (m.type === 'move') this.bankFx(m.to, 3);
        if (!a.moves.length) {
          this.auto = null;
          this.win();
        }
      }
      this.drawFx();
      const t = this.sceneMs;
      const calm = this.tk.motion.reduced;
      this.scenery.lanternGlow.setAlpha(
        calm ? 0.45 : 0.4 + 0.08 * Math.sin(t / 170) + 0.05 * Math.sin(t / 53),
      );
      if (!calm) this.scenery.lantern.setAngle(2.5 * Math.sin(t / 1100));
      this.hintG.setAlpha(calm ? 1 : 0.65 + 0.35 * Math.sin(t / 120));
      this.hud.timeText.setText(clock(this.elapsed));
    }

    /** HUD text that follows the table (called by render, so not every frame). */
    private syncHud(): void {
      const g = this.current;
      const mv = formatScore(g.moves, 'integer', this.tk.env.locale);
      if (this.hud.movesText.text !== mv) this.hud.movesText.setText(mv);
      const chip = strings.t('draw', { n: g.draw });
      if (this.hud.chipText.text !== chip) this.hud.chipText.setText(chip);
      this.stockMark.setText(
        this.s.piles[STOCK]!.length ? '' : this.s.piles[WASTE]!.length ? '↺' : '✕',
      );
    }

    /** Places every card; `stockOnly` keeps tableau cards where the deal put them. Face changes flip. */
    private render(animate: boolean, stockOnly = false, ms = 180): void {
      const s = this.s;
      const { w, h } = this.g;
      const reduced = this.tk.motion.reduced;
      if (animate && !reduced) kit.fps.burst(ms + 300);
      s.piles.forEach((pile, p) =>
        pile.forEach((id, i) => {
          const sp = this.sprites[id]!;
          const up = p !== STOCK && !(isTab(p) && i < s.faceDown[p - TAB0]!);
          const key = up ? `card${id}` : 'back';
          this.tweens.killTweensOf(sp);
          sp.setScale(this.cs);
          if (animate && !reduced && !stockOnly && sp.texture.key !== key) this.flip(sp, key);
          else if (sp.texture.key !== key) sp.setTexture(key);
          if (stockOnly && isTab(p)) return;
          const to = cardXY(this.g, s, p, i);
          if (this.selected && p === this.selected.pile && i >= this.selected.index) to.y -= 6;
          const depth = (p === STOCK ? 10 : p === WASTE ? 100 : isVault(p) ? 200 : 300) + i;
          if (sp.depth !== depth) sp.setDepth(depth);
          const [x, y] = [to.x + w / 2, to.y + h / 2];
          if (animate && !reduced && (sp.x !== x || sp.y !== y))
            this.tweens.add({ targets: sp, x, y, duration: ms, ease: 'Cubic.easeOut' });
          else sp.setPosition(x, y);
        }),
      );
      this.syncHud();
    }

    /**
     * Turns a card over: its width follows |cos| (so a face is never shown mirrored) and the texture swaps at the
     * edge-on midpoint. Any later render() kills this and sets the final texture and scale.
     */
    private flip(sp: Phaser.GameObjects.Image, key: string): void {
      const cs = this.cs;
      this.tweens.add({
        targets: sp,
        scaleX: cs,
        duration: 150,
        onUpdate: (tw) => {
          const p = tw.progress;
          if (p >= 0.5 && sp.texture.key !== key) sp.setTexture(key);
          sp.scaleX = cs * Math.abs(Math.cos(p * Math.PI));
        },
        onComplete: () => {
          sp.setTexture(key);
          sp.scaleX = cs;
        },
      });
    }

    /** Selection, legal targets, hint arrow and keyboard cursor; redrawn only when they change. */
    private drawFx(): void {
      const s = this.s;
      const { w, h } = this.g;
      const pick = this.live() ? (this.held ?? this.selected) : null;
      const hintOn = this.hintMove && this.sceneMs < this.hintUntil ? this.hintMove : null;
      const cur = this.cursorShown && !this.tk.attract && this.live() ? this.cursor : null;
      const sig = `${this.current.log.length}|${s.piles[STOCK]!.length}|${pick ? `${pick.pile},${pick.index},${this.held ? 1 : 0}` : ''}|${hintOn ? `${hintOn.from},${hintOn.to}` : ''}|${cur ? `${cur.pile},${cur.index}` : ''}`;
      if (sig === this.fxSig) return;
      this.fxSig = sig;
      const g = this.fx.clear();
      const ring = (x: number, y: number, rh: number, color: string, lw = 3) => {
        g.lineStyle(lw + 6, colorNum(color), 0.25).strokeRoundedRect(
          x - 6,
          y - 6,
          w + 12,
          rh + 12,
          14,
        );
        g.lineStyle(lw, colorNum(color), 1).strokeRoundedRect(x - 5, y - 5, w + 10, rh + 10, 13);
      };
      if (pick) {
        const from = cardXY(this.g, s, pick.pile, pick.index);
        const last = cardXY(this.g, s, pick.pile, s.piles[pick.pile]!.length - 1);
        if (!this.held) ring(from.x, from.y - 6, last.y - from.y + h, colors.gold, 4);
        const count = s.piles[pick.pile]!.length - pick.index;
        for (let p = 2; p < 13; p++) {
          if (p === pick.pile || !legal(s, { type: 'move', from: pick.pile, to: p, count }))
            continue;
          const at = s.piles[p]!.length
            ? cardXY(this.g, s, p, s.piles[p]!.length - 1)
            : this.g.slots[p]!;
          ring(at.x, at.y, h, colors.lime, 3);
          const [bx, by] = [at.x + w - 4, at.y + 4];
          g.fillStyle(colorNum('ink'), 1).fillCircle(bx, by + 2, 16);
          g.fillStyle(colorNum('green'), 1).fillCircle(bx, by, 15);
          g.lineStyle(4, colorNum('ink'), 1)
            .beginPath()
            .moveTo(bx - 7, by)
            .lineTo(bx - 2, by + 6)
            .lineTo(bx + 7, by - 6)
            .strokePath();
        }
      }
      const hg = this.hintG.clear();
      if (hintOn) {
        const a = centre(
          this.g,
          s,
          hintOn.from,
          hintOn.from === STOCK ? 0 : Math.max(0, s.piles[hintOn.from]!.length - 1),
        );
        const b = centre(this.g, s, hintOn.to, s.piles[hintOn.to]!.length);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const head = (len: number) =>
          [
            b.x,
            b.y,
            b.x - len * Math.cos(ang - 0.45),
            b.y - len * Math.sin(ang - 0.45),
            b.x - len * Math.cos(ang + 0.45),
            b.y - len * Math.sin(ang + 0.45),
          ] as const;
        hg.lineStyle(12, colorNum('ink'), 0.8).lineBetween(a.x, a.y, b.x, b.y);
        hg.fillStyle(colorNum('ink'), 0.8).fillTriangle(...head(30));
        hg.lineStyle(6, colorNum('sky'), 1).lineBetween(a.x, a.y, b.x, b.y);
        hg.fillStyle(colorNum('sky'), 1).fillTriangle(...head(24));
        hg.fillStyle(colorNum('sky'), 1).fillCircle(a.x, a.y, 8);
      }
      if (cur) {
        const n = s.piles[cur.pile]!.length;
        const index = Math.min(cur.index, Math.max(0, n - 1));
        const at = n ? cardXY(this.g, s, cur.pile, index) : this.g.slots[cur.pile]!;
        const rh = isTab(cur.pile) && n ? cardXY(this.g, s, cur.pile, n - 1).y - at.y + h : h;
        ring(at.x, at.y, rh, colors.yellow, 3);
        g.fillStyle(colorNum('yellow'), 1).fillTriangle(
          at.x + w / 2 - 9,
          at.y - 24,
          at.x + w / 2 + 9,
          at.y - 24,
          at.x + w / 2,
          at.y - 11,
        );
      }
    }
  }

  return [Table];
};
