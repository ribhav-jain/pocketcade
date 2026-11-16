# Games

Pocketcade ships fifteen games. Each one is a package under `packages/games/<id>`. Its `game.md` holds the portal listing, `src/meta.ts` the platform metadata (inputs, frame shape, leaderboards), and the rules live in a pure module that unit tests drive directly. This page describes every game as it plays and how its code is laid out. See [Shared conventions](#shared-conventions) for what all games have in common.

| Game | Id | Category | Genre | Engine | Frame | Inputs | Leaderboards |
|---|---|---|---|---|---|---|---|
| [Pebble Post](#pebble-post) | `pebble-post` | Arcade | Endless ice-canyon runner | Phaser | 9:16 to 16:9 | Keyboard, pointer, touch | Best score |
| [Pop Reef](#pop-reef) | `pop-reef` | Puzzle | Bubble-shooter levels | Phaser | 9:16 to 16:9 | Pointer, touch, keyboard | Best score |
| [Snugfit](#snugfit) | `snugfit` | Puzzle | Quilt block-fitting puzzle | Phaser | 9:16 to 16:9 | Pointer, touch, keyboard | Best score |
| [Sumslide](#sumslide) | `sumslide` | Puzzle | Sliding number-merge puzzle | Phaser | 9:16 to 16:9 | Keyboard, pointer, touch | Best score, Best tile |
| [Sunset Sprint](#sunset-sprint) | `sunset-sprint` | Arcade | Checkpoint traffic racer | Phaser | 3:4 to 16:9 | Keyboard, pointer, touch | Best distance |
| [Bao Bolt](#bao-bolt) | `bao-bolt` | Arcade | Endless rooftop runner | Phaser | 3:4 to 2:1 | Keyboard, pointer, touch | Best score |
| [Sourdough Solitaire](#sourdough-solitaire) | `sourdough` | Cards and board | Klondike solitaire | Phaser | 9:16 to 16:9 | Pointer, touch, keyboard | Fastest win, Total wins |
| [Pentafall](#pentafall) | `pentafall` | Puzzle | Falling-pentomino puzzle | Phaser | 9:16 to 16:9 | Keyboard, touch | Best score, Most lines |
| [Glowworm](#glowworm) | `glowworm` | Arcade | Grow-and-dodge cave arcade | Phaser | 3:4 to 16:9 | Keyboard, pointer, touch | Best score |
| [Comet Bounce](#comet-bounce) | `comet-bounce` | Arcade | Brick-breaker arcade levels | Phaser | 9:16 to 16:9 | Pointer, touch, keyboard | Best score |
| [Letterhop](#letterhop) | `letterhop` | Word | Daily word ladder | DOM | Fills the frame | Keyboard, pointer, touch | Fewest hops (daily), Daily streak |
| [Molehills](#molehills) | `molehills` | Puzzle | Number-deduction puzzle | Phaser | 9:16 to 16:9 | Pointer, touch, keyboard | Best time for each of Garden, Field and Meadow |
| [Rowbot](#rowbot) | `rowbot` | Cards and board | Four-in-a-row versus robot | Phaser | 9:16 to 16:9 | Pointer, touch, keyboard | Best win streak |
| [Starlap](#starlap) | `starlap` | Arcade | One-button timing game | Phaser | 9:16 to 16:9 | Keyboard, pointer, touch | Best score |
| [Firefly Flip](#firefly-flip) | `firefly-flip` | Brain | Memory pairs and patterns | Phaser | 9:16 to 16:9 | Pointer, touch, keyboard | Fewest moves (Pairs 6 by 6), Longest pattern (Follow) |

A frame such as "9:16 to 16:9" is the range of aspect ratios the game accepts, from a tall phone held upright to a wide desktop window. "Fills the frame" means the game lays itself out in whatever space it gets.


## Pebble Post

Pebble, a penguin mail courier in a red beanie, belly-slides down an endless winding ice canyon with a satchel of letters. She slides forward on her own; the player changes lane, hops and tucks to get past obstacles, collects letters and goes as far as possible.

**Rules**

- Three lanes. Pebble moves forward automatically. Speed eases from 18 m/s to 30 m/s over the first 3,200 m (about 2 minutes 15 seconds) and then holds.
- A lane change takes 0.16 s and moves one lane. A hop lasts 0.62 s and rises 1.5 m. A tuck lasts 0.6 s; tucking in the air drops Pebble fast and she tucks on landing. One early input is held for up to 0.18 s, so a swipe just before a slide ends still counts.
- Obstacles come in rows. Low ones (snow drift, fallen log) are hopped over, high ones (icicle arch, mail banner) are tucked under, and full ones (ice pillar, parked mail sled) fill the lane. The course generator always leaves a passable lane in every row and spaces rows so the moves needed fit in the time available. Rows get busier and closer over the first 4,000 m.
- A hit starts a one second tumble and ends the run. Distance never goes down when Pebble is knocked back.
- Score is 1 point per metre, 5 per letter, and 10 for each obstacle hopped over, tucked under, or left with a last-moment lane change (a close call is a lane change begun under 0.3 s before the obstacle).
- Power-ups, one held at a time: the scarf absorbs one hit, shatters the obstacle and gives one second of safety (it wears off after 20 s); the mail bell pulls in letters ahead from every lane and height for 8 s. The first power-up appears after 420 m, then one every 800 to 1,200 m.
- The scenery changes every 600 m, cycling Snowy Canyon, Aurora Night and Crystal Cave.

**Controls**

| Input | Lane | Hop | Tuck | Pause |
|---|---|---|---|---|
| Keyboard | Left and right arrows, A and D | Up arrow, W, Space | Down arrow, S | Escape, P |
| Pointer | Drag left or right | Drag up | Drag down | Pause button |
| Touch | Swipe left or right | Swipe up | Swipe down | Pause button |

**Look and feel**

A chase view from behind and above Pebble, drawn as a pseudo-3D road with gentle bends and hills that are the same every run. The three zones change the ice, banks, sky, fog and scenery: pines and huts in the daytime canyon, lanterns and igloos under the aurora, pink and blue crystals in the cave. The sky blends from one zone to the next across each boundary. Letters, power-ups and obstacle types carry distinct shapes, not just colours.

**Code map**

- `src/sim.ts`: the run, the seeded course generator and its passability guarantee, speed ramp, moves, collisions, bonuses and power-ups.
- `src/track.ts` and `src/road.ts`: bends, hills, scenery props and the projection onto the screen.
- `src/scene.ts`: key and swipe mapping, 60 Hz stepping, HUD and effects. `src/art.ts` draws the character, obstacles and zone palettes.
- `src/attract.ts`: an autopilot that plays through the same inputs.
- `test/sim.test.ts` covers speed, moves and the input buffer, obstacles, bonuses, power-ups, the course guarantee at several speeds, zones, the autopilot and the save guards.

**Saves and boards**

Stats only: best score, finished runs, best distance and total letters delivered. There is no mid-run save. Leaderboard: Best score.

## Pop Reef

Puff, a pufferfish at the bottom of a coral reef, puffs bubbles up at a hex-packed ceiling of bubbles. The goal of each level is to pop every coloured bubble (or, on rescue levels, free every trapped fish) before the reef sinks to the danger line.

**Rules**

- The play field is 10 bubbles wide. Aim between 12 and 168 degrees; shots bounce off the side walls and an aim guide shows the path, including its wall bounces, to where the bubble will land.
- A shot sticks where it touches. Three or more connected bubbles of one colour pop. Bubbles no longer connected to the top row drop.
- Special bubbles: stones never pop (they fall only when nothing holds them up); an urchin bursts when a bubble lands or pops beside it and clears two rings around it, which can chain; a rainbow bubble pops every colour group it touches; fish ride inside coloured bubbles.
- Popping on shots in a row builds a multiplier up to times 5. Every fourth popping shot in a row loads a rainbow bubble as the next bubble.
- Shots that pop nothing count up; after 6 (5 in the later zones) the ceiling pushes down one row and a new row enters at the top.
- The level is lost when a bubble settles in row 13 of the field, past the dashed danger line. Losing replays the level with the run score reset.
- Score: 10 per popped bubble, 20 per dropped bubble, times the multiplier; 100 per freed fish; 10 for each bubble left when the level is won; 500 per star. Stars: three for a clear within par shots (set per level), two within 40 percent more, otherwise one.
- Levels: four zones of ten hand-built boards, then endless generated boards that repeat the zones. Zone 1, Sunlit Shallows, teaches matching, drops, rainbows and stones with 3 to 4 colours (level 6 brings stones). Zone 2, Kelp Forest, adds fish (level 11) and a fifth colour. Zone 3, Coral Garden, adds urchins (level 21) and a faster sink. Zone 4, Twilight Trench, brings a sixth colour and everything together. Generated levels use six colours with random shapes, stones, urchins and fish.

**Controls**

| Input | Aim | Puff | Swap with next bubble |
|---|---|---|---|
| Keyboard | Left and right arrows (turn faster the longer held) | Space, Up arrow, Enter | X, Shift |
| Pointer | Move the mouse | Click | Click the next bubble |
| Touch | Drag | Let go | Tap the next bubble |

After a level, the card takes Space for the next level and R to replay. Pause is Escape or P, or the pause button.

**Look and feel**

A sunlit coral reef whose backdrop is re-tinted for each zone. Bubbles are glossy and each colour has its own shape mark, so colour is never the only signal. Stones are grey boulders, urchins plum spiked balls, fish glimpsed inside their bubbles. Pops chain outward with rising notes, drops tumble, and Puff changes face as things go well or badly.

**Code map**

- `src/sim.ts`: board geometry, flight and bounces, snapping, matching, floating checks, urchin chains, pushes, scoring and stars.
- `src/levels.ts`: the 40 authored boards, the endless generator, zones and first-time tips.
- `src/scene.ts`: input, drawing, HUD, effects and cards. `src/art.ts`: bubbles, Puff and zone backdrops.
- `src/attract.ts`: an AI that tries 60 aims through the sim and plays the best.
- `test/sim.test.ts` covers geometry, aiming, bounces, matching, drops, stones, urchins, rainbows, win and loss, stars, pushes, level building and the save.

**Saves and boards**

Stars and best score for each cleared level, plus the best run score; Continue starts at the first uncleared level. Leaderboard: Best score (the run score).

## Snugfit

Purl, a dozing orange cat, keeps a quilt-maker company. The player sews fabric patches onto an 8 by 8 quilt, stitching whole rows and columns away to make room. There is no timer: the game ends when no waiting patch fits.

**Rules**

- The quilt is 8 by 8 squares. A tray holds three patches at a time, each one of 35 fixed shapes (1 to 9 squares). Patches cannot be rotated. Six fabrics, each with its own pattern as well as colour.
- Place a patch anywhere it fits. A row or column that becomes full is stitched up and cleared. A patch that completes a row and a column clears both.
- When the third patch is placed, three new ones are dealt. A new hand always contains at least one patch that fits. A crowded quilt is dealt smaller patches; the deal brings in more large ones as the score climbs toward 6,000.
- Score: 1 point per square placed; stitched lines score 10, 30, 60, 100 for 1 to 4 lines at once; placing on patches in a row that each stitch a line multiplies the line points up to times 8; emptying the quilt adds 300.
- The game ends when none of the waiting patches fits anywhere.

**Controls**

| Input | Choose a patch | Place it | Pause |
|---|---|---|---|
| Keyboard | 1, 2, 3 or Tab | Arrow keys or W A S D to move, Enter or Space to sew | Escape |
| Pointer | Click a patch | Drag onto the quilt, or click the quilt | Pause button |
| Touch | Tap a patch | Drag onto the quilt, or tap the quilt | Pause button |

**Look and feel**

A sewing table seen from above with the quilt, a tray of patches, yarn, buttons and Purl. The room's light moves with the score: morning, afternoon sun from 300, golden hour from 1,000 and lamplight from 2,500, announced with a short toast. Patches use gingham, dots, stripes, zigzag and cross patterns so colour is never the only signal. A needle and thread zip along a line as it clears. The layout stacks on tall frames and puts the quilt between score and tray on wide ones.

**Code map**

- `src/logic.ts`: shapes, fit test, placing, line clears, scoring, the weighted deal, game-over test and the greedy demo move.
- `src/layout.ts`: tall and wide layouts and the quilt, tray and Purl placement.
- `src/scene.ts`: drag, tap and keyboard input, drawing, saves and sound. `src/art.ts`: patches, quilt, Purl and the room's light phases.
- `src/attract.ts`: the self-playing demo from a half-sewn quilt.
- `test/logic.test.ts` covers fits, line clears, scoring, dealing, game over and whole greedy games. `test/layout.test.ts` checks the layouts, patch patterns and light phases. `test/save.test.ts` covers the save guards.

**Saves and boards**

The run in progress is saved after every placement (board, hand, score, streak and the random state), so a quilt can be picked up later. A profile stores the best score. Leaderboard: Best score.

## Sumslide

A sliding-tile number puzzle on a 4 by 4 tray. Every move slides all tiles; equal tiles merge into the next doubling. The player works toward a ladder of goal tiles while a rainbow Echo tile occasionally helps.

**Rules**

- Two equal tiles that collide merge into one of double the value (5, 10, 20, 40 and on). Each merge scores the new tile's value. After a move that shifts something, one new tile appears: a 5, or a 10 with 10 percent chance (15 percent once the run's biggest tile reaches level 7, 20 percent from level 9).
- Goals: the first goal tile is 80, then each goal doubles (26 goals in all). Reaching a goal pays its value again as a bonus, adds one Undo and moves the backdrop on. A bar under the goal shows how much of its value is on the tray.
- Echo: every 40 moves a rainbow Echo tile arrives. It merges with any number tile and doubles it. The 40-move meter waits while an Echo is on the tray.
- Undo: one at the start, plus one per goal. It takes back the last move only; undoing a goal move also removes the Undo it earned.
- The game ends when the tray is full, no neighbours match and there is no Echo.

**Controls**

| Input | Slide | Undo | Pause |
|---|---|---|---|
| Keyboard | Arrow keys or W A S D | Z or Ctrl+Z | Escape |
| Pointer | Drag in a direction, or click near an edge of the tray | Undo button | Pause button |
| Touch | Swipe, or tap near an edge of the tray | Undo button | Pause button |

**Look and feel**

Glossy candy tiles climb a colour ladder, with a glyph on each tier so value is never colour-only, ending in molten-gold tiles from 5,120. The Echo is a rainbow ring marked x2. The tray is dark glass with sixteen slots; the backdrop is a calm gradient that changes through six themes as goals are reached. Merges pop and show their value, and a goal brings a celebration. Effects are skipped under reduced motion.

**Code map**

- `src/logic.ts`: sliding and merging, scoring, goals, Echo charge, spawning, undo rules, game-over test and the demo policy.
- `src/layout.ts`: tray, HUD and Undo placement. `src/scene.ts`: input, animation, HUD and saves. `src/art.ts`: tile ladder, themes, tray.
- `src/attract.ts`: a demo player that looks one move ahead.
- `test/logic.test.ts` covers slides, merge tracks, scoring and goal bonuses, spawning, replay from a seed, the Echo schedule, undo cost, game over, labels, the demo and save guards; `test/layout.test.ts` covers the layout.

**Saves and boards**

The run is saved after every move, including the undo snapshot. Leaderboards: Best score and Best tile.

## Sunset Sprint

Miso, a red panda in a lime-green convertible, races a winding coast road at sunset. The car accelerates on its own; the player steers through traffic and beats a shrinking clock to each checkpoint arch. The goal is distance.

**Rules**

- The run starts with a short countdown (3, 2, 1, Go) and 45 seconds on the clock. The car accelerates to a top speed of 64 m/s (about 230 km/h); only steering and braking are the player's.
- Reaching a checkpoint arch adds time: 30 s for the first, 27 s for the second, then 24, 21, 18, and never less than 15. The first arch stands 1,900 m past the start and the rest every 1,500 m.
- When the clock reaches zero the car rolls to a stop and the run ends. An arch reached while rolling still counts and restarts the race.
- Traffic is seeded per run: up to 14 cars in three lanes at 22 to 40 m/s, which follow slower cars, change lanes and never wall off the whole road. Traffic gets denser by up to 30 percent over the first five stages.
- A crash cuts speed to 30 percent, makes the car wobble without steering for 0.6 s and gives 1.5 s of safety. Driving off the road (past the edge of the tarmac, onto sand, rock or kerb) caps speed at 22 m/s. Curves push the car outward in proportion to speed squared.
- Passing a car without touching it counts as an overtake; a pass within about half a lane shows "Close one!". Overtakes appear on the game-over card. The score is the distance driven in metres from the start line.
- The road is a fixed, seeded track, the same every run. The scenery cycles Coast Road, Red Canyon and Night City, changing at every second checkpoint.

**Controls**

| Input | Steer | Brake | Pause |
|---|---|---|---|
| Keyboard | Left and right arrows, A and D | Down arrow, S | Escape, P |
| Pointer | Hold the left or right half of the game | Hold both halves, or the bottom middle | Pause button |
| Touch | Hold the left or right half of the screen | Hold both halves, or the bottom middle | Pause button |

**Look and feel**

A pseudo-3D road with bends and hills seen from behind and above the car, with parallax scenery: palms, sea and headlands on the Coast Road, red rock on the Red Canyon, and streetlights and neon on the Night City. The scenery turns into the next stage as the arch between them comes up, and a stage banner announces it. A warning shows in the last five seconds.

**Code map**

- `src/sim.ts`: the race: speed, steering, curve push, off-road slowdown, traffic, crashes, overtakes, checkpoints and the clock.
- `src/track.ts`: the fixed track, checkpoint spacing, stage themes and the projection. `src/road.ts`: drawing the road and roadside props.
- `src/scene.ts`: key and held-pointer input, HUD, stage banners. `src/art.ts`: Miso, the car, traffic and arches.
- `src/attract.ts`: a demo driver that uses the same inputs.
- `test/sim.test.ts` covers the track, countdown, speed and steering, curve push, off-road, traffic behaviour, crashes, overtakes, checkpoints, the stop, determinism and the save guards.

**Saves and boards**

Stats only: best distance, finished runs and best stage reached. No mid-run save. Leaderboard: Best distance.

## Bao Bolt

Bao is a steamed bun in a red bandana who runs endlessly across the rooftops of a night market, jumping and sliding past obstacles and collecting sesame coins. Gulp, a gull in a napkin bib, waits for a second mistake.

**Rules**

- Bao runs on his own. Speed rises from 6 to 14 world units a second over the first three minutes. Jump to clear crabs (which scuttle toward Bao) and steamer stacks; hold to jump higher (80 to 280 ms of hold). Slide under hanging shop signs. Pressing slide in the air drops Bao fast and starts a slide on landing. A jump pressed just before landing is buffered.
- Obstacles come in hand-written chunks, each timed in seconds so it plays the same at any speed. A chunk is picked by the current difficulty tier, avoids recent repeats, and a coin-only breather comes every 4 to 6 chunks and at the start of each district.
- The first hit is a stumble: Bao slows to 60 percent for 0.8 s, recovers over 0.5 s, is safe for 1.5 s, and loses his coin streak and multiplier. Gulp then stays for 8 s; every coin grabbed sends him off 0.2 s sooner. A hit while Gulp is near ends the run.
- Score is 1 point per metre times the multiplier. Every 10 coins in a row add 1 to the multiplier, up to times 5. A missed coin does not break the row; a stumble does.
- Districts, in order: Dumpling Alley (from 0 m), Neon Row (250 m), Crane Harbour (600 m) and Temple Gardens (1,000 m). Difficulty steps up with each district and once more at 1,500 m, after which the four districts repeat in 500 m stretches. Steamer stacks first appear in the second district.

**Controls**

| Input | Jump | Slide | Pause |
|---|---|---|---|
| Keyboard | Space, Up arrow, W (hold for higher) | Down arrow, S | Escape, P |
| Pointer | Left-click (hold for higher) | Right-click | Pause button |
| Touch | Tap (hold for higher) | Swipe down | Pause button |

**Look and feel**

Bao is a cream steamed bun with a swirl on top and a polka-dot bandana, drawn a little larger than his hitbox so hits feel fair. Gulp is a gull in a napkin bib who chomps when he catches Bao. Rooftops scroll in three parallax layers. Each district is a theme: Dumpling Alley is a moonlit market with embers, Neon Row has rain, Crane Harbour a low sun and birds, and Temple Gardens a sun and drifting petals. A "Gulp is close!" pill shows while the gull is near. The game-over card waits briefly so the catch can be seen.

**Code map**

- `src/sim.ts`: the run: movement, jump hold, slide, chunks, collisions, coins, multiplier, Gulp and districts.
- `src/tuning.ts`: every constant, the route and the difficulty tiers. `src/chunks.ts`: the hand-written obstacle chunks and breathers.
- `src/themes.ts`: district data (sky, skyline, roof, lights, ambient effects). `src/art.ts`: Bao, Gulp, obstacles. `src/scene.ts`: input, HUD, banners.
- `src/attract.ts`: a scripted demo that includes a stumble and a catch.
- `test/sim.test.ts` covers jump height by hold, the slide hitbox, stumble and eaten, chunk availability by tier, hitbox sizes and the save.

**Saves and boards**

Lifetime stats (runs, best points, best metres, best multiplier, total metres and coins). No mid-run save. Leaderboard: Best score (the run's points).

## Sourdough Solitaire

Klondike patience at a lantern-lit gold-rush camp. A deal is called a claim; the four foundation piles are vaults. The goal is to bank all 52 cards in the vaults, each suit from Ace to King.

**Rules**

- Standard Klondike: seven tableau columns dealt 1 to 7 cards with the top card up (28 cards), a deck of 24, a waste pile and four vaults.
- Columns build down in alternating colours; only a King (or a run starting with a King) goes on an empty column. Runs move whole. Vaults take an Ace, then the same suit in order.
- Two draw modes: Draw 1 or Draw 3 (only the top of the three is playable). The deck can be recycled without limit. Switching mode takes effect at once on an untouched deal and from the next claim otherwise.
- Claims are shuffled from a random 16-digit hex code, so some deals cannot be won. Undo is unlimited. Hint points at a useful move or the deck, or says nothing useful is left.
- Once no tableau card is face down, the game banks everything automatically.
- There is no score. A win records time and moves for that mode and counts toward a win streak. Abandoning a counted, unfinished claim resets that mode's streak. The win card offers Replay this claim or a switch to the other draw mode.

**Controls**

| Input | Draw | Move cards | Send to best spot | Other |
|---|---|---|---|---|
| Keyboard | D, or Space on the deck | Arrows to move the cursor, Space to pick up and place | Enter | U or Ctrl+Z undo, H hint, N new claim, M switch draw mode, Esc or P pause |
| Pointer | Click the deck | Drag | Click a card | Undo, Hint, New and Pause buttons; click the Draw chip to switch mode |
| Touch | Tap the deck | Drag | Tap a card | Undo, Hint, New and Pause buttons; tap the Draw chip to switch mode |

Pressing New asks for a second press within three seconds to confirm once a move has been made.

**Look and feel**

A felt table in lantern light with a wooden rail. Cards have custom suit shapes, big two-corner indices, ace medallions and original court portraits (a prospector, a lantern keeper and a young miner), on a navy-and-gold back with a pickaxe-and-gold-pan emblem. Red suits are red. Cards flip, lift with a shadow when dragged and burst into nuggets when they reach a vault, and a win rains gold nuggets. The table lays out again for the frame: side columns when wide, longer columns when tall.

**Code map**

- `src/klondike.ts`: the pure rules: deal, legal moves, move tokens, tap-to-move, hints, the deck check, the auto-finish and replay of a move log.
- `src/layout.ts`: table layout for each frame. `src/cards.ts`: card faces and backs. `src/scene.ts`: input, HUD, timer, dealing and saves. `src/art.ts`: table art.
- `src/attract.ts`: taps the hint's source card, else the deck, on a fixed claim.
- `test/rules.test.ts` covers the deal, moves, flips, Draw 3 and recycling, move tokens and replay, tap-to-move, hints, auto-finish, saves, stats and the attract clip.

**Saves and boards**

The claim in progress is saved as its deal plus a move log (validated by replaying it), with elapsed time, moves, undos and hints. Stats are kept per draw mode (played, won, best time, best moves, streak, best streak) and the draw preference is remembered. Leaderboards: Fastest win (time, lowest first) and Total wins.

## Pentafall

A falling-block puzzle played with eighteen five-block jelly pieces in a twelve-wide neon well. Clear rows, level up for faster falls and new shapes, and aim for a Full Five by clearing five rows with a single bar.

**Rules**

- The well is 12 cells wide and 18 rows tall, with three hidden rows above a dashed crest. A piece that settles above the crest ends the run, as does a new piece that has no room to enter.
- There are 18 one-sided pentominoes in eight families (bar, hook, step, block, branch, bolt, kite and a family of T, U, V, W and X shapes), each with its own mark. Pieces come in shuffled loads in which every unlocked shape appears once, with two bars in each load, so none is ever far away. A piece never comes twice in a row, and the first pieces are kept simple.
- Fill all 12 cells of a row to clear it. Rows above fall down.
- Every 10 lines make a level, up to level 20. A piece falls one row every 1,000 ms at level 1, speeding up by about 14 percent a level to 57 ms at level 20. Shapes unlock at level 1, 4, 7 and 10, adding more complex shapes.
- A piece that rests on the pile settles after about half a second (shorter at levels 10 and 15); moving or turning it restarts the wait a limited number of times.
- Turns pivot about the piece's centre and nudge the piece off walls and the floor where they can. Stash swaps the falling piece with the stash slot, or with the next piece when the slot is empty, once per piece. A queue of three next pieces is shown.
- Scoring: clearing 1 to 5 rows scores 100, 250, 450, 750 or 1,500, times the level. Clearing rows with consecutive pieces raises the streak multiplier by a quarter per piece, up to double. Emptying the well adds 2,000 times the level. Fast drops score 1 per row and a drop-now scores 2 per row.

**Controls**

| Input | Move | Turn | Drop faster | Drop now | Stash |
|---|---|---|---|---|---|
| Keyboard | Left and right arrows, A and D | Up, W or X turn right; Z or Q turn left | Down arrow, S | Space | C or Shift |
| Touch | Drag sideways | Tap turns right; Turn left button | Drag down | Flick down, or Drop button | Swipe up, or Stash button |

Pause is Escape or P on the keyboard and the pause button on touch. Pentafall has no pointer input.

**Look and feel**

Glossy jelly cells, each family with its own shape mark (hollow for mirrored pieces) so shape never depends on colour, in a neon well with a grid, over a night city with a level tube. A dotted ghost shows where the piece will land. Line clears flash and crumble; a Full Five and a clean sweep show banners with confetti. When the well fills the pile turns to stone from the bottom up.

**Code map**

- `src/sim.ts`: the well, the fixed 60 Hz run, turns with nudges, stash, locking, clearing, scoring, levels and the piece dealer.
- `src/pieces.ts`: the 18 shapes, their families and tiers. `src/layout.ts`: sizing the well for any frame. `src/draw.ts`: cell art.
- `src/scene.ts`: keys, touch gestures, drawing and saves. `src/ai.ts`: the demo player, which scores every orientation in every column.
- `test/rules.test.ts` covers shapes and turns, entry, the piece dealer over 10,000 draws, tier unlocks, fall speed, settling, key repeat, scoring vectors, a Full Five, stash, saves, layout and the attract clip.

**Saves and boards**

The run in progress is saved each time a piece settles (board, queue, stash, score and the piece dealer's state). Lifetime stats: runs, lines, Full Fives, clean sweeps and best level. Leaderboards: Best score and Most lines.

## Glowworm

Wick, a mint-green glowworm with glowing antennae, grows by eating glowberries in a 17 by 17 crystal cave. Eating enough berries lights the cave and sends Wick on to the next one, with a new layout. The run ends when Wick hits a wall, a crystal or its own tail.

**Rules**

- Wick moves one cell per tick and turns with up to two queued turns; reversing is ignored. A run starts on the first direction. The tick starts at 150 ms and eases toward 90 ms with every berry eaten.
- A berry is worth 10 points. Eating the next within 24 ticks builds a combo: each berry in the row adds 5, up to a total of 30.
- After the fourth plain berry in a cave a golden star berry appears for 6 s, worth 50 points. It does not count toward the quota.
- Eating 8 plain berries clears the cave (+50 points). After a pause, Wick starts again at the left of the next cave at its full length, with a new layout and palette.
- Caves cycle through eight layouts (open, four pillars, corner brackets with tunnels, two bars, six columns, a crystal field, an S of walls, a split cave) and five palettes (Amethyst Hollow, Lagoon Grotto, Ember Vault, Sapphire Deep and Sunstone Hall). Some caves wrap every edge, some only through glowing tunnels, some are walled. Layouts never block Wick's start and keep every region reachable.
- Filling every free cell wins the run.

**Controls**

| Input | Steer | Pause |
|---|---|---|
| Keyboard | Arrow keys or WASD | Escape, P |
| Pointer | Drag, or click beside Wick to turn that way | Pause button |
| Touch | Swipe, or tap beside Wick to turn that way | Pause button |

**Look and feel**

A dark cave of glowing crystals with a different palette for each cave. Wick's body glows and dims toward its tail; the head has antennae and a face that opens its mouth near a berry. The golden berry is a star in a ring that empties as it fades. Each cave shows its name and a one-line edge rule. The board is square and the scenery fills the frame around it.

**Code map**

- `src/sim.ts`: the cave grid, layouts, wrapping, movement, combos, golden berry, caves and the win test.
- `src/scene.ts`: input (keys, drag, swipe, tap beside the head), drawing and HUD. `src/art.ts`: Wick, berries, crystals and palettes.
- `src/attract.ts`: an autopilot that follows the shortest path to a berry when it leaves enough room.
- `test/sim.test.ts` covers movement, wrapping, walls and crystals, turn queueing, tap-to-turn, eating and speed, tail bites, combos, the golden berry, cave clears, the win, layout soundness, determinism and the save.

**Saves and boards**

Stats only: best score, runs played, longest Wick and deepest cave. No mid-run save. Leaderboard: Best score.

## Comet Bounce

The Skiff, a white hover-ship with a small pilot, bounces a blazing comet into walls of crystals adrift in a nebula. There are 20 hand-built walls in four zones of five. The goal is to shatter every breakable crystal on each wall without losing all three ships.

**Rules**

- Each wall is a 14 by 12 grid. Ember, frost and prism crystals take 1, 2 and 3 hits. Alloy plates never break. Plasma mines blow up every mine touching them in a chain. Pod crystals break into falling pods.
- The comet leaves the Skiff at an angle set by where it hits: mid-ship goes straight up, a wing tip about 60 degrees to the side, plus a little spin from the Skiff's movement. Comets never fly flatter than 22 degrees. A comet that hits nothing for six seconds gets a small random turn.
- Comet speed starts at 400 units a second on wall 1, rising by 10 each wall, and speeds up within a wall as it is cleared, to a cap of 780. The Skiff is 120 units wide on walls 1 to 7, 112 on 8 to 14 and 104 on 15 to 20.
- Pods fall and must be caught with the Skiff. Wingspan widens the Skiff by half for 15 s. Scatter splits the comet into three. Stasis slows every comet to 70 percent for 10 s.
- A comet lost below the Skiff is a lost ship only when it is the last one in play. There are three ships. Clearing the last wall of a zone of five repairs one lost ship. Losing all three ends the run.
- Scoring: crystals 50, 100 or 150 points by type, mines 60, pods 50, each multiplied by a streak that grows with each break since the comet last touched the Skiff (times 1 to times 4 from 4, 8 and 12). A hit that cracks without breaking is 10. Catching a pod is 100 (250 for a Scatter pod when the comet is already split into three). Clearing a wall pays 1,000, a speed bonus of 10 points per second under par (30 s plus one per hit point), and 500 for a flawless wall with no ship lost. Clearing all 20 walls pays 2,000 per remaining ship.
- After the last ship, the player can start over from wall 1 or continue from the first wall of the zone they reached, with a fresh score.

**Controls**

| Input | Steer | Launch | Pause |
|---|---|---|---|
| Keyboard | Left and right arrows, A and D (hold Shift to fine-tune) | Space, Enter, Up arrow, W | Escape, P |
| Pointer | Move the mouse | Click | Pause button |
| Touch | Drag anywhere | Tap | Pause button |

**Look and feel**

A neon nebula. The Skiff has a pilot who changes mood, thrusters, and wings that slide out for Wingspan. Crystals are hex-cut with their hit points shown by facet cut, pip shape and cracks, so colour is never the only signal. Alloy plates are riveted, mines carry fuses and pods are glass capsules. Each zone has its own cloud tint and ringed planet: violet drift, blue reach, ember veil and aurora. Walls open with a title card and warp in, and a cleared wall ends with fireworks and a bonus panel. On a tall frame the Skiff's line moves down toward the player's thumb while the crystals stay at the top.

**Code map**

- `src/sim.ts`: the run at a fixed step with four sub-steps per frame: Skiff, comet, collisions, pods, fuses, lives and scoring.
- `src/levels.ts`: the 20 walls, hit points, par, speed and Skiff width by wall, and zones. `src/scene.ts`: input, drawing, effects and cards. `src/art.ts`: ship, crystals, nebula zones.
- `src/attract.ts`: a demo that plays with three comets from the start.
- `test/sim.test.ts` covers wall data, sealed-off crystals, when each element first appears, multiplier bands, launch angles, mine chains, losing ships, wall clears, resizing and the save.

**Saves and boards**

A checkpoint is saved at the start of each wall (wall, score, ships, starting wall and clears), so a reload continues the run from there. Leaderboard: Best score.

## Letterhop

A word-ladder puzzle on the DOM. Hop, a frog, crosses a pond on lily pads, each a 4-letter word one letter away from the last. The goal is to reach the goal word in as few hops as possible. Par is the shortest possible ladder.

**Rules**

- Each hop changes exactly one letter and must be a word in the list (3,865 four-letter words; 38 are blocked), and cannot repeat a word already on the ladder. A try that is not allowed is refused with a reason and costs nothing.
- Daily: one ladder per day, the same for everyone, picked from 728 prepared ladders with par of 4 to 7. The day rolls over at local midnight. Solved days in a row make a streak; Show a way ends the attempt and breaks it. The streak and best streak are kept.
- Practice: Short, Medium and Long ladders (500, 500 and 300 prepared) that can be played at any time in order.
- Climb down returns Hop to the previous pad but never refunds hops. The cap is 50 hops, after which the ladder is out of rungs.
- Ratings: at or under par gives 3 leaves (On par), up to 2 over gives 2 (Close), up to 5 over gives 1 (Made it), more is Scenic route. Show a way and out of rungs give no leaves and reveal one shortest ladder. A share panel copies the result as text.

**Controls**

| Input | Enter the next word | Hop | Climb down | Pause |
|---|---|---|---|---|
| Keyboard | Type 4 letters in the field | Enter | Ctrl+Z or Cmd+Z with the field empty | Escape |
| Pointer | Click the field and type, or use the letter picker | Click Hop | Click Climb down | Escape |
| Touch | Tap a letter on the draft rung, then a letter in the picker | Tap Hop | Tap Climb down | Pause button |

**Look and feel**

A night pond with a moon, reeds and fireflies. Hop is an original SVG frog with a bow tie who is idle, happy or sad, and jumps up lily-pad rungs with a squash and stretch, a splash and sparkles. Letters are candy tiles and picker keys; invalid words shake and a solved ladder brings confetti and a flame streak badge. Every control has an accessible name and announcements are spoken for screen readers.

**Code map**

- `src/logic.ts`: word lookup, hop checks, shortest-path search, ratings, dates and streaks. `src/daily.ts`: the daily epoch.
- `src/game.ts`: the DOM game: modes, entry methods, results, share dialog, saves. `src/styles.ts`: styles. `src/art.ts`: frog, pads and scenery.
- `src/data/`: the generated word list and the daily and practice ladders, from `data/` through the word-ladder generator.
- `test/logic.test.ts` covers hops, ratings, dates, streaks and history. `test/data.test.ts` checks the generated data. Saves are checked against fixtures.

**Saves and boards**

Separate saves for the daily (the current attempt, a history of days and the best streak), practice (tier, order of ladders, current attempt per tier and totals) and the entry method setting. Leaderboards: Fewest hops (daily) and Daily streak.

## Molehills

A number-deduction puzzle in a sunny garden bed. Each number counts the sleeping moles in the eight patches around it. The player digs every safe patch and plants daisies on the patches where a mole must be sleeping. Digging a mole's patch wakes it and ends the board.

**Rules**

- Three sizes: Garden 8 by 10 with 12 moles, Field 12 by 16 with 32 moles, and Meadow 16 by 24 with 70 moles.
- The first dig is always safe: moles are placed after it, never on the dug patch or its eight neighbours. A dug patch with no mole around it opens all its neighbours in a flood.
- Boards never need a guess. The generator checks each board with a deterministic solver (single-number rules, then pairs of numbers on Field and Meadow, which must need at least 2 and 5 pair steps, then the total mole count) and repeats until the board can be solved by reasoning alone.
- Daisies mark suspected moles and block digging there. A number with exactly as many daisies around it as its count digs the other covered neighbours in one action (a chord). Hint points at the next safe patch, or first at a daisy that sits on a safe patch.
- A board is won when every safe patch is dug. The timer runs from the first dig; the best time for each size is kept, with wins, losses and a snooze streak per size. After wins the game suggests the next bigger size.
- Large boards on small frames can be zoomed in and panned; on a fitted board whose patches are too small to tap safely, a tap zooms in instead of digging.

**Controls**

| Input | Dig | Daisy | Other |
|---|---|---|---|
| Keyboard | Arrow keys or WASD to move, Space or Enter | F or X; M switches between Dig and Plant | H hint, N new board, 1 2 3 for size, O zoom |
| Pointer | Left-click (click a finished number to chord) | Right-click, press and hold, or Plant mode | Buttons for Hint, Zoom, size tabs and New board; drag to pan |
| Touch | Tap (tap a finished number to chord) | Press and hold, or Plant mode | Buttons; drag to pan |

**Look and feel**

A sunny garden: grass tufts for covered patches, warm soil for dug ones, bold outlined numbers in a different colour per number and daisies. When a board ends the moles are revealed: an original mole in a striped nightcap, asleep on a win and grumpy on a loss. Digging sends dirt puffs and a ripple of opening patches, and a win scatters petals and confetti. Nothing explodes.

**Code map**

- `src/logic.ts`: board sizes, mole placement, digging and flood, the solver, no-guess generation, hints and the bitset helpers.
- `src/scene.ts`: input, zoom and pan, drawing, timer, saves. `src/art.ts`: tiles, moles, daisies.
- `src/attract.ts`: a demo that plays the solver's moves on a fixed Field board, digging safe patches and planting daisies on moles.
- `test/rules.test.ts` covers the size table, mole placement, flood fill, the solver and its soundness, hints on every generated board, wrong-daisy hints, bitsets, saves and stats.

**Saves and boards**

The board in progress is saved (mole layout, dug patches, daisies, timer, hints, cursor and view). Per-size stats: played, won, abandoned, streak, best streak and best time. Preferences remember the last size and Dig or Plant mode. Leaderboards: a best-time board for each size (Garden, Field and Meadow).

## Rowbot

A four-in-a-row game against Rowdy, a retro arcade robot. The player's discs are coins marked with a square, Rowdy's are marked with a gear. The goal is a win streak, with Rowdy getting sharper with every round won.

**Rules**

- A 7 by 6 rack. Players take turns dropping a coin into a column; the first to line up four across, up or diagonally wins. A full rack is a draw. Who goes first alternates every round.
- The player picks Easy, Medium or Hard. Easy looks one move ahead, picks by weight and often blocks a three. Medium is a shallow alpha-beta search that sometimes plays its second-best move. Hard is an iterative-deepening alpha-beta search with a time budget of about 150 ms per move that never searches the whole game.
- Each round won in a row raises Rowdy's sharpness, up to step 4: Easy blocks threes more often (60 up to 100 percent) and leans to the centre, Medium searches 2 to 4 moves deep and blunders less (30 down to 5 percent), Hard's depth cap rises from 6 to 12. A loss or a forfeit ends the streak and resets Rowdy.
- A draw keeps the streak where it is. Bank streak on the round card ends the streak by choice. The streak that ends, by a loss, forfeit or banking, is the score for the Best win streak board.
- Restarting a round after dropping a disc counts as a forfeit. Restarting before the first disc replays the round.

**Controls**

| Input | Aim | Drop |
|---|---|---|
| Keyboard | Left and right arrows or A and D, Home and End for the edges | Enter, Space, Down arrow, S, or the keys 1 to 7 |
| Pointer | Hover over a column | Click a column |
| Touch | Touch a column and slide | Lift your finger, or tap a column |

Pause is Escape, or the pause button on touch.

**Look and feel**

A glossy blue arcade-style rack set before a night sky. Rowdy is a retro robot with a blinking antenna and an LED face that shows many moods (thinking, smug, surprised, dizzy, sad), with speech-bubble quips and reactions. Coins are candy-glossy with their square or gear mark so colour is never the only signal. Winning lines flash, with confetti. A small level meter shows Rowdy's power.

**Code map**

- `src/rules.ts`: the rack, drops, four-in-a-row test, the 69 lines and move-list replay.
- `src/ai.ts`: the three levels, the sharpness table, the time-sliced search and the transposition table.
- `src/save.ts`: progress, round and streak bookkeeping. `src/scene.ts`: input, drawing, cards, Rowdy and the time-sliced AI. `src/art.ts`: rack, coins and Rowdy.
- `src/attract.ts`: a scripted game that ends in a win for the player.
- `test/rules.test.ts` covers the lines, draws, the attract game, Hard finding a forced win, sharpening with the streak, search time, strength between levels, determinism, streak and result handling, and the fixtures.

**Saves and boards**

Progress is saved: the chosen level, the streak and per-level records (wins, losses, draws, best streak) and who starts next. A round in progress is saved as its move list plus the AI's random state and restored on return. Leaderboard: Best win streak.

## Starlap

A one-button timing game. Pip, a neon spark, orbits a glowing ring. The player taps at the instant Pip crosses a star on the ring. One miss ends the run.

**Rules**

- Pip's position is a function of time, so timing is exact. A tap is judged by how many milliseconds it is from Pip's arrival at the star. Inside the Perfect window it is a Perfect, inside the hit window a Good, and outside it the run ends as early or late, as does letting the star pass.
- The first lap takes 2.4 s and each hit shortens it by 2.5 percent to a floor of 1.25 s, reached after 26 hits. The hit window starts at 110 ms either side and shrinks 3 percent per hit to 55 ms. The Perfect window is about a third of it, never below 18 ms.
- A Perfect scores 1 plus its place in the chain of Perfects in a row, up to 5. A Good scores 1 and breaks the chain.
- Every 10 hits is a zone and the sky changes: Sunset, Dusk, Night, Aurora, Dawn, then repeats. From hit 10 Pip may reverse direction after a hit (25 percent, then 40 percent from hit 30), never twice in a row. From hit 20 a star may drift along the ring (30 percent, then 45 percent from hit 40), never on a reversal. Each new star is placed far enough ahead to react to.
- Presses within 120 ms of a hit are ignored, so a double tap cannot end the run. After a pause Pip and the star resume from a short countdown.

**Controls**

| Input | Hit | Pause |
|---|---|---|
| Keyboard | Space, Enter, arrow keys or any letter or number key | Escape |
| Pointer | Click anywhere | Pause button |
| Touch | Tap anywhere | Pause button |

**Look and feel**

A synthwave sky with a striped sun, mountains and a moving grid floor, a neon ring with dial ticks and a large neon score in the centre. Pip is a grinning cyan spark with a comet tail that squashes on a hit and winces on a miss. Stars pop with bursts and a shockwave, and a reversal sweeps an arc across the ring. The sky moves to the next zone's palette every 10 hits. A hit reports how many milliseconds early or late it was.

**Code map**

- `src/rules.ts`: the pure, clock-driven run: lap and window curves, judging, scoring, star placement, reversals, drift, pause and resume.
- `src/scene.ts`: input stamped at the moment of the press, drawing, HUD and saves. `src/art.ts`: Pip, ring, sky and zones.
- `src/attract.ts`: a demo that shows Perfect and Good hits, a reversal and a new zone.
- `test/rules.test.ts` covers the speed and window curves, coarse clocks, judging bands, star placement, scoring, the lockout, pausing, reversals and drift, stats and the attract clip.

**Saves and boards**

Stats only: best score, best hit count, runs, total hits and Perfects, longest chain and the last run. Each submitted score carries its seed and per-hit offsets. Leaderboard: Best score.

## Firefly Flip

Two short memory games in a moonlit meadow, hosted by Lumi the firefly: Pairs, a jar-matching game on three grid sizes, and Follow, a repeat-the-pattern game on four lanterns.

**Rules**

- Pairs: the grid is 4 by 4 (8 pairs), 4 by 5 (10) or 6 by 6 (18), dealt from 24 glyphs. Turn two jars to find a match; each pair of turns is one move. A match stays lit. A mismatch stays open for 900 ms, or can be closed early by a tap after 600 ms. Clearing the board shows the move count and the time.
- Follow: Lumi lights lanterns in a pattern and the player repeats it in the same order. Each cleared round adds one more lantern, up to 99. The playback speeds up with the length (600 ms a light up to 5 notes, 350 ms from 14 on). No lantern repeats three times in a row.
- Second look: the first wrong press in a Follow run replays the same song at the same length. The second wrong press ends the run; the score is the longest song repeated correctly.
- The Modes button leads back to the menu and needs a second press to end a run in progress. A Pairs board in progress can be resumed from the menu.

**Controls**

| Input | Menu | Pairs | Follow | Other |
|---|---|---|---|---|
| Keyboard | Arrow keys, Space or Enter | Arrow keys or WASD, Space or Enter | Keys 1 to 4 | M for Modes, Escape to pause |
| Pointer | Click a size or Follow | Click a jar | Click a lantern | Modes and Pause buttons |
| Touch | Tap a size or Follow | Tap a jar | Tap a lantern | Modes and Pause buttons |

**Look and feel**

A moonlit meadow with drifting fireflies. Lumi is a round purple firefly host who cheers and droops and speaks in bubbles. Pairs cards are glass jars with a real flip, a glow and tick on a match, a shake and a cross on a miss, and "All aglow!" on a clear; each glyph is a shape so colour is never the only cue. Follow lanterns (circle, square, triangle, hexagon) bob on a vine and light up with a swarm, each with its own tone.

**Code map**

- `src/pairs.ts`: grid sizes, dealing, the two-card state machine with the mismatch hold.
- `src/follow.ts`: the lantern pattern, tempo table, phases and the second look.
- `src/scene.ts`: menu, both modes, input, drawing, Lumi and saves. `src/art.ts`: jars, lanterns, Lumi.
- `src/attract.ts`: a Pairs 4 by 4 demo on a fixed seed with a deliberate mismatch.
- `test/rules.test.ts` covers dealing, matches and mismatches, the hold and its shortcut, clearing, tempo, follow growth and the second look, repeat limits and save validation.

**Saves and boards**

One save holds the last mode and grid, the Pairs board in progress for each grid, best moves and time per grid, the best Follow length and counts of boards cleared and Follow runs. A Follow run is never saved mid-run. Leaderboards: Fewest moves (Pairs 6 by 6) and Longest pattern (Follow).

## Shared conventions

- **Pure rules, thin scene.** Each game keeps its rules in a pure module (a simulation, a logic file or a rules file) with no Phaser, DOM or clock access. The scene or DOM module only reads input, calls the rules and draws. Unit tests drive the rules directly.
- **Attract demo.** Every game ships a self-playing demo that uses the same inputs a player has, so the portal can show a live clip.
- **Saves through the toolkit.** Saved data is versioned, validated on load (a damaged save falls back to defaults) and written through the toolkit's save helpers.
- **Colour is never the only signal.** Pieces, bubbles, tiles, cards and coins carry a shape, pattern, glyph or number as well as a colour.
- **Reduced motion.** Effects such as shakes, bursts, flips and sweeps are skipped or shortened when the player asks for reduced motion.
- **Tests.** Each game has unit tests on its pure rules and the shared contract suite in `test/contract.test.ts`.
To build a game, see [making-games.md](making-games.md). For the platform the games run on, see [architecture.md](architecture.md).

