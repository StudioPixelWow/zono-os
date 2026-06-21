import { getFinancingCommandCenter, type FinancingCommandCenter } from "@/lib/financing/service";
import { FinancingView } from "./FinancingView";

export const dynamic = "force-dynamic";

const EMPTY: FinancingCommandCenter = {
  financingReady: 0, financingRisks: 0, cashGapAlerts: 0, readyToPurchase: 0,
  totalPurchasingPower: 0, profiles: [], buyersNeedingProfile: [], isManager: false,
};

export default async function FinancingPage() {
  let cc: FinancingCommandCenter = EMPTY;
  try {
    cc = await getFinancingCommandCenter();
  } catch (e) {
    console.error("[financing] load failed:", e);
  }
  return <FinancingView cc={cc} />;
}
