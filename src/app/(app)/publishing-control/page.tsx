// ============================================================================
// ZONO — Publishing Control Center (/publishing-control).
// ----------------------------------------------------------------------------
// The real-time operational screen for the canonical Facebook Groups publishing
// engine (P0). Server component: loads the live snapshot (states, queues, event
// feed, emergency stops) from the SAME canonical tables the engine writes, then
// hands it to the client view which is wired to the P0 control actions
// (retry / pause / resume / cancel / reconcile / emergency-stop). Real data only.
// ============================================================================
import { getPublishingControlData, emptyControlData } from "@/lib/distribution/publishing-control-data";
import { PublishingControlView } from "./PublishingControlView";

export const dynamic = "force-dynamic";

export default async function PublishingControlPage() {
  let data = emptyControlData(false);
  try {
    data = await getPublishingControlData();
  } catch (err) {
    console.error("[publishing-control] load failed:", err);
  }
  return <PublishingControlView data={data} />;
}
