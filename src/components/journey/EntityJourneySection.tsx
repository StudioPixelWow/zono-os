// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.5 (Part 10) · the ONE journey read, as a slot.
//
// A server component every cockpit page can drop in. It reads the canonical spine
// through getCockpitJourney (5.5C) and renders the ONE shared block (Part 10).
// Five cockpits, one read path, one presentation — no forks.
// ============================================================================
import { getCockpitJourney } from "@/lib/journey-cockpit/service";
import { stageCommandSupported } from "@/lib/journey-cockpit/actions";
import type { CockpitEntityType } from "@/lib/journey-cockpit/types";
import { JourneyCockpitBlock } from "./JourneyCockpitBlock";

export async function EntityJourneySection({
  entityType,
  entityId,
  children,
  compact = false,
}: {
  entityType: CockpitEntityType;
  entityId: string;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  const [journey, commandable] = await Promise.all([
    getCockpitJourney(entityType, entityId),
    stageCommandSupported(entityType),
  ]);

  return (
    <div className="bg-card border-line rounded-[20px] border p-5">
      <JourneyCockpitBlock journey={journey} commandable={commandable} compact={compact}>
        {children}
      </JourneyCockpitBlock>
    </div>
  );
}
