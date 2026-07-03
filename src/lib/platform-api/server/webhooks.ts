// ============================================================================
// 🔌 Platform API — webhooks (server-only). 31.0. Part 4.
// Register/list/delete webhook subscriptions and deliver events best-effort.
// Delivery is a plain outbound POST of the (pure-built) payload with event +
// delivery headers; it never blocks and never throws. No engine modified.
// ============================================================================
import "server-only";
import { buildWebhookPayload } from "../webhook-payload";
import { createWebhook, listWebhooks, deleteWebhook, updateWebhookDelivery } from "./repository";
import type { WebhookEvent, WebhookRecord } from "../types";

export async function registerWebhook(orgId: string | null, url: string, events: WebhookEvent[], createdBy: string | null) {
  if (!/^https:\/\//i.test(url)) return { ok: false as const, error: "כתובת ה-Webhook חייבת להיות https." };
  return createWebhook(orgId, url, events, null, createdBy);
}
export const listOrgWebhooks = listWebhooks;
export const removeWebhook = deleteWebhook;

/** Best-effort delivery of one payload to one webhook. Never throws. */
export async function deliverWebhook(hook: WebhookRecord, event: WebhookEvent, orgId: string | null, data: Record<string, unknown>): Promise<number> {
  const payload = buildWebhookPayload(event, orgId, data);
  let status = 0;
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Zono-Event": event, "X-Zono-Delivery": payload.id },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    status = res.status;
  } catch { status = 0; }
  await updateWebhookDelivery(hook.id, status);
  return status;
}

/** Fan out an event to all active org webhooks subscribed to it. Best-effort. */
export async function fanoutEvent(orgId: string | null, event: WebhookEvent, data: Record<string, unknown>): Promise<{ delivered: number }> {
  const { rows } = await listWebhooks(orgId);
  const targets = rows.filter((h) => h.active && h.events.includes(event));
  const results = await Promise.all(targets.map((h) => deliverWebhook(h, event, orgId, data)));
  return { delivered: results.filter((s) => s >= 200 && s < 300).length };
}

/** Manual test delivery from the Developer Center. */
export async function testWebhook(hook: WebhookRecord, orgId: string | null): Promise<number> {
  return deliverWebhook(hook, hook.events[0] ?? "mission.created", orgId, { test: true, note: "בדיקת חיבור מ-ZONO Developer Center" });
}
