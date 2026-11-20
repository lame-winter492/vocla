// Small line glyphs in the spirit of SF Symbols, for menus and toolbars.
// iOS menus put the symbol after the label, aligned on the trailing edge.
import type { ReactNode } from "react";

const g = (d: ReactNode, size = 18) => (
  <svg className="glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

export const GLYPH = {
  open: g(<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />),
  rename: g(<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />),
  options: g(
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>,
  ),
  export: g(<path d="M12 15V3M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />),
  trash: g(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />),
  check: g(<path d="m5 12 5 5 9-10" />),
  up: g(<path d="m6 15 6-6 6 6" />, 14),
  down: g(<path d="m6 9 6 6 6-6" />, 14),
  grid: g(
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>,
  ),
  list: g(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />),
  more: g(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </>,
    20,
  ),
  select: g(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>,
  ),
  suspend: g(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6M14 9v6" />
    </>,
  ),
  flag: g(<path d="M5 21V4M5 4h11l-2 4 2 4H5" />),
  chevron: g(<path d="m9 6 6 6-6 6" />, 14),
};

/** A stable hue for a name, so a deck or course keeps its colour (like Safari's monogram icons). */
export function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Rounded-square tile with a letter or two, coloured from the name. */
export function Monogram({ name, text, size }: { name: string; text?: string; size?: "sm" | "lg" }) {
  const t = (text ?? name.trim().charAt(0)).toUpperCase() || "?";
  return (
    <span className={`monogram${size ? ` ${size}` : ""}`} style={{ ["--h" as string]: hueOf(name) }} aria-hidden="true">
      {t}
    </span>
  );
}
