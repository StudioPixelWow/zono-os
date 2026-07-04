// ============================================================================
// 👤 ZONO — Broker Personal Workspace™ page (/my). 35.0.
// The broker's daily operating center. Reuses every existing engine (agents,
// missions, workflows, agent-framework inbox, Ask ZONO) scoped to the signed-in
// broker via owner_id. No new engine, no schema. Nothing auto-sends/auto-books.
// ============================================================================
import { getBrokerWorkspace } from "@/lib/broker-workspace/service";
import { BrokerWorkspaceView } from "@/components/broker-workspace/BrokerWorkspaceView";

export const dynamic = "force-dynamic";

export default async function MyWorkspacePage() {
  const data = await getBrokerWorkspace();
  return <BrokerWorkspaceView data={data} />;
}
