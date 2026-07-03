// ============================================================================
// 🔌 Platform API — persistence (server-only). 31.0. Part 5.
// API keys / audit / webhooks (service-role). Graceful degrade if the migration
// hasn't run. Never throws.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateApiKey } from "./keys";
import type { ApiKeyRecord, CreatedApiKey, AuditEntry, WebhookRecord, WebhookEvent, Scope } from "../types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const sn = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const isMissing = (m: string) => /does not exist|schema cache|could not find the table/i.test(m);
export class PlatformTablesMissing extends Error { constructor() { super("zono_api_* tables missing — run the 31.0 migration."); } }

const K = "zono_api_keys", A = "zono_api_audit", H = "zono_webhooks";

function rowToKey(r: Row): ApiKeyRecord {
  return { id: s(r.id), organizationId: sn(r.organization_id), name: s(r.name), type: (s(r.key_type) as ApiKeyRecord["type"]) || "organization", scopes: arr<Scope>(r.scopes), rateLimitPerMin: Number(r.rate_limit_per_min) || 120, prefix: s(r.public_id) ? `zk_${s(r.public_id)}` : "", lastUsedAt: sn(r.last_used_at), createdAt: s(r.created_at), revokedAt: sn(r.revoked_at) };
}

export async function createKey(orgId: string | null, name: string, type: ApiKeyRecord["type"], scopes: Scope[], rateLimitPerMin: number, createdBy: string | null): Promise<{ ok: boolean; key?: CreatedApiKey; migrationRequired?: boolean; error?: string }> {
  const db = createServiceRoleClient();
  const g = generateApiKey();
  try {
    const ins = await db.from(K as never).insert({ organization_id: orgId, name, key_type: type, public_id: g.publicId, secret_hash: g.secretHash, scopes, rate_limit_per_min: rateLimitPerMin, created_by: createdBy } as never).select("*").single();
    if (ins.error) { if (isMissing(ins.error.message)) return { ok: false, migrationRequired: true, error: "טבלאות ה-API חסרות — יש להריץ מיגרציית 31.0." }; throw new Error(ins.error.message); }
    return { ok: true, key: { ...rowToKey(ins.data as Row), plaintext: g.plaintext } };
  } catch (e) { const m = e instanceof Error ? e.message : "שגיאה"; return { ok: false, migrationRequired: isMissing(m), error: m }; }
}

export async function listKeys(orgId: string | null): Promise<{ rows: ApiKeyRecord[]; migrationRequired: boolean }> {
  const db = createServiceRoleClient();
  try {
    const q = await db.from(K as never).select("*").eq("organization_id", orgId as never).order("created_at", { ascending: false }).limit(100);
    if (q.error) return { rows: [], migrationRequired: isMissing(q.error.message) };
    return { rows: ((q.data as Row[]) ?? []).map(rowToKey), migrationRequired: false };
  } catch (e) { return { rows: [], migrationRequired: isMissing(e instanceof Error ? e.message : "") }; }
}

/** For AUTH: load the raw key row (incl. secret_hash) by public id. */
export async function loadKeyForAuth(publicId: string): Promise<{ record: ApiKeyRecord; secretHash: string } | null> {
  const db = createServiceRoleClient();
  try {
    const q = await db.from(K as never).select("*").eq("public_id", publicId).is("revoked_at", null).maybeSingle();
    if (q.error || !q.data) return null;
    return { record: rowToKey(q.data as Row), secretHash: s((q.data as Row).secret_hash) };
  } catch { return null; }
}

export async function revokeKey(orgId: string | null, id: string): Promise<boolean> {
  const db = createServiceRoleClient();
  try { const q = await db.from(K as never).update({ revoked_at: new Date().toISOString() } as never).eq("id", id).eq("organization_id", orgId as never); return !q.error; } catch { return false; }
}

export async function touchKey(id: string): Promise<void> {
  const db = createServiceRoleClient();
  try { await db.from(K as never).update({ last_used_at: new Date().toISOString() } as never).eq("id", id); } catch { /* best-effort */ }
}

// ── Audit ───────────────────────────────────────────────────────────────────
export async function insertAudit(orgId: string | null, keyId: string | null, keyName: string | null, method: string, path: string, scope: string | null, status: number, ip: string | null): Promise<void> {
  const db = createServiceRoleClient();
  try { await db.from(A as never).insert({ organization_id: orgId, key_id: keyId, key_name: keyName, method, path, scope, status, ip } as never); } catch { /* best-effort */ }
}

export async function recentAuditTimestamps(keyId: string, sinceMs: number): Promise<number[]> {
  const db = createServiceRoleClient();
  try {
    const q = await db.from(A as never).select("at").eq("key_id", keyId).gte("at", new Date(sinceMs).toISOString()).limit(1000);
    if (q.error) return [];
    return ((q.data as Row[]) ?? []).map((r) => new Date(s(r.at)).getTime());
  } catch { return []; }
}

export async function listAudit(orgId: string | null, limit = 100): Promise<AuditEntry[]> {
  const db = createServiceRoleClient();
  try {
    const q = await db.from(A as never).select("*").eq("organization_id", orgId as never).order("at", { ascending: false }).limit(limit);
    if (q.error) return [];
    return ((q.data as Row[]) ?? []).map((r) => ({ id: s(r.id), keyId: sn(r.key_id), keyName: sn(r.key_name), method: s(r.method), path: s(r.path), scope: sn(r.scope), status: Number(r.status) || 0, at: s(r.at), ip: sn(r.ip) }));
  } catch { return []; }
}

// ── Webhooks ─────────────────────────────────────────────────────────────────
const rowToHook = (r: Row): WebhookRecord => ({ id: s(r.id), organizationId: sn(r.organization_id), url: s(r.url), events: arr<WebhookEvent>(r.events), active: !!r.active, createdAt: s(r.created_at), lastDeliveryAt: sn(r.last_delivery_at), lastStatus: r.last_status == null ? null : Number(r.last_status) });

export async function createWebhook(orgId: string | null, url: string, events: WebhookEvent[], secretHash: string | null, createdBy: string | null): Promise<{ ok: boolean; hook?: WebhookRecord; migrationRequired?: boolean; error?: string }> {
  const db = createServiceRoleClient();
  try {
    const ins = await db.from(H as never).insert({ organization_id: orgId, url, events, secret_hash: secretHash, created_by: createdBy } as never).select("*").single();
    if (ins.error) { if (isMissing(ins.error.message)) return { ok: false, migrationRequired: true, error: "טבלאות ה-API חסרות — יש להריץ מיגרציית 31.0." }; throw new Error(ins.error.message); }
    return { ok: true, hook: rowToHook(ins.data as Row) };
  } catch (e) { const m = e instanceof Error ? e.message : "שגיאה"; return { ok: false, migrationRequired: isMissing(m), error: m }; }
}

export async function listWebhooks(orgId: string | null): Promise<{ rows: WebhookRecord[]; migrationRequired: boolean }> {
  const db = createServiceRoleClient();
  try {
    const q = await db.from(H as never).select("*").eq("organization_id", orgId as never).order("created_at", { ascending: false }).limit(100);
    if (q.error) return { rows: [], migrationRequired: isMissing(q.error.message) };
    return { rows: ((q.data as Row[]) ?? []).map(rowToHook), migrationRequired: false };
  } catch (e) { return { rows: [], migrationRequired: isMissing(e instanceof Error ? e.message : "") }; }
}

export async function deleteWebhook(orgId: string | null, id: string): Promise<boolean> {
  const db = createServiceRoleClient();
  try { const q = await db.from(H as never).delete().eq("id", id).eq("organization_id", orgId as never); return !q.error; } catch { return false; }
}

export async function updateWebhookDelivery(id: string, status: number): Promise<void> {
  const db = createServiceRoleClient();
  try { await db.from(H as never).update({ last_delivery_at: new Date().toISOString(), last_status: status } as never).eq("id", id); } catch { /* best-effort */ }
}
