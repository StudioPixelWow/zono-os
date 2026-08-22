"use client";
// ============================================================================
// ZONO — ZI Character System · <ZICharacter> (the ONE shared component).
// Renders the ZI mascot in one of nine states at one of three display levels,
// optionally with a title / message / action beside it. Never hardcodes an image
// path (uses the registry). Accessibility-first: decorative by default (alt="",
// aria-hidden); when it carries a title/message it is announced with a real,
// meaning-based alt and the text is always present as HTML. Animations are gentle,
// CSS-only, and fully disabled under prefers-reduced-motion. Only the requested
// state is loaded (next/image, width/height set → no layout shift).
// ============================================================================
import Image from "next/image";
import Link from "next/link";
import { ZI_STATES, ZI_STATE_ALT, type ZIState, type ZISize, type ZIPlacement } from "@/lib/characters/zi-registry";

const SIZE_PX: Record<ZISize, number> = { xs: 44, sm: 64, md: 120, lg: 190, xl: 240 };

export interface ZICharacterAction { label: string; href: string }

export function ZICharacter({
  state,
  size = "md",
  placement = "inline",
  message,
  title,
  action,
  className = "",
  animate = true,
  priority = false,
  decorative,
}: {
  state: ZIState;
  size?: ZISize;
  placement?: ZIPlacement;
  message?: string;
  title?: string;
  action?: ZICharacterAction;
  className?: string;
  animate?: boolean;
  priority?: boolean;
  /** Force decorative (alt="", aria-hidden). Defaults to true when no text is given. */
  decorative?: boolean;
}) {
  const hasText = !!(title || message || action);
  const isDecorative = decorative ?? !hasText;
  const px = SIZE_PX[size];

  const figure = (
    <span
      className={`zi-char zi-char--${size} zi-char--${state} ${animate ? "zi-char--anim" : ""} ${placement === "card-edge" ? "zi-char--edge" : ""}`}
    >
      <span className="zi-char__glow" aria-hidden="true" />
      <Image
        src={ZI_STATES[state]}
        width={px}
        height={px}
        priority={priority}
        alt={isDecorative ? "" : ZI_STATE_ALT[state]}
        aria-hidden={isDecorative || undefined}
        className="zi-char__img"
        draggable={false}
      />
    </span>
  );

  if (!hasText) return <span className={`zi-char-wrap ${className}`}>{figure}</span>;

  return (
    <div className={`zi-char-block zi-char-block--${placement} ${className}`}>
      {figure}
      <div className="zi-char-block__body">
        {title && <p className="zi-char-block__title">{title}</p>}
        {message && <p className="zi-char-block__msg">{message}</p>}
        {action && (
          <Link href={action.href} className="zi-char-block__cta">
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}
