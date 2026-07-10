// ============================================================================
// 🧭 ZONO — Journey Center page (/journeys). Reads the UNIFIED journey model
// (composition over the existing buyer/seller/lead twins + listing scorecards);
// never the sparsely-seeded `journeys` table. Distinguishes load-error from a
// true empty state. No writes, no journey creation.
// ============================================================================
import { getJourneyCenter } from "@/lib/journey-center/service";
import type { JourneyCenter } from "@/lib/journey-center/types";
import { JourneysView } from "./JourneysView";

export const dynamic = "force-dynamic";

export default async function JourneysPage() {
  let data: JourneyCenter | null = null;
  let error = false;
  try { data = await getJourneyCenter(); }
  catch (e) { console.error("[journeys] load failed:", e); error = true; }
  return <JourneysView data={data} error={error} />;
}
