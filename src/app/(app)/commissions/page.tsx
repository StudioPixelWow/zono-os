import { getCommissionsCommandCenter, type CommissionsCommandCenter } from "@/lib/commissions/service";
import { CommissionsView } from "./CommissionsView";

export const dynamic = "force-dynamic";

const EMPTY: CommissionsCommandCenter = {
  commissions: [], deals: [], isManager: false, pendingApproval: 0, approved: 0, totalDue: 0, totalCollected: 0,
};

export default async function CommissionsPage() {
  let cc: CommissionsCommandCenter = EMPTY;
  try {
    cc = await getCommissionsCommandCenter();
  } catch (e) {
    console.error("[commissions] load failed:", e);
  }
  return <CommissionsView cc={cc} />;
}
