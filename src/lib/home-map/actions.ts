"use server";
// ============================================================================
// ZONO — Home live-property map action. Org-scoped (the service derives org from
// the session). Returns real-coordinate points only.
// ============================================================================
import { getHomeMapData } from "./service";
import { DEFAULT_HOME_MAP_FILTERS, type HomeMapData, type HomeMapFilters } from "./types";

export async function getHomeMapDataAction(filters: HomeMapFilters = DEFAULT_HOME_MAP_FILTERS): Promise<HomeMapData> {
  try { return await getHomeMapData(filters); }
  catch {
    return { points: [], internalCount: 0, externalCount: 0, total: 0, hasGoogleKey: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, hasOperatingArea: false, areaCities: [], areaLabel: null, externalDiag: { rawActive: 0, withCoords: 0, missingCoords: 0, cityDropped: 0, shown: 0, droppedCitySamples: [] } };
  }
}
