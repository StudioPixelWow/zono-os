// ============================================================================
// 📘 ZONO — PERSONAL transport public surface (server-only).
// ----------------------------------------------------------------------------
// The neutral entry point the registry + UI-facing code import. It exposes the
// provider instance and a transport-generic "configured?" predicate. Callers
// here learn NOTHING about Evolution — that name lives only inside compat/.
// ============================================================================
import "server-only";
import { personalConfigured, workerPing } from "./compat";

export { personalTransportProvider } from "./adapter";

/** READ-ONLY infra liveness of the transport backend (root ping — no session).
 *  Neutral surface for SRE synthetic monitoring; callers learn nothing about
 *  the backend beyond ok/latency. */
export async function personalWorkerHealth(): Promise<{ ok: boolean; latencyMs: number | null }> {
  const r = await workerPing();
  return r.ok ? { ok: true, latencyMs: r.data.latencyMs } : { ok: false, latencyMs: null };
}

// Neutral re-export so ZONO's own personal webhook route can normalize inbound
// events WITHOUT importing the Evolution compat layer directly (C2/C9). The
// route stays Evolution-agnostic; all parsing lives inside compat/.
export { normalizeWebhook as normalizePersonalWebhook, type NormalizedWebhook } from "./compat";

/** True when the personal transport backend is configured for this deployment. */
export function personalTransportConfigured(): boolean {
  return personalConfigured();
}
