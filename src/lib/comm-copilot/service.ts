// ============================================================================
// 🤖 ZONO — Copilot SERVICE (server-only). Phase 1.
// ----------------------------------------------------------------------------
// Wires the canonical read → deterministic pipeline → hash-gated persistence.
// Org comes from the authenticated session. Freshness reasons: `new_message`
// (hash-gated, no rewrite if unchanged), `reopened`/`manual` (forced, but still
// a no-op when the deterministic output is truly identical). No LLM in Phase 1 —
// fully deterministic; a later phase enriches only when the hash changes.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { loadConversationView } from "./read";
import { runCopilotPipeline } from "./pipeline";
import { persistInsight } from "./persist";

export type FreshnessReason = "new_message" | "reopened" | "manual";

export interface GenerateResult { ok: boolean; changed?: boolean; classification?: string; error?: string }

/** Generate (and persist) the Copilot insight + summary for a conversation. */
export async function generateConversationInsight(conversationRef: string, reason: FreshnessReason): Promise<GenerateResult> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return { ok: false, error: "no_org" };

  const view = await loadConversationView(conversationRef);
  if (!view) return { ok: false, error: "not_found" };

  const nowIso = new Date().toISOString();
  const result = runCopilotPipeline(view, nowIso);
  const force = reason === "manual" || reason === "reopened";
  const r = await persistInsight(profile.org_id, result, nowIso, force);
  return { ok: true, changed: r.changed, classification: r.classification };
}
