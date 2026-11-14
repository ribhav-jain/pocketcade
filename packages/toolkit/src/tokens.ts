// Design tokens, restyled for the Pocketcade brand: a 'night arcade' base (deep indigo)
// with candy-bright accents. Accent keys keep their Okabe–Ito names and hue families, and each still pairs with a
// shape (SHAPES), so gameplay never relies on colour alone.

export const colors = {
  bg: '#120C2C',
  surface: '#1D1546',
  raised: '#2A1F60',
  line: '#4A3D93',
  text: '#FFF9F2',
  textMuted: '#C2B9EA',
  paper: '#FFF6EA',
  ink: '#120C2C',
  orange: '#FF9F1C',
  sky: '#38D6FF',
  green: '#2BD47D',
  yellow: '#FFE14D',
  blue: '#5B8CFF',
  vermillion: '#FF5A5F',
  purple: '#C77DFF',
  // brand extras (no paired shape: decoration, not game state)
  pink: '#FF4FA3',
  violet: '#7B5CFF',
  lime: '#B8F34A',
  gold: '#FFC83D',
} as const;

/** Two-stop brand gradients, start → end (top → bottom or left → right). */
export const gradients = {
  /** primary: buttons, highlights */
  sunset: ['#FF4FA3', '#FF9F1C'],
  aurora: ['#38D6FF', '#7B5CFF'],
  candy: ['#FF4FA3', '#C77DFF'],
  meadow: ['#B8F34A', '#2BD47D'],
  gold: ['#FFE14D', '#FF9F1C'],
  /** backdrops */
  night: ['#2A1F60', '#120C2C'],
} as const;

export type ColorToken = keyof typeof colors;

/** Never colour alone: each accent has a paired shape. */
export const SHAPES = {
  orange: 'circle',
  sky: 'square',
  green: 'triangle',
  yellow: 'diamond',
  blue: 'star',
  vermillion: 'cross',
  purple: 'hexagon',
} as const;

export const typeScale = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
  display: 44,
} as const;

export const space = [0, 4, 8, 12, 16, 24, 32, 48] as const;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;
export const target = { min: 44, comfort: 48, gap: 8 } as const;

export const motionMs = { fast: 120, base: 200, slow: 320, celebrate: 600 } as const;
export type MotionToken = keyof typeof motionMs;

/** Body text: Nunito (self-hosted by the page; system fallbacks otherwise). */
export const FONT_STACK =
  '"Nunito Variable", Nunito, ui-rounded, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Headings, numbers and in-game text: Fredoka, rounded and bold. */
export const FONT_DISPLAY =
  '"Fredoka Variable", Fredoka, "Nunito Variable", ui-rounded, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** '#RRGGBB' → 0xRRGGBB for Phaser. */
export function colorNum(token: ColorToken | string): number {
  const hex = token.startsWith('#') ? token : colors[token as ColorToken];
  return Number.parseInt(hex.slice(1, 7), 16);
}

/** Mix two '#RRGGBB' colours: t = 0 → a, t = 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[16, 8, 0]
    .map((s) => ch(s).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** WCAG contrast ratio between two '#RRGGBB' colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
