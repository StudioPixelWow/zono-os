"use server";
// ============================================================================
// 🔌 Platform API — Developer Center server actions. 31.0. Part 8.
// Manage API keys / webhooks / audit from the session UI. Key secrets are shown
// ONCE at creation. Reuses the platform server modules. No engine modified.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { createKey, listKeys, revokeKey, listAudit } from "./server/repository";
import { registerWebhook, listOrgWebhooks, removeWebhook, testWebhook } from "./server/webhooks";
import type { ApiKeyRecord, CreatedApiKey, AuditEntry, WebhookRecord, Scope, KeyType, WebhookEvent } from "./types";

export async function createApiKeyAction(name: string, type: KeyType, scopes: Scope[], rateLimitPerMin: number): Promise<{ ok: boolean; result?: CreatedApiKey; migrationRequired?: boolean; error?: string }> {
  try {
    const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    if (!name.trim()) return { ok: false, error: "יש להזין שם מפתח." };
    if (!scopes.length) return { ok: false, error: "יש לבחור לפחות הרשאה אחת." };
    const r = await createKey(profile.org_id, name.trim(), type, scopes, Math.max(1, Math.min(6000, rateLimitPerMin || 120)), profile.id ?? null);
    return r.ok ? { ok: true, result: r.key } : { ok: false, migrationRequired: r.migrationRequired, error: r.error };
  } catch (e) { console.error("[platform] createKey failed:", e); return { ok: false, error: "יצירת המפתח נכשלה." }; }
}

export async function listApiKeysAction(): Promise<{ ok: boolean; result?: ApiKeyRecord[]; migrationRequired?: boolean; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; const r = await listKeys(profile.org_id); return { ok: true, result: r.rows, migrationRequired: r.migrationRequired }; }
  catch { return { ok: false, error: "טעינת המפתחות נכשלה." }; }
}

export async function revokeApiKeyAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: await revokeKey(profile.org_id, id) }; }
  catch { return { ok: false, error: "ביטול המפתח נכשל." }; }
}

export async function listAuditAction(): Promise<{ ok: boolean; result?: AuditEntry[]; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await listAudit(profile.org_id) }; }
  catch { return { ok: false, error: "טעינת היומן נכשלה." }; }
}

export async function registerWebhookAction(url: string, events: WebhookEvent[]): Promise<{ ok: boolean; result?: WebhookRecord; migrationRequired?: boolean; error?: string }> {
  try {
    const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    if (!events.length) return { ok: false, error: "יש לבחור לפחות אירוע אחד." };
    const r = await registerWebhook(profile.org_id, url.trim(), events, profile.id ?? null);
    return r.ok ? { ok: true, result: r.hook } : { ok: false, migrationRequired: r.migrationRequired, error: r.error };
  } catch { return { ok: false, error: "רישום ה-Webhook נכשל." }; }
}

export async function listWebhooksAction(): Promise<{ ok: boolean; result?: WebhookRecord[]; migrationRequired?: boolean; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; const r = await listOrgWebhooks(profile.org_id); return { ok: true, result: r.rows, migrationRequired: r.migrationRequired }; }
  catch { return { ok: false, error: "טעינת ה-Webhooks נכשלה." }; }
}

export async function deleteWebhookAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: await removeWebhook(profile.org_id, id) }; }
  catch { return { ok: false, error: "מחיקת ה-Webhook נכשלה." }; }
}

export async function testWebhookAction(id: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    const { rows } = await listOrgWebhooks(profile.org_id);
    const hook = rows.find((h) => h.id === id); if (!hook) return { ok: false, error: "לא נמצא." };
    return { ok: true, status: await testWebhook(hook, profile.org_id) };
  } catch { return { ok: false, error: "בדיקת ה-Webhook נכשלה." }; }
}
