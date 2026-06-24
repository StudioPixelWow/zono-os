// ============================================================================
// Madlan provider — REAL active listings imported via the external-listings
// module (source/provider = 'madlan'). Reads stored rows only (no live scrape);
// returns 'not_connected' when nothing has been imported for the area.
// ============================================================================
import type { ProviderContext, ProviderResult } from "./types";
import { readPortalListings } from "./portal-listings";

export async function madlanProvider(ctx: ProviderContext): Promise<ProviderResult> {
  return readPortalListings(ctx, "madlan", ["madlan"]);
}
