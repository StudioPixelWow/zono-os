// ============================================================================
// ZONO — Competitor alert engine (pure, deterministic). Builds candidate alerts
// from competitor analytics + area data, then de-duplicates against existing
// unread alerts of the same type/competitor/area within 24h.
// ============================================================================
import type { AlertType, CompetitorAnalytics, ExistingAlertKey, Severity } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const SEV_RANK: Record<Severity, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export interface AlertCandidate {
  competitorProfileId: string | null;
  competitorName: string | null;
  alertType: AlertType;
  severity: Severity;
  title: string;
  message: string;
  city: string | null;
  neighborhood: string | null;
}

export interface BuildAlertsInput {
  competitors: CompetitorAnalytics[];
  /** Per-competitor area aggregates for spike / new-area / price-drop-wave. */
  areaActivity: {
    competitorProfileId: string;
    competitorName: string;
    city: string | null;
    neighborhood: string | null;
    newListings: number;
    priceDrops: number;
    isNewArea: boolean;             // competitor had no prior links in this area
    belowAreaAvgCount: number;      // listings priced below area average
    areaListingCount: number;
  }[];
  /** Estimated share change vs previous snapshot, per competitor. */
  shareChanges: { competitorProfileId: string; competitorName: string; deltaPercent: number }[];
}

/** Generate candidate competitor alerts (pre-dedup). */
export function buildCompetitorAlertCandidates(i: BuildAlertsInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];

  for (const a of i.areaActivity) {
    const area = a.neighborhood ?? a.city ?? "האזור";
    // A. competitor_spike — many new listings in same area.
    if (a.newListings >= 4) {
      out.push({
        competitorProfileId: a.competitorProfileId, competitorName: a.competitorName,
        alertType: "competitor_spike", severity: a.newListings >= 8 ? "high" : "medium",
        title: `${a.competitorName} מגביר פעילות ב${area}`,
        message: `${a.newListings} מודעות חדשות מהמתחרה ב${area} השבוע.`,
        city: a.city, neighborhood: a.neighborhood,
      });
    }
    // B. competitor_price_drop_wave — multiple price drops in same area.
    if (a.priceDrops >= 3) {
      out.push({
        competitorProfileId: a.competitorProfileId, competitorName: a.competitorName,
        alertType: "competitor_price_drop_wave", severity: a.priceDrops >= 6 ? "high" : "medium",
        title: `גל ירידות מחיר של ${a.competitorName} ב${area}`,
        message: `${a.priceDrops} ירידות מחיר של המתחרה ב${area} — ייתכן לחץ תמחור.`,
        city: a.city, neighborhood: a.neighborhood,
      });
    }
    // C. competitor_new_area — competitor appears where it was not active before.
    if (a.isNewArea && a.newListings >= 2) {
      out.push({
        competitorProfileId: a.competitorProfileId, competitorName: a.competitorName,
        alertType: "competitor_new_area", severity: "medium",
        title: `${a.competitorName} נכנס לאזור חדש: ${area}`,
        message: `המתחרה החל לפרסם ב${area} (${a.newListings} מודעות) — לא היה פעיל שם קודם.`,
        city: a.city, neighborhood: a.neighborhood,
      });
    }
    // E. aggressive_pricing — listings consistently below area average.
    if (a.areaListingCount >= 3 && a.belowAreaAvgCount / a.areaListingCount >= 0.6 && a.belowAreaAvgCount >= 3) {
      out.push({
        competitorProfileId: a.competitorProfileId, competitorName: a.competitorName,
        alertType: "aggressive_pricing", severity: "high",
        title: `${a.competitorName} מתמחר אגרסיבי ב${area}`,
        message: `${a.belowAreaAvgCount} מתוך ${a.areaListingCount} מודעות מתחת לממוצע האזור.`,
        city: a.city, neighborhood: a.neighborhood,
      });
    }
  }

  // D. market_share_change — material estimated-share change.
  for (const s of i.shareChanges) {
    if (Math.abs(s.deltaPercent) >= 5) {
      const up = s.deltaPercent > 0;
      out.push({
        competitorProfileId: s.competitorProfileId, competitorName: s.competitorName,
        alertType: "market_share_change", severity: Math.abs(s.deltaPercent) >= 12 ? "high" : "medium",
        title: `שינוי נתח שוק מוערך: ${s.competitorName}`,
        message: `נתח השוק המוערך של המתחרה ${up ? "עלה" : "ירד"} ב‑${Math.abs(s.deltaPercent)}% (הערכה).`,
        city: null, neighborhood: null,
      });
    }
  }

  return out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}

/** Stable dedup key for an alert. */
export function alertDedupKey(alertType: string, competitorProfileId: string | null, city: string | null, neighborhood: string | null): string {
  return [alertType, competitorProfileId ?? "_", city ?? "_", neighborhood ?? "_"].join("|");
}

/**
 * Drop candidates that duplicate an existing unread alert of the same
 * type/competitor/area within the last 24h. Deterministic.
 */
export function dedupAlerts(candidates: AlertCandidate[], existing: ExistingAlertKey[], now: number = Date.now()): AlertCandidate[] {
  const blocked = new Set<string>();
  for (const e of existing) {
    if (e.status !== "unread") continue;
    if (now - Date.parse(e.createdAt) > DAY_MS) continue;
    blocked.add(alertDedupKey(e.alertType, e.competitorProfileId, e.city, e.neighborhood));
  }
  const seen = new Set<string>();
  const out: AlertCandidate[] = [];
  for (const c of candidates) {
    const key = alertDedupKey(c.alertType, c.competitorProfileId, c.city, c.neighborhood);
    if (blocked.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
