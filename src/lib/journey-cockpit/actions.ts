"use server";

// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.5E · THE CANONICAL COCKPIT COMMAND.
//
// This replaces setJourneyStageAction(), which wrote `property_journeys` straight
// from the UI: no buildTransition(), no journey_events, no domain event, no
// Timeline. A broker's click moved the LEGACY table while the canonical spine sat
// still — two lifecycles for one property.
//
// The click now goes exactly where every other lifecycle change in ZONO goes:
//     UI → domain event → journey-subscriber → journey-applier → journeys / journey_events
// The cockpit does not write a journey table. It asks the kernel to move the spine,
// and the spine's own machine decides whether that move is legal.
// ============================================================================
import { revalidatePath } from "next/cache";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { drainDomainEvents } from "@/lib/kernel/processor";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";
import { isValidStage, stageLabel } from "@/lib/journey-canonical";

export interface CockpitCommandState {
  ok: boolean;
  error?: string;
}

/**
 * Move a property to a canonical stage. `targetStage` MUST be a canonical property
 * stage — the UI reads its buttons from the canonical ladder (5.5B), so it cannot
 * offer anything else, and we refuse anything else here too rather than letting a
 * legacy value in through the back door.
 */
export async function requestPropertyStageAction(
  propertyId: string,
  targetStage: string,
): Promise<CockpitCommandState> {
  if (!propertyId) return { ok: false, error: "מזהה נכס חסר" };
  if (!isValidStage("property", targetStage)) {
    return { ok: false, error: `שלב לא קנוני: ${targetStage}` };
  }

  const res = await emitBusinessEvent({
    type: DOMAIN_EVENTS.propertyStageChanged,
    entityType: "property",
    entityId: propertyId,
    payload: { stage: targetStage, manual: true },
  });
  if (!res.ok) return { ok: false, error: `פרסום האירוע נכשל: ${res.error ?? "שגיאה"}` };

  // Drain inline so the broker SEES the move on this request. The drain is
  // idempotent by design (5.2), and the cron drain remains the safety net — this
  // is a latency optimisation, not a second write path.
  try {
    await drainDomainEvents(25);
  } catch (e) {
    // The event is durably stored; the cron will apply it. Say so, don't pretend.
    console.error("[journey-cockpit] inline drain failed:", e);
    return {
      ok: true,
      error: `העדכון נרשם (${stageLabel("property", targetStage)}) ויוחל תוך זמן קצר`,
    };
  }

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
  revalidatePath("/journeys");
  return { ok: true };
}
