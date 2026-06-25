"use client";
// ============================================================================
// ZI Expert™ — official ZI avatar (Phase 22). Uses the ONE official asset.
// Floating purple-gradient circle + soft glow. Never rotated / morphed /
// distorted; the face is never covered. Idle = very gentle float; thinking =
// soft pulse + glow. Online indicator dot.
// ============================================================================
import { useState } from "react";
import { Sparkles } from "lucide-react";

// The single official ZI avatar (Hebrew filename, URL-encoded).
export const ZI_AVATAR_URL = "https://s-pixel.co.il/wp-content/uploads/2026/06/%D7%A6-%D7%91%D7%91%D7%95.png";
const ZI_AVATAR_LOCAL = "/zi-avatar.png";

export type ZiAvatarState = "idle" | "thinking" | "online";

export function ZIAvatar({ size = 56, state = "idle", showStatus = true, className = "" }: {
  size?: number;
  state?: ZiAvatarState;
  showStatus?: boolean;
  className?: string;
}) {
  const [src, setSrc] = useState(ZI_AVATAR_URL);
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`zi-avatar ${state === "thinking" ? "zi-avatar--thinking" : "zi-avatar--idle"} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="zi-avatar__ring" />
      {failed ? (
        <span className="zi-avatar__fallback"><Sparkles size={size * 0.42} /></span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="ZI"
          className="zi-avatar__img"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => { if (src !== ZI_AVATAR_LOCAL) setSrc(ZI_AVATAR_LOCAL); else setFailed(true); }}
        />
      )}
      {showStatus && <span className="zi-avatar__status" />}
    </span>
  );
}
