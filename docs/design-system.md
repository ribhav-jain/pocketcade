# Pocketcade design system

Pocketcade is "a whole arcade in your pocket": free, instant browser games with no ads and no tracking. The look is
a **night arcade with candy-bright lights**: deep indigo backdrops, glossy rounded shapes, warm sunset gradients and
cheerful cartoon characters. It should feel playful and energetic, never noisy, and every screen should look like it
came from the same studio.

Source of truth in code:

| What | Where |
|---|---|
| Colour, gradient, type, spacing, radius and motion tokens | `packages/toolkit/src/tokens.ts` (games), the `:root` block of `apps/web/src/app/globals.css` (portal) |
| Canvas art helpers (glossy shapes, stars, gradients, brand-font loading) | `packages/toolkit/src/art.ts` |
| Phaser game-feel helpers (bursts, score pops, shake, flash, HUD pills, backdrops, crisp canvas textures) | `packages/toolkit/src/phaser/fx.ts` |
| In-game dialogs (how-to, pause, game over, toasts) | `packages/toolkit/src/ui/overlays.ts` |
| Portal components | `apps/web/src/components/` |

## Brand

- **Name**: Pocketcade. **Line**: "A whole arcade in your pocket."
- **Logo**: a rounded "pocket" badge (sunset gradient, stitched top edge) holding a gold star, next to the wordmark in
  Fredoka Bold. The star is the brand's recurring motif (ratings, bursts, favicons).
- **Voice**: short, warm, a little cheeky. "Play now", "One more go?", "New best!". No dark patterns, no nagging.

## Colour

Dark is the only theme: games are the light source.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#120C2C` | page and game backdrop base |
| `surface` | `#1D1546` | cards, panels |
| `raised` | `#2A1F60` | raised cards, dialogs |
| `line` | `#4A3D93` | borders |
| `text` / `textMuted` | `#FFF9F2` / `#C2B9EA` | copy (AA on every surface) |
| `paper` / `ink` | `#FFF6EA` / `#120C2C` | light fills; dark text and outlines on bright fills (the pair is AA) |
| `pink` | `#FF4FA3` | brand primary (with orange) |
| `orange` | `#FF9F1C` | brand primary, energy |
| `gold` / `yellow` | `#FFC83D` / `#FFE14D` | rewards, stars, scores |
| `sky` | `#38D6FF` | info, cool accents |
| `violet` / `purple` | `#7B5CFF` / `#C77DFF` | depth, magic |
| `lime` / `green` | `#B8F34A` / `#2BD47D` | success, nature |
| `blue` | `#5B8CFF` | secondary accent |
| `vermillion` | `#FF5A5F` | danger, damage |

Gradients (`gradients` token): **sunset** pink → orange (primary buttons, highlights), **aurora** sky → violet,
**candy** pink → purple, **meadow** lime → green, **gold** yellow → orange, **night** raised → bg (backdrops).

The portal mirrors these as CSS variables (`--bg`, `--surface`, `--raised`, `--line`, `--text`, `--text-muted`,
`--ink` and the accents) and adds a few of its own:

| Variable | Value | Use |
|---|---|---|
| `--bg-deep` | `#0B0720` | the deepest backdrop band |
| `--focus` | `#FFE14D` | focus rings |
| `--sunset` | `#FF62AD` → `#FF4FA3` → `#FF9F1C`, top to bottom | primary buttons |
| `--lip` | `#A8326B` | the pressed-down edge under primary buttons |
| `--glass`, `--glass-line` | white at 8 % and 12 % | glassy chips and borders |
| `--scrim` | `rgba(10, 6, 28, 0.78)` | behind dialogs |
| `--radius` | `22px` | cards |

Rules:
- Primary buttons are sunset with **ink** text (AA). Never white text on the orange end.
- Game state never relies on colour alone: each of the seven accents `orange`, `sky`, `green`, `yellow`, `blue`,
  `vermillion` and `purple` pairs with a shape in `SHAPES` (circle, square, triangle, diamond, star, cross, hexagon),
  or state is also shown by a number, icon or position. `pink`, `violet`, `lime` and `gold` are decoration only.
- Each game owns one **accent** (see the table below) used for its card glow, page tint and HUD badges.

## Type

| Face | Use |
|---|---|
| **Fredoka** (variable, `FONT_DISPLAY`) | headings, buttons, numbers, all in-game text |
| **Nunito** (variable, `FONT_STACK`) | body copy, descriptions, help text |

Both are self-hosted via `@fontsource-variable/*` 5.3.0 (SIL Open Font License). The Phaser adapter waits up to
800 ms for them before the first frame so canvas text renders in the brand faces. Numbers in HUDs use Fredoka Bold
with a dark outline or shadow.

| Token | Values |
|---|---|
| `typeScale` | xs 12, sm 14, md 16, lg 20, xl 28, display 44 (px or design units) |
| `space` | 0, 4, 8, 12, 16, 24, 32, 48 |
| `target` | touch targets at least 44, comfortably 48, with 8 between them |

## Shape, depth and motion

- Radii (`radius`): 8 / 14 / 22 / pill. Cards are 22 px, in-game dialogs 26 px, buttons 16 px, chips and badges pill.
- "Candy" depth: a top-to-bottom gradient face, a darker 3–4 px lip underneath, a soft gloss band and a dark outline
  (`glossyRect`, `glossyCircle`). Primary buttons press down 3 px on `:active`, other buttons 2 px.
- Shadows are deep indigo, never grey: `rgba(4, 2, 16, …)` at 45–80 % opacity.
- Motion (`motionMs`): 120 / 200 / 320 / 600 ms; ease-out for entrances, back-out for pops. Everything collapses under
  reduced motion (`tk.motion.reduced`, `prefers-reduced-motion`); the fx helpers already honour it.

## Game art direction

- **Style**: 2D cartoon, chunky silhouettes, thick dark outlines (`ink`-tinted, not black), glossy highlights, soft
  gradients. Characters have big expressive eyes and at least three expressions (idle, happy, hurt or sad).
- **Backdrops**: layered gradients with depth (glows, bokeh, parallax silhouettes), darker toward the edges so the play
  area pops. Use `backdrop()`; draw once per mount.
- **Feedback**: every scoring action gets a response within one frame: `burst()` particles, `popText()` for points,
  `bump()` on counters, `shake()`/`flash()` for hits. Big moments (level clear, new best) get confetti-sized bursts.
- **HUD**: `hudPill()` for score, timer, lives, level and moves, placed at the top edge; same pill style in every game.
- **Frames and crispness**: most games accept a range of frame shapes. Keep everything the player must see or touch in
  the fixed design area and let scenery fill the extra view on wide or tall screens. Draw textures with the toolkit's
  canvas helpers at the render scale so art stays sharp up to fullscreen; details are in
  [making-games.md](making-games.md#frames-that-fit-any-screen).
- **Covers**: each game ships `media/cover.svg`, a square key-art illustration (viewBox `0 0 600 600`) showing the
  hero character in action on the game's backdrop, no text, at most 40 KB, self-contained (no external references or
  fonts).
- **Originality**: no copyrighted characters or look-alikes.
- **DOM games**: inline SVG inside a game's shadow root must not paint with `url(#id)` (gradients, patterns). In
  Chromium a cached computed style keeps the referenced shadow root alive after unmount. Use solid fills plus
  highlight shapes, or a data-URI image (which may use gradients internally).

## The library

In the portal's editorial order. The accent is read from each game's `game.md`.

| Game | Concept | Accent | Category |
|---|---|---|---|
| **Pebble Post** | Pebble, a penguin mail courier in a red beanie, belly-slides down a three-lane ice canyon collecting letters | red `#F2475E` | Arcade |
| **Pop Reef** | Puff, a pufferfish on a coral reef, puffs bubbles at the ceiling; match three to pop, drop whole clusters | teal `#2DD4BF` | Puzzle |
| **Snugfit** | Drag fabric patches onto a quilt and stitch full rows and columns while Purl the cat naps | orchid `#E96BD6` | Puzzle |
| **Sumslide** | Slide glossy candy number tiles on a 4×4 tray; equal numbers merge into their sum | purple `#C77DFF` | Puzzle |
| **Sunset Sprint** | Miso, a red panda in a lime-green convertible, races a winding coast road at sunset to each checkpoint arch | coral `#FF7A59` | Arcade |
| **Bao Bolt** | Bao, a steamed bun in a red bandana, dashes across lantern-lit night-market rooftops while Gulp the gull gives chase | orange `#FF9F1C` | Arcade |
| **Sourdough Solitaire** | Klondike patience at a gold-rush camp: bank every suit into the glowing vault | gold `#FFC83D` | Cards & Board |
| **Pentafall** | Glossy five-block jelly pieces fall into a neon well; clear rows and land a Full Five | violet `#7B5CFF` | Puzzle |
| **Glowworm** | Guide Wick, a little glowworm, through a crystal cave; gobble glowberries, grow longer, don't bite your tail | mint `#6CF5C2` | Arcade |
| **Comet Bounce** | Pilot the Skiff, a hover-ship paddle, and bounce a blazing comet through crystal walls in a neon nebula | sky `#38D6FF` | Arcade |
| **Letterhop** | Help Hop the frog leap a daily ladder of words, one letter at a time, across moonlit lily pads | lime `#B8F34A` | Word |
| **Molehills** | No-guess deduction in a sunny garden; find the sleeping moles without waking one | green `#2BD47D` | Puzzle |
| **Rowbot** | Four in a row against a cheeky retro robot with an LED face that powers up every round you win | blue `#5B8CFF` | Cards & Board |
| **Starlap** | Tap as Pip, a bouncy neon spark, crosses each glowing star on a synthwave orbit | pink `#FF4FA3` | Arcade |
| **Firefly Flip** | Match glowing firefly jars and repeat the lantern song with Lumi in a moonlit meadow | yellow `#FFE14D` | Brain |

## Portal patterns

- **Header**: sticky and glassy; logo, category links, search (a combobox with live results) and the sound toggle.
- **Game card**: square cover with a 22 px radius, title below. On hover or focus the art lifts and tilts slightly,
  zooms, glows in the game's accent and shows a round Play bubble. A Daily badge sits top-left on daily games. The
  whole card is one link at least 44 px tall.
- **Rows**: horizontally scrolling rails with snap, and arrow buttons on pointer devices. Grids have 2 / 3 / 4 / 5
  columns at < 480 / 480–767 / 768–1023 / ≥ 1024 px (large-card grids stay at 4).
- **Player**: the frame is sized in CSS to the game's aspect range, with rounded corners and an accent glow from
  768 px up, and edge to edge on phones. A player bar below holds Full screen, sound, Restart and Leaderboard chips.
- **Discovery without tracking**: "Top picks" and the mood rows are editorial; "Continue playing" and "Your most
  played" are computed on the device only and never leave it.
