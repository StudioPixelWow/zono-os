// ============================================================================
// 💳 ZONO — Account & billing (/account). Batch 6.4. Self-service (Part 6) +
// first-login checklist (Part 3). Composition over the commercial account
// overview; owner-gated actions live in the client view.
// ============================================================================
import { getAccountOverview } from "@/lib/commercial/account";
import { getSessionContext } from "@/lib/auth/session";
import { getOrgBillingOverview } from "@/lib/commercial/overview";
import { BillingActivationPanel } from "../settings/plan/BillingActivationPanel";
import { AccountView } from "./AccountView";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const overview = await getAccountOverview();
  // Single source of truth for plan/price/status: the same billing panel as
  // /settings/plan (ZONO Pro · per-seat). The legacy 4-tier selector is gone.
  let billing = null;
  try {
    const sc = await getSessionContext();
    if (sc.state === "ready" && sc.profile?.org_id) billing = await getOrgBillingOverview(sc.profile.org_id);
  } catch { /* non-fatal */ }
  return <AccountView overview={overview} billing={billing ? <BillingActivationPanel overview={billing} /> : null} />;
}
