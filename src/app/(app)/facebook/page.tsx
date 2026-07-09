// ============================================================================
// 📘 ZONO — Facebook Growth Platform page (/facebook).
// STATE-DRIVEN onboarding: the page renders the onboarding FLOW
// (connect → scan → import wizard) and only renders the Facebook Distribution
// dashboard AFTER groups have been imported. It never shows an empty dashboard.
// Assisted/manual + approval-gated; nothing publishes here.
// ============================================================================
import { getFacebookHome } from "@/lib/facebook-home/service";
import { FacebookHome } from "@/components/facebook-home/FacebookHome";
import { getFacebookOnboarding } from "@/lib/facebook-onboarding/service";
import { FacebookOnboardingFlow } from "./FacebookOnboardingFlow";

export const dynamic = "force-dynamic";

export default async function FacebookPage() {
  const ob = await getFacebookOnboarding().catch(() => ({ state: "disconnected" as const, connectedAt: null, scannedAt: null, discovery: null, importedGroupIds: [] }));

  // Dashboard ONLY after import. Every state before that is onboarding.
  if (ob.state !== "imported") {
    return <FacebookOnboardingFlow state={ob.state} discovery={ob.discovery} />;
  }

  const data = await getFacebookHome();
  return <FacebookHome data={data} />;
}
