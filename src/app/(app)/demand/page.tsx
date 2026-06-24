import { getDemandCommandCenter, type DemandCommandCenter } from "@/lib/demand/service";
import { DemandCommandCenterView } from "./DemandCommandCenterView";

export const dynamic = "force-dynamic";

export default async function DemandPage() {
  let data: DemandCommandCenter | null = null;
  try {
    data = await getDemandCommandCenter();
  } catch (e) {
    console.error("[demand] load failed:", e);
  }
  return <DemandCommandCenterView data={data} />;
}
