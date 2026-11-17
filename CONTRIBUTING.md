# Contributing to Pocketcade

Thanks for helping. Bug fixes, new games, polish on existing games and documentation fixes are all welcome. For
anything large, such as a new game or a change to the contract, open an issue first so the idea can be discussed
before you build it.

## Prerequisites

- Node.js 26 (the version is in `.node-version`).
- pnpm 12.18.0. The version is pinned in `package.json`, and pnpm downloads it if you have a different one.
- Playwright's Chromium, for the contract and end-to-end tests:
  `pnpm --filter @pocketcade/web exec playwright install chromium`.

## Setup

```bash
pnpm install
pnpm dev                                    # the portal at http://localhost:3000
pnpm --filter @pocketcade/playground dev    # one game at a time at http://localhost:5173
```

## Before you open a pull request

```bash
pnpm format     # Prettier
pnpm verify     # lint, typecheck, unit and contract tests, build
pnpm budgets    # bundle sizes, after the build
pnpm e2e        # Playwright: the portal and the leak test
```

CI runs the same commands on every pull request. If you change a game's cover or title, run `pnpm og` and commit the
updated share image in `apps/web/public/og/`.

## Where things live

| Path               | What                                                              |
| ------------------ | ----------------------------------------------------------------- |
| `packages/games/*` | One package per game                                              |
| `packages/toolkit` | Shared game code and the Phaser and DOM adapters                  |
| `packages/sdk`     | The `Game` / `HostAPI` contract and the contract test suite       |
| `packages/host`    | The runtime that mounts a game into a page                        |
| `apps/web`         | The portal                                                        |
| `apps/playground`  | A page that mounts any game on the real host, plus the leak test  |
| `tools/`           | Build and check scripts                                           |
| `docs/`            | Architecture, the game-making guide, the design system, the games |

Start with [docs/architecture.md](docs/architecture.md) for how the pieces fit, and
[docs/making-games.md](docs/making-games.md) before writing or changing a game.

## Rules that matter

- **Games stay inside the contract.** A game imports only `@pocketcade/sdk`, `@pocketcade/toolkit` and Phaser types,
  draws only inside its container, and reaches storage, audio, fullscreen and scores only through the host. ESLint
  enforces this; do not disable the rules to get around them.
- **Original art and synthesized sound only.** Art is drawn in code or hand-written SVG, and every sound effect is
  synthesized. Genres and mechanics are fair game; another game's name, characters, art, music or level layouts are
  not.
- **Record third-party material.** Anything the project did not make itself, such as a font or a word list, gets a
  row in [ASSETS.md](ASSETS.md) with its source and licence.
- **Exact dependency versions.** `pnpm add` saves exact versions; keep it that way. A version used by several
  packages goes in the `catalog:` section of `pnpm-workspace.yaml`.
- **No ads, no cookies, no third-party requests.** The site loads only its own files. Its only statistics are
  Vercel's anonymous Web Analytics and Speed Insights, described on the Privacy page. Do not add other analytics,
  ads, external fonts or CDNs.
- **No secrets.** Every environment variable is optional and non-secret ([.env.example](.env.example)).

## Licence of contributions

By contributing, you agree that your code is licensed under the [MIT License](LICENSE) and your original art, audio
and text under [CC BY 4.0](LICENSE-ASSETS), credited to "Pocketcade contributors", the same as the rest of the
project.
