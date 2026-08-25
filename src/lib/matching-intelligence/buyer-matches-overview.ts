// ============================================================================
// Buyer Command Center 5.1 — internal buyer MATCHES OVERVIEW (server-only).
// Assembles the one view model the internal buyer page reads: every match with its
// derived freshness, the "new since last review" count, shortlist state summary,
// and the single evidence-backed next action. Reuses the canonical match table and
// shortlist — no second source of truth.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  deriveMatchFreshness, FRESHNESS_LABEL_HE, FRESHNESS_TONE,
  type MatchFreshness, type ShortlistState,
} from "./freshness";
import { computeBuyerNextAction, type BuyerNextAction } from "./buyer-next-action";
import { MATCH_SCAN, pageCompleteness } from "./scan";

type SupabaseLike = ReturnType<typeof createServiceRoleClient>;
const MARKETABLE = new Set(["active", "published", "ready", "under_offer"]);

export interface BuyerMatchRow {
  propertyId: string;
  title: string;
  city: string | null;
  neighborhood: string | null;
  rooms: number | null;
  sizeSqm: number | null;
  price: number | null;
  imageUrl: string | null;
  available: boolean;
  matchPercent: number | null;   // compatibility_score (internal view)
  closing: number | null;
  reason: string | null;         // strongest_advantage
  blocker: string | null;        // primary_blocker (important mismatch)
  shortlistState: ShortlistState | null;
  freshness: MatchFreshness;
  freshnessLabel: string;        // Hebrew
  freshnessTone: "brand" | "success" | "warning" | "neutral";
  lastCalculatedAt: string | null;
}

export interface BuyerMatchOverview {
  buyerId: string;
  firstName: string;
  reviewedAt: string | null;
  counts: {
    total: number; active: number; newCount: number;
    shortlisted: number; sent: number; viewed: number; liked: number;
    rejected: number; visitRequested: number; inactive: number;
  };
  newSinceLabel: string | null;   // "4 התאמות חדשות מאז 21.8" (or null)
  nextAction: BuyerNextAction | null;
  matches: BuyerMatchRow[];
  /** 9.7 UI HONESTY — false when there are MORE matches than the page shows, so the
   *  UI must NOT claim it is displaying the buyer's complete match universe. */
  matchesComplete: boolean;
  /** Subtle Hebrew note when incomplete (null when complete). No fake progress %. */
  partialLabel: string | null;
}

function firstNameOf(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "הקונה";
}

function heShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

/** Assemble the buyer's match overview (freshness + counts + next action). */
export async function getBuyerMatchOverview(orgId: string, buyerId: string, db?: SupabaseLike): Promise<BuyerMatchOverview> {
  // buyer_property_shortlist + the match→properties join are newer than / not
  // representable in the generated types — use an untyped client for the reads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = db ?? createServiceRoleClient();
  const [buyerRes, matchesRes, shortlistRes, viewingRes] = await Promise.all([
    supabase.from("buyers").select("full_name,matches_last_reviewed_at").eq("org_id", orgId).eq("id", buyerId).maybeSingle(),
    supabase.from("match_intelligence_profiles")
      .select("property_id,match_status,compatibility_score,closing_probability,strongest_advantage,primary_blocker,last_calculated_at,properties(id,title,city,neighborhood,rooms,size_sqm,price,status,primary_image_url)")
      // 9.7 — fetch SHOWN+1 so we can tell there are MORE matches than the page shows
      // (honest "not the complete universe") without a second query.
      .eq("org_id", orgId).eq("buyer_id", buyerId).order("closing_probability", { ascending: false }).limit(MATCH_SCAN.OVERVIEW_SHOWN + 1),
    supabase.from("buyer_property_shortlist").select("property_id,state").eq("org_id", orgId).eq("buyer_id", buyerId),
    supabase.from("meetings").select("id").eq("org_id", orgId).eq("buyer_id", buyerId).gte("start_at", new Date().toISOString()).in("status", ["scheduled", "confirmed"]).limit(1),
  ]);

  const firstName = firstNameOf((buyerRes.data as { full_name?: string | null } | null)?.full_name);
  const reviewedAt = (buyerRes.data as { matches_last_reviewed_at?: string | null } | null)?.matches_last_reviewed_at ?? null;
  const shortlistBy = new Map(((shortlistRes.data ?? []) as Array<{ property_id: string; state: string }>).map((s) => [s.property_id, s.state as ShortlistState]));
  const hasUpcomingViewing = ((viewingRes.data ?? []) as unknown[]).length > 0;

  type Raw = {
    property_id: string; match_status: string | null; compatibility_score: number | null;
    closing_probability: number | null; strongest_advantage: string | null; primary_blocker: string | null;
    last_calculated_at: string | null;
    properties: { id: string; title: string; city: string | null; neighborhood: string | null; rooms: number | null; size_sqm: number | null; price: number | null; status: string | null; primary_image_url: string | null } | null;
  };
  const fetched = (matchesRes.data ?? []) as unknown as Raw[];
  // 9.7 — clamp to SHOWN, remember whether the +1 probe found more (honest UI).
  const { hasMore, shown } = pageCompleteness(fetched.length, MATCH_SCAN.OVERVIEW_SHOWN);
  const rows = fetched.slice(0, shown);

  const matches: BuyerMatchRow[] = rows.map((r) => {
    const prop = r.properties;
    const available = MARKETABLE.has((prop?.status ?? "") as string);
    const shortlistState = shortlistBy.get(r.property_id) ?? null;
    const freshness = deriveMatchFreshness({
      matchStatus: r.match_status, propertyAvailable: available,
      shortlistState, lastCalculatedAt: r.last_calculated_at, reviewedAt,
    });
    return {
      propertyId: r.property_id,
      title: prop?.title ?? "נכס",
      city: prop?.city ?? null, neighborhood: prop?.neighborhood ?? null,
      rooms: prop?.rooms ?? null, sizeSqm: prop?.size_sqm ?? null, price: prop?.price ?? null,
      imageUrl: prop?.primary_image_url ?? null, available,
      matchPercent: r.compatibility_score, closing: r.closing_probability,
      reason: r.strongest_advantage, blocker: r.primary_blocker,
      shortlistState, freshness,
      freshnessLabel: FRESHNESS_LABEL_HE[freshness], freshnessTone: FRESHNESS_TONE[freshness],
      lastCalculatedAt: r.last_calculated_at,
    };
  });

  const count = (f: MatchFreshness) => matches.filter((m) => m.freshness === f).length;
  const counts = {
    total: matches.length,
    active: matches.filter((m) => m.freshness !== "INACTIVE").length,
    newCount: count("NEW"),
    shortlisted: count("SHORTLISTED"),
    sent: count("SENT"),
    viewed: count("VIEWED"),
    liked: count("LIKED"),
    rejected: count("REJECTED"),
    visitRequested: count("VISIT_REQUESTED"),
    inactive: count("INACTIVE"),
  };

  const sinceDate = heShortDate(reviewedAt);
  const newSinceLabel = counts.newCount > 0
    ? `${counts.newCount} ${counts.newCount === 1 ? "התאמה חדשה" : "התאמות חדשות"}${sinceDate ? ` מאז ${sinceDate}` : ""}`
    : null;

  const nextAction = computeBuyerNextAction(firstName, {
    newMatches: counts.newCount,
    shortlisted: counts.shortlisted,
    sentAny: counts.sent + counts.viewed + counts.liked + counts.rejected + counts.visitRequested > 0,
    liked: counts.liked,
    visitRequested: counts.visitRequested,
    hasUpcomingViewing,
  });

  return {
    buyerId, firstName, reviewedAt, counts, newSinceLabel, nextAction, matches,
    matchesComplete: !hasMore,
    partialLabel: hasMore ? "מוצגות ההתאמות המובילות — ייתכנו התאמות נוספות" : null,
  };
}

/** Mark this buyer's matches as reviewed now (clears "new since last review"). */
export async function markBuyerMatchesReviewed(orgId: string, buyerId: string, db?: SupabaseLike): Promise<void> {
  // matches_last_reviewed_at is newer than the generated types — untyped client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = db ?? createServiceRoleClient();
  await supabase.from("buyers").update({ matches_last_reviewed_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", buyerId);
}
