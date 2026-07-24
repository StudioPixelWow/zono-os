// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · WEBHOOK STORE ADAPTER. Phase 3C (server).
// ----------------------------------------------------------------------------
// Supabase-backed durable webhook-event store (service-role writes; org-scoped
// reads, with NULL-org unmatched rows visible only to the service role). Dedup is
// enforced by the unique (provider, external_event_id) / (provider, fingerprint)
// constraints — a replayed delivery never inserts a second row. Only a size-
// bounded, whitelisted SANITIZED subset is ever persisted; the raw body, app
// secret, and signature are never stored. Trusted mappings (asset→org, external
// id→provider object) are resolved here for the matcher — NEVER from the payload.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { MetaCanonicalWebhookEvent } from "./types";
import type { MatchCandidateObject, MatchCandidateAsset } from "./match";

type Row = Record<string, unknown>;
const db = () => createServiceRoleClient();

export interface WebhookEventRow {
  id: string; orgId: string | null; provider: string; platform: string | null; externalEventId: string | null; fingerprint: string;
  eventType: string; objectType: string | null; externalObjectId: string | null; externalParentId: string | null; assetExternalId: string | null;
  receivedAtIso: string; providerCreatedAtIso: string | null; signatureVerified: boolean; processingStatus: string;
  matchedProviderObjectId: string | null; matchedPublishTargetId: string | null; safeErrorKind: string | null;
}

/** Whitelisted, size-bounded sanitized payload (forensic value only; never raw). */
export function sanitizeForensic(ev: MetaCanonicalWebhookEvent): Record<string, unknown> {
  return { eventType: ev.eventType, changeClass: ev.changeClass, platform: ev.platform, hasObject: !!ev.externalObjectId, providerEventTime: ev.providerEventTime };
}

export function createWebhookStore() {
  return {
    /** Insert if new (dedup by external id / fingerprint). Returns {row, wasNew}. */
    async upsertEvent(ev: MetaCanonicalWebhookEvent, signatureVerified: boolean): Promise<{ id: string; wasNew: boolean; orgId: string | null }> {
      // Existing by external id or fingerprint?
      const existing = await db().from("meta_webhook_event" as never).select("id, org_id").eq("provider", ev.provider).eq("event_fingerprint", ev.fingerprint).maybeSingle();
      if (existing.data) { const e = existing.data as { id: string; org_id: string | null }; return { id: e.id, wasNew: false, orgId: e.org_id }; }
      const id = crypto.randomUUID();
      const ins = await db().from("meta_webhook_event" as never).insert({ id, org_id: null, provider: ev.provider, platform: ev.platform, external_event_id: ev.externalEventId, event_fingerprint: ev.fingerprint, event_type: ev.eventType, object_type: null, external_object_id: ev.externalObjectId, external_parent_id: ev.externalParentId, asset_external_id: ev.assetExternalId, received_at: new Date().toISOString(), provider_created_at: ev.providerEventTime, signature_verified: signatureVerified, processing_status: signatureVerified ? "verified" : "received", sanitized_payload: sanitizeForensic(ev) } as never).select("id").maybeSingle();
      // A race could still collide on the unique index → treat as duplicate.
      if (ins.error) { const again = await db().from("meta_webhook_event" as never).select("id, org_id").eq("provider", ev.provider).eq("event_fingerprint", ev.fingerprint).maybeSingle(); const e = again.data as { id: string; org_id: string | null } | null; return { id: e?.id ?? id, wasNew: false, orgId: e?.org_id ?? null }; }
      return { id, wasNew: true, orgId: null };
    },
    async setMatch(id: string, m: { orgId: string | null; providerObjectId: string | null; publishTargetId: string | null; status: string }): Promise<void> {
      await db().from("meta_webhook_event" as never).update({ org_id: m.orgId, matched_provider_object_id: m.providerObjectId, matched_publish_target_id: m.publishTargetId, processing_status: m.status, processed_at: m.status === "processed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() } as never).eq("id", id);
    },
    /** Trusted asset→org mapping (Phase-1). Never trusts a payload org id. */
    async resolveAsset(assetExternalId: string): Promise<MatchCandidateAsset | null> {
      const page = await db().from("meta_page" as never).select("org_id, connection_id").eq("external_id", assetExternalId).maybeSingle();
      if (page.data) { const p = page.data as { org_id: string; connection_id: string | null }; return { orgId: p.org_id, connectionId: p.connection_id }; }
      const ig = await db().from("meta_instagram_account" as never).select("org_id, connection_id").eq("external_id", assetExternalId).maybeSingle();
      if (ig.data) { const i = ig.data as { org_id: string; connection_id: string | null }; return { orgId: i.org_id, connectionId: i.connection_id }; }
      return null;
    },
    async findProviderObjectByExternalId(externalObjectId: string): Promise<MatchCandidateObject | null> {
      const r = await db().from("meta_provider_object" as never).select("id, org_id, publish_target_id, publish_operation_id").eq("external_object_id", externalObjectId).maybeSingle();
      if (!r.data) return null; const o = r.data as { id: string; org_id: string; publish_target_id: string | null; publish_operation_id: string | null };
      return { providerObjectId: o.id, orgId: o.org_id, publishTargetId: o.publish_target_id, publishOperationId: o.publish_operation_id };
    },
    async findProviderObjectByContainerId(containerId: string): Promise<MatchCandidateObject | null> {
      const r = await db().from("meta_provider_object" as never).select("id, org_id, publish_target_id, publish_operation_id").eq("external_container_id", containerId).maybeSingle();
      if (!r.data) return null; const o = r.data as { id: string; org_id: string; publish_target_id: string | null; publish_operation_id: string | null };
      return { providerObjectId: o.id, orgId: o.org_id, publishTargetId: o.publish_target_id, publishOperationId: o.publish_operation_id };
    },
    async listForOrg(orgId: string): Promise<readonly WebhookEventRow[]> {
      const r = await db().from("meta_webhook_event" as never).select("*").eq("org_id", orgId).order("received_at", { ascending: false } as never);
      return ((r.data as Row[]) ?? []).map(fromDb);
    },
    async healthCounts(nowMs: number): Promise<{ lastValidAgeMs: number | null; invalidSignatureRate: number; unmatchedBacklog: number; failed: number }> {
      const total = await db().from("meta_webhook_event" as never).select("id", { count: "exact", head: true } as never);
      const invalid = await db().from("meta_webhook_event" as never).select("id", { count: "exact", head: true } as never).eq("signature_verified", false);
      const unmatched = await db().from("meta_webhook_event" as never).select("id", { count: "exact", head: true } as never).eq("processing_status", "unmatched");
      const last = await db().from("meta_webhook_event" as never).select("received_at").eq("signature_verified", true).order("received_at", { ascending: false } as never).limit(1).maybeSingle();
      const t = (total.count as number) ?? 0; const inv = (invalid.count as number) ?? 0;
      const lastIso = (last.data as { received_at?: string } | null)?.received_at ?? null;
      return { lastValidAgeMs: lastIso ? nowMs - Date.parse(lastIso) : null, invalidSignatureRate: t > 0 ? inv / t : 0, unmatchedBacklog: (unmatched.count as number) ?? 0, failed: 0 };
    },
  };
}

function fromDb(d: Row): WebhookEventRow {
  return { id: String(d.id), orgId: (d.org_id as string) ?? null, provider: String(d.provider), platform: (d.platform as string) ?? null, externalEventId: (d.external_event_id as string) ?? null, fingerprint: String(d.event_fingerprint), eventType: String(d.event_type), objectType: (d.object_type as string) ?? null, externalObjectId: (d.external_object_id as string) ?? null, externalParentId: (d.external_parent_id as string) ?? null, assetExternalId: (d.asset_external_id as string) ?? null, receivedAtIso: String(d.received_at), providerCreatedAtIso: (d.provider_created_at as string) ?? null, signatureVerified: Boolean(d.signature_verified), processingStatus: String(d.processing_status), matchedProviderObjectId: (d.matched_provider_object_id as string) ?? null, matchedPublishTargetId: (d.matched_publish_target_id as string) ?? null, safeErrorKind: (d.safe_error_kind as string) ?? null };
}
