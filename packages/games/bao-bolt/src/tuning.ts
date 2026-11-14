// Every gameplay constant. World units (wu): 1 wu = 60 design px; the design area is 16 × 9 wu.
export const WU = 60;
export const DESIGN = { width: 960, height: 540 } as const;
export const GROUND_TOP = 7.5; // wu from the top of the design area
export const STEP_S = 1 / 60;
export const STEP_MS = 1000 / 60;
export const MAX_STEPS_PER_FRAME = 6;

export const BUN_X = 3.0;
export const STAND = { w: 0.7, h: 0.85 } as const;
export const SLIDE = { w: 0.95, h: 0.4 } as const;

export const TAKEOFF_V = 10;
export const G_HELD = 15;
export const G = 50;
export const MIN_HOLD_MS = 80;
export const MAX_HOLD_MS = 280;
export const TERMINAL_V = 20;
export const FAST_DROP_V = 16;
export const SLIDE_MS = 600;
export const SLIDE_EXTEND_MS = 600;
export const JUMP_BUFFER_MS = 100;
export const SHELF_JUMP_BUFFER_MS = 150;

export const PIN_ROLL = 1.5; // crabs scuttle toward the bun, wu/s
export const SPAWN_X = 17;

/** Run speed after t seconds: 6 wu/s rising to 14 wu/s over three minutes. */
export const baseSpeed = (t: number): number => Math.min(14, 6 + (8 * t) / 180);

export const STUMBLE = {
  slowMs: 800,
  recoverMs: 500,
  factor: 0.6,
  invulnMs: 1500,
  gulpMs: 8000,
  /** each coin grabbed while Gulp is near sends him away this much sooner */
  coinShooMs: 200,
} as const;
export const EATEN_MS = 600;
export const CRUMB_R = 0.25;

/** Obstacle hitboxes relative to the obstacle's left edge (x) and the ground (heights up from the ground top). */
export const HITBOX = {
  pin: { dx: 0.15, w: 0.6, bottom: 0, top: 0.42, visualW: 0.9 },
  tins: { dx: 0.05, w: 0.8, bottom: 0, top: 1.5, visualW: 0.9 },
  shelf: { dx: 0.05, bottom: 0.62, top: 9 },
} as const;

/** The route: four districts, then laps of the same four in shorter stretches. */
export const DISTRICT_STARTS = [0, 250, 600, 1000] as const;
export const DISTRICT_COUNT = DISTRICT_STARTS.length;
const LAP_FROM = 1500;
const LAP_STRETCH = 500;

export function districtIndex(metres: number): number {
  if (metres >= LAP_FROM) return Math.floor((metres - LAP_FROM) / LAP_STRETCH) % DISTRICT_COUNT;
  let i = 0;
  for (let k = 0; k < DISTRICT_COUNT; k++) if (metres >= DISTRICT_STARTS[k]!) i = k;
  return i;
}

/** Where the district after the one at `metres` begins. */
export function nextDistrictAt(metres: number): number {
  for (const from of DISTRICT_STARTS) if (from > metres) return from;
  if (metres < LAP_FROM) return LAP_FROM;
  return LAP_FROM + (Math.floor((metres - LAP_FROM) / LAP_STRETCH) + 1) * LAP_STRETCH;
}

interface Tier {
  from: number;
  target: number;
  min: number;
  max: number;
  leadInS: number;
  breatherEvery: number;
}
/** Difficulty steps up with each new district on the first lap, then once more when the laps begin. */
export const TIERS: readonly Tier[] = [
  { from: 0, target: 1, min: 1, max: 2, leadInS: 1.2, breatherEvery: 4 },
  { from: 250, target: 2, min: 1, max: 3, leadInS: 1.0, breatherEvery: 4 },
  { from: 600, target: 3, min: 2, max: 4, leadInS: 0.9, breatherEvery: 5 },
  { from: 1000, target: 4, min: 3, max: 5, leadInS: 0.8, breatherEvery: 6 },
  { from: 1500, target: 5, min: 3, max: 5, leadInS: 0.8, breatherEvery: 6 },
];

export function tierIndex(metres: number): number {
  let i = 0;
  for (let k = 0; k < TIERS.length; k++) if (metres >= TIERS[k]!.from) i = k;
  return i;
}
