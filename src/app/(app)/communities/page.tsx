import { getCommunityCommandCenter, type CommunityCommandCenter } from "@/lib/community/service";
import { CommunitiesView } from "./CommunitiesView";

export const dynamic = "force-dynamic";

const EMPTY: CommunityCommandCenter = {
  communities: [], comments: [], messenger: [], socialAccounts: [],
  totalCommunities: 0, approvedCommunities: 0, leadsAttributed: 0, dealsAttributed: 0,
  hotComments: 0, topRoi: null, lowRoi: null, isManager: false,
};

export default async function CommunitiesPage() {
  let cc: CommunityCommandCenter = EMPTY;
  try {
    cc = await getCommunityCommandCenter();
  } catch (e) {
    console.error("[communities] load failed:", e);
  }
  return <CommunitiesView cc={cc} />;
}
