"use server";

// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.5E/G · THE CANONICAL COCKPIT COMMAND.
//
// This replaced setJourneyStageAction() (property) and setBuyerStageAction() (buyer),
// both of which wrote a private lifecycle table straight from the UI: no
// buildTransition(), no journey_events, no domain event, no Timeline. A broker's click
// moved a LEGACY row while the canonical spine sat still — two lifecycles per entity.
//
// A stage command now goes exactly where every other lifecycle change in ZONO goes:
//     UI → domain event → journey-subscriber → journey-applier → journeys / journey_events
// The cockpit does not write a journey table. It asks the kernel to move the spine, and
// the spine's own machine decides whether the move is legal.
// ============================================================================
import { revalidatePath } from "next/cache";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { drainDomainEvents } from "@/lib/kernel/processor";
import { DOMAIN_EVENTS, type DomainEventType } from "@/lib/kernel/events";
import { isValidStage, stageLabel } from "@/lib/journey-canonical";
import type { CockpitEntityType } from "./types";

export interface CockpitCommandState {
  ok: boolean;
  error?: string;
}

/**
 * The domain event that carries a MANUAL stage command for each entity.
 *
 * `seller` is deliberately NULL. The kernel subscriber has buyer/lead/deal/property
 * `*.stage_changed` cases but no seller one — a seller's canonical journey moves on
 * evidence (linked_to_property, risk_changed) and nothing else today. Rather than
 * inventing an event the spine cannot honour, the seller cockpit renders NO stage
 * command at all (5.5G: never a dead control). Adding it is a 5.6 decision, not a
 * button we quietly wire to nothing.
 */
const STAGE_COMMAND_EVENT: Record<CockpitEntityType, DomainEventType | null> = {
  property: DOMAIN_EVENTS.propertyStageChanged,
  buyer: DOMAIN_EVENTS.buyerStageChanged,
  lead: DOMAIN_EVENTS.leadStageChanged,
  deal: DOMAIN_EVENTS.dealStageChanged,
  seller: null,
};

/** Can this entity's stage be commanded from a cockpit at all? Drives whether the UI renders a control. */
export async function stageCommandSupported(entityType: CockpitEntityType): Promise<boolean> {
  return STAGE_COMMAND_EVENT[entityType] !== null;
}

/**
 * Move an entity to a canonical stage. `targetStage` MUST be canonical for that entity's
 * machine — the UI reads its buttons from the canonical ladder (5.5B), so it cannot offer
 * anything else, and we refuse anything else here rather than letting a legacy value in
 * through the back door.
 */
export async function requestEntityStageAction(
  entityType: CockpitEntityType,
  entityId: string,
  targetStage: string,
): Promise<CockpitCommandState> {
  if (!entityId) return { ok: false, error: "מזהה ישות חסר" };

  const eventType = STAGE_COMMAND_EVENT[entityType];
  if (!eventType) {
    return { ok: false, error: `אין פקודת שלב קנונית ל-${entityType}` };
  }
  if (!isValidStage(entityType, targetStage)) {
    return { ok: false, error: `שלב לא קנוני: ${targetStage}` };
  }

  const res = await emitBusinessEvent({
    type: eventType,
    entityType,
    entityId,
    payload: { stage: targetStage, manual: true },
  });
  if (!res.ok) return { ok: false, error: `פרסום האירוע נכשל: ${res.error ?? "שגיאה"}` };

  // Drain inline so the broker SEES the move on this request. The drain is idempotent by
  // design (5.2), and the cron drain remains the safety net — this is a latency
  // optimisation, not a second write path.
  try {
    await drainDomainEvents(25);
  } catch (e) {
    // The event is durably stored; the cron will apply it. Say so, don't pretend.
    console.error("[journey-cockpit] inline drain failed:", e);
    return {
      ok: true,
      error: `העדכון נרשם (${stageLabel(entityType, targetStage)}) ויוחל תוך זמן קצר`,
    };
  }

  revalidatePath(`/${PATH[entityType]}/${entityId}`);
  revalidatePath(`/${PATH[entityType]}`);
  revalidatePath("/journeys");
  return { ok: true };
}

const PATH: Record<CockpitEntityType, string> = {
  property: "properties",
  buyer: "buyers",
  seller: "sellers",
  lead: "leads",
  deal: "deals",
};

/** Property cockpit convenience wrapper (Batch 5.5E). Same canonical path. */
export async function requestPropertyStageAction(
  propertyId: string,
  targetStage: string,
): Promise<CockpitCommandState> {
  return requestEntityStageAction("property", propertyId, targetStage);
}
