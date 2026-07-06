"use server";
// ============================================================================
// 🌐 ZONO — Universal Knowledge Graph — server actions. PHASE 51.0.
// Read-only. Surfaces entity relationship summaries and the org graph overview
// for the UI. No writes, no approvals (nothing to execute here).
// ============================================================================
import { getEntityRelationships, getUniversalGraphOverview } from "./service";
import type { RelationshipSummary, EntityContextPack, UniversalGraphOverview } from "./types";

export async function getEntityRelationshipsAction(input: { entityType: string; entityId: string; entityName?: string }): Promise<{ summary?: RelationshipSummary; pack?: EntityContextPack; error?: string }> {
  if (!input.entityType || !input.entityId) return { error: "חסרים פרטי ישות" };
  try {
    const r = await getEntityRelationships(input.entityType, input.entityId, input.entityName);
    return { summary: r.summary, pack: r.pack };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "טעינת הקשרים נכשלה" };
  }
}

export async function getUniversalGraphOverviewAction(): Promise<{ overview?: UniversalGraphOverview; error?: string }> {
  try {
    return { overview: await getUniversalGraphOverview() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "טעינת גרף הידע נכשלה" };
  }
}
