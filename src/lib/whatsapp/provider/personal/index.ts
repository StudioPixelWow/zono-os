// ============================================================================
// 📘 ZONO — PERSONAL transport public surface (server-only).
// ----------------------------------------------------------------------------
// The neutral entry point the registry + UI-facing code import. It exposes the
// provider instance and a transport-generic "configured?" predicate. Callers
// here learn NOTHING about Evolution — that name lives only inside compat/.
// ============================================================================
import "server-only";
import { personalConfigured } from "./compat";

export { personalTransportProvider } from "./adapter";

// Neutral re-export so ZONO's own personal webhook route can normalize inbound
// events WITHOUT importing the Evolution compat layer directly (C2/C9). The
// route stays Evolution-agnostic; all parsing lives inside compat/.
export { normalizeWebhook as normalizePersonalWebhook, type NormalizedWebhook } from "./compat";

/** True when the personal transport backend is configured for this deployment. */
export function personalTransportConfigured(): boolean {
  return personalConfigured();
}
