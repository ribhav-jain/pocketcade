// The 20 crystal walls. Rows are written compactly and centred into the 14 × 12 grid. Every breakable cell must be
// reachable: alloy plates touching diagonally, or a plate within 16 units of a side wall, seal what is behind them.
// Legend: '.' empty · '1' ember crystal · '2' frost crystal · '3' prism crystal · '#' alloy plate (keystone) ·
// 'f' plasma mine (fuse) · 'w' Wingspan pod · 'x' Scatter pod · 'z' Stasis pod
export type LevelCell = '.' | '1' | '2' | '3' | '#' | 'f' | 'w' | 'x' | 'z';

interface Level {
  id: number;
  name: string;
  /** 12 rows × 14 cells; rows[0] is the top row (y 120) */
  rows: readonly string[];
}

export const COLS = 14;
export const ROWS = 12;

function centre(row: string): string {
  if (row.length > COLS) throw new Error(`row "${row}" is wider than ${COLS}`);
  const left = Math.floor((COLS - row.length) / 2);
  return '.'.repeat(left) + row + '.'.repeat(COLS - row.length - left);
}
const level = (id: number, name: string, rows: string[]): Level => ({
  id,
  name,
  rows: [...rows, ...Array<string>(Math.max(0, ROWS - rows.length)).fill('')]
    .slice(0, ROWS)
    .map(centre),
});
const full = (ch: string) => ch.repeat(COLS);

export const LEVELS: readonly Level[] = [
  level(1, 'First Light', ['', full('1'), full('1'), full('1'), full('1')]),
  level(2, 'Gap Teeth', [
    '',
    '111.111111.111',
    '111.111111.111',
    '111.111111.111',
    '111.111111.111',
    '111.111111.111',
  ]),
  level(3, 'Frost Line', ['', full('2'), full('1'), full('1'), full('1')]),
  level(4, 'Hangar Bay', [
    '',
    '11',
    '1111',
    '11w1',
    '22222222',
    '21111112',
    '21111112',
    '21111112',
    '21111112',
    '22222222',
    '11..11',
  ]),
  level(5, 'Stasis Lane', [
    '',
    '11..........11',
    '211........112',
    '1211......1121',
    '1211....1121',
    '1211..1121',
    '121z1121',
    '1211..1121',
    '1211....1121',
    '1211......1121',
  ]),
  level(6, 'Keystone Arch', [
    '',
    '######',
    '#222222#',
    '#22222222#',
    '#2222222222#',
    '1#1111111111#1',
    '11111....11111',
    '1111......1111',
  ]),
  level(7, 'Short Fuse', [
    '',
    '.ffff....ffff.',
    '.111f1111f111.',
    '.ffff11w1ffff.',
    '.f1111111111f.',
    '.111111111111.',
    '11111111',
  ]),
  level(8, 'Scatter Shot', [
    '',
    '22x222',
    '2221111222',
    '221111111122',
    '21111111111112',
    '2111111w111112',
    '21111111111112',
    '221111111122',
    '1111111111',
  ]),
  level(9, 'Porthole', [
    '',
    '333333',
    '33111133',
    '3311111133',
    '331111111133',
    '3311z1111133',
    '331111111133',
    '3311111133',
    '33111133',
    '333333',
    '2222222222',
    '22222222',
  ]),
  level(10, 'Launch Towers', [
    '..##..##..##..',
    '..11..11..11..',
    '..12..12..12..',
    '..11..1x..11..',
    '..21..11..12..',
    '..11..21..11..',
    '..12..11..21..',
    '..11..12..11..',
    full('1'),
    full('1'),
  ]),
  level(11, 'Ion Weave', [
    '',
    '22112211221122',
    '12211221122112',
    '11221122112211',
    '21122112211221',
    '22112211221122',
    '12211221122w12',
    '11221122112211',
    '21122112211221',
  ]),
  level(12, 'Fuse Box', [
    '#####..#####',
    '#fff#..#fff#',
    '#fff#..#fff#',
    '#fff#..#fff#',
    '##.##..##.##',
    '1111x1111z1111',
    '#####..#####',
    '#fff#11#fff#',
    '#fff#11#fff#',
    '#fff#11#fff#',
    '##.##11##.##',
  ]),
  level(13, 'Reactor Door', [
    '',
    '##1111111111##',
    '#3333333333#',
    '#3333333333#',
    full('f'),
    '#3333333333#',
    '#33333z3333#',
    '##1111111111##',
    full('1'),
  ]),
  level(14, 'Crossed Beams', [
    '',
    '1#2222222222#1',
    '12#22222222#21',
    '122#222222#221',
    '1222#2222#2221',
    '11111#11#11111',
    '1111w1##1x1111',
    '11111#11#11111',
    '1111#1111#1111',
    '111#111111#111',
    '11#11111111#11',
    '1#1111111111#1',
  ]),
  level(15, 'Plasma Veins', [
    full('2'),
    '2fff2222222222',
    '222f2222fff222',
    '222fff22f2f222',
    '22222f22f2ff22',
    '22222ffff22f22',
    '1111111111zf11',
    '11111111111f11',
    '1111111111ff11',
  ]),
  level(16, 'Beacon Tower', [
    '3333',
    '333333',
    '#333333#',
    '#3w33x3#',
    '#333333#',
    '#22222222#',
    '#22222222#',
    '#.22222222.#',
    full('1'),
    full('1'),
  ]),
  level(17, 'Rocket Run', [
    '',
    '.........3....',
    '.........33...',
    '1111111112333#',
    '11111111123z3#',
    '.........33...',
    '.........3....',
    '#####',
    '222222x2',
    '22222222',
    '2222222222',
  ]),
  level(18, 'Cargo Hold', [
    full('#'),
    '#111#1111#111#',
    '#111#1w11#111#',
    '#111#1111#1z1#',
    '#111#1111#111#',
    '#1.###..###.1#',
    full('1'),
    '1111......1111',
  ]),
  level(19, 'Nebula Bazaar', [
    full('3'),
    '2222w2222x2222',
    full('1'),
    'ffffffffff',
    'ffffffffff',
    '22222222z22222',
    full('1'),
    '3333333333',
    full('1'),
  ]),
  level(20, 'Moonrise', [
    '######',
    '##1111111##',
    '#ff12223333#',
    '#ff12x23333#',
    '#1111222w3333#',
    '#ff1222223333#',
    '#ff12z23333#',
    '#1222223333#',
    '##1111111##',
    '######',
  ]),
];

export const HIT_POINTS: Record<LevelCell, number> = {
  '.': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '#': 0,
  f: 1,
  w: 1,
  x: 1,
  z: 1,
};
export const isBreakable = (c: string): boolean => c !== '.' && c !== '#';

/** Total breakable hit points of a level. */
export const levelHitPoints = (l: Level): number =>
  l.rows
    .join('')
    .split('')
    .reduce((s, c) => s + HIT_POINTS[c as LevelCell], 0);
/** Par time in seconds for the speed bonus: 30 s plus one per hit point. */
export const levelPar = (l: Level): number => 30 + levelHitPoints(l);
/** Comet launch speed (design units per second) rises 10 per wall. */
export const startSpeed = (level: number): number => 400 + 10 * (level - 1);
export const batWidth = (level: number): number => (level <= 7 ? 120 : level <= 14 ? 112 : 104);

/** Walls come in zones of five; each zone has its own backdrop, and clearing its last wall repairs a ship. */
export const ZONE_SIZE = 5;
export const zoneOf = (level: number): number => Math.floor((level - 1) / ZONE_SIZE);
export const zoneStart = (level: number): number => zoneOf(level) * ZONE_SIZE + 1;
