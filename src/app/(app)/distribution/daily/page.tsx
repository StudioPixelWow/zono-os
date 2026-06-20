import { getDailyWorkspace, type DailyWorkspace } from "@/lib/distribution/service";
import { DailyDistributionView } from "./DailyDistributionView";

export const dynamic = "force-dynamic";

export default async function DailyDistributionPage() {
  let workspace: DailyWorkspace;
  try {
    workspace = await getDailyWorkspace();
  } catch (e) {
    console.error("[distribution] daily load failed:", e);
    workspace = { batch: null, items: [] };
  }
  return <DailyDistributionView workspace={workspace} />;
}
