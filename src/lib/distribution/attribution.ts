import "server-only";
import type { createClient } from "@/lib/supabase/server";

// The resolver accepts an already-scoped supabase client (session OR service-role);
// it performs NO writes and creates no client of its own.
type Db = Awaited<ReturnType<typeof createClient>>;

export interface PostAttribution {
  campaignId: string | null;
  propertyId: string | null;
  groupId: string | null;
}

/**
 * P4.1 — authoritative server-side attribution resolver.
 *
 * Given the source distribution_posts.id an interaction originated from, return
 * its campaign / property / group. distribution_posts is the single source of
 * truth (it carries all three ids since Phase 1). Security:
 *   • Org ownership is VALIDATED in the query (id AND org_id must match). A
 *     campaign/property/group supplied by a client is never trusted — only what
 *     this row yields is returned.
 *   • A missing post and a post owned by ANOTHER org both return null and are
 *     indistinguishable to the caller (no cross-tenant existence leak).
 *   • Read-only. Narrowly scoped. No URL/external-id fallback in P4.1.
 */
export async function resolvePostAttribution(
  sourcePostId: string | null | undefined,
  orgId: string,
  db: Db,
): Promise<PostAttribution | null> {
  if (!sourcePostId || !orgId) return null;
  const { data } = await db.from("distribution_posts" as never)
    .select("campaign_id,property_id,group_id")
    .eq("id", sourcePostId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null; // not found OR foreign-org — deliberately indistinguishable
  const r = data as { campaign_id: string | null; property_id: string | null; group_id: string | null };
  return {
    campaignId: r.campaign_id ?? null,
    propertyId: r.property_id ?? null,
    groupId: r.group_id ?? null,
  };
}
