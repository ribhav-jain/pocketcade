# Third-party notices

Pocketcade's own work is original: every sprite, backdrop and cover is drawn in code or hand-written SVG, and every
sound effect is synthesized at run time. Code is under the [MIT License](LICENSE); original art, audio and text are
under [CC BY 4.0](LICENSE-ASSETS), credit "Pocketcade contributors".

This file lists everything in the repository or the built site that the project did not make itself. The site's
Licenses page is generated from the table below.

## Assets

| ID              | Title                            | Author                      | License                                  | URL                                     | Files                                                                     |
| --------------- | -------------------------------- | --------------------------- | ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `font-fredoka`  | Fredoka (variable font)          | The Fredoka Project Authors | SIL Open Font License 1.1                | https://github.com/hafontia/Fredoka-One | npm `@fontsource-variable/fredoka`, loaded by the portal and the games    |
| `font-nunito`   | Nunito (variable font)           | The Nunito Project Authors  | SIL Open Font License 1.1                | https://github.com/googlefonts/nunito   | npm `@fontsource-variable/nunito`, loaded by the portal and the games     |
| `words-enable`  | ENABLE word list (`enable1.txt`) | M. Cooper and contributors  | Public domain                            | https://sources.debian.org/src/scowl/   | `packages/games/letterhop/data/source.txt`, generated `src/data/*.gen.ts` |
| `words-12dicts` | 12dicts word lists, list `6of12` | Alan Beale                  | Public domain (acknowledgment requested) | http://wordlist.aspell.net/12dicts/     | `packages/games/letterhop/data/common.txt`, generated `src/data/*.gen.ts` |

Notes:

- The fonts are not stored in this repository. They are installed from npm and bundled into the built site; each
  package carries its full licence text.
- ENABLE: its README states that the list is "formally released into the Public Domain". The README is reproduced in
  the SCOWL source package linked above (`r/enable/README`).
- 12dicts: its author released the lists to the public domain and asked for acknowledgment, given here: the 12dicts
  lists were compiled by Alan Beale.
- How the word lists are filtered and turned into game data is described in
  [packages/games/letterhop/data/SOURCE.md](packages/games/letterhop/data/SOURCE.md).

## Libraries shipped in the built site

| Library                                                           | License    |
| ----------------------------------------------------------------- | ---------- |
| [Phaser](https://github.com/phaserjs/phaser)                      | MIT        |
| [Next.js](https://github.com/vercel/next.js)                      | MIT        |
| [React](https://github.com/facebook/react)                        | MIT        |
| [Vercel Web Analytics](https://github.com/vercel/analytics)       | MIT        |
| [Vercel Speed Insights](https://github.com/vercel/speed-insights) | Apache-2.0 |

Build and test tooling (TypeScript, Vite, Vitest, Playwright, ESLint, Prettier, Turborepo and their dependencies) is
used during development only and is not part of the site. `pnpm licenses list` prints the licence of every installed
package.

## Names

Game titles and character names were chosen for this project. Names of other products mentioned in documentation
belong to their owners and are used only to describe a genre or a tool.
