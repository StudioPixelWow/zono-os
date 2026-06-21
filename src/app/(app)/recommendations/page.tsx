import { getRecommendationCommandCenter, type RecommendationCommandCenter } from "@/lib/recommendations/service";
import { RecommendationsView } from "./RecommendationsView";

export const dynamic = "force-dynamic";

const EMPTY: RecommendationCommandCenter = {
  total: 0, highPriority: 0, needsMoreData: 0, readyPackages: 0, expectedRevenue: 0,
  accepted: 0, rejected: 0, converted: 0, byType: [], top: [], recentlyConverted: [], needsData: [],
};

export default async function RecommendationsPage() {
  let cc: RecommendationCommandCenter;
  try {
    cc = await getRecommendationCommandCenter();
  } catch (e) {
    console.error("[recommendations] load failed:", e);
    cc = EMPTY;
  }
  return <RecommendationsView cc={cc} />;
}
