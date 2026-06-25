// ============================================================================
// ZONO — Office heatmap points + market-share estimation (pure).
// Real coordinates only (the server passes points already filtered to real
// lat/lng). Market share is clearly labeled as an estimate with completeness.
// ============================================================================
import { clamp } from "./analytics";
import type { MarketShareEstimate, OfficeMapPoint } from "./types";

export interface RawPoint { id: string; lat: number; lng: number; title: string; details: string[]; tone: OfficeMapPoint["tone"] }

/** Pass through already-validated points (server guarantees real coordinates). */
export function toOfficeMapPoints(points: RawPoint[]): OfficeMapPoint[] {
  return points.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.title, details: p.details, tone: p.tone }));
}

export interface MarketShareInput { city: string; officeListings: number; monitoredListings: number; previousSharePercent?: number | null }

/** Estimate office market share per city = officeListings / monitoredListings. */
export function computeMarketShareEstimates(rows: MarketShareInput[]): MarketShareEstimate[] {
  return rows.map((r) => {
    const sharePercent = r.monitoredListings > 0 ? Math.round((r.officeListings / r.monitoredListings) * 1000) / 10 : 0;
    // Completeness: more monitored listings → more reliable estimate.
    const dataCompleteness = clamp(Math.round((r.monitoredListings / 50) * 100), 0, 100);
    const confidence: MarketShareEstimate["confidence"] = dataCompleteness >= 70 ? "high" : dataCompleteness >= 35 ? "medium" : "low";
    return { city: r.city, officeListings: r.officeListings, monitoredListings: r.monitoredListings, sharePercent, confidence, dataCompleteness };
  }).sort((a, b) => b.sharePercent - a.sharePercent);
}
