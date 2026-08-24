import { redirect } from "next/navigation";
import { getTeamBoard, type TeamBoard } from "@/lib/team/service";
import { getTeamSeats } from "@/lib/team-admin/team-seats";
import { getSessionContext } from "@/lib/auth/session";
import { resolveBillingAccess, type BillingAccessDecision } from "@/lib/commercial/billing-access";
import { TeamSeatsView } from "./TeamSeatsView";

export const dynamic = "force-dynamic";

// /team → Team & Access (roster + ZONO seat access + billing impact). The
// legacy analytics board (getTeamBoard→TeamView) is preserved and rendered
// under the "תובנות צוות" tab inside TeamSeatsView. Manager/owner only.
export default async function TeamPage() {
  const seats = await getTeamSeats();
  if (!seats) redirect("/"); // not a manager/owner (or no org) → no team admin surface

  let board: TeamBoard;
  try {
    board = await getTeamBoard();
  } catch (e) {
    console.error("[team] analytics load failed:", e);
    board = { snapshot: null, office: null, agents: [], topPerformers: [], revenueLeaders: [], forecastLeaders: [], needsAttention: [], coaching: [], workload: [], territory: [], leaks: [], actions: [] };
  }

  // 8.2 — billing lifecycle banner (grace / restricted). Manager/owner surface
  // only (this page already redirects agents), so no provider/debug leaks to them.
  let billing: BillingAccessDecision | null = null;
  try {
    const { profile } = await getSessionContext();
    if (profile?.org_id) billing = await resolveBillingAccess(profile.org_id);
  } catch { /* banner is best-effort */ }

  return <TeamSeatsView seats={seats} board={board} billing={billing} />;
}
