// ============================================================================
// ZONO — Market Intelligence COMMAND CENTER · server aggregation (server-only).
// ----------------------------------------------------------------------------
// The ONE read layer for the rebuilt /market-intelligence command center. Pulls
// ONLY real, org-scoped (RLS) external-market data — active external listings,
// the price-change event stream, and the daily market snapshots — maps it to the
// pure `buildCommandCenter` derivations, and returns the synthesized view model.
// Every source is best-effort: a failed read degrades to empty (never a fake
// number). No CRM data, no fabrication. The long-horizon trend is DATA_REQUIRED
// until enough daily snapshots exist (decided inside the pure module).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { externalListingRepository } from "@/lib/external-listings/repository";
import { buildCommandCenter, type CommandCenter, type MiListing, type MiSnapshot } from "./command-center";

const DAY = 86_400_000;

function firstImageUrl(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const f = images[0];
  if (typeof f === "string") return f;
  if (f && typeof f === "object") { const o = f as Record<string, unknown>; return (o.url as string) ?? (o.src as string) ?? (o.image as string) ?? null; }
  return null;
}
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const ms = (v: unknown): number | null => { if (!v) return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };

/** Assemble the market-intelligence command center. All reads best-effort. */
export async function getMarketCommandCenter(): Promise<CommandCenter> {
  const now = Date.now();
  const supabase = await createClient();

  // ── Active external listings (paginated, RLS-scoped) → MiListing. ───────────
  let listings: MiListing[] = [];
  try {
    const rows = await externalListingRepository.listForOrg();
    listings = rows.map((r) => ({
      id: r.id,
      title: r.title ?? null,
      city: r.city ?? null,
      neighborhood: r.neighborhood ?? null,
      propertyType: r.property_type ?? null,
      dealType: r.deal_type ?? null,
      price: num(r.price),
      sqm: num(r.sqm) ?? num(r.area_sqm),
      rooms: num(r.rooms),
      hasAgent: r.has_agent ?? null,
      contactPhone: r.contact_phone ?? null,
      opportunityScore: num(r.opportunity_score),
      status: r.status ?? null,
      firstSeenMs: ms(r.first_seen_at) ?? ms(r.imported_at),
      image: firstImageUrl(r.images),
      source: r.source ?? null,
    }));
  } catch (e) { console.error("[market-command-center] listings failed:", e instanceof Error ? e.message : e); }

  // ── Price-change event stream (last 90d) → trend + recent-drop signal. ───────
  let priceEventMs: number[] = [];
  let droppedListingIds: string[] = [];
  try {
    const since = new Date(now - 90 * DAY).toISOString();
    const { data } = await supabase
      .from("external_listing_history")
      .select("listing_id,created_at")
      .eq("change_type", "price_changed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    const rows = (data ?? []) as { listing_id: string | null; created_at: string | null }[];
    priceEventMs = rows.map((r) => ms(r.created_at)).filter((t): t is number => t != null);
    const recent = new Set<string>();
    for (const r of rows) { const t = ms(r.created_at); if (r.listing_id && t != null && t >= now - 30 * DAY) recent.add(r.listing_id); }
    droppedListingIds = [...recent];
  } catch (e) { console.error("[market-command-center] history failed:", e instanceof Error ? e.message : e); }

  // ── Daily market snapshots → the (gated) long-horizon locality trend. ───────
  let snapshots: MiSnapshot[] = [];
  try {
    const { data } = await supabase
      .from("market_area_snapshots")
      .select("date,locality_name,avg_price_per_sqm")
      .order("date", { ascending: true })
      .limit(2000);
    snapshots = ((data ?? []) as { date: string; locality_name: string | null; avg_price_per_sqm: number | null }[])
      .map((s) => ({ date: s.date, localityName: s.locality_name, avgPricePerSqm: num(s.avg_price_per_sqm) }));
  } catch (e) { console.error("[market-command-center] snapshots failed:", e instanceof Error ? e.message : e); }

  return buildCommandCenter({ listings, priceEventMs, droppedListingIds, snapshots, nowMs: now });
}
