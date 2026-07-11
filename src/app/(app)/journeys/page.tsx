// ============================================================================
// 🧭 ZONO — Journey Center page (/journeys) · CANONICAL-FIRST (Batch 5.4).
//
// It used to read a DERIVED model and deliberately "never the sparsely-seeded
// `journeys` table" — correct when that table was empty, wrong now that 5.2 fills
// it from events and 5.3 backfilled the real property journeys. It now reads the
// canonical spine first and falls back to the derived model ONLY for entities with
// no canonical journey, always marked. No writes, no journey creation.
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
