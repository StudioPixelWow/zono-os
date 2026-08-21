// ============================================================================
// ZONO — AI presence: PURE semantic state/variant maps (no deps, no I/O). ONE
// definition of the product persona's voice, the mascot asset per state, the
// size scale, and the variant → (label, tone, mark-state) mapping. Presentational
// components consume this; they never compute intelligence. Never fabricates
// content — it only names and styles real, already-computed items.
// ============================================================================

export type ZonoState = "default" | "thinking" | "idea" | "opportunity" | "attention" | "success" | "welcome";
export type ZonoSize = "micro" | "compact" | "standard" | "hero";
export type ZonoVariant = "notice" | "insight" | "recommendation" | "opportunity" | "warning" | "success";

/** The product-wide "open the existing ZONO chat" trigger (no seeded context in
 *  P0 — contextual handoff is a later phase). AskZono dispatches it; ZIWidget listens. */
export const ZONO_OPEN_CHAT_EVENT = "zono:open-chat";

// ONE self-hosted canonical mascot. All semantic states map to it today — no
// fabricated poses. Drop the approved PNG at public/zono/zono-default.png; until
// then ZonoMark falls back to a clean Sparkles glyph (never a placeholder image).
export const ZONO_ASSET_DEFAULT = "/zono/zono-default.png";
export const ZONO_STATE_ASSET: Record<ZonoState, string> = {
  default: ZONO_ASSET_DEFAULT,
  thinking: ZONO_ASSET_DEFAULT,
  idea: ZONO_ASSET_DEFAULT,
  opportunity: ZONO_ASSET_DEFAULT,
  attention: ZONO_ASSET_DEFAULT,
  success: ZONO_ASSET_DEFAULT,
  welcome: ZONO_ASSET_DEFAULT,
};

// P0 operational surfaces use micro / compact / standard only. No hero in P0.
export const ZONO_SIZE_PX: Record<ZonoSize, number> = { micro: 24, compact: 36, standard: 56, hero: 96 };

export interface ZonoVariantMeta { label: string; state: ZonoState; chip: string; icon: string }

/** variant → product-facing Hebrew label + tone tokens + mascot state. Tone is
 *  carried by chip color AND an icon+text label (never color alone). */
export const ZONO_VARIANT_META: Record<ZonoVariant, ZonoVariantMeta> = {
  notice:         { label: "זונו שם לב",      state: "attention",   chip: "bg-warning-soft text-warning",    icon: "AlertTriangle" },
  insight:        { label: "התובנה של זונו",  state: "idea",        chip: "bg-brand-soft text-brand-strong", icon: "Sparkles" },
  recommendation: { label: "זונו ממליץ",      state: "idea",        chip: "bg-brand-soft text-brand-strong", icon: "Sparkles" },
  opportunity:    { label: "זונו מצא הזדמנות", state: "opportunity", chip: "bg-success-soft text-success",    icon: "Sparkles" },
  warning:        { label: "אזהרה של זונו",   state: "attention",   chip: "bg-danger-soft text-danger",      icon: "AlertTriangle" },
  success:        { label: "זונו סיים",        state: "success",     chip: "bg-success-soft text-success",    icon: "CheckCircle" },
};
