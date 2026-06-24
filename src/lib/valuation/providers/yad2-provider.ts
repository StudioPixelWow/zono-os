// ============================================================================
// Yad2 provider — REAL active listings imported via the external-listings module
// (source/provider = 'yad2'). No live scraping in this module: it reads stored,
// previously-imported rows only. Returns 'not_connected' when nothing imported.
// ============================================================================
import type { ProviderContext, ProviderResult } from "./types";
import { readPortalListings } from "./portal-listings";

export async function yad2Provider(ctx: ProviderContext): Promise<ProviderResult> {
  return readPortalListings(ctx, "yad2", ["yad2"]);
}
