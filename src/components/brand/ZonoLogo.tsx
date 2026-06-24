// ============================================================================
// ZONO — official brand logo. Single source of truth for the logo asset so a
// future swap (e.g. self-host at /zono-logo.png) is a one-line change. The logo
// is used exactly as provided — never recreated, recolored, distorted, or cropped.
// Transparent PNG; rendered with object-contain to preserve proportions and stay
// sharp at every size.
// ============================================================================

/** The official ZONO logo URL (provided by the brand owner). To self-host,
 *  save the file to `public/zono-logo.png` and set this to "/zono-logo.png". */
export const ZONO_LOGO_SRC =
  "https://s-pixel.co.il/wp-content/uploads/2026/06/6e81441e-b248-45dd-8ab9-68dfe0b32902.png";

export function ZonoLogo({
  className = "",
  width = 168,
  height = 56,
  priority = false,
}: {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ZONO_LOGO_SRC}
      alt="ZONO"
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={`select-none object-contain ${className}`}
      style={{ width, height: "auto", maxWidth: "100%" }}
    />
  );
}
