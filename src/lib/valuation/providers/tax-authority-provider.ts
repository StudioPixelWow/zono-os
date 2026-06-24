// ============================================================================
// Tax Authority provider — STUB. A direct connection to the Israeli Tax
// Authority (רשות המסים) real-estate deal API is NOT wired in this module.
// Tax-Authority-sourced deals are already surfaced via the GovMap provider
// (the imported property_transactions feed). This stub stays honest: it never
// fabricates official records and reports 'not_connected'.
//
// To connect later: add a server-side authenticated client to the Tax Authority
// deals endpoint, map each deal → Comparable{ source:'tax_authority', comparableType:'sold' }
// and return status:'ok'. Keep all credentials server-only.
// ============================================================================
import type { ProviderContext, ProviderResult } from "./types";

export async function taxAuthorityProvider(_ctx: ProviderContext): Promise<ProviderResult> {
  void _ctx;
  return {
    source: "tax_authority",
    status: "not_connected",
    comparables: [],
    message: "חיבור ישיר לרשות המסים אינו מוגדר. נתוני עסקאות רשמיים זמינים דרך GovMap.",
  };
}
