// ============================================================================
// 📘 ZONO — PERSONAL transport public surface (server-only).
// ----------------------------------------------------------------------------
// The neutral entry point the registry + UI-facing code import. It exposes the
// provider instance and a transport-generic "configured?" predicate. Callers
// here learn NOTHING about Evolution — that name lives only inside compat/.
// ============================================================================
import "server-only";
import {
  personalConfigured, workerPing,
  fetchContacts, fetchChats, fetchChatMessages,
  type CompatResult, type CanonicalChat, type CanonicalContact, type CanonicalMessage,
} from "./compat";
import type { WaSessionCtx } from "../types";

export { personalTransportProvider } from "./adapter";

// Neutral read surface. These forward to the compat layer so callers above the
// provider boundary never import Evolution internals (C2/C9). The canonical
// contact/chat/message DTOs carry only neutral fields (phone/name/body/at).
export type { CanonicalChat, CanonicalContact, CanonicalMessage } from "./compat";

/** READ the connected account's contacts (personal chats only). */
export async function personalFetchContacts(ctx: WaSessionCtx): Promise<CompatResult<CanonicalContact[]>> {
  return fetchContacts(ctx);
}

/** READ the connected account's EXISTING chats (personal only). */
export async function personalFetchChats(ctx: WaSessionCtx): Promise<CompatResult<CanonicalChat[]>> {
  return fetchChats(ctx);
}

/** READ a single chat's messages by contact phone. */
export async function personalFetchChatMessages(ctx: WaSessionCtx, phone: string): Promise<CompatResult<CanonicalMessage[]>> {
  return fetchChatMessages(ctx, phone);
}

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
