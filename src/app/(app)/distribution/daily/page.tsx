// ============================================================================
// ZONO — "מה מפרסמים היום?" (/distribution/daily). Facebook UX P1.
// The single operational Today. Sources the SAME canonical distribution_posts a
// campaign activation creates + the extension publishes (getPublishingControlData),
// so a just-activated campaign's posts appear here — no separate admin surface.
// Falls back to an empty Today on load error (never crashes the morning workflow).
// ============================================================================
import { getPublishingControlData, emptyControlData } from "@/lib/distribution/publishing-control-data";
import { getFacebookConnectionPathsAction } from "@/lib/distribution/provider-connections-actions";
import { computeExtensionReadiness } from "@/lib/distribution/extension-readiness";
import { TodayView } from "./TodayView";

export const dynamic = "force-dynamic";

export default async function DailyDistributionPage() {
  let data = emptyControlData(false);
  try {
    data = await getPublishingControlData();
  } catch (e) {
    console.error("[distribution] today load failed:", e);
  }
  // Publish-time readiness (freshness-aware). Campaign creation never depends on
  // this — it is only a publishing-time gate. The customer sees ONE state, not the
  // internal status name. facebook_session_detected is not persisted to the path
  // metadata (the "session" key is stripped defensively), so we derive it from the
  // status the heartbeat set (ready/facebook_session_detected == session present).
  let readiness = computeExtensionReadiness({ status: "not_installed", lastCheckedAt: null });
  try {
    const paths = await getFacebookConnectionPathsAction();
    const ext = paths.extension;
    readiness = computeExtensionReadiness({
      status: ext?.status ?? "not_installed",
      lastCheckedAt: ext?.lastCheckedAt ?? null,
      facebookSessionDetected: ext?.status === "ready" || ext?.status === "facebook_session_detected",
      version: (ext?.metadata?.version as string | undefined) ?? null,
    });
  } catch (e) {
    console.error("[distribution] ext readiness load failed:", e);
  }
  return <TodayView data={data} readiness={readiness} />;
}
