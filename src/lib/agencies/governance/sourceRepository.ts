// ============================================================================
// ZONO — PHASE 26.14: Intelligence source repository (SERVER-ONLY). Org-scoped.
// Idempotent upsert keyed by (org, entity_type, entity_id, source_type,
// source_name). Reads + visibility/retention mutations. Never deletes.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { govContext } from "./_ctx";
import type { IntelligenceSource, SourceType, VisibilityStatus, LicenseStatus, GovernedEntityType } from "./agencyGovernanceTypes";

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const COLS = "id,organization_id,entity_type,entity_id,source_type,source_name,source_url,collected_at,last_verified_at,confidence,license_status,visibility_status,retention_until,metadata,created_at";

export function toSource(r: Obj): IntelligenceSource {
  return {
    id: r.id as string, entityType: r.entity_type as string, entityId: r.entity_id as string,
    sourceType: (r.source_type as SourceType) ?? "internal", sourceName: str(r.source_name), sourceUrl: str(r.source_url),
    collectedAt: str(r.collected_at), lastVerifiedAt: str(r.last_verified_at), confidence: num(r.confidence),
    licenseStatus: (r.license_status as LicenseStatus) ?? "unknown", visibilityStatus: (r.visibility_status as VisibilityStatus) ?? "visible",
    retentionUntil: str(r.retention_until), metadata: asObj(r.metadata), createdAt: r.created_at as string,
  };
}

export interface AttachSourceInput {
  entityType: GovernedEntityType | string;
  entityId: string;
  sourceType: SourceType;
  sourceName?: string | null;
  sourceUrl?: string | null;
  collectedAt?: string | null;
  confidence?: number | null;
  licenseStatus?: LicenseStatus;
  visibilityStatus?: VisibilityStatus;
  retentionUntil?: string | null;
  metadata?: Obj;
}

/** Attach (or refresh) a provenance source for an intelligence entity. Idempotent. */
export async function attachSource(input: AttachSourceInput): Promise<IntelligenceSource> {
  const { orgId } = await govContext();
  const db = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await db.from("agency_intelligence_sources").upsert({
    organization_id: orgId, entity_type: input.entityType, entity_id: input.entityId, source_type: input.sourceType,
    source_name: input.sourceName ?? null, source_url: input.sourceUrl ?? null,
    collected_at: input.collectedAt ?? now, last_verified_at: now, confidence: input.confidence ?? null,
    license_status: input.licenseStatus ?? "unknown", visibility_status: input.visibilityStatus ?? "visible",
    retention_until: input.retentionUntil ?? null, metadata: input.metadata ?? {},
  } as never, { onConflict: "organization_id,entity_type,entity_id,source_type,source_name" }).select(COLS).single();
  if (error) throw new Error(error.message);
  return toSource(data as Obj);
}

export async function listSourcesForEntity(entityType: string, entityId: string): Promise<IntelligenceSource[]> {
  const { orgId } = await govContext();
  const db = await createClient();
  const { data } = await db.from("agency_intelligence_sources").select(COLS)
    .eq("organization_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false });
  return ((data as Obj[] | null) ?? []).map(toSource);
}

/** Sources whose retention window has passed and that are not already expired/hidden. */
export async function listRetentionDue(nowIso: string, limit = 500): Promise<IntelligenceSource[]> {
  const { orgId } = await govContext();
  const db = await createClient();
  const { data } = await db.from("agency_intelligence_sources").select(COLS)
    .eq("organization_id", orgId).not("retention_until", "is", null).lte("retention_until", nowIso)
    .not("visibility_status", "in", "(expired,hidden)").limit(limit);
  return ((data as Obj[] | null) ?? []).map(toSource);
}

export async function setVisibility(id: string, visibility: VisibilityStatus): Promise<void> {
  const { orgId } = await govContext();
  const db = await createClient();
  await db.from("agency_intelligence_sources").update({ visibility_status: visibility } as never).eq("organization_id", orgId).eq("id", id);
}

export async function touchVerification(id: string): Promise<void> {
  const { orgId } = await govContext();
  const db = await createClient();
  await db.from("agency_intelligence_sources").update({ last_verified_at: new Date().toISOString() } as never).eq("organization_id", orgId).eq("id", id);
}
