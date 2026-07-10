// ============================================================================
// 🧵 ZONO OS 2.0 — Stage 2 · Entity Timeline section (server component).
// The drop-in cockpit timeline: loads an entity's canonical timeline from the
// ONE shared activity service (getEntityTimeline) and renders the shared
// EntityTimeline. Every cockpit mounts THIS — no bespoke per-cockpit timeline
// queries. Honest empty state; best-effort (never throws).
// ============================================================================
import { getEntityTimeline } from "@/lib/activity/service";
import { EntityTimeline } from "./EntityTimeline";

export async function EntityTimelineSection({
  entityType,
  entityId,
  title = "ציר זמן",
  limit = 60,
}: {
  entityType: string;
  entityId: string;
  title?: string;
  limit?: number;
}) {
  let items: Awaited<ReturnType<typeof getEntityTimeline>> = [];
  try {
    items = await getEntityTimeline(entityType, entityId, { limit });
  } catch {
    items = [];
  }
  return <EntityTimeline items={items} title={title} />;
}
