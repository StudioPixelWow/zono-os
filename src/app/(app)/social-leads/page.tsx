import { getSocialLeadsBoard, type SocialLeadsBoard } from "@/lib/social/service";
import { SocialLeadsView } from "./SocialLeadsView";

export const dynamic = "force-dynamic";

export default async function SocialLeadsPage() {
  let board: SocialLeadsBoard;
  try {
    board = await getSocialLeadsBoard();
  } catch (e) {
    console.error("[social] load failed:", e);
    board = { counts: { new: 0, reviewed: 0, qualified: 0, converted: 0, rejected: 0 }, byStatus: { new: [], reviewed: [], qualified: [], converted: [], rejected: [] }, topOpportunities: [], intentBreakdown: [], sourceBreakdown: [], communityBreakdown: [], agentRecommendations: [], followups: [] };
  }
  return <SocialLeadsView board={board} />;
}
