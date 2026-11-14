// One inline-SVG icon set for the portal (24 × 24, currentColor, decorative: always aria-hidden).
// Every category id has an icon of the same name.

const PATHS = {
  play: (
    <path
      d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"
      fill="currentColor"
      stroke="none"
    />
  ),
  rotate: (
    <path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15m0 5v-5h5" />
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  restart: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />,
  trophy: (
    <path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" />
  ),
  search: <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5" />,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  star: (
    <path
      d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
      fill="currentColor"
      stroke="none"
    />
  ),
  sparkle: (
    <path
      d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7zM19 16c.3 1.6 1 2.3 2.5 2.5-1.6.3-2.3 1-2.5 2.5-.3-1.6-1-2.3-2.5-2.5 1.6-.3 2.3-1 2.5-2.5z"
      fill="currentColor"
      stroke="none"
    />
  ),
  bolt: <path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z" fill="currentColor" stroke="none" />,
  clock: <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3 2" />,
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" strokeWidth="3" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
  ),
  shield: <path d="M12 3l7.5 3v5.5c0 4.7-3.2 8-7.5 9.5-4.3-1.5-7.5-4.8-7.5-9.5V6zM9 12l2 2 4-4" />,
  code: <path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />,
  devices: (
    <>
      <rect x="2.5" y="4.5" width="14" height="10" rx="2" />
      <path d="M6 18.5h7" />
      <rect x="16.5" y="8.5" width="5" height="11" rx="1.5" />
    </>
  ),
  grid: <path d="M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z" />,
  history: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5M12 8v4.5l3 1.5" />,
  fire: (
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.8.3 2 1.4 3.2 2.6 3.7C11.4 6.8 13 4.4 15.6 3c-.6 3.4 2.9 5.5 2.9 10.4 0 4.5-2.7 7.6-6.5 7.6z" />
  ),
  // categories
  arcade: (
    <>
      <path d="M12 3.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 9.5v5" />
      <rect x="3.5" y="14.5" width="17" height="6" rx="2.5" />
      <path d="M7 17.5h.01M17 17.5h.01" strokeWidth="3" />
    </>
  ),
  puzzle: (
    <path d="M10 3.5h0a2 2 0 0 1 2 2v1h4a1 1 0 0 1 1 1v4h1a2 2 0 0 1 0 4h-1v4a1 1 0 0 1-1 1h-4v-1a2 2 0 0 0-4 0v1H4a1 1 0 0 1-1-1v-4h1a2 2 0 0 0 0-4H3v-4a1 1 0 0 1 1-1h4v-1a2 2 0 0 1 2-2z" />
  ),
  word: (
    <>
      <rect x="2.5" y="6.5" width="8.5" height="11" rx="2" />
      <rect x="13" y="6.5" width="8.5" height="11" rx="2" />
      <path
        d="M5 15l1.8-5.5L8.6 15M5.6 13.2h2.4M15.5 9.5h2.2a1.4 1.4 0 0 1 0 2.8h-2.2zm0 2.8h2.6a1.4 1.4 0 0 1 0 2.8h-2.6z"
        strokeWidth="1.6"
      />
    </>
  ),
  'cards-and-board': (
    <>
      <rect x="3.5" y="5" width="10" height="14" rx="2" transform="rotate(-10 8.5 12)" />
      <rect x="10.5" y="5" width="10" height="14" rx="2" transform="rotate(8 15.5 12)" />
      <path d="M15.6 10.5l-1.3 2 1.3 2 1.3-2z" fill="currentColor" />
    </>
  ),
  brain: (
    <path d="M9 4.5a3 3 0 0 0-3 3v.3A3 3 0 0 0 4 10.5a3 3 0 0 0 1 2.3 3 3 0 0 0 1 4.4A3 3 0 0 0 9 19.5a2.5 2.5 0 0 0 3-1V5.7A2.5 2.5 0 0 0 9 4.5zM15 4.5a3 3 0 0 1 3 3v.3a3 3 0 0 1 2 2.7 3 3 0 0 1-1 2.3 3 3 0 0 1-1 4.4 3 3 0 0 1-3 2.3 2.5 2.5 0 0 1-3-1" />
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The Pocketcade mark: a sunset "pocket" with a stitched rim holding a gold star. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="pc-pocket" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF4FA3" />
          <stop offset="1" stopColor="#FF9F1C" />
        </linearGradient>
        <linearGradient id="pc-star" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF3A8" />
          <stop offset="1" stopColor="#FFC83D" />
        </linearGradient>
      </defs>
      <path
        d="M8 14h48v20c0 13.3-10.7 24-24 24S8 47.3 8 34z"
        fill="#A8326B"
        transform="translate(0 3)"
      />
      <path d="M8 14h48v20c0 13.3-10.7 24-24 24S8 47.3 8 34z" fill="url(#pc-pocket)" />
      <path
        d="M13 20h38"
        stroke="#FFF9F2"
        strokeOpacity=".75"
        strokeWidth="2.5"
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      <path
        d="M32 25.5l3.6 7.3 8 1.2-5.8 5.6 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.6 8-1.2z"
        fill="url(#pc-star)"
        stroke="#120C2C"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M8 14h48" stroke="#120C2C" strokeOpacity=".25" strokeWidth="3" />
    </svg>
  );
}
