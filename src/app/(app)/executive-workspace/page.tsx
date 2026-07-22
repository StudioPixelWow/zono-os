// ============================================================================
// 🏛️ ZONO — Executive Workspace page (/executive-workspace). STAGE 6 · Batch 6.0.
// The office manager's home screen. COMPOSITION ONLY: it fans out canonical
// providers into one executive surface and introduces no business logic, no new
// queries, no direct SQL. Role-gated at the door (has_min_role, fail-closed):
//   manager → full Executive Workspace
//   broker  → the existing Broker Workspace only (no manager cards mounted)
//   member  → the minimal Member Workspace only
// Each card streams independently; one card failing never fails the page.
// ============================================================================
import { resolveWorkspaceAudience } from "@/lib/executive-workspace/providers";
import { ExecutiveWorkspace } from "./ExecutiveWorkspace";
import { MemberWorkspace } from "./MemberWorkspace";
import { getBrokerWorkspace } from "@/lib/broker-workspace/service";
import { BrokerWorkspaceView } from "@/components/broker-workspace/BrokerWorkspaceView";

export const dynamic = "force-dynamic";

export default async function ExecutiveWorkspacePage() {
  const audience = await resolveWorkspaceAudience();

  if (audience === "manager") return <ExecutiveWorkspace />;

  // Broker Workspace only — the EXISTING broker surface, owner-scoped. No
  // executive cards are mounted for a non-manager.
  if (audience === "broker") {
    const data = await getBrokerWorkspace();
    return <BrokerWorkspaceView data={data} />;
  }

  // Member Workspace only.
  return <MemberWorkspace />;
}
