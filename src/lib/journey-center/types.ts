// ============================================================================
// 🧭 ZONO — Journey Center unified read model (pure types).
// One normalized journey shape over the REAL CRM entities (buyer / seller / lead
// / property) — composed from the existing digital twins + listing scorecards.
// Read-only: nothing is written, no journey rows are created. Client-importable.
// ============================================================================

export type JourneyEntityType = "buyer" | "seller" | "lead" | "property";

/** Lifecycle flags derived from real signals (an entity can carry several). */
export type JourneyFlag = "active" | "at_risk" | "waiting" | "advancing" | "no_activity" | "closed";

export interface JourneyLinked { kind: JourneyEntityType; id: string; name: string }

export interface UnifiedJourney {
  journeyId: string;              // `${entityType}:${entityId}`
  entityType: JourneyEntityType;
  entityId: string;
  entityName: string;
  href: string;                   // internal cockpit route
  currentStage: string;           // stage key
  stageLabel: string;             // Hebrew label
  stageIndex: number;             // 0-based position in the stage vocabulary
  stageTotal: number;
  progress: number;               // 0..100
  healthScore: number;            // 0..100
  healthLabel: string;
  risk: number;                   // 0..100
  priority: number;               // 0..100 (sort key)
  flags: JourneyFlag[];
  lastActivityAt: string | null;
  daysSinceActivity: number | null;
  nextAction: string | null;
  nextActionReason: string | null;
  openTasks: number;
  upcomingMeetingAt: string | null;
  linked: JourneyLinked[];
  evidence: string[];
}

export interface JourneyKpis {
  active: number;
  atRisk: number;
  waiting: number;       // waiting for broker (ready next-best-action / overdue task)
  advancing: number;     // recent activity → progressing
  noActivity: number;    // no meaningful activity recently
  upcomingMeetings: number;
}

export interface JourneyCenter {
  version: string;
  generatedAt: string;
  journeys: UnifiedJourney[];
  kpis: JourneyKpis;
  totals: { buyers: number; sellers: number; leads: number; properties: number };
  /** True when ANY buyer/seller/lead/property exists (drives the honest empty states). */
  hasEntities: boolean;
  /** True when at least one journey has meaningful lifecycle activity. */
  hasActivity: boolean;
  notes: string[];
}

// ── Stage vocabularies (reuse ZONO's existing stage language) ────────────────
export const STAGE_LABELS: Record<JourneyEntityType, Record<string, string>> = {
  buyer: {
    new: "חדש", qualification: "הסמכה", matching: "התאמות", viewing: "סיורים",
    negotiation: "משא ומתן", deal: "עסקה", inactive: "לא פעיל",
  },
  seller: {
    new: "מוכר חדש", valuation: "הערכת שווי", pricing: "תמחור", signing: "בלעדיות/חתימה",
    marketing: "שיווק", negotiation: "משא ומתן", deal: "עסקה", churn_risk: "סיכון נטישה",
  },
  lead: {
    new: "חדש", contacted: "נוצר קשר", qualified: "מוסמך", nurturing: "טיפוח",
    converted: "הומר", lost: "אבוד", disqualified: "נפסל",
  },
  property: {
    draft: "טיוטה", preparation: "הכנה", ready: "מוכן לפרסום", marketed: "בשיווק",
    active: "פעיל", under_offer: "בהצעה", negotiation: "משא ומתן", sold: "נמכר/הושכר", stale: "תקוע",
  },
};

export const STAGE_ORDER: Record<JourneyEntityType, string[]> = {
  buyer: ["new", "qualification", "matching", "viewing", "negotiation", "deal", "inactive"],
  seller: ["new", "valuation", "pricing", "signing", "marketing", "negotiation", "deal", "churn_risk"],
  lead: ["new", "contacted", "qualified", "nurturing", "converted", "lost", "disqualified"],
  property: ["draft", "preparation", "ready", "marketed", "active", "under_offer", "negotiation", "sold", "stale"],
};

export const ENTITY_HE: Record<JourneyEntityType, string> = { buyer: "קונה", seller: "מוכר", lead: "ליד", property: "נכס" };
