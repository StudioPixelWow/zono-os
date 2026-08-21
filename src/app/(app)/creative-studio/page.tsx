import { listSelectableEntities, type SelectableEntity } from "@/lib/creative-studio/service";
import { listRecentQuickOutputs, listOrgQuickOutputs, getCreativeOpportunities } from "@/lib/creative-studio/quick-creative-service";
import { CREATIVE_PAGE_SIZE, RECENT_MAX, type CreativeCardView, type OrgCreativePage } from "@/lib/creative-studio/library-model";
import type { CreativeOpportunity } from "@/lib/creative-studio/creative-opportunities";
import { CreativeStudioWorkspace } from "./CreativeStudioWorkspace";

export const dynamic = "force-dynamic";

// /creative-studio — the CREATE-first workspace. The per-entity studio
// (/creative-studio/[type]/[id]) still owns the canonical generation wizard; this
// landing gives fast creation entry + a bounded, paginated library over the real
// org creatives. All selectors are org-scoped; nothing is fetched unbounded.
export default async function CreativeStudioLauncherPage() {
  let selectable: Record<string, SelectableEntity[]> = {};
  let recent: CreativeCardView[] = [];
  let initial: OrgCreativePage = { items: [], total: 0, hasMore: false, nextOffset: 0 };
  let opportunities: CreativeOpportunity[] = [];
  try { selectable = await listSelectableEntities(); } catch (e) { console.error("[creative-studio] selectable failed:", e); }
  try { recent = await listRecentQuickOutputs(RECENT_MAX); } catch (e) { console.error("[creative-studio] recent failed:", e); }
  try { initial = await listOrgQuickOutputs({ limit: CREATIVE_PAGE_SIZE, offset: 0 }); } catch (e) { console.error("[creative-studio] library failed:", e); }
  try { opportunities = await getCreativeOpportunities(3); } catch (e) { console.error("[creative-studio] opportunities failed:", e); }

  // id → name maps for the concise property/agent context chip on each card.
  const nameMap = (list: SelectableEntity[] | undefined): Record<string, string> =>
    Object.fromEntries((list ?? []).map((e) => [e.id, e.name]));

  return (
    <CreativeStudioWorkspace
      selectable={selectable}
      recent={recent}
      initial={initial}
      opportunities={opportunities}
      propertyNameById={nameMap(selectable.property)}
      agentNameById={nameMap(selectable.agent)}
    />
  );
}
