// ============================================================================
// ZONO Public Sites — the SINGLE icon source of truth (server-safe).
// ----------------------------------------------------------------------------
// The generated Office / Agent / Property templates each used to define their
// own inline <svg> glyphs at hardcoded tiny sizes (14-20px), decoupled from the
// internal dashboard Icon — which is why the internal icon-size upgrade never
// reached the public sites. PublicIcon replaces all of them with ONE primitive
// driven by SEMANTIC size tokens, so icons are consistent and correctly scaled
// across every public template. currentColor + brand vars keep them themeable.
// ============================================================================
import type { CSSProperties } from "react";

export type PublicIconName =
  | "map" | "megaphone" | "handshake" | "scale" | "pin" | "phone" | "mail"
  | "home" | "bed" | "ruler" | "stairs" | "whatsapp" | "check" | "star"
  | "building" | "users" | "key" | "chart" | "arrow" | "heart" | "calendar"
  | "shield" | "search" | "sparkle" | "award";

/** Semantic sizes (px). inline/button 18-20 - feature 24-30 - hero 32-36. */
export type PublicIconSize = "inline" | "button" | "feature" | "hero";
const SIZE_PX: Record<PublicIconSize, number> = { inline: 19, button: 20, feature: 28, hero: 34 };

const STROKE: Partial<Record<PublicIconName, string>> = {
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h3l4 4V6L7 10H4a1 1 0 0 0-1 1Zm13-4a6 6 0 0 1 0 10",
  handshake: "m8 12 3 3 5-5m-9 2-3-3 4-4 3 2 3-2 4 4-3 3",
  scale: "M12 3v18M5 7h14M7 7l-3 6a3 3 0 0 0 6 0L7 7Zm10 0-3 6a3 3 0 0 0 6 0l-3-6Z",
  pin: "M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z",
  mail: "M3 5h18v14H3zM3 7l9 6 9-6",
  home: "M3 11 12 4l9 7M5 10v9h5v-5h4v5h5v-9",
  bed: "M3 8v10M3 12h18v6M21 12v-1a3 3 0 0 0-3-3h-5v4",
  ruler: "m4 16 12-12 4 4L8 20l-4-4Zm3-3 2 2m1-5 2 2m1-5 2 2",
  stairs: "M4 20h4v-4h4v-4h4V8h4",
  check: "m5 13 4 4L19 7",
  star: "m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3.4 1.1-6.5L2.6 9.8l6.5-.9L12 3Z",
  building: "M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M14 9h4a2 2 0 0 1 2 2v10M4 21h18M8 7h2M8 11h2M8 15h2",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 10v-2a4 4 0 0 0-3-3.9M16 4.1a4 4 0 0 1 0 7.8",
  key: "M15 7a4 4 0 1 1-5.7 3.6L4 16v3h3l1-1v-2h2l1-1v-2l1.3-1.3A4 4 0 0 1 15 7Z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  arrow: "M5 12h14M13 6l6 6-6 6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  shield: "M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z",
  search: "M11 11a5 5 0 1 0 0-.01M20 20l-3.5-3.5",
  sparkle: "M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3",
  award: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm-3 .5L7 22l5-2 5 2-2-6.5",
};
const FILL: Partial<Record<PublicIconName, string>> = {
  phone: "M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11 11 0 0 0 3.4.55 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .55 3.4 1 1 0 0 1-.25 1z",
  whatsapp: "M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.2 1.2-1.7 1.2-.4 0-1 .1-3.2-.9-2.7-1.1-4.4-3.9-4.6-4.1-.1-.2-1-1.4-1-2.6s.6-1.8.9-2.1c.2-.2.5-.3.6-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.5c-.2.2-.3.4-.1.7.2.3.9 1.4 1.9 2.3 1.3 1.1 2.3 1.5 2.6 1.6.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.6-.1l2 1c.2.1.4.2.4.3.1.2.1.9-.1 1.6Z",
  heart: "M12 21s-7-4.4-9.5-8.5C.7 9.3 2 6 5.2 6c1.9 0 3 1 3.8 2 .8-1 1.9-2 3.8-2 3.2 0 4.5 3.3 2.7 6.5C19 16.6 12 21 12 21Z",
};

export interface PublicIconProps {
  name: PublicIconName;
  size?: PublicIconSize | number;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

export function PublicIcon({ name, size = "inline", className, strokeWidth, style }: PublicIconProps) {
  const px = typeof size === "number" ? size : SIZE_PX[size];
  const filled = FILL[name];
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" width={px} height={px} fill="currentColor" aria-hidden className={className} style={style}>
        <path d={filled} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={px} height={px} fill="none" stroke="currentColor" strokeWidth={strokeWidth ?? 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className} style={style}>
      <path d={STROKE[name] ?? STROKE.home} />
    </svg>
  );
}
