// ============================================================================
// ZONO — P6.1 AI Usage & Cost · the ONE canonical writer (server-only).
// recordAiUsage() is the single entry point for AI provider usage/economics.
// Best-effort by contract: it NEVER throws to its caller, so recording usage can
// never turn a successful AI product action into a failure. Org identity is
// server-derived (session or explicit background orgId) — never trusted from the
// browser. Stores METADATA ONLY (sanitized); prompts/completions/secrets can
// never enter a record. Cost is authoritative-source-only, else NULL/unavailable.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  isValidFeature, isValidRequestType, normalizeProvider, normalizeModel,
  reconcileTokens, resolveCost, sanitizeAiMetadata, FORBIDDEN_AI_KEYS,
  type AiFeatureKey, type AiRequestType, type AiStatus, type AiErrorCategory,
} from "../model";

export interface RecordAiUsageInput {
  feature: AiFeatureKey;
  provider: string;                 // raw hint; normalized internally
  model: string;                    // raw model id; normalized internally
  requestType?: AiRequestType;
  status: AiStatus;
  inputTokens?: number | null;      // provider-reported ONLY (never estimated)
  outputTokens?: number | null;
  totalTokens?: number | null;
  errorCategory?: AiErrorCategory | null;
  durationMs?: number | null;
  attempt?: number;                 // provider invocation # (retries each recorded)
  sourceEventId?: string | null;    // domain_events.id link
  /** Only set from an AUTHORITATIVE source (provider cost field / verified pricing). */
  authoritativeCost?: { amount: number; currency: string } | null;
  metadata?: Record<string, unknown>;
  // Background/service-role context (no session): supply org, optional user.
  orgId?: string;
  userId?: string | null;
}

export interface RecordAiUsageResult { ok: boolean; id?: string; error?: string }

/** Record one AI provider invocation. Never throws — returns a structured result. */
export async function recordAiUsage(input: RecordAiUsageInput): Promise<RecordAiUsageResult> {
  try {
    if (!isValidFeature(input.feature)) return { ok: false, error: "invalid feature key" };

    let orgId = input.orgId ?? null;
    let userId = input.userId ?? null;
    if (!orgId) {
      const { user, profile } = await getSessionContext();
      orgId = profile?.org_id ?? null;
      if (userId === null) userId = user?.id ?? null;
    }
    if (!orgId) return { ok: false, error: "no org context" };

    const tokens = reconcileTokens(input.inputTokens, input.outputTokens, input.totalTokens);
    const cost = resolveCost(tokens, input.authoritativeCost ?? null);
    const requestType = input.requestType && isValidRequestType(input.requestType) ? input.requestType : "chat";

    // Metadata: sanitize, then hard-strip any forbidden content/secret keys as
    // a second line of defense (the writer must NEVER persist AI content).
    const safeMeta = sanitizeAiMetadata(input.metadata ?? {});
    for (const k of Object.keys(safeMeta)) {
      if (FORBIDDEN_AI_KEYS.some((f) => k.toLowerCase().includes(f))) delete safeMeta[k];
    }

    const row = {
      organization_id: orgId,
      user_id: userId,
      feature_key: input.feature,
      provider: normalizeProvider(input.provider),
      model: normalizeModel(input.model),
      request_type: requestType,
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      total_tokens: tokens.total,
      cost_amount: cost.costAmount,
      currency: cost.currency,
      cost_basis: cost.basis,
      status: input.status,
      error_category: input.status === "failed" ? (input.errorCategory ?? "unknown") : null,
      duration_ms: numOrNull(input.durationMs),
      attempt: input.attempt && input.attempt > 0 ? Math.floor(input.attempt) : 1,
      source_event_id: input.sourceEventId ?? null,
      metadata: safeMeta as never,
    };

    const db = createServiceRoleClient();
    const { data, error } = await db.from("ai_usage_costs" as never).insert(row as never).select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: (data as { id: string } | null)?.id };
  } catch (e) {
    console.error("[ai-usage] recordAiUsage failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "record failed" };
  }
}

function numOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.floor(v);
}
