// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.1 · Canonical stage machines (PURE).
// One machine per journey type. This is the ONLY place stage keys are defined.
//
// Safe to adopt this vocabulary wholesale: `journeys.current_stage` is TEXT and
// the table holds 0 rows live — no data is migrated or broken. The legacy
// catalogs (journey/stages.ts property enum · journey-intelligence/engine.ts
// buyer+seller) remain readable through ./legacy-map, which maps them ONTO
// these stages for the Batch 5.3 backfill.
// ============================================================================
import type { CanonicalStage, JourneyType, StageMachine } from "./types";

/** Terminal-ness is a function of kind — never hand-typed per stage. */
const S = (
  key: string,
  label: string,
  position: number,
  kind: CanonicalStage["kind"] = "open",
  lateral = false,
): CanonicalStage => ({ key, label, position, kind, terminal: kind !== "open", ...(lateral ? { lateral: true } : {}) });

// ── BUYER ───────────────────────────────────────────────────────────────────
export const BUYER_MACHINE: StageMachine = {
  journeyType: "buyer",
  entityType: "buyer",
  initial: "new",
  stages: [
    S("new", "קונה חדש", 1),
    S("qualification", "הסמכה", 2),
    S("financing", "מימון", 3),
    S("matching", "התאמה", 4),
    S("properties_sent", "נכסים נשלחו", 5),
    S("viewing_scheduled", "צפייה נקבעה", 6),
    S("viewing_completed", "צפייה בוצעה", 7),
    S("negotiation", "משא ומתן", 8),
    S("deal", "עסקה", 9),
    S("won", "נסגר בהצלחה", 10, "won"),
    S("inactive", "לא פעיל", 11, "inactive"),
    S("lost", "אבד", 12, "lost"),
  ],
};

// ── SELLER ──────────────────────────────────────────────────────────────────
export const SELLER_MACHINE: StageMachine = {
  journeyType: "seller",
  entityType: "seller",
  initial: "new",
  stages: [
    S("new", "מוכר חדש", 1),
    S("qualification", "הסמכה", 2),
    S("valuation", "הערכת שווי", 3),
    S("pricing", "תמחור", 4),
    S("representation", "ייצוג/בלעדיות", 5),
    S("preparation", "הכנה", 6),
    S("marketing", "שיווק", 7),
    S("viewings", "צפיות", 8),
    S("offers", "הצעות", 9),
    S("negotiation", "משא ומתן", 10),
    S("deal", "עסקה", 11),
    S("won", "נסגר בהצלחה", 12, "won"),
    // Lateral: a seller can be at risk of churning from ANY working stage.
    // Entering it is an attention signal, never forward progress.
    S("churn_risk", "סיכון נטישה", 13, "open", true),
    S("inactive", "לא פעיל", 14, "inactive"),
    S("lost", "אבד", 15, "lost"),
  ],
};

// ── LEAD ────────────────────────────────────────────────────────────────────
export const LEAD_MACHINE: StageMachine = {
  journeyType: "lead",
  entityType: "lead",
  initial: "new",
  stages: [
    S("new", "ליד חדש", 1),
    S("contacted", "נוצר קשר", 2),
    S("qualified", "מוסמך", 3),
    S("nurturing", "טיפוח", 4),
    S("matched", "הותאם", 5),
    S("meeting_scheduled", "פגישה נקבעה", 6),
    S("converted", "הומר", 7, "won"),
    S("lost", "אבד", 8, "lost"),
  ],
};

// ── PROPERTY ────────────────────────────────────────────────────────────────
// NOTE — one documented deviation from the Batch 5.1 stage list: `under_contract`.
// The live `journey_stage` ENUM (used by property_journeys, 10 rows) contains
// `deal_signed`, a real state that sits AFTER negotiation and BEFORE sold. With
// no canonical peer it could only be mapped backwards onto `negotiation`, which
// would corrupt stage ordering during the 5.3 backfill. Adding the stage is the
// truthful fix; see ./legacy-map.
export const PROPERTY_MACHINE: StageMachine = {
  journeyType: "property",
  entityType: "property",
  initial: "draft",
  stages: [
    S("draft", "טיוטה", 1),
    S("preparation", "הכנה", 2),
    S("ready_to_publish", "מוכן לפרסום", 3),
    S("active", "פעיל", 4),
    S("marketing", "שיווק", 5),
    S("viewings", "צפיות", 6),
    S("offers", "הצעות", 7),
    S("negotiation", "משא ומתן", 8),
    S("under_contract", "בחוזה", 9),
    S("sold", "נמכר", 10, "won"),
    S("rented", "הושכר", 11, "won"),
    S("paused", "מושהה", 12, "paused"),
    S("archived", "בארכיון", 13, "inactive"),
  ],
};

// ── DEAL ────────────────────────────────────────────────────────────────────
export const DEAL_MACHINE: StageMachine = {
  journeyType: "deal",
  entityType: "deal",
  initial: "initiated",
  stages: [
    S("initiated", "נפתחה", 1),
    S("qualification", "הסמכה", 2),
    S("offer", "הצעה", 3),
    S("negotiation", "משא ומתן", 4),
    S("financing", "מימון", 5),
    S("legal", "משפטי", 6),
    S("signing", "חתימה", 7),
    S("closing", "סגירה", 8),
    S("won", "נסגרה בהצלחה", 9, "won"),
    S("lost", "אבדה", 10, "lost"),
  ],
};

export const MACHINES: Record<JourneyType, StageMachine> = {
  buyer: BUYER_MACHINE,
  seller: SELLER_MACHINE,
  lead: LEAD_MACHINE,
  property: PROPERTY_MACHINE,
  deal: DEAL_MACHINE,
};

export const JOURNEY_TYPES: JourneyType[] = ["buyer", "seller", "lead", "property", "deal"];

export function isJourneyType(v: string): v is JourneyType {
  return (JOURNEY_TYPES as string[]).includes(v);
}

export function machineFor(journeyType: JourneyType): StageMachine {
  return MACHINES[journeyType];
}

export function stageDef(journeyType: JourneyType, key: string): CanonicalStage | undefined {
  return MACHINES[journeyType]?.stages.find((s) => s.key === key);
}

export function stageLabel(journeyType: JourneyType, key: string): string {
  return stageDef(journeyType, key)?.label ?? key;
}

export function isValidStage(journeyType: JourneyType, key: string): boolean {
  return !!stageDef(journeyType, key);
}

export function initialStage(journeyType: JourneyType): string {
  return MACHINES[journeyType].initial;
}

/** Open, non-lateral stages — the linear ladder progress is measured against. */
export function ladder(journeyType: JourneyType): CanonicalStage[] {
  return MACHINES[journeyType].stages.filter((s) => !s.terminal && !s.lateral);
}

/**
 * Progress 0..100. Won = 100. Lost/inactive = 0 (no progress was banked).
 * Paused / lateral hold the last ladder position they imply, so a paused
 * property doesn't read as "0% done".
 */
export function stageProgress(journeyType: JourneyType, key: string): number {
  const def = stageDef(journeyType, key);
  if (!def) return 0;
  if (def.kind === "won") return 100;
  if (def.kind === "lost" || def.kind === "inactive") return 0;
  const rungs = ladder(journeyType);
  if (def.lateral || def.kind === "paused") return 0; // caller should use the last known ladder stage
  const idx = rungs.findIndex((s) => s.key === key);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / rungs.length) * 100);
}
