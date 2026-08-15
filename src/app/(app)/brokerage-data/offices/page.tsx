// ============================================================================
// 🗂️ /brokerage-data/offices — directory of all brokerage offices.
// Card grid with search + city/brand filters; each card links to the office's
// profile page. Real connected data only.
// ============================================================================
import { getBrokerageOfficesIndex } from "@/lib/brokerage-data/office-profile";
import { getSessionContext } from "@/lib/auth/session";
import { OfficesIndexView } from "./OfficesIndexView";

export const dynamic = "force-dynamic";

export default async function BrokerageOfficesIndexPage() {
  let index = { offices: [], cities: [], brands: [], totals: { offices: 0, agents: 0, listings: 0 } } as Awaited<ReturnType<typeof getBrokerageOfficesIndex>>;
  try {
    index = await getBrokerageOfficesIndex();
  } catch (e) {
    console.error("[brokerage-offices] index load failed:", e);
  }
  // Viewer's operating city drives the hero copy (falls back gracefully).
  let city: string | null = null;
  try { const { profile } = await getSessionContext(); city = profile?.primary_city ?? null; } catch { /* no session */ }
  return <OfficesIndexView index={index} city={city} />;
}
