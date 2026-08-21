"use client";
// ============================================================================
// ZONO — the mascot mark. The ONE way ZONO's face appears in the product. Renders
// the self-hosted canonical asset at an explicit size (no layout shift); on a
// missing/failed asset it degrades to a clean brand Sparkles glyph — never a
// broken image, never a fabricated pose. Decorative by default (aria-hidden):
// the surrounding TEXT always carries the meaning. Micro/compact/standard for P0
// operational surfaces; hero is reserved for future moment screens.
// ============================================================================
import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { ZONO_SIZE_PX, ZONO_STATE_ASSET, type ZonoSize, type ZonoState } from "./states";

export function ZonoMark({ size = "compact", state = "default", label, className = "" }: {
  size?: ZonoSize;
  state?: ZonoState;
  /** Set only when the mark is the sole carrier of meaning (rare) → real alt/role. */
  label?: string;
  className?: string;
}) {
  const px = ZONO_SIZE_PX[size];
  const [failed, setFailed] = useState(false);
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };

  if (failed) {
    return (
      <span {...a11y} className={`bg-brand-soft text-brand-strong grid shrink-0 place-items-center rounded-full ${className}`} style={{ width: px, height: px }}>
        <Icon name="Sparkles" size={Math.round(px * 0.55)} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- one small self-hosted mascot; next/image loader not configured for this asset
    <img
      src={ZONO_STATE_ASSET[state]} alt={label ?? ""} width={px} height={px}
      loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)}
      {...(label ? {} : { "aria-hidden": true })}
      className={`shrink-0 rounded-full object-contain ${className}`} style={{ width: px, height: px }}
    />
  );
}
