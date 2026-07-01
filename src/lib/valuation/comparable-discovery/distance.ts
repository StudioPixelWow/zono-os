// ============================================================================
// 📏 Distance + radius bucketing (pure). VAL-QA-10.
// Real coordinates only — no coordinates → no radius (never guessed).
// ============================================================================
import { haversineMeters } from "@/lib/evidence-search/normalizers";
import { RADIUS_LADDER } from "./types";

export { haversineMeters };

/** Distance (m) between subject and a point, or null when either lacks coords. */
export function distanceOrNull(
  subjLat: number | null, subjLng: number | null, lat: number | null, lng: number | null,
): number | null {
  if (subjLat == null || subjLng == null || lat == null || lng == null) return null;
  return Math.round(haversineMeters(subjLat, subjLng, lat, lng));
}

/** Smallest radius bucket (500…4000) containing the distance, or null. */
export function radiusBucket(distanceMeters: number | null): number | null {
  if (distanceMeters == null) return null;
  for (const r of RADIUS_LADDER) if (distanceMeters <= r) return r;
  return null;   // beyond 4km
}
