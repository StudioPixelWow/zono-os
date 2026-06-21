import { getReputationCommandCenter, type ReputationCommandCenter } from "@/lib/reputation/service";
import { ReputationView } from "./ReputationView";

export const dynamic = "force-dynamic";

const EMPTY: ReputationCommandCenter = {
  reviewCount: 0, avgRating: 0, publishedReviews: 0, referralCount: 0, convertedReferrals: 0, referralRevenue: 0,
  advocateCounts: [], ambassadors: 0, topAdvocates: [], topReferrers: [], geoInfluence: [], agentRankings: [],
  opportunities: [], reviewOpportunities: 0, referralOpportunities: 0, isManager: false,
};

export default async function ReputationPage() {
  let cc: ReputationCommandCenter = EMPTY;
  try {
    cc = await getReputationCommandCenter();
  } catch (e) {
    console.error("[reputation] load failed:", e);
  }
  return <ReputationView cc={cc} />;
}
