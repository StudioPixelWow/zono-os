import { getGroupRegistry, getGroupsAnalytics, type GroupRow, type GroupsAnalytics } from "@/lib/distribution/groups-service";
import { GroupsView } from "./GroupsView";

export const dynamic = "force-dynamic";

export default async function DistributionGroupsPage() {
  let groups: GroupRow[] = [];
  let analytics: GroupsAnalytics | null = null;
  try {
    [groups, analytics] = await Promise.all([getGroupRegistry(), getGroupsAnalytics()]);
  } catch (e) {
    console.error("[fb-groups] load failed:", e);
  }
  return <GroupsView groups={groups} analytics={analytics} />;
}
