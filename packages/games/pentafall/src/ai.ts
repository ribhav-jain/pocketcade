// Attract AI: tries every distinct orientation in every reachable column, drops it, and scores the result
// +1.0 × rows − 0.8 × holes − 0.5 × aggregate height − 0.2 × bumpiness; ties → leftmost column, then fewer turns.
import { distinctRotations } from './pieces.ts';
import {
  cellsOf,
  clearRows,
  COLS,
  dropDistance,
  fits,
  ROWS,
  tryTurn,
  UP_NUDGES_MAX,
  type Action,
  type Board,
  type Piece,
} from './sim.ts';

function boardMetrics(board: Board): { holes: number; height: number; bumpiness: number } {
  const heights: number[] = [];
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let top = ROWS;
    for (let y = 0; y < ROWS; y++)
      if (board[y * COLS + x]! >= 0) top = Math.min(top, y);
      else if (y > top) holes++;
    heights.push(ROWS - top);
  }
  let bumpiness = 0;
  for (let x = 1; x < COLS; x++) bumpiness += Math.abs(heights[x]! - heights[x - 1]!);
  return { holes, height: heights.reduce((a, b) => a + b, 0), bumpiness };
}

function placementScore(board: Board, p: Piece): number {
  const b = board.slice();
  const landed = { ...p, y: p.y + dropDistance(board, p) };
  for (const [x, y] of cellsOf(landed)) b[y * COLS + x] = 0;
  const rows = clearRows(b).length;
  const m = boardMetrics(b);
  return rows - 0.8 * m.holes - 0.5 * m.height - 0.2 * m.bumpiness;
}

/** The action list (turns, shifts, then a slam) for the best placement of the piece that just entered. */
export function plan(board: Board, entered: Piece): Action[] {
  let best: { score: number; minX: number; turns: number; actions: Action[] } | null = null;
  for (const r of distinctRotations(entered.id)) {
    const turns: Action[] = r === 3 ? ['turnLeft'] : Array<Action>(r).fill('turnRight');
    let p: Piece | null = entered;
    let up = UP_NUDGES_MAX;
    for (const t of turns) {
      const res: ReturnType<typeof tryTurn> =
        p && tryTurn(board, p, t === 'turnRight' ? 1 : -1, up);
      p = res?.piece ?? null;
      if (res?.up) up--;
    }
    if (!p) continue;
    for (const dir of [-1, 1] as const) {
      for (let q = p, n = 0; ; n++) {
        if (dir === -1 || n > 0) {
          const score = placementScore(board, q);
          const minX = Math.min(...cellsOf(q).map(([x]) => x));
          const better =
            !best ||
            score > best.score + 1e-9 ||
            (Math.abs(score - best.score) <= 1e-9 &&
              (minX < best.minX || (minX === best.minX && turns.length < best.turns)));
          if (better)
            best = {
              score,
              minX,
              turns: turns.length,
              actions: [...turns, ...Array<Action>(n).fill(dir < 0 ? 'left' : 'right'), 'slam'],
            };
        }
        const moved = { ...q, x: q.x + dir };
        if (!fits(board, moved)) break;
        q = moved;
      }
    }
  }
  return best?.actions ?? ['slam'];
}
