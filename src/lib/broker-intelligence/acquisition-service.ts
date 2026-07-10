// ============================================================================
// 🎯 ZONO — BROKER INTELLIGENCE · Area 1 · Acquisition service (server-only).
// Feeds the pure acquisition engine with REAL data by reusing the existing
// market-listings loader (external_listings + buyer-match enrichment). Maps only
// columns that actually exist; unknown signals stay null (the engine treats them
// honestly and flags insufficient evidence rather than guessing). Never throws.
// ============================================================================
import "server-only";
import { loadMarketListings } from "@/lib/external-listings/market-listings-data";
import { rankAcquisition, type AcquisitionSignals } from "./acquisition";
import type { Recommendation } from "./types";

const DAY = 86_400_000;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / DAY));
}

export interface AcquisitionIntelligence {
  recommendations: Recommendation[];
  /** Honest counts so the UI can show coverage without inventing data. */
  scanned: number;
  actionable: number;   // sufficient-evidence recommendations
  generatedAt: string;
}

/**
 * Rank today's acquisition opportunities from real external-listing signals.
 * `limit` caps how many top opportunities are returned to the UI.
 */
export async function getAcquisitionIntelligence(limit = 12): Promise<AcquisitionIntelligence> {
  const empty: AcquisitionIntelligence = { recommendations: [], scanned: 0, actionable: 0, generatedAt: new Date().toISOString() };
  try {
    const { listings, matches } = await loadMarketListings();
    if (!listings.length) return empty;

    const signals: AcquisitionSignals[] = listings.map((l) => ({
      listingId: l.id,
      title: l.title,
      city: l.city,
      neighborhood: l.neighborhood,
      daysOnMarket: daysSince(l.first_seen_at),
      // Per-listing reduction history isn't on this read model → 0 (honest: no signal).
      priceReductions: 0,
      privateOwner: l.has_agent === false,
      duplicate: !!l.duplicate_group_id,
      // Per-listing market delta not available here → null (unknown, not zero).
      vsNeighborhoodPct: null,
      buyerMatches: matches[l.id]?.count ?? 0,
      competingCount: null,
      sellerLikelihood: null,
    }));

    const ranked = rankAcquisition(signals);
    const actionable = ranked.filter((r) => !r.insufficientEvidence).length;
    return {
      recommendations: ranked.slice(0, limit),
      scanned: listings.length,
      actionable,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error("[broker-intelligence] acquisition failed:", e);
    return empty;
  }
}
