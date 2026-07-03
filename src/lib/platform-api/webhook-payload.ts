// ============================================================================
// 🔌 Platform API — webhook payload builder (pure). 31.0. Part 4.
// Builds + canonicalizes the payload; the HMAC signature is computed server-side
// over the canonical string (see server/webhooks.ts). Pure — no I/O.
// ============================================================================
import type { WebhookEvent, WebhookPayload } from "./types";

let SEQ = 0;
export function buildWebhookPayload(event: WebhookEvent, organizationId: string | null, data: Record<string, unknown>, at = new Date().toISOString()): WebhookPayload {
  return { id: `evt_${Date.now().toString(36)}_${(++SEQ).toString(36)}`, event, at, organizationId, data };
}

/** Stable JSON for signing (keys sorted) so producer + consumer agree. */
export function canonicalPayload(p: WebhookPayload): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
    return v;
  };
  return JSON.stringify(sortKeys(p));
}
