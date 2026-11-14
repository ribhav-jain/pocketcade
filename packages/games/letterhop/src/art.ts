// Letterhop art: Hop the frog, the night pond scene, lily pads and small icons, all as inline SVG strings.
// Pure strings (no DOM work at import). Colours are brand tokens or their darker shades.
// Inline SVG here never paints with url(#id) (gradients): in Chromium a cached computed style keeps the referenced
// shadow root alive, so every mount leaked its whole tree (playground leak test). Data-URI images may use them.

const INK = '#1D5A2C';

/** Hop: a lime frog in a sky-blue bow tie. Moods (idle / happy / sad) are toggled by CSS via [data-mood]. */
export const FROG = `<svg class="frog" viewBox="0 0 80 74" aria-hidden="true" focusable="false">
<ellipse cx="40" cy="70" rx="24" ry="4" fill="#04121c" opacity=".35"/>
<g fill="#62BF43" stroke="${INK}" stroke-width="3" stroke-linejoin="round">
<path d="M15 55C4 52 2 67 13 68h14c-2-7-6-11-12-13Z"/><path d="M65 55c11-3 13 12 2 13H53c2-7 6-11 12-13Z"/></g>
<path d="M40 27c18 0 29 11 29 24 0 12-12 18-29 18S11 63 11 51c0-13 11-24 29-24Z" fill="#8FDB46" stroke="${INK}" stroke-width="3"/>
<ellipse cx="31" cy="38" rx="10" ry="5" fill="#D4FF8A" opacity=".6"/>
<ellipse cx="40" cy="57" rx="15" ry="8.5" fill="#F0FFC9"/>
<g fill="#8FDB46" stroke="${INK}" stroke-width="3"><circle cx="25" cy="22" r="12.5"/><circle cx="55" cy="22" r="12.5"/></g>
<g class="eyes"><circle cx="25" cy="21" r="8.6" fill="#fff"/><circle cx="55" cy="21" r="8.6" fill="#fff"/>
<g class="pupils" fill="#120C2C"><circle cx="26.5" cy="22.5" r="4.8"/><circle cx="56.5" cy="22.5" r="4.8"/></g>
<g fill="#fff"><circle cx="28.3" cy="20.4" r="1.8"/><circle cx="58.3" cy="20.4" r="1.8"/></g>
<g class="lids" fill="#8DDB45" stroke="${INK}" stroke-width="2"><ellipse cx="25" cy="21" rx="9.6" ry="9.6"/><ellipse cx="55" cy="21" rx="9.6" ry="9.6"/></g></g>
<g fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round">
<path class="e-happy" d="M18 23q7-8 14 0M48 23q7-8 14 0"/>
<path class="brow" d="M17 11l11-5M63 11l-11-5"/>
<path class="m-idle" d="M28 37q12 9 24 0"/>
<path class="m-sad" d="M30 42q10-7 20 0"/></g>
<g class="m-happy"><path d="M27 35q13 16 26 0Z" fill="#C2264F" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/><ellipse cx="40" cy="43" rx="5" ry="2.6" fill="#FF8FB0"/></g>
<g stroke="#0E4A63" stroke-width="2" stroke-linejoin="round" fill="#38D6FF"><path d="M40 52l-9-5v10Z"/><path d="M40 52l9-5v10Z"/><circle cx="40" cy="52" r="2.6"/></g>
<g fill="#FF7FB8" opacity=".75"><ellipse cx="20" cy="39" rx="4.6" ry="2.6"/><ellipse cx="60" cy="39" rx="4.6" ry="2.6"/></g>
<g fill="#9BE34C" stroke="${INK}" stroke-width="2.5"><ellipse cx="30" cy="68" rx="6.5" ry="3.4"/><ellipse cx="50" cy="68" rx="6.5" ry="3.4"/></g>
</svg>`;

/** The night pond behind everything: moon, stars and reeds (fireflies are separate spans, see FIREFLIES). */
export const SCENE = `<svg class="scene" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
<g fill="#FFF3C4"><circle cx="350" cy="44" r="66" opacity=".06"/><circle cx="350" cy="44" r="46" opacity=".09"/><circle cx="350" cy="44" r="30" opacity=".14"/></g><circle cx="350" cy="44" r="16" fill="#FFF6D8"/><circle cx="356" cy="40" r="13" fill="#E9DDA8" opacity=".35"/>
<g fill="#E9DDFF" opacity=".7"><circle cx="40" cy="30" r="1.2"/><circle cx="120" cy="18" r="1"/><circle cx="210" cy="40" r="1.4"/><circle cx="270" cy="14" r="1"/><circle cx="300" cy="88" r="1.1"/><circle cx="80" cy="76" r="1"/><circle cx="170" cy="96" r=".9"/><circle cx="390" cy="120" r="1"/></g>
<g fill="#0A2E3A"><path d="M0 300V230q8-40 10-70 3 40 6 72 4-50 9-88 3 50 5 92 6-36 12-58-2 40 0 70 5-20 10-32-2 40 4 76Z"/>
<path d="M400 300v-74q-6-34-9-60-3 36-7 66-4-44-9-80-3 46-4 86-6-30-12-48 2 36 0 62-5-16-10-24 2 34-2 72Z"/></g>
<g fill="#0F3C48"><ellipse cx="18" cy="160" rx="3" ry="11"/><ellipse cx="25" cy="141" rx="3" ry="11"/><ellipse cx="384" cy="164" rx="3" ry="11"/></g>
</svg>`;

/** Firefly spots as [left %, top %, size px]; HTML spans so their twinkle stays on the compositor. */
export const FIREFLIES = [
  [12, 52, 5],
  [27, 72, 4],
  [83, 62, 5],
  [72, 82, 4],
  [50, 46, 3],
  [91, 86, 5],
  [6, 88, 4],
] as const;

/** CSS url() for an SVG string (no network: a data URI). */
export function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const padPath = 'M100 4c52 0 96 12 96 28s-44 26-96 26S4 48 4 32C4 19 34 8 78 5l22 25Z';
const veins =
  '<g stroke="#9BE58F" stroke-width="2" opacity=".55" fill="none"><path d="M100 30 30 22M100 30 26 40M100 30l66-14M100 30l74 12M100 30l10 24M100 30 70 54"/></g>';

/** A lily pad (200 × 62) under each rung; `kind` adds the goal's lotus or makes a ghost pad for empty rungs. */
export function padSvg(kind: 'pad' | 'goal' | 'ghost'): string {
  if (kind === 'ghost')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 62" preserveAspectRatio="none"><path d="${padPath}" fill="#7FD6A0" fill-opacity=".14" stroke="#9BE58F" stroke-opacity=".35" stroke-width="2.5" stroke-dasharray="7 7"/></svg>`;
  const lotus =
    kind === 'goal'
      ? '<g transform="translate(176 26)" stroke="#8A1F57" stroke-width="2" stroke-linejoin="round"><path d="M0 4C-14 2-18-8-16-12-8-12-2-6 0 4Z" fill="#FF7FB8"/><path d="M0 4C14 2 18-8 16-12 8-12 2-6 0 4Z" fill="#FF7FB8"/><path d="M0 4C-7-6-6-16 0-22 6-16 7-6 0 4Z" fill="#FFC1DD"/><circle cy="2" r="3" fill="#FFE14D" stroke="none"/></g>'
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 62" preserveAspectRatio="none"><defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5FD47A"/><stop offset="1" stop-color="#278A4A"/></linearGradient></defs><path d="${padPath}" transform="translate(0 3)" fill="#0B3A2A"/><path d="${padPath}" fill="url(#p)" stroke="#145A33" stroke-width="2.5"/>${veins}<path d="M30 14q30-8 60-9" stroke="#D6FFC4" stroke-width="3" stroke-linecap="round" opacity=".5" fill="none"/>${lotus}</svg>`;
}

/** Ripple rings for the pond panel background. */
export const RIPPLES = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><g fill="none" stroke="#7FE0FF" stroke-opacity=".09" stroke-width="2"><ellipse cx="50" cy="60" rx="30" ry="9"/><ellipse cx="50" cy="60" rx="18" ry="5"/><ellipse cx="180" cy="170" rx="34" ry="10"/><ellipse cx="180" cy="170" rx="20" ry="6"/><ellipse cx="200" cy="40" rx="16" ry="5"/></g></svg>`;

/** Flame for the daily streak badge. */
export const FLAME = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 1.5-5 3-6 0 2 1 3 2 3-1-3 0-6 1-9Z" fill="#FF9F1C" stroke="#7A2E00" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 12c2 2 3 3 3 5a3 3 0 0 1-6 0c0-1.5 1-2.5 3-5Z" fill="#FFE14D"/></svg>`;

/** Rating leaf (filled or empty). */
export function leaf(on: boolean): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2C6 2 3 8 3 13c0 5 4 9 9 9s9-4 9-9c0-5-3-11-9-11Z" transform="rotate(-30 12 12)" fill="${on ? '#9BE34C' : 'none'}" stroke="${on ? INK : '#7F77B0'}" stroke-width="2"/><path d="M12 21V8" transform="rotate(-30 12 12)" stroke="${on ? INK : '#7F77B0'}" stroke-width="1.6" fill="none"/></svg>`;
}

/** Small glyphs for action buttons. */
export const ICONS = {
  hop: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20V6M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  down: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v14M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  clear: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  help: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 9a3 3 0 1 1 4 2.8c-.8.4-1 1-1 2.2M12 18v.1" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>`,
} as const;
