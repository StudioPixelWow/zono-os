// ============================================================================
// ZONO Price Intelligence — provider layer contract (server-only).
// ----------------------------------------------------------------------------
// A provider returns comparable evidence for a subject property from ONE source.
// "Real" providers read data the org already imported (GovMap transactions, Yad2/
// Madlan listings, ZONO internal inventory, the broker's own closed deals).
// "Stub" providers (direct Tax Authority / direct portal APIs) are NOT connected
// in this module — they return status 'not_connected' and never invent records.
// No illegal scraping is performed here; nothing fabricates official data.
// ============================================================================
import type { createClient } from "@/lib/supabase/server";
import type { Comparable, ValuationInput } from "../types";

export type ProviderStatus = "ok" | "not_connected" | "demo" | "error";

export interface ProviderContext {
  db: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  input: ValuationInput;
  /** Max evidence rows to pull per provider. */
  limit: number;
}

export interface ProviderResult {
  source: string;
  status: ProviderStatus;
  comparables: Comparable[];
  message?: string;
}

/** Compute haversine distance (m) between subject and a point, or null. */
export function distanceMeters(
  input: ValuationInput, lat?: number | null, lng?: number | null,
): number | null {
  if (input.latitude == null || input.longitude == null || lat == null || lng == null) return null;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat - input.latitude);
  const dLng = toRad(lng - input.longitude);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(input.latitude)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
