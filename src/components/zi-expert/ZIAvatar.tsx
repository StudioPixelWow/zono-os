"use client";
// ============================================================================
// ZI Expert™ — official ZI avatar (Phase 22). Uses the ONE official asset.
// Floating purple-gradient circle + soft glow. Never rotated / morphed /
// distorted; the face is never covered. Idle = very gentle float; thinking =
// soft pulse + glow. Online indicator dot.
// ============================================================================
import { useState } from "react";
import { Sparkles } from "lucide-react";

// The canonical ZONO mascot — self-hosted (no remote dependency). Drop the
// approved PNG at public/zono/zono-default.png; until then the avatar falls back
// to the Sparkles glyph (never a fabricated/placeholder asset).
export const ZI_AVATAR_URL = "/zono/zono-default.png";

export type ZiAvatarState = "idle" | "thinking" | "online";

export function ZIAvatar({ size = 56, state = "idle", showStatus = true, bare = false, className = "" }: {
  size?: number;
  state?: ZiAvatarState;
  showStatus?: boolean;
  /** Image-only: drop the purple disc + ring (used for the floating launcher). */
  bare?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`zi-avatar ${bare ? "zi-avatar--bare" : ""} ${state === "thinking" ? "zi-avatar--thinking" : "zi-avatar--idle"} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="zi-avatar__ring" />
      {failed ? (
        <span className="zi-avatar__fallback"><Sparkles size={size * 0.42} /></span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ZI_AVATAR_URL}
          alt="ZONO"
          className="zi-avatar__img"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
      {showStatus && <span className="zi-avatar__status" />}
    </span>
  );
}
