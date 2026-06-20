import { getTeamBoard, type TeamBoard } from "@/lib/team/service";
import { TeamView } from "./TeamView";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  let board: TeamBoard;
  try {
    board = await getTeamBoard();
  } catch (e) {
    console.error("[team] load failed:", e);
    board = { snapshot: null, agents: [], topPerformers: [], revenueLeaders: [], forecastLeaders: [], needsAttention: [], coaching: [], workload: [], territory: [], leakage: [], managementActions: [] };
  }
  return <TeamView board={board} />;
}
