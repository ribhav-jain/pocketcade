# Pocketcade design system

Pocketcade is "a whole arcade in your pocket": free, instant browser games with no ads and no tracking. The look is
a **night arcade with candy-bright lights**: deep indigo backdrops, glossy rounded shapes, warm sunset gradients and
cheerful cartoon characters. It should feel playful and energetic, never noisy, and every screen should look like it
came from the same studio.

Source of truth in code:

| What | Where |
|---|---|
| Colour, gradient, type, radius and motion tokens | `packages/toolkit/src/tokens.ts` (games), `apps/web/src/app/globals.css` `:root` (portal) |
| Canvas art helpers (candy tiles, glossy balls, stars, gradients, brand-font loading) | `packages/toolkit/src/art.ts` |
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

Rules:
- Primary buttons are sunset with **ink** text (AA). Never white text on the orange end.
- Game state never relies on colour alone: each accent still pairs with a shape (`SHAPES`), or with a number, icon or
  position.
- Each game owns one **accent** (see the table below) used for its card glow, page tint and HUD badges.

## Type

| Face | Use |
|---|---|
| **Fredoka** (variable 300–700, `FONT_DISPLAY`) | headings, buttons, numbers, all in-game text |
| **Nunito** (variable, `FONT_STACK`) | body copy, descriptions, help text |

Both are self-hosted via `@fontsource-variable/*` 5.3.0 (OFL). The Phaser adapter waits ≤ 800 ms for them before the
first frame so canvas text renders in the brand faces. Numbers in HUDs use Fredoka Bold with a dark outline or shadow.

## Shape, depth and motion

- Radii: 8 / 14 / 22 / pill. Cards and dialogs are 22–28 px; buttons 16 px; chips pill.
- "Candy" depth: a top-to-bottom gradient face, a darker 3–4 px lip underneath, a soft gloss band and a dark outline
  (`glossyRect`, `glossyCircle`). Buttons press down 3 px on `:active`.
- Shadows are deep indigo, never grey: `rgba(4,2,16,.5)`.
- Motion: 120 / 200 / 320 / 600 ms; ease-out for entrances, back-out for pops. Everything collapses under reduced
  motion (`tk.motion.reduced`, `prefers-reduced-motion`); the fx helpers already honour it.

## Game art direction

- **Style**: 2D cartoon, chunky silhouettes, thick dark outlines (`ink`-tinted, not black), glossy highlights, soft
  gradients. Characters have big expressive eyes and at least three expressions (idle, happy, hurt/sad).
- **Backdrops**: layered gradients with depth (glows, bokeh, parallax silhouettes), darker toward the edges so the play
  area pops. Use `backdrop()`; draw once per mount.
- **Feedback**: every scoring action gets a response within one frame: `burst()` particles, `popText()` for points,
  `bump()` on counters, `shake()`/`flash()` for hits. Big moments (level clear, new best) get confetti-sized bursts.
- **HUD**: `hudPill()` for score, timer, lives, level and moves, placed at the top edge; same pill style in every game.
- **Covers**: each game ships `media/cover.svg`, a square key-art illustration (viewBox `0 0 600 600`) showing the
  hero character in action on the game's backdrop, no text, ≤ 40 KB, self-contained (no external refs or fonts).
- **Originality**: no copyrighted characters or look-alikes.
- **DOM games**: inline SVG inside a game's shadow root must not paint with `url(#id)` (gradients, patterns). In
  Chromium a cached computed style keeps the referenced shadow root alive after unmount. Use solid fills plus
  highlight shapes, or a data-URI image (which may use gradients internally).

## The library

| Game | Was | Concept | Accent | Category |
|---|---|---|---|---|
| **Bao Bolt** | Bunaway | Bao, a plucky steamed bun in a red bandana, dashes across lantern-lit night-market rooftops, hopping steamer stacks and ducking signboards while Gulp the gull gives chase | orange `#FF9F1C` | Arcade |
| **Comet Crush** | Brickbat | Pilot the Skiff, a hover-ship paddle, and bounce a blazing comet through crystal asteroid walls in a neon nebula | sky `#38D6FF` | Arcade |
| **On the Dot** | | Tap as Pip, a bouncy neon spark, sweeps over the glowing stars on a synthwave orbit | pink `#FF4FA3` | Arcade |
| **Glowworm** | | Guide Wick, a little glowworm, through a dark crystal cave; gobble glowberries, grow longer, don't bite your tail | mint `#6CF5C2` | Arcade |
| **Sunset Sprint** | | Miso, a red panda in a lime-green convertible, races a winding coast road at sunset, beating the clock to each checkpoint arch | coral `#FF7A59` | Arcade |
| **Pebble Post** | | Pebble, a penguin mail courier in a red beanie, belly-slides down a three-lane ice canyon collecting letters (tall 9:16 frame) | red `#F2475E` | Arcade |
| **Sumslide** | | Slide glossy candy number tiles; equal numbers merge into their sum | purple `#C77DFF` | Puzzle |
| **Molehills** | | No-guess deduction in a sunny garden; find the sleeping moles without waking one | green `#2BD47D` | Puzzle |
| **Pentafall** | | Falling five-block jelly pieces in a neon well | violet `#7B5CFF` | Puzzle |
| **Pop Reef** | | Puff, a pufferfish on a coral reef, puffs bubbles at the ceiling; match three to pop, drop whole clusters | teal `#2DD4BF` | Puzzle |
| **Letterhop** | | Help Hop the frog leap a ladder of words, one letter at a time, across lily pads | lime `#B8F34A` | Word |
| **Rowdy** | | Four in a row against Rowdy, a cheeky retro robot with an LED face | blue `#5B8CFF` | Cards & Board |
| **Sourdough Solitaire** | Sourdough | Klondike patience at a gold-rush camp: bank every suit into the glowing vault | gold `#FFC83D` | Cards & Board |
| **Firefly Flip** | Flip & Follow | Match glowing firefly jars (Pairs) and repeat the lantern song (Follow) in a moonlit meadow | yellow `#FFE14D` | Brain |

New names need a trademark check before launch.

## Portal patterns

- **Header**: sticky, glassy; logo, search (combobox with live results), category pills, sound toggle.
- **Game card**: square cover, 22 px radius, title below; hover lifts 4 px, scales the art, glows in the game's accent and
  shows a round Play bubble; badges (New, Daily) top-left. Whole card is one link (≥ 44 px).
- **Rows**: horizontally scrolling rails with snap and arrow buttons on desktop; grids 2 / 3 / 4 / 5–6 columns at
  < 480 / 480–767 / 768–1023 / ≥ 1024 px.
- **Discovery without tracking**: "Top picks" and mood rows are editorial; "New" uses release dates; "Continue playing"
  and "Your most played" are computed on the device only and never leave it.
