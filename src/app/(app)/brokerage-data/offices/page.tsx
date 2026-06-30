// ============================================================================
// 🗂️ /brokerage-data/offices — directory of all brokerage offices.
// Card grid with search + city/brand filters; each card links to the office's
// profile page. Real connected data only.
// ============================================================================
import { getBrokerageOfficesIndex } from "@/lib/brokerage-data/office-profile";
import { OfficesIndexView } from "./OfficesIndexView";

export const dynamic = "force-dynamic";

export default async function BrokerageOfficesIndexPage() {
  let index = { offices: [], cities: [], brands: [], totals: { offices: 0, agents: 0, listings: 0 } } as Awaited<ReturnType<typeof getBrokerageOfficesIndex>>;
  try {
    index = await getBrokerageOfficesIndex();
  } catch (e) {
    console.error("[brokerage-offices] index load failed:", e);
  }
  return <OfficesIndexView index={index} />;
}
