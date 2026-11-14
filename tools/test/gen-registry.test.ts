import { describe, expect, it } from 'vitest';
import { parseGameMd, renderRegistry } from '../gen-registry.ts';

const FRONT = `title: Frog Hop
tagline: Hop across the pond.
category: arcade
tags: [quick, reflex]
accent: '#2BD47D'
minutes: 3
coverAlt: A green frog mid-leap over lily pads.
controls:
  - action: Jump
    keyboard: Space
    touch: Tap
faq:
  - q: Does it save?
    a: Yes, on this device.`;

const md = (front: string, body = 'Hop from pad to pad.\nDo not fall in.') =>
  `---\n${front}\n---\n\n${body}\n`;
const without = (key: string) =>
  FRONT.split('\n')
    .filter((line) => !line.startsWith(`${key}:`))
    .join('\n');

describe('parseGameMd', () => {
  it('reads the listing from the front matter and the blurb from the body', () => {
    expect(parseGameMd('frog-hop', md(FRONT))).toEqual({
      listing: {
        title: 'Frog Hop',
        tagline: 'Hop across the pond.',
        category: 'arcade',
        tags: ['quick', 'reflex'],
        accent: '#2BD47D',
        minutes: 3,
        blurb: 'Hop from pad to pad. Do not fall in.',
      },
      details: {
        controls: [{ action: 'Jump', keyboard: 'Space', touch: 'Tap' }],
        faq: [{ q: 'Does it save?', a: 'Yes, on this device.' }],
        alt: 'A green frog mid-leap over lily pads.',
      },
    });
  });

  it('accepts Windows line endings and a missing FAQ', () => {
    const noFaq = FRONT.slice(0, FRONT.indexOf('\nfaq:'));
    expect(parseGameMd('frog-hop', md(noFaq)).details.faq).toEqual([]);
    expect(parseGameMd('frog-hop', md(FRONT).replace(/\n/g, '\r\n')).listing.title).toBe(
      'Frog Hop',
    );
  });

  it.each([
    ['no front matter', 'Just a blurb.', /no front matter/],
    ['invalid YAML', md('title: a: b'), /not valid YAML/],
    ['a missing title', md(without('title')), /needs title/],
    ['a missing cover description', md(without('coverAlt')), /needs coverAlt/],
    ['a malformed accent', md(FRONT.replace("'#2BD47D'", 'green')), /needs accent/],
    ['tags that are not a list', md(FRONT.replace('[quick, reflex]', 'quick')), /needs tags/],
    [
      'no controls',
      md(FRONT.replace(/controls:[^]*?faq:/, 'controls: []\nfaq:')),
      /needs controls/,
    ],
    ['an empty blurb', md(FRONT, ''), /needs a blurb/],
  ])('names the game when game.md has %s', (_what, markdown, message) => {
    expect(() => parseGameMd('frog-hop', markdown)).toThrow(message);
    expect(() => parseGameMd('frog-hop', markdown)).toThrow(/^frog-hop: /);
  });
});

describe('renderRegistry', () => {
  it('emits one lazy import per game', () => {
    const text = renderRegistry([
      { id: 'a-game', pkg: '@pocketcade/game-a-game' },
      { id: 'sumslide', pkg: '@pocketcade/game-sumslide' },
    ]);
    expect(text).toContain(
      "  'a-game': () => import('@pocketcade/game-a-game'),\n  'sumslide': () => import('@pocketcade/game-sumslide'),",
    );
    expect(text.startsWith('// GENERATED')).toBe(true);
  });
});
