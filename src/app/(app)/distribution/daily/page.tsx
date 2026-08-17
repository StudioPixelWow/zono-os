// ============================================================================
// ZONO — "מה מפרסמים היום?" (/distribution/daily). Facebook UX P1.
// The single operational Today. Sources the SAME canonical distribution_posts a
// campaign activation creates + the extension publishes (getPublishingControlData),
// so a just-activated campaign's posts appear here — no separate admin surface.
// Falls back to an empty Today on load error (never crashes the morning workflow).
// ============================================================================
import { getPublishingControlData, emptyControlData } from "@/lib/distribution/publishing-control-data";
import { getFacebookConnectionPathsAction } from "@/lib/distribution/provider-connections-actions";
import { TodayView } from "./TodayView";

export const dynamic = "force-dynamic";

export default async function DailyDistributionPage() {
  let data = emptyControlData(false);
  try {
    data = await getPublishingControlData();
  } catch (e) {
    console.error("[distribution] today load failed:", e);
  }
  let extensionStatus = "not_installed";
  try {
    const paths = await getFacebookConnectionPathsAction();
    extensionStatus = paths.extension?.status ?? "not_installed";
  } catch (e) {
    console.error("[distribution] ext status load failed:", e);
  }
  return <TodayView data={data} extensionStatus={extensionStatus} />;
}
