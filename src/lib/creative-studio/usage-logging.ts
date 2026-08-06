// ============================================================================
// ZONO creative-studio — usage / cost / performance logging.
//
// Uses the EXISTING ZONO-native `usage_events` table (no new billing model).
// Every generation / edit / retry / refinement / variant records a structured,
// REDACTED event. Never logs API keys, raw secrets, sensitive prompts, personal
// data, or binary image bytes. Cost fields distinguish provider-reported vs
// estimated vs unavailable — an exact cost is never invented.
// ============================================================================

export type UsageOperation = "generate" | "edit" | "retry" | "refine" | "variant" | "qa";
export type CostBasis = "provider_reported" | "estimated" | "unavailable";

export interface UsageEventInput {
  orgId: string;
  actorId: string | null;
  campaignId?: string | null;
  contentItemId?: string | null;
  creativeRequestId?: string | null;
  outputId?: string | null;
  provider: string;
  model: string;
  operation: UsageOperation;
  inputImages?: number;
  outputImages?: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number;
  attempt?: number;
  retryReason?: string | null;
  qaResult?: "passed" | "failed" | "manual_review" | null;
  providerUsage?: Record<string, number> | null;   // e.g. { input_tokens, output_tokens } if returned
  cost?: { basis: CostBasis; amountUsd?: number | null };
  success: boolean;
  errorClass?: string | null;   // safe class only (never raw provider text)
}

export interface UsageEventRow {
  org_id: string;
  actor_id: string | null;
  event_type: "creative_generation";
  occurred_at_hint: null;   // caller stamps real time on persist
  payload: Record<string, unknown>;
}

const SENSITIVE_KEYS = /(key|secret|token|authorization|prompt|password|api)/i;

/** Strip any accidentally-sensitive keys from a shallow object. Pure. */
export function redact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.test(k)) continue;
    if (typeof v === "string" && v.length > 512) continue; // drop oversized blobs (e.g. base64)
    out[k] = v;
  }
  return out;
}

/** Build a redacted usage_events row. Pure — no I/O. */
export function buildUsageEvent(input: UsageEventInput): UsageEventRow {
  const payload = redact({
    provider: input.provider,
    model: input.model,
    operation: input.operation,
    campaign_id: input.campaignId ?? null,
    content_item_id: input.contentItemId ?? null,
    creative_request_id: input.creativeRequestId ?? null,
    output_id: input.outputId ?? null,
    input_images: input.inputImages ?? 0,
    output_images: input.outputImages ?? 0,
    width: input.width ?? null,
    height: input.height ?? null,
    duration_ms: input.durationMs ?? null,
    attempt: input.attempt ?? 1,
    retry_reason: input.retryReason ?? null,
    qa_result: input.qaResult ?? null,
    provider_usage: input.providerUsage ?? null,
    cost_basis: input.cost?.basis ?? "unavailable",
    cost_usd: input.cost?.basis === "provider_reported" || input.cost?.basis === "estimated" ? (input.cost?.amountUsd ?? null) : null,
    success: input.success,
    error_class: input.errorClass ?? null,
  });
  return {
    org_id: input.orgId,
    actor_id: input.actorId,
    event_type: "creative_generation",
    occurred_at_hint: null,
    payload,
  };
}

/**
 * Persist a usage event to `usage_events` via an injected supabase-like client.
 * Best-effort: logging must never block or fail a generation.
 */
export async function writeUsageEvent(
  db: { from: (t: string) => { insert: (row: unknown) => Promise<{ error: unknown } | unknown> } },
  input: UsageEventInput,
): Promise<void> {
  try {
    const row = buildUsageEvent(input);
    await db.from("usage_events").insert({
      org_id: row.org_id, actor_id: row.actor_id, event_type: row.event_type, payload: row.payload,
    });
  } catch {
    /* logging is best-effort — never throws into the generation path */
  }
}
