// ============================================================================
// ZONO — Creative Studio library: PURE, client-safe view model. ONE place that
// maps a raw zono_quick_creative_outputs row → a card view, labels output types,
// and does the bounded-pagination math. No server-only, no @/ imports, no I/O —
// so the workspace UI, the server selector, and the tests all share exactly one
// definition (bounded lists can't drift, labels can't fork). Never fabricates:
// it only reshapes real fields the caller already read.
// ============================================================================

export type CreativeOutputType = "property_ad_post" | "sold_post" | "testimonial_post" | (string & {});

/** Product-facing Hebrew labels for the real request/output types (engine truth). */
export const CREATIVE_TYPE_LABEL_HE: Record<string, string> = {
  property_ad_post: "פוסט נכס",
  sold_post: "נמכר",
  testimonial_post: "המלצת לקוח",
};
export function outputTypeLabel(t: string | null | undefined): string {
  return (t && CREATIVE_TYPE_LABEL_HE[t]) || "קריאייטיב";
}

/** The library's canonical page size and hard bound — never fetch a whole history. */
export const CREATIVE_PAGE_SIZE = 18;
export const CREATIVE_PAGE_MAX = 40;
export const RECENT_MAX = 6;

/** Clamp any requested page size into [1, CREATIVE_PAGE_MAX] (default page size). */
export function clampPageLimit(n: number | null | undefined): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return CREATIVE_PAGE_SIZE;
  return Math.max(1, Math.min(CREATIVE_PAGE_MAX, v));
}
export function clampRecent(n: number | null | undefined): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return RECENT_MAX;
  return Math.max(1, Math.min(12, v));
}

/** Given the offset we queried from and how many rows came back (plus the total
 *  count), derive the next offset and whether more remain. Pure + deterministic. */
export function pageInfo(offset: number, returned: number, total: number): { nextOffset: number; hasMore: boolean } {
  const off = Math.max(0, Math.floor(offset) || 0);
  const got = Math.max(0, Math.floor(returned) || 0);
  const tot = Math.max(0, Math.floor(total) || 0);
  const nextOffset = off + got;
  return { nextOffset, hasMore: nextOffset < tot };
}

export interface CreativeCardView {
  id: string;
  outputType: string;
  typeLabel: string;
  format: string | null;
  title: string | null;
  headline: string | null;
  imageUrl: string | null;      // a resolved (already-signed) preview URL, or null
  imageStatus: string | null;
  status: string | null;
  propertyId: string | null;
  agentId: string | null;
  isFavorite: boolean;
  createdAt: string | null;
  hasImage: boolean;
  isFailed: boolean;            // real failure only (image or generation) — drives the sole red state
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length ? v : null);

/** Map a raw output row (snake_case, image_url already resolved by the caller)
 *  into the card view. Pure — the ONE mapping the whole library shares. */
export function toCreativeCardView(row: Record<string, unknown>): CreativeCardView {
  const outputType = str(row.output_type) ?? "";
  const imageUrl = str(row.image_url);
  const imageStatus = str(row.image_status);
  const status = str(row.status);
  return {
    id: String(row.id ?? ""),
    outputType,
    typeLabel: outputTypeLabel(outputType),
    format: str(row.format),
    title: str(row.title),
    headline: str(row.headline),
    imageUrl,
    imageStatus,
    status,
    propertyId: str(row.property_id),
    agentId: str(row.agent_id),
    isFavorite: row.is_favorite === true,
    createdAt: str(row.created_at),
    hasImage: !!imageUrl,
    isFailed: imageStatus === "failed" || status === "failed",
  };
}

/** A bounded page of library creatives (shared by the selector, action, and UI). */
export interface OrgCreativePage { items: CreativeCardView[]; total: number; hasMore: boolean; nextOffset: number }

/** Where a creative card opens: its property studio, else its agent studio, else null. */
export function creativeStudioHref(card: Pick<CreativeCardView, "propertyId" | "agentId">): string | null {
  if (card.propertyId) return `/creative-studio/property/${card.propertyId}`;
  if (card.agentId) return `/creative-studio/agent/${card.agentId}`;
  return null;
}
