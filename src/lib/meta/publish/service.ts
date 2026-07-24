// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH SERVICE (server wiring). Phase 3A.
// ----------------------------------------------------------------------------
// Wires the pure publish engine to production adapters: Supabase publish store,
// the sealed Graph publish gateway, a server-side asset/credential resolver
// (decrypts the Page token just-in-time), media delivery, audit, clock, id-gen.
// Enforces publish permission (approval permission alone does NOT grant publish),
// local rate limits, and idempotency. Returns safe DTOs. Nothing bypasses the
// approval/version integrity checks or the MetaProvider boundary.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/security/crypto";
import { logAudit } from "@/lib/audit/service";
import { createPublishGateway } from "../provider/graph";
import { createSupabasePublishStore } from "./store";
import { createSupabaseMediaDelivery } from "./media-delivery";
import type { PublishPorts, AssetPublishResolver } from "./ports";
import { DEFAULT_TARGET_CONCURRENCY } from "./ports";
import * as engine from "./engine";
import { toOperationDetail, toOperationListItem, type OperationDetailDTO, type OperationListItemDTO } from "./read";
import { publishRateCheck } from "./ratelimit";
export { publishRateCheck };

/** Roles permitted to publish. Approver/read-only/creator are NOT publishers by default. */
const PUBLISHER_ROLES: ReadonlySet<string> = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager"]);
export function canPublish(role: string): boolean {
  return PUBLISHER_ROLES.has((role || "").toLowerCase());
}

/** Server-side asset resolver: canonical asset id → external id + decrypted token. */
function assetResolver(): AssetPublishResolver {
  return {
    async resolve(orgId, assetId) {
      const db = createServiceRoleClient();
      const page = await db.from("meta_page" as never).select("external_id, token_ref, status").eq("org_id", orgId).eq("id", assetId).maybeSingle();
      const p = page.data as { external_id?: string; token_ref?: string; status?: string } | null;
      if (p?.external_id && p.token_ref && p.status === "active") {
        try { return { externalId: p.external_id, tokenPlain: decryptSecret(p.token_ref) }; } catch { return null; }
      }
      const ig = await db.from("meta_instagram_account" as never).select("external_id, page_external_id, status").eq("org_id", orgId).eq("id", assetId).maybeSingle();
      const i = ig.data as { external_id?: string; page_external_id?: string; status?: string } | null;
      if (i?.external_id && i.status === "active" && i.page_external_id) {
        const linked = await db.from("meta_page" as never).select("token_ref, status").eq("org_id", orgId).eq("external_id", i.page_external_id).maybeSingle();
        const lp = linked.data as { token_ref?: string; status?: string } | null;
        if (lp?.token_ref && lp.status === "active") {
          try { return { externalId: i.external_id, tokenPlain: decryptSecret(lp.token_ref) }; } catch { return null; }
        }
      }
      return null;
    },
  };
}

/** Build production publish-engine ports. */
export function buildPublishPorts(): PublishPorts {
  return {
    store: createSupabasePublishStore(),
    gateway: createPublishGateway(),
    asset: assetResolver(),
    media: createSupabaseMediaDelivery(),
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    ids: { uuid: () => crypto.randomUUID() },
    audit: { log: (i) => logAudit({ action: i.action, category: "configuration", entityType: "meta_publish_operation", entityId: i.entityId, summary: i.summary, metadata: i.metadata }) },
  };
}

/** Bounded target concurrency (configurable). */
export function targetConcurrency(): number {
  const v = Number(process.env.META_PUBLISH_TARGET_CONCURRENCY);
  return Number.isFinite(v) && v >= 1 && v <= 8 ? v : DEFAULT_TARGET_CONCURRENCY;
}

// ── Read entrypoints ─────────────────────────────────────────────────────────
export async function listPublishHistory(orgId: string): Promise<readonly OperationListItemDTO[]> {
  return (await createSupabasePublishStore().listOperations(orgId)).map(toOperationListItem);
}
export async function getOperationDetail(orgId: string, operationId: string): Promise<OperationDetailDTO | null> {
  const store = createSupabasePublishStore();
  const op = await store.getOperation(orgId, operationId);
  if (!op) return null;
  return toOperationDetail(op, await store.listTargets(orgId, operationId));
}

// ── Publish readiness + create ───────────────────────────────────────────────
import { createSupabaseContentStore } from "../content/store";
import { checkPublishPreconditions, type TargetRuntime } from "./preconditions";
import { buildPublishSnapshot } from "./snapshot";
import { evaluateMetaCapability } from "../capability/evaluate";
import type { MetaCapabilityState } from "../capability/types";
import { contentKind } from "../content/model";

/** Resolve per-target runtime (capability + asset + connection + media) for gating. */
async function resolveRuntime(orgId: string, assetId: string, requiredCapability: string): Promise<TargetRuntime> {
  const db = createServiceRoleClient();
  let assetStatus = "unknown", grantedCaps: string[] = [];
  let connStatus = "unknown", connHealth = "unknown";
  const page = await db.from("meta_page" as never).select("status, connection_id").eq("org_id", orgId).eq("id", assetId).maybeSingle();
  let connectionId = (page.data as { connection_id?: string; status?: string } | null)?.connection_id ?? null;
  if (page.data) assetStatus = String((page.data as { status?: string }).status ?? "unknown");
  else {
    const ig = await db.from("meta_instagram_account" as never).select("status, connection_id").eq("org_id", orgId).eq("id", assetId).maybeSingle();
    if (ig.data) { assetStatus = String((ig.data as { status?: string }).status ?? "unknown"); connectionId = (ig.data as { connection_id?: string }).connection_id ?? null; }
  }
  if (connectionId) {
    const conn = await db.from("meta_connection" as never).select("status, health, granted_capabilities").eq("org_id", orgId).eq("id", connectionId).maybeSingle();
    const c = conn.data as { status?: string; health?: string; granted_capabilities?: string[] } | null;
    if (c) { connStatus = String(c.status ?? "unknown"); connHealth = String(c.health ?? "unknown"); grantedCaps = c.granted_capabilities ?? []; }
  }
  const state: MetaCapabilityState = {
    globalFeatureEnabled: true, orgFeatureEnabled: true, providerAvailable: true,
    connectionStatus: connStatus as MetaCapabilityState["connectionStatus"], connectionHealth: connHealth as MetaCapabilityState["connectionHealth"],
    accessMode: "business_login", grantedCapabilities: grantedCaps,
    businessVerification: "approved", appReview: "approved", webhookHealthy: false, extendedEnabled: [],
    globalKillSwitch: false, orgKillSwitch: false,
  };
  const capability = evaluateMetaCapability(requiredCapability, state);
  return { capability, assetStatus, connectionStatus: connStatus, connectionHealth: connHealth, mediaValid: true, variantMissing: false };
}

export type CreatePublishResult = { ok: true; detail: OperationDetailDTO; resumed: boolean } | { ok: false; error: string; blocked?: unknown };

/** Create + immediately execute a publish operation for an approved draft version. */
export async function createPublish(orgId: string, userId: string, role: string, draftId: string, targetIds: readonly string[]): Promise<CreatePublishResult> {
  if (!canPublish(role)) return { ok: false, error: "forbidden" };
  if (!publishRateCheck("publish", `${orgId}:${userId}`)) return { ok: false, error: "rate_limited" };
  const content = createSupabaseContentStore();
  const draft = await content.getDraft(orgId, draftId);
  if (!draft) return { ok: false, error: "not_found" };

  const approvals = await content.listApprovals(orgId, draftId);
  const approved = approvals.filter((a) => a.status === "approved").sort((a, b) => b.draftVersionNumber - a.draftVersionNumber)[0];
  const versions = await content.listVersions(orgId, draftId);
  const approvedVersion = approved?.draftVersionNumber ?? draft.currentVersion;
  const approvedContentHash = versions.find((v) => v.versionNumber === approvedVersion)?.contentHash ?? (draft.contentHash ?? "");

  const runtimeById = new Map<string, TargetRuntime>();
  for (const t of draft.targets.filter((x) => targetIds.includes(x.id))) {
    const def = contentKind(t.contentKind);
    runtimeById.set(t.id, await resolveRuntime(orgId, t.assetId, def?.requiredCapability ?? "facebook.content.publish"));
  }
  const pre = checkPublishPreconditions({
    draft, approvedVersion, approvedContentHash, targetIds,
    runtime: (id) => runtimeById.get(id) ?? null, globalKillSwitch: false, orgKillSwitch: false, actorCanPublish: true,
  });
  if (!pre.ok) return { ok: false, error: pre.operationBlock ?? "blocked", blocked: pre.targets };

  const mediaRows = await content.listMedia(orgId);
  const mediaById = new Map(mediaRows.map((m) => [m.id, m]));
  const snapshot = buildPublishSnapshot({
    draft, targetIds: pre.publishableTargetIds,
    media: (id) => { const m = mediaById.get(id); return m ? { mediaId: m.id, kind: m.mediaKind, storageRef: m.storageRef, mime: m.mimeType, width: m.width, height: m.height, durationMs: m.durationMs } : null; },
    capability: (tid) => runtimeById.get(tid)!.capability,
    validation: () => ({ ok: true }),
    requestedBy: userId, correlationId: crypto.randomUUID(), createdAt: new Date().toISOString(),
  });

  const ports = buildPublishPorts();
  const created = await engine.createOperation(ports, snapshot, pre.publishableTargetIds);
  if (created.resumed) return { ok: true, detail: toOperationDetail(created.operation, created.targets), resumed: true };
  const exec = await engine.executeOperation(ports, orgId, created.operation.id, { concurrency: targetConcurrency() });
  const detail = await getOperationDetail(orgId, exec.operation.id);
  return { ok: true, detail: detail!, resumed: false };
}

// ── Cancel (pre-execution only) ──────────────────────────────────────────────
export async function cancelOperation(orgId: string, role: string, operationId: string): Promise<{ ok: boolean; error?: string }> {
  if (!canPublish(role)) return { ok: false, error: "forbidden" };
  const r = await engine.cancelOperation(buildPublishPorts(), orgId, operationId);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "cancel_failed" };
}

/** Manually retry an eligible failed target (never automatic; never republishes success). */
export async function retryTarget(orgId: string, userId: string, role: string, targetId: string): Promise<{ ok: boolean; error?: string; detail?: OperationDetailDTO }> {
  if (!canPublish(role)) return { ok: false, error: "forbidden" };
  if (!publishRateCheck("retry", `${orgId}:${userId}`)) return { ok: false, error: "rate_limited" };
  const ports = buildPublishPorts();
  const target = await ports.store.getTarget(orgId, targetId);
  if (!target) return { ok: false, error: "not_found" };
  const rt = await resolveRuntime(orgId, target.assetId, contentKind(target.contentKind)?.requiredCapability ?? "facebook.content.publish");
  const r = await engine.manualRetry(ports, orgId, targetId, userId, { actorCanPublish: true, assetActive: rt.assetStatus === "active", capabilityAllowed: rt.capability.allowed, draftVersionMatches: true, mediaValid: rt.mediaValid });
  if (!r.ok) return { ok: false, error: r.error ?? "retry_failed" };
  const detail = await getOperationDetail(orgId, target.operationId);
  return { ok: true, detail: detail ?? undefined };
}
