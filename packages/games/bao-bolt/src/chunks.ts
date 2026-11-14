// Hand-authored obstacle chunks, written as compact strings and parsed once at import.
// Obstacles: "<at s> pin|tins|shelf<width>" (pin = crab, tins = steamer stack, shelf = hanging sign);
// coins: "<at s> line|arc|low<count>"; ';' separates entries. Times are seconds, so a chunk plays the same at any
// run speed; keep at least 0.7 s between obstacles so every chunk can be cleared.

export type ObstacleKind = 'pin' | 'tins' | 'shelf';
interface ChunkObstacle {
  /** seconds after the chunk's start line reaches the bun until this obstacle's leading edge does */
  at: number;
  kind: ObstacleKind;
  /** shelf only (wu) */
  width?: 1.0 | 1.3 | 1.6;
}
interface CrumbRun {
  at: number;
  shape: 'line' | 'arc' | 'low';
  count: number;
}
export interface Chunk {
  id: string;
  /** 0 = warm-up / breather */
  difficulty: 0 | 1 | 2 | 3 | 4 | 5;
  minTier: 1 | 2 | 3 | 4;
  lengthS: number;
  obstacles: readonly ChunkObstacle[];
  crumbs: readonly CrumbRun[];
}

function parse(
  id: string,
  difficulty: Chunk['difficulty'],
  minTier: Chunk['minTier'],
  lengthS: number,
  obs: string,
  crumbs: string,
): Chunk {
  const items = (s: string) =>
    s
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean);
  return {
    id,
    difficulty,
    minTier,
    lengthS,
    obstacles: items(obs).map((x) => {
      const [at, what] = x.split(/\s+/) as [string, string];
      const kind = what.replace(/[\d.]+$/, '') as ObstacleKind;
      const width = kind === 'shelf' ? (Number(what.slice(5)) as 1.0 | 1.3 | 1.6) : undefined;
      return { at: Number(at), kind, ...(width ? { width } : {}) };
    }),
    crumbs: items(crumbs).map((x) => {
      const [at, what] = x.split(/\s+/) as [string, string];
      return {
        at: Number(at),
        shape: what.replace(/\d+$/, '') as CrumbRun['shape'],
        count: Number(/\d+$/.exec(what)![0]),
      };
    }),
  };
}

export const CHUNKS: readonly Chunk[] = [
  parse('w0', 0, 1, 2.0, '', '0.6 line6'),
  parse('b1', 0, 1, 1.5, '', '0.4 line5'),
  parse('b2', 0, 1, 1.5, '', '0.3 arc6'),
  parse('b3', 0, 1, 1.5, '', '0.4 line3; 1.0 line3'),
  parse('b4', 0, 1, 2.0, '', '0.4 arc5; 1.3 arc5'),
  // difficulty 1
  parse('c01', 1, 1, 2.0, '1.0 pin', '1.0 arc5'),
  parse('c02', 1, 1, 2.0, '1.0 shelf1.0', '1.0 low4'),
  parse('c03', 1, 1, 2.0, '1.0 pin', '0.3 line4; 1.0 arc5'),
  parse('c04', 1, 1, 2.0, '1.0 shelf1.3', '1.0 low5'),
  parse('c05', 1, 1, 2.2, '1.2 pin', '1.2 arc5'),
  parse('c06', 1, 1, 2.0, '0.9 shelf1.0', '0.2 line3; 0.9 low4'),
  // difficulty 2
  parse('c07', 2, 1, 3.0, '0.8 pin; 2.0 pin', '0.8 arc4; 2.0 arc4'),
  parse('c08', 2, 1, 3.0, '0.8 shelf1.0; 2.0 pin', '0.8 low4; 2.0 arc5'),
  parse('c09', 2, 1, 3.0, '0.8 pin; 2.0 shelf1.3', '0.8 arc4; 2.0 low5'),
  parse('c10', 2, 1, 3.0, '0.8 shelf1.3; 2.0 shelf1.0', '0.8 low5; 2.0 low4'),
  parse('c11', 2, 1, 3.0, '0.7 pin; 1.9 pin', '0.7 arc5; 1.3 line3'),
  parse('c12', 2, 1, 3.2, '1.0 pin; 2.2 shelf1.6', '1.0 arc5; 2.2 low6'),
  parse('c13', 2, 1, 3.0, '0.8 shelf1.6; 2.0 pin', '0.8 low6; 2.0 arc5'),
  parse('c31', 2, 2, 2.2, '1.0 tins', '1.0 arc6'),
  // difficulty 3
  parse('c14', 3, 2, 3.0, '0.8 tins; 2.1 shelf1.3', '0.8 arc6; 2.1 low4'),
  parse('c15', 3, 2, 3.0, '0.8 tins; 2.0 pin', '0.8 arc6; 2.0 arc4'),
  parse('c16', 3, 1, 3.6, '0.8 pin; 1.9 pin; 3.0 shelf1.0', '0.8 arc4; 1.9 arc4; 3.0 low4'),
  parse('c17', 3, 2, 3.2, '0.8 shelf1.0; 1.1 shelf1.0; 2.4 pin', '0.8 low8; 2.4 arc4'),
  parse('c18', 3, 2, 3.2, '0.8 tins; 2.0 tins', '0.8 arc6; 2.0 arc6'),
  parse('c19', 3, 1, 4.0, '0.8 pin; 2.0 shelf1.3; 3.2 pin', '0.8 arc4; 2.0 low5; 3.2 arc4'),
  parse('c20', 3, 2, 3.2, '0.8 shelf1.3; 2.0 tins', '0.8 low5; 2.0 arc6'),
  parse('c32', 3, 2, 2.6, '0.8 pin; 1.6 pin', '0.8 arc4; 1.6 arc4'),
  parse('c33', 3, 2, 3.0, '0.8 shelf1.6; 1.05 shelf1.6; 1.3 shelf1.6', '0.9 low12'),
  // difficulty 4
  parse('c21', 4, 3, 3.6, '0.6 pin; 1.6 shelf1.6; 2.7 tins', '0.6 line3; 1.6 low5; 2.7 arc6'),
  parse('c22', 4, 3, 3.6, '0.6 tins; 1.7 pin; 2.8 shelf1.3', '0.6 arc6; 1.7 arc4; 2.8 low5'),
  parse(
    'c23',
    4,
    3,
    4.0,
    '0.6 shelf1.0; 0.9 shelf1.0; 2.0 tins; 3.1 pin',
    '0.6 low8; 2.0 arc6; 3.1 arc4',
  ),
  parse('c24', 4, 3, 3.4, '0.6 pin; 1.6 pin; 2.6 pin', '0.6 arc4; 1.6 arc4; 2.6 arc4'),
  parse('c25', 4, 3, 3.6, '0.6 tins; 1.7 shelf1.0; 2.8 tins', '0.6 arc6; 1.7 low4; 2.8 arc6'),
  parse('c26', 4, 3, 3.6, '0.6 shelf1.3; 1.7 pin; 2.7 shelf1.3', '0.6 low5; 1.7 arc5; 2.7 low5'),
  parse('c34', 4, 3, 3.2, '0.6 pin; 1.3 shelf1.3; 2.3 tins', '0.6 arc4; 1.3 low5; 2.3 arc6'),
  parse('c35', 4, 3, 3.0, '0.6 shelf1.0; 1.35 pin; 2.2 pin', '0.6 low4; 1.35 arc4; 2.2 arc4'),
  // difficulty 5
  parse(
    'c27',
    5,
    4,
    4.6,
    '0.5 shelf1.0; 0.8 shelf1.0; 2.0 pin; 3.0 pin; 4.0 tins',
    '0.5 low8; 2.0 arc4; 4.0 arc6',
  ),
  parse(
    'c28',
    5,
    4,
    4.6,
    '0.5 tins; 1.5 pin; 2.5 shelf1.6; 3.6 tins',
    '0.5 arc6; 2.5 low6; 3.6 arc6',
  ),
  parse(
    'c29',
    5,
    4,
    4.6,
    '0.5 pin; 1.5 tins; 2.6 shelf1.0; 2.9 shelf1.0; 4.0 pin',
    '0.5 arc4; 1.5 arc6; 2.6 low8; 4.0 arc4',
  ),
  parse(
    'c30',
    5,
    4,
    4.6,
    '0.5 shelf1.3; 1.6 tins; 2.7 pin; 3.7 shelf1.3',
    '0.5 low5; 1.6 arc6; 2.7 arc4; 3.7 low5',
  ),
  parse(
    'c36',
    5,
    4,
    4.2,
    '0.5 tins; 1.3 pin; 2.1 shelf1.6; 2.35 shelf1.6; 3.4 tins',
    '0.5 arc6; 2.2 low8; 3.4 arc6',
  ),
  parse(
    'c37',
    5,
    4,
    4.6,
    '0.5 pin; 1.2 shelf1.0; 2.0 pin; 2.8 tins; 3.8 shelf1.3',
    '0.5 arc4; 1.2 low4; 2.8 arc6; 3.8 low5',
  ),
];

export const BREATHERS = ['b1', 'b2', 'b3', 'b4'] as const;

export const chunkById = (id: string): Chunk => CHUNKS.find((c) => c.id === id)!;

/** The self-playing demo opens with these chunks, then picks like a normal run. */
export const ATTRACT_REEL = ['w0', 'c01', 'c02', 'c07', 'c08', 'c03', 'c09'] as const;
