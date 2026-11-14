// The game sandbox in @pocketcade/config/eslint is built from hand-written selectors; each one is checked here
// against a line it must reject, next to the patterns games rely on that must stay allowed.
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '@pocketcade/config/eslint';

const cwd = import.meta.dirname;
const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: config('game') });
const errors = async (code: string) =>
  (await eslint.lintText(code, { filePath: join(cwd, 'src', 'game.ts') }))[0]!.messages.filter(
    (m) => m.severity === 2,
  );

const BANNED = [
  'localStorage.getItem("k");',
  'sessionStorage.clear();',
  'indexedDB.open("db");',
  'void doc.cookie;',
  'void fetch("/x");',
  'new XMLHttpRequest();',
  'new WebSocket("wss://x");',
  'addEventListener("keydown", () => {});',
  'window.addEventListener("resize", () => {});',
  'document.body.append(el);',
  'document.addEventListener("keydown", () => {});',
  'globalThis.x = 1;',
  'let counter = 0;',
  'export var shared = 1;',
  'host.audio.context.close();',
  'import { createGameRunner } from "@pocketcade/host";',
  'import { createMemoryBackend } from "@pocketcade/sdk/rules";',
  'import other from "@pocketcade/game-other";',
  'import React from "react";',
  'import Phaser from "phaser";',
];

const ALLOWED = [
  'export const el = document.createElement("div");',
  'export function f(el: HTMLElement) { el.addEventListener("pointerdown", () => {}); }',
  'export const SPEED = 4;',
  'export function g() { let n = 0; return ++n; }',
  'import type Phaser from "phaser"; export type S = Phaser.Scene;',
  'import { defineGame } from "@pocketcade/sdk"; export { defineGame };',
];

describe('game sandbox lint rules', () => {
  it.each(BANNED)('rejects: %s', async (code) => {
    expect((await errors(code)).length).toBeGreaterThan(0);
  });
  it.each(ALLOWED)('allows: %s', async (code) => {
    expect(await errors(code)).toEqual([]);
  });
});
