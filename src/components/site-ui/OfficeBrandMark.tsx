/* eslint-disable @next/next/no-img-element -- office logo is an external CDN url; next/image would require remotePatterns */
// ============================================================================
// 🏛️ ZONO Website Design System™ — OfficeBrandMark (server-safe).
// The single, shared, premium way to render an office logo across every public
// site (nav, hero, footer, agent attribution, property broker block, mobile).
// Rules enforced here so no surface ever gets it wrong:
//   • preserve aspect ratio — object-contain, never crop, never stretch
//   • a subtle white/glass container ONLY when needed (dark surfaces / boxed)
//   • contrast treatment chosen from the surface context (light vs dark)
//   • office name is the accessible alt text
//   • no logo → elegant typography fallback (initial chip + office name)
//   • never substitutes the ZONO logo for the office logo
// Handles horizontal, square, transparent, light and dark logos gracefully.
// ============================================================================
import Link from "next/link";

type Surface = "light" | "dark";
type Size = "sm" | "md" | "lg" | "xl";

const LOGO_H: Record<Size, string> = { sm: "h-8", md: "h-10", lg: "h-14", xl: "h-16" };
const LOGO_MAXW: Record<Size, string> = { sm: "max-w-[150px]", md: "max-w-[190px]", lg: "max-w-[260px]", xl: "max-w-[300px]" };
const NAME_TXT: Record<Size, string> = { sm: "text-[15px]", md: "text-[17px]", lg: "text-2xl", xl: "text-3xl" };
const CHIP: Record<Size, string> = { sm: "h-8 w-8 text-[13px]", md: "h-10 w-10 text-[15px]", lg: "h-12 w-12 text-lg", xl: "h-14 w-14 text-xl" };

/** First meaningful letters of the office name for the typography fallback. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Z";
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] + words[1][0]);
}

export function OfficeBrandMark({
  name, logo, surface = "light", size = "md", href = null, variant = "mark", boxed = false, className = "",
}: {
  /** Office name — accessible alt text + typography fallback. */
  name: string;
  logo: string | null;
  /** Where the mark sits: over dark imagery vs on a light surface. Drives contrast. */
  surface?: Surface;
  size?: Size;
  href?: string | null;
  /** `mark` = logo/chip only; `lockup` = logo/chip + office name text beside it. */
  variant?: "mark" | "lockup";
  /** Force the subtle glass container even on light surfaces (e.g. busy hero). */
  boxed?: boolean;
  className?: string;
}) {
  const onDark = surface === "dark";
  const nameCls = onDark ? "text-white drop-shadow" : "text-ink";

  let inner: React.ReactNode;
  if (logo) {
    // A subtle container guarantees legibility for dark / non-transparent logos on
    // dark surfaces, and adds premium framing when explicitly boxed.
    const needsBox = onDark || boxed;
    const img = (
      <img
        src={logo}
        alt={name || "לוגו המשרד"}
        loading="lazy"
        decoding="async"
        className={`${LOGO_H[size]} ${LOGO_MAXW[size]} w-auto object-contain`}
      />
    );
    const framed = needsBox ? (
      <span className={`inline-flex items-center rounded-2xl px-3 py-2 ${onDark ? "border border-white/50 bg-white/85 shadow-[0_6px_20px_rgba(15,23,42,0.18)] backdrop-blur-md" : "border-line border bg-white shadow-[var(--shadow-soft)]"}`}>
        {img}
      </span>
    ) : img;
    inner = variant === "lockup"
      ? <span className="flex items-center gap-2.5">{framed}<span className={`${NAME_TXT[size]} font-black ${nameCls}`}>{name}</span></span>
      : framed;
  } else {
    // Elegant typography fallback — a gradient initial chip + the office name.
    // Never a blank box, never the ZONO logo.
    const chip = (
      <span
        className={`grid ${CHIP[size]} shrink-0 place-items-center rounded-2xl font-black text-white shadow-[0_6px_18px_rgba(109,40,217,0.25)]`}
        style={{ background: "var(--site-gradient, linear-gradient(135deg,#7c3aed,#a78bfa))" }}
        aria-hidden
      >
        {initials(name).toUpperCase()}
      </span>
    );
    inner = variant === "mark"
      ? chip
      : <span className="flex items-center gap-2.5">{chip}<span className={`${NAME_TXT[size]} font-black tracking-tight ${nameCls}`}>{name}</span></span>;
  }

  if (href) {
    return (
      <Link href={href} aria-label={name || "לוגו המשרד"} className={`zono-focus-ring inline-flex items-center rounded-xl ${className}`}>
        {inner}
      </Link>
    );
  }
  return <span className={`inline-flex items-center ${className}`}>{inner}</span>;
}
