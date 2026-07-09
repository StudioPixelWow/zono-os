// ============================================================================
// 📘 ZONO — Facebook Growth Platform page (/facebook).
// Connection-gated: if there is NO live Meta API connection we render a premium
// onboarding gate — NOT the dashboard/stats/groups/publishing. The dashboard
// (FacebookHome) renders ONLY after a real connection exists. Assisted/manual +
// approval-gated; nothing publishes here.
// ============================================================================
import { getFacebookHome } from "@/lib/facebook-home/service";
import { FacebookHome } from "@/components/facebook-home/FacebookHome";
import { providerConnectionService } from "@/lib/distribution/provider-connections";
import { FacebookOnboardingGate } from "./FacebookOnboardingGate";

export const dynamic = "force-dynamic";

export default async function FacebookPage() {
  const connected = await providerConnectionService.isFacebookApiConnected().catch(() => false);
  if (!connected) return <FacebookOnboardingGate />;

  const data = await getFacebookHome();
  return <FacebookHome data={data} />;
}
