import { getJourneyCommandCenter, type JourneyCommandCenter } from "@/lib/journey-intelligence/service";
import { JourneysView } from "./JourneysView";

export const dynamic = "force-dynamic";

const EMPTY: JourneyCommandCenter = {
  kpis: { readyBuyers: 0, readySellers: 0, stuckJourneys: 0, journeyRisks: 0, journeyOpportunities: 0, activeJourneys: 0, expectedCommission: 0 },
  buyers: [], sellers: [], stuck: [], ready: [], risks: [], opportunities: [], milestones: [],
  analytics: { byStageBuyer: [], byStageSeller: [], avgConversion: 0, avgHealth: 0 }, isManager: false,
};

export default async function JourneysPage() {
  let cc: JourneyCommandCenter = EMPTY;
  try { cc = await getJourneyCommandCenter(); }
  catch (e) { console.error("[journeys] load failed:", e); }
  return <JourneysView cc={cc} />;
}
