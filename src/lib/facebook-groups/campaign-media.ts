// ============================================================================
// ZONO — Campaign media source-of-truth (server-only, ONE shared resolver).
// ----------------------------------------------------------------------------
// For a selected property, lists the REAL media a Facebook group campaign can use:
//   • the property cover (properties.primary_image_url)
//   • the property gallery (property_media)
//   • Creative Studio assets linked to that property (zono_quick_creative_outputs)
// No new storage, no duplicate library. Ordered primary → gallery → studio,
// deduped by URL. Org-scoped via session; a property from another org yields [].
// assertCampaignMediaAllowed() is the P0 tamper guard: a media ref must belong to
// BOTH the current org AND the selected property, else it is rejected server-side.
// ============================================================================
import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export type CampaignMediaSource = "property_primary" | "property_gallery" | "studio";
export type MediaRefKind = "property_media" | "creative_output" | "property_primary";

export interface MediaRef { kind: MediaRefKind; id: string; url: string }

export interface CampaignMediaItem {
  id: string;                    // stable identity (row id, or "primary")
  source: CampaignMediaSource;
  url: string;                   // the URL that will be published
  thumbnailUrl: string | null;
  label: string;                 // customer-facing: "תמונת נכס" | "נוצר בסטודיו"
  isPrimary: boolean;
  publishable: boolean;          // studio ⇒ is_approved; property ⇒ always true
  ref: MediaRef;
}

const LABEL_PROPERTY = "תמונת נכס";
const LABEL_STUDIO = "נוצר בסטודיו";

async function orgScope(): Promise<string | null> {
  const { profile } = await getSessionContext();
  return profile?.org_id ?? null;
}

/** True only if the property belongs to the current org (no cross-tenant access). */
async function propertyInOrg(db: any, orgId: string, propertyId: string): Promise<boolean> {
  const { data } = await db.from("properties").select("id").eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  return !!data;
}

/**
 * All media a campaign for this property may use, ordered primary → gallery →
 * studio and deduped by URL. Empty if the property is not in the caller's org.
 */
export async function listPropertyCampaignMedia(propertyId: string): Promise<CampaignMediaItem[]> {
  const orgId = await orgScope();
  if (!orgId || !propertyId) return [];
  const db: any = createServiceRoleClient();
  if (!(await propertyInOrg(db, orgId, propertyId))) return [];

  const items: CampaignMediaItem[] = [];
  const seen = new Set<string>();
  const push = (it: CampaignMediaItem) => { if (it.url && !seen.has(it.url)) { seen.add(it.url); items.push(it); } };

  // 1) Property cover.
  const { data: prop } = await db.from("properties").select("primary_image_url").eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  const cover = (prop?.primary_image_url as string | null) ?? null;
  if (cover) push({ id: "primary", source: "property_primary", url: cover, thumbnailUrl: cover, label: LABEL_PROPERTY, isPrimary: true, publishable: true, ref: { kind: "property_primary", id: "primary", url: cover } });

  // 2) Property gallery (is_primary first, then sort_order).
  const { data: gal } = await db.from("property_media")
    .select("id,url,external_url,type,is_primary,sort_order")
    .eq("org_id", orgId).eq("property_id", propertyId)
    .order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).limit(60);
  for (const m of (gal ?? []) as any[]) {
    const url = (m.url as string | null) ?? (m.external_url as string | null);
    if (!url) continue;
    if (m.type && String(m.type) !== "image" && String(m.type) !== "photo") continue; // images only
    push({ id: String(m.id), source: "property_gallery", url, thumbnailUrl: url, label: LABEL_PROPERTY, isPrimary: m.is_primary === true && !cover, publishable: true, ref: { kind: "property_media", id: String(m.id), url } });
  }

  // 3) Creative Studio assets linked to this property (newest first).
  const { data: studio } = await db.from("zono_quick_creative_outputs")
    .select("id,image_url,thumbnail_url,is_approved,image_status,created_at")
    .eq("org_id", orgId).eq("property_id", propertyId)
    .order("created_at", { ascending: false }).limit(40);
  for (const c of (studio ?? []) as any[]) {
    const url = c.image_url as string | null;
    if (!url) continue;
    if (c.image_status && String(c.image_status) !== "ready" && String(c.image_status) !== "completed" && String(c.image_status) !== "approved") continue;
    push({ id: String(c.id), source: "studio", url, thumbnailUrl: (c.thumbnail_url as string | null) ?? url, label: LABEL_STUDIO, isPrimary: false, publishable: c.is_approved === true, ref: { kind: "creative_output", id: String(c.id), url } });
  }

  return items;
}

/**
 * P0 security: a selected media ref must belong to the current org AND the given
 * property. A tampered client (Property A + media from Property B / another org)
 * is rejected here, server-side, before any post is scheduled.
 * Returns the resolved { imageUrl, creativeOutputId } to persist, or null if invalid.
 */
export async function assertCampaignMediaAllowed(
  propertyId: string,
  ref: MediaRef | null | undefined,
): Promise<{ ok: true; imageUrl: string | null; creativeOutputId: string | null } | { ok: false }> {
  // No media selected is allowed (text-only is a deliberate choice, guarded in UI).
  if (!ref) return { ok: true, imageUrl: null, creativeOutputId: null };
  const orgId = await orgScope();
  if (!orgId || !propertyId) return { ok: false };
  const db: any = createServiceRoleClient();
  if (!(await propertyInOrg(db, orgId, propertyId))) return { ok: false };

  if (ref.kind === "property_primary") {
    const { data } = await db.from("properties").select("primary_image_url").eq("id", propertyId).eq("org_id", orgId).maybeSingle();
    const url = (data?.primary_image_url as string | null) ?? null;
    return url ? { ok: true, imageUrl: url, creativeOutputId: null } : { ok: false };
  }
  if (ref.kind === "property_media") {
    const { data } = await db.from("property_media").select("id,url,external_url").eq("id", ref.id).eq("property_id", propertyId).eq("org_id", orgId).maybeSingle();
    if (!data) return { ok: false };
    const url = (data.url as string | null) ?? (data.external_url as string | null);
    return url ? { ok: true, imageUrl: url, creativeOutputId: null } : { ok: false };
  }
  if (ref.kind === "creative_output") {
    const { data } = await db.from("zono_quick_creative_outputs").select("id,image_url").eq("id", ref.id).eq("property_id", propertyId).eq("org_id", orgId).maybeSingle();
    if (!data) return { ok: false };
    // Studio assets publish through the approved derivative; persist the output id.
    return { ok: true, imageUrl: (data.image_url as string | null) ?? null, creativeOutputId: String(data.id) };
  }
  return { ok: false };
}
