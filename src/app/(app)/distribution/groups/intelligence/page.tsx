// ============================================================================
// 📊 ZONO — Facebook Groups Intelligence Center page. 33.4.
// Renders the intelligence layer over the EXISTING group registry (folders,
// insights, recommendations). No new engine, no new tables; read-only.
// Supports a per-group drill-down via ?g=<groupId> (deep-linked from Facebook Home).
// ============================================================================
import { GroupsIntelligenceView } from "@/components/distribution/GroupsIntelligenceView";

export const dynamic = "force-dynamic";

export default async function GroupsIntelligencePage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const { g } = await searchParams;
  return <GroupsIntelligenceView selectedId={g ?? null} />;
}
