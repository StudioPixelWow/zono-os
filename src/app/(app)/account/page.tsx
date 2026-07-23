// ============================================================================
// 💳 ZONO — Account & billing (/account). Batch 6.4. Self-service (Part 6) +
// first-login checklist (Part 3). Composition over the commercial account
// overview; owner-gated actions live in the client view.
// ============================================================================
import { getAccountOverview } from "@/lib/commercial/account";
import { AccountView } from "./AccountView";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const overview = await getAccountOverview();
  return <AccountView overview={overview} />;
}
