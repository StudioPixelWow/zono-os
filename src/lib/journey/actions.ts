"use server";

// ============================================================================
// ⚠️ RETIRED — Batch 5.5E.
//
// setJourneyStageAction() used to move a property by writing `property_journeys`
// directly from the cockpit. That write never reached the canonical spine: no
// buildTransition(), no journey_events, no domain event, no Timeline. A broker who
// clicked "advance" moved the LEGACY table while `journeys` stood still — two
// lifecycles for one property, which is the exact defect Stage 5 exists to end.
//
// THE REPLACEMENT:
//     requestPropertyStageAction()  →  src/lib/journey-cockpit/actions.ts
// It emits `property.stage_changed`, and the kernel (journey-subscriber →
// journey-applier) moves the canonical journey. The UI does not write journey tables.
//
// This file is deliberately left as a tombstone rather than deleted, so nobody
// re-adds a "quick" UI writer without reading why the last one had to go.
// ============================================================================

export interface JourneyActionState {
  error?: string;
}

