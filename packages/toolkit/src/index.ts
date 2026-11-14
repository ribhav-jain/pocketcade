// @pocketcade/toolkit (core). Importing this module does no work.
export type {
  Layout,
  RngProvider,
  RunTracker,
  TkContext,
  TkEvents,
  TkLiveEnv,
  TkSaveSpec,
} from './context.ts';
export type {
  ActionEvent,
  ActionName,
  Dir,
  GestureEvents,
  Input,
  InputSpec,
  KeyBinding,
  VirtualInput,
} from './input.ts';
export { createRng, isRngState, type Rng, type RngState } from './rng.ts';
export {
  createSave,
  isCount,
  isInt,
  isRecord,
  type LoadIssue,
  type Loaded,
  type Save,
  type SaveOptions,
  type SaveSpec,
} from './save.ts';
export {
  FONT_DISPLAY,
  FONT_STACK,
  SHAPES,
  colorNum,
  colors,
  contrastRatio,
  gradients,
  luminance,
  mixHex,
  motionMs,
  radius,
  space,
  target,
  typeScale,
  type ColorToken,
  type MotionToken,
} from './tokens.ts';
export {
  fillGradient,
  font,
  glossyCircle,
  glossyRect,
  prng,
  rgba,
  roundRectPath,
  shade,
  sprinkle,
  starPath,
  type GlossyOptions,
} from './art.ts';
export { defineStrings, formatScore, type Motion, type Strings } from './util.ts';
export type { Sfx, SfxBank, SfxParams, SfxPresetName } from './sfx.ts';
export type { SafeLoop, SafeLoopOptions } from './loop.ts';
export type { AttractController, AttractPhase, AttractScript } from './attract.ts';
export type { ToolkitStrings } from './strings.en.ts';
export type {
  GameOverOptions,
  HowToStep,
  IconName,
  OverlayConfig,
  Overlays,
} from './ui/overlays.ts';
