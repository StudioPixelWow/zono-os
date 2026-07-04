// ============================================================================
// 📊 ZONO — Facebook Groups Intelligence Center page. 33.4.
// Renders the intelligence layer over the EXISTING group registry (folders,
// insights, recommendations). No new engine, no new tables; read-only.
// ============================================================================
import { GroupsIntelligenceView } from "@/components/distribution/GroupsIntelligenceView";

export const dynamic = "force-dynamic";

export default function GroupsIntelligencePage() {
  return <GroupsIntelligenceView />;
}
