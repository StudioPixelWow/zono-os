import { getTerritoryCommandCenter, type TerritoryCommandCenter } from "@/lib/territory/service";
import { TerritoriesView } from "./TerritoriesView";

export const dynamic = "force-dynamic";

const EMPTY: TerritoryCommandCenter = {
  total: 0, strongest: null, fastestGrowing: null, highestRevenue: null, highestAcquisition: null,
  biggestThreat: null, biggestOpportunity: null, rankings: [], whiteSpace: [], dominance: [],
  revenueOps: [], neighborhoods: [], signals: [], expectedRevenueTotal: 0,
};

export default async function TerritoriesPage() {
  let cc: TerritoryCommandCenter;
  try {
    cc = await getTerritoryCommandCenter();
  } catch (e) {
    console.error("[territories] load failed:", e);
    cc = EMPTY;
  }
  return <TerritoriesView cc={cc} />;
}
