// The run checkpoint: saved at the start of each wall so a reload continues the run from there.
import type { Json } from '@pocketcade/sdk';
import { isCount, isInt, isRecord } from '@pocketcade/toolkit';

type RunV1 = {
  level: number;
  scoreAtLevelStart: number;
  lives: number;
  startLevel: number;
  levelsCleared: number;
  cleanLevels: number;
};
export type RunSlotV1 = RunV1 | null;

export function isRunSlotV1(v: Json): v is RunSlotV1 {
  if (v === null) return true;
  return (
    isRecord(v) &&
    isInt(v.level, 1, 20) &&
    isCount(v.scoreAtLevelStart) &&
    isInt(v.lives, 1, 3) &&
    isInt(v.startLevel, 1, 20) &&
    v.startLevel <= v.level &&
    isInt(v.levelsCleared, 0, 20) &&
    isInt(v.cleanLevels, 0, 20) &&
    v.cleanLevels <= v.levelsCleared
  );
}
