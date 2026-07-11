// ============================================================================
// 🧭 ZONO — Journey Center unified read model (pure types).
// One normalized journey shape over the REAL CRM entities (buyer / seller / lead
// / property) — composed from the existing digital twins + listing scorecards.
// Read-only: nothing is written, no journey rows are created. Client-importable.
// ============================================================================

// Batch 5.4 FIX (caught by the deployed build): `deal` was missing. Canonical DEAL
// journeys are real — 5.2 proved one live end-to-end — so the Journey Center type
// must admit them or the page silently cannot represent a whole journey type.
export type JourneyEntityType = "buyer" | "seller" | "lead" | "property" | "deal";

/** Lifecycle flags derived from real signals (an entity can carry several). */
export type JourneyFlag = "active" | "at_risk" | "waiting" | "advancing" | "no_activity" | "closed";

export interface JourneyLinked { kind: JourneyEntityType; id: string; name: string }

export interface UnifiedJourney {
  /** Batch 5.4: the REAL canonical journeys.id for canonical rows.
   *  Fallback rows keep the synthetic `${entityType}:${entityId}` key. */
  journeyId: string;
  /** Batch 5.4 — the canonical journey type (equals entityType today). */
  journeyType?: string;
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

  // ── Batch 5.4 — canonical-first fields. Unknown stays NULL, never invented. ──
  /** 'canonical' = read from the spine · 'fallback' = derived, no canonical row yet. */
  source?: "canonical" | "fallback";
  canonical?: boolean;
  status?: string;
  ownerUserId?: string | null;
  ownerName?: string | null;
  stageEnteredAt?: string | null;
  stageAgeDays?: number | null;
  /** Real, observed blockers only. */
  blockers?: string[];
}

export interface JourneyKpis {
  active: number;
  atRisk: number;
  waiting: number;       // waiting for broker (ready next-best-action / overdue task)
  advancing: number;     // recent activity → progressing
  noActivity: number;    // no meaningful activity recently
  upcomingMeetings: number;

  // ── Batch 5.4 — KPI integrity. Computed from CANONICAL journeys only, except
  //    `fallbackRecords`, which is exactly the count of records that are NOT.
  //    No hardcoded counts, no fake funnel, no double counting. ────────────────
  byType?: Record<string, number>;
  byStage?: Record<string, number>;
  /** Mean days in the CURRENT stage across open canonical journeys. null when none. */
  avgDaysInStage?: number | null;
  stalled?: number;
  blocked?: number;
  won?: number;
  lostOrInactive?: number;
  /** journeys per owner id — real workload, not an estimate. */
  ownerWorkload?: Record<string, number>;
  /** Mean stage-index advance per open canonical journey. null when unmeasurable. */
  stageVelocity?: number | null;
  canonicalRecords?: number;
  fallbackRecords?: number;
}

/** Batch 5.4 — Journey Center filters (5.4E). */
export interface JourneyFilters {
  journeyType?: string;
  stage?: string;
  owner?: string;
  status?: string;
  entityType?: JourneyEntityType;
  stalled?: boolean;
  blocked?: boolean;
  source?: "canonical" | "fallback";
  fromDate?: string;
  toDate?: string;
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
  /** Batch 5.4 — records that could NOT be shown, with the exact reason. Never hidden. */
  diagnostics?: { entityType: string; entityId: string; reason: string }[];
}

// ── LEGACY (Batch 5.4): this was journey-center's OWN stage vocabulary — a SIXTH
// one, which disagreed with the canonical machines (e.g. property `marketed`,
// `stale`). It is NO LONGER the display vocabulary: the UI reads the canonical
// ladder, and canonical.ts maps these keys onto it. They survive only because
// derive.ts (the fallback model) still emits them. Retired with derive.ts in 5.5.
// ─────────────────────────────────────────────────────────────────────────────
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
  // Deals never had a DERIVED model — they only ever existed canonically. The map
  // is empty on purpose: the canonical machine supplies every deal label.
  deal: {},
};

export const STAGE_ORDER: Record<JourneyEntityType, string[]> = {
  buyer: ["new", "qualification", "matching", "viewing", "negotiation", "deal", "inactive"],
  seller: ["new", "valuation", "pricing", "signing", "marketing", "negotiation", "deal", "churn_risk"],
  lead: ["new", "contacted", "qualified", "nurturing", "converted", "lost", "disqualified"],
  property: ["draft", "preparation", "ready", "marketed", "active", "under_offer", "negotiation", "sold", "stale"],
  deal: [],   // canonical-only — see above
};

export const ENTITY_HE: Record<JourneyEntityType, string> = { buyer: "קונה", seller: "מוכר", lead: "ליד", property: "נכס", deal: "עסקה" };
