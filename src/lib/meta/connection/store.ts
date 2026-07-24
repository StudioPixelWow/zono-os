// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SUPABASE STORE ADAPTER. Phase 1 (server).
// ----------------------------------------------------------------------------
// The production MetaStore: reads/writes the meta_* tables via the SERVICE-ROLE
// client (token columns are service-role-only by RLS). Every method is org-scoped
// with an explicit org_id. Encrypted token refs are written as-is; plaintext never
// reaches here. Row ↔ column mapping (camelCase ↔ snake_case) is centralized.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  MetaStore, MetaConnectionRow, MetaBusinessRow, MetaPageRow, MetaInstagramRow,
  MetaPermissionSnapshotRow, MetaTokenHealthRow,
} from "./ports";

type Row = Record<string, unknown>;
const db = () => createServiceRoleClient();

// ── Mappers ──────────────────────────────────────────────────────────────────
const connToDb = (r: MetaConnectionRow): Row => ({
  id: r.id, org_id: r.orgId, authorizing_user_id: r.authorizingUserId, provider_key: r.providerKey, mode: r.mode,
  business_external_id: r.businessExternalId, token_ref: r.tokenRef, token_kind: r.tokenKind, expires_at: r.expiresAt,
  status: r.status, health: r.health, granted_capabilities: r.grantedCapabilities, reconnect_required: r.reconnectRequired,
  last_verified_at: r.lastVerifiedAt, disconnected_at: r.disconnectedAt, revocation_reason: r.revocationReason,
  version: r.version, updated_at: new Date().toISOString(),
});
const connFromDb = (d: Row): MetaConnectionRow => ({
  id: String(d.id), orgId: String(d.org_id), authorizingUserId: (d.authorizing_user_id as string) ?? null,
  providerKey: String(d.provider_key ?? "graph"), mode: (d.mode as MetaConnectionRow["mode"]) ?? "unknown",
  businessExternalId: (d.business_external_id as string) ?? null, tokenRef: (d.token_ref as string) ?? null,
  tokenKind: (d.token_kind as MetaConnectionRow["tokenKind"]) ?? "unknown", expiresAt: (d.expires_at as string) ?? null,
  status: (d.status as MetaConnectionRow["status"]) ?? "not_connected", health: (d.health as MetaConnectionRow["health"]) ?? "unknown",
  grantedCapabilities: (d.granted_capabilities as string[]) ?? [], reconnectRequired: Boolean(d.reconnect_required),
  lastVerifiedAt: (d.last_verified_at as string) ?? null, disconnectedAt: (d.disconnected_at as string) ?? null,
  revocationReason: (d.revocation_reason as string) ?? null, version: Number(d.version ?? 1),
});

const assetTable = (kind: "business" | "page" | "instagram") =>
  kind === "business" ? "meta_business" : kind === "page" ? "meta_page" : "meta_instagram_account";

/** Construct the production Supabase-backed store. */
export function createSupabaseMetaStore(): MetaStore {
  return {
    async upsertConnection(row) {
      await db().from("meta_connection" as never).upsert(connToDb(row) as never, { onConflict: "id" } as never);
    },
    async getConnection(orgId, connectionId) {
      const res = await db().from("meta_connection" as never).select("*").eq("org_id", orgId).eq("id", connectionId).maybeSingle();
      return res.data ? connFromDb(res.data as Row) : null;
    },
    async findConnectionByBusiness(orgId, businessExternalId) {
      const res = await db().from("meta_connection" as never).select("*").eq("org_id", orgId).eq("business_external_id", businessExternalId).neq("status", "revoked").maybeSingle();
      return res.data ? connFromDb(res.data as Row) : null;
    },
    async listConnections(orgId) {
      const res = await db().from("meta_connection" as never).select("*").eq("org_id", orgId);
      return ((res.data as Row[]) ?? []).map(connFromDb);
    },
    async upsertBusinesses(rows) {
      if (!rows.length) return;
      const payload = rows.map((r) => ({ id: r.id, org_id: r.orgId, connection_id: r.connectionId, external_id: r.externalId, name: r.name, verification_status: r.verificationStatus, status: r.status, updated_at: new Date().toISOString() }));
      await db().from("meta_business" as never).upsert(payload as never, { onConflict: "org_id,external_id" } as never);
    },
    async upsertPages(rows) {
      if (!rows.length) return;
      const payload = rows.map((r) => ({ id: r.id, org_id: r.orgId, connection_id: r.connectionId, external_id: r.externalId, name: r.name, category: r.category, token_ref: r.tokenRef, permitted_tasks: r.permittedTasks, status: r.status, linked_instagram_external_id: r.linkedInstagramExternalId, updated_at: new Date().toISOString() }));
      await db().from("meta_page" as never).upsert(payload as never, { onConflict: "org_id,external_id" } as never);
    },
    async upsertInstagram(rows) {
      if (!rows.length) return;
      const payload = rows.map((r) => ({ id: r.id, org_id: r.orgId, connection_id: r.connectionId, external_id: r.externalId, username: r.username, account_type: r.accountType, page_external_id: r.pageExternalId, followers: r.followers, status: r.status, updated_at: new Date().toISOString() }));
      await db().from("meta_instagram_account" as never).upsert(payload as never, { onConflict: "org_id,external_id" } as never);
    },
    async listBusinesses(orgId, connectionId) {
      const res = await db().from("meta_business" as never).select("*").eq("org_id", orgId).eq("connection_id", connectionId);
      return ((res.data as Row[]) ?? []).map((d) => ({ id: String(d.id), orgId: String(d.org_id), connectionId: String(d.connection_id), externalId: String(d.external_id), name: String(d.name ?? ""), verificationStatus: String(d.verification_status ?? "unknown"), status: String(d.status ?? "active") }));
    },
    async listPages(orgId, connectionId) {
      const res = await db().from("meta_page" as never).select("*").eq("org_id", orgId).eq("connection_id", connectionId);
      return ((res.data as Row[]) ?? []).map((d) => ({ id: String(d.id), orgId: String(d.org_id), connectionId: String(d.connection_id), externalId: String(d.external_id), name: String(d.name ?? ""), category: (d.category as string) ?? null, tokenRef: (d.token_ref as string) ?? null, permittedTasks: (d.permitted_tasks as string[]) ?? [], status: String(d.status ?? "active"), linkedInstagramExternalId: (d.linked_instagram_external_id as string) ?? null }));
    },
    async listInstagram(orgId, connectionId) {
      const res = await db().from("meta_instagram_account" as never).select("*").eq("org_id", orgId).eq("connection_id", connectionId);
      return ((res.data as Row[]) ?? []).map((d) => ({ id: String(d.id), orgId: String(d.org_id), connectionId: String(d.connection_id), externalId: String(d.external_id), username: String(d.username ?? ""), accountType: String(d.account_type ?? "unknown"), pageExternalId: String(d.page_external_id ?? ""), followers: (d.followers as number) ?? null, status: String(d.status ?? "active") }));
    },
    async tombstoneAssetsExcept(orgId, connectionId, kind, keepExternalIds) {
      let q = db().from(assetTable(kind) as never).update({ status: "tombstoned", updated_at: new Date().toISOString() } as never).eq("org_id", orgId).eq("connection_id", connectionId).neq("status", "tombstoned");
      if (keepExternalIds.length) q = (q as unknown as { not(c: string, o: string, v: string): typeof q }).not("external_id", "in", `(${keepExternalIds.map((e) => `"${e}"`).join(",")})`);
      const res = await q;
      return (res as { count?: number }).count ?? 0;
    },
    async insertPermissionSnapshot(row) {
      await db().from("meta_permission_snapshot" as never).insert({ id: row.id, org_id: row.orgId, connection_id: row.connectionId, granted: row.granted, configured: row.configured, mode: row.mode, captured_at: row.capturedAt } as never);
    },
    async recordTokenHealth(row: MetaTokenHealthRow) {
      await db().from("meta_token_health" as never).insert({ id: row.id, org_id: row.orgId, connection_id: row.connectionId, ok: row.ok, checked_at: row.checkedAt, detail: row.detail } as never);
    },
  };
}

export type { MetaBusinessRow, MetaPageRow, MetaInstagramRow, MetaPermissionSnapshotRow };
