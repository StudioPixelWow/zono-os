// ============================================================================
// ZONO — "מה מפרסמים היום?" (/distribution/daily). Facebook UX P1.
// The single operational Today. Sources the SAME canonical distribution_posts a
// campaign activation creates + the extension publishes (getPublishingControlData),
// so a just-activated campaign's posts appear here — no separate admin surface.
// Falls back to an empty Today on load error (never crashes the morning workflow).
// ============================================================================
import { getPublishingControlData, emptyControlData } from "@/lib/distribution/publishing-control-data";
import { computeExtensionReadiness } from "@/lib/distribution/extension-readiness";
import { getOrgExtensionReadiness } from "@/lib/distribution/extension-service";
import { TodayView } from "./TodayView";

export const dynamic = "force-dynamic";

export default async function DailyDistributionPage() {
  let data = emptyControlData(false);
  try {
    data = await getPublishingControlData();
  } catch (e) {
    console.error("[distribution] today load failed:", e);
  }
  // Publish-time readiness (freshness-aware, MULTI-INSTANCE). Campaign creation never
  // depends on this — it is only a publishing-time gate. Computed from ALL of the org's
  // instances (getOrgExtensionReadiness picks the STRONGEST), so a stale/installed
  // instance can never make a genuinely-ready office look offline. The customer sees
  // ONE state, never an internal status name.
  let readiness = computeExtensionReadiness({ status: "not_installed", lastCheckedAt: null });
  try {
    readiness = await getOrgExtensionReadiness();
  } catch (e) {
    console.error("[distribution] ext readiness load failed:", e);
  }
  return <TodayView data={data} readiness={readiness} />;
}
