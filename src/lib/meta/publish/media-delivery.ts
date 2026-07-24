// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · MEDIA DELIVERY TO META. Phase 3A (server).
// ----------------------------------------------------------------------------
// Produces SHORT-LIVED, provider-fetchable media URLs only at execution time,
// AFTER verifying org ownership of the media. Media stays private by default;
// no permanent public bucket URL is ever created; storage credentials are never
// exposed; the signed URL is NEVER placed in a DTO or audit record. No media
// bytes enter app memory. The URL is scoped to the exact storage object.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

const META_MEDIA_BUCKET = "meta-media";
const PROVIDER_FETCH_TTL_SEC = 900;

export interface MediaDeliveryPort {
  resolve(orgId: string, mediaId: string, storageRef: string): Promise<string | null>;
}

/** Production media-delivery: verifies ownership, then signs a bounded URL. */
export function createSupabaseMediaDelivery(): MediaDeliveryPort {
  return {
    async resolve(orgId, mediaId, storageRef) {
      const db = createServiceRoleClient();
      const owned = await db.from("meta_media_asset" as never).select("id").eq("org_id", orgId).eq("id", mediaId).eq("storage_ref", storageRef).maybeSingle();
      if (!owned.data) return null;
      const { data } = await db.storage.from(META_MEDIA_BUCKET).createSignedUrl(storageRef, PROVIDER_FETCH_TTL_SEC);
      return data?.signedUrl ?? null;
    },
  };
}
