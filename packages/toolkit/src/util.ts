// Small shared helpers: motion, score formatting, strings, shadow-root stylesheets.
import type { LeaderboardDef } from '@pocketcade/sdk';
import { motionMs, type MotionToken } from './tokens.ts';

export interface Motion {
  /** env.reducedMotion at mount */
  readonly reduced: boolean;
  /** 0 when reduced */
  ms(token: MotionToken): number;
  /** false when reduced */
  shake(): boolean;
}

export function createMotion(reduced: boolean): Motion {
  return {
    reduced,
    ms: (token) => (reduced ? 0 : motionMs[token]),
    shake: () => !reduced,
  };
}

/** integer → grouped; duration_ms → m:ss.t; moves → "N moves". */
export function formatScore(
  value: number,
  format: LeaderboardDef['format'],
  locale: string,
): string {
  if (format === 'integer') return new Intl.NumberFormat(locale).format(value);
  if (format === 'moves') {
    const plural = new Intl.PluralRules(locale).select(value);
    return `${new Intl.NumberFormat(locale).format(value)} ${plural === 'one' ? 'move' : 'moves'}`;
  }
  const tenths = Math.floor(value / 100);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor((tenths % 36000) / 600);
  const s = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  const ss = `${String(s).padStart(2, '0')}.${t}`;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * One parsed sheet per CSS text, shared by every mount's shadow root (constructed sheets may be adopted by many
 * roots). Re-parsing on each mount left Blink's style caches holding a fresh copy per cycle, which the leak test
 * read as heap growth. Bounded by the number of distinct style texts; nothing mutates these sheets.
 */
const sheets = new Map<string, CSSStyleSheet>();
export function sheet(css: string): CSSStyleSheet {
  let s = sheets.get(css);
  if (!s) {
    s = new CSSStyleSheet();
    s.replaceSync(css);
    sheets.set(css, s);
  }
  return s;
}

export type Strings<T extends Record<string, string>> = T & {
  t(key: keyof T, params?: Record<string, string | number>): string;
};

/** English strings with `{name}` placeholders. */
export function defineStrings<T extends Record<string, string>>(en: T): Strings<T> {
  const t = (key: keyof T, params: Record<string, string | number> = {}) =>
    String(en[key] ?? String(key)).replace(/\{(\w+)\}/g, (_, name: string) =>
      String(params[name] ?? `{${name}}`),
    );
  return Object.assign(Object.create(null) as object, en, { t }) as Strings<T>;
}
