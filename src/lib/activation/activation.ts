// ============================================================================
// ZONO — Office Activation model (PURE, no server-only / no supabase import, so
// it is unit-testable and QA-importable via tsx).
//
// This is the CANONICAL new-office / activation resolver for P9.0B. It derives a
// single authoritative activation phase (new · activating · active) and a
// premium activation journey from REAL org state only. Every milestone's "done"
// comes from a real DB signal supplied by the server layer — never fabricated,
// never client-supplied. `computeActivation` is deterministic and side-effect
// free; the server wrapper (activation-server.ts) provides the real counts.
// ============================================================================

export type ActivationPhase = "new" | "activating" | "active";

export type ActivationMilestoneKey =
  | "office_created"
  | "identity_established"
  | "city_detected"
  | "operating_area"
  | "brand_configured"
  | "team_invited"
  | "first_property"
  | "first_contact"
  | "first_deal"
  | "first_task_meeting"
  | "digital_presence";

export interface ActivationMilestone {
  key: ActivationMilestoneKey;
  label: string;
  description: string;
  /** CTA label shown on the incomplete milestone. */
  cta: string;
  /** Real, existing product route the CTA navigates to. */
  href: string;
  /** Identity milestones proven by the session itself (org/owner/city), not by a data count. */
  auto?: boolean;
}

/** The persistent activation journey — ordered, all mapped to real routes. */
export const ACTIVATION_MILESTONES: ActivationMilestone[] = [
  { key: "office_created", label: "המשרד נוצר", description: "לנדסמן פעיל ב-ZONO", cta: "", href: "/", auto: true },
  { key: "identity_established", label: "הזהות הוגדרה", description: "הבעלים והתפקיד מחוברים", cta: "", href: "/settings", auto: true },
  { key: "city_detected", label: "העיר זוהתה", description: "אזור הפעילות שלך מזוהה", cta: "", href: "/settings/operating-areas", auto: true },
  { key: "operating_area", label: "אזורי פעילות", description: "בחר את הערים והשכונות שבהן אתה עובד", cta: "בחר אזורי פעילות", href: "/settings/operating-areas" },
  { key: "brand_configured", label: "מיתוג המשרד", description: "הוסף לוגו וצבעי מותג (צהוב/שחור)", cta: "הגדר מיתוג", href: "/settings/brand" },
  { key: "team_invited", label: "הזמנת צוות", description: "הזמן את הסוכנים שלך למשרד", cta: "הזמן צוות", href: "/team" },
  { key: "first_property", label: "הנכס הראשון", description: "הוסף את הנכס הראשון של המשרד", cta: "הוסף נכס", href: "/properties/new" },
  { key: "first_contact", label: "הלקוח הראשון", description: "הוסף ליד, קונה או מוכר ראשון", cta: "הוסף לקוח", href: "/buyers/new" },
  { key: "first_deal", label: "העסקה הראשונה", description: "פתח את העסקה הראשונה שתנוהל ב-ZONO", cta: "פתח עסקה", href: "/deals" },
  { key: "first_task_meeting", label: "פעולה ראשונה", description: "צור משימה או קבע פגישה ראשונה", cta: "צור פעולה", href: "/today" },
  { key: "digital_presence", label: "נוכחות דיגיטלית", description: "פרסם אתר משרד או אתר סוכן", cta: "בנה אתר", href: "/office-website" },
];

/**
 * Count-derived milestones → the canonical org-scoped (table, column) sources
 * that prove them. The P9.0B regression test asserts every pair exists in the
 * live schema, so a wrong column (the class of bug that silently zeroed
 * onboarding auto-detection) can never regress. A milestone is done when ANY of
 * its sources has ≥1 row (e.g. first_contact = a lead OR a buyer OR a seller).
 */
export const ACTIVATION_COUNT_SOURCES: { key: ActivationMilestoneKey; tables: { table: string; column: string }[] }[] = [
  { key: "operating_area", tables: [{ table: "organization_operating_localities", column: "organization_id" }] },
  { key: "team_invited", tables: [{ table: "org_invitations", column: "org_id" }] },
  { key: "first_property", tables: [{ table: "properties", column: "org_id" }] },
  { key: "first_contact", tables: [{ table: "leads", column: "org_id" }, { table: "buyers", column: "org_id" }, { table: "sellers", column: "org_id" }] },
  { key: "first_deal", tables: [{ table: "deals", column: "org_id" }] },
  { key: "first_task_meeting", tables: [{ table: "tasks", column: "org_id" }, { table: "meetings", column: "org_id" }] },
];

/** Milestones that represent real *business* data (used to distinguish new vs activating). */
export const OPERATIONAL_MILESTONES: ActivationMilestoneKey[] = [
  "first_property", "first_contact", "first_deal", "first_task_meeting",
];

export interface ActivationInput {
  orgExists: boolean;
  /** Owner profile has a real name. */
  ownerIdentity: boolean;
  /** Org has a resolved operating city. */
  cityDetected: boolean;
  /** Summed real row-counts per count-derived milestone. */
  counts: Partial<Record<ActivationMilestoneKey, number>>;
  /** brand_identity_profiles has a real primary color. */
  brandConfigured: boolean;
  /** A published office/agent website exists. */
  digitalPresence: boolean;
  /** users count for the org (>1 also satisfies team_invited). */
  teamSize: number;
}

export interface ComputedMilestone {
  milestone: ActivationMilestone;
  done: boolean;
}

export interface ActivationState {
  phase: ActivationPhase;
  milestones: ComputedMilestone[];
  completedCount: number;
  total: number;
  percent: number;
  nextIncomplete: ActivationMilestone | null;
  /** True once the office has ANY real business record (property/contact/deal/task). */
  hasOperationalData: boolean;
}

// ── Serializable presentational view-models (shared by server + client) ────────
export interface OfficeIdentity {
  orgId: string;
  officeName: string;
  officeLogoUrl: string | null;
  ownerName: string;
  ownerFirstName: string;
  ownerAvatarUrl: string | null;
  city: string | null;
  subdistrict: string | null;
  localityCode: string | null;
}

export interface OfficeBrand {
  primary: string | null;
  secondary: string | null;
  accent: string | null;
  logoUrl: string | null;
}

export interface OfficeTrial {
  active: boolean;
  endsAt: string | null;
  daysLeft: number | null;
}

export interface OfficeActivationResult {
  activation: ActivationState;
  identity: OfficeIdentity;
  brand: OfficeBrand;
  trial: OfficeTrial | null;
}

// ── P9.0D city-discovery view-model (shared by server + client) ────────────────
export type CityDiscoveryPhase = "not_started" | "scanning" | "ready" | "no_results";

export interface CityDiscovery {
  phase: CityDiscoveryPhase;
  city: string | null;
  discoveredListings: number;
  noBrokerCount: number;
  mapPoints: number;
  neighborhoods: number;
  scanRunning: boolean;
  lastScanAt: string | null;
}

/** Percent-complete threshold at which an office with data is treated as fully "active". */
export const ACTIVE_PHASE_THRESHOLD = 70;

function isDone(key: ActivationMilestoneKey, input: ActivationInput): boolean {
  const c = (k: ActivationMilestoneKey) => input.counts[k] ?? 0;
  switch (key) {
    case "office_created": return input.orgExists;
    case "identity_established": return input.ownerIdentity;
    case "city_detected": return input.cityDetected;
    case "operating_area": return c("operating_area") > 0;
    case "brand_configured": return input.brandConfigured;
    case "team_invited": return c("team_invited") > 0 || input.teamSize > 1;
    case "first_property": return c("first_property") > 0;
    case "first_contact": return c("first_contact") > 0;
    case "first_deal": return c("first_deal") > 0;
    case "first_task_meeting": return c("first_task_meeting") > 0;
    case "digital_presence": return input.digitalPresence;
    default: return false;
  }
}

/**
 * Deterministic activation state from real signals.
 * Phase rules (honest, never time-only):
 *  - "new"        → no operational business data yet (fresh office → WOW command center)
 *  - "active"     → has operational data AND ≥ACTIVE_PHASE_THRESHOLD% of the journey done
 *  - "activating" → has operational data but journey still in progress
 */
export function computeActivation(input: ActivationInput): ActivationState {
  const milestones: ComputedMilestone[] = ACTIVATION_MILESTONES.map((milestone) => ({
    milestone,
    done: isDone(milestone.key, input),
  }));
  const completedCount = milestones.filter((m) => m.done).length;
  const total = ACTIVATION_MILESTONES.length;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);
  const nextIncomplete = milestones.find((m) => !m.done && !m.milestone.auto)?.milestone
    ?? milestones.find((m) => !m.done)?.milestone
    ?? null;
  const hasOperationalData = OPERATIONAL_MILESTONES.some((k) => isDone(k, input));

  const phase: ActivationPhase = !hasOperationalData
    ? "new"
    : percent >= ACTIVE_PHASE_THRESHOLD
      ? "active"
      : "activating";

  return { phase, milestones, completedCount, total, percent, nextIncomplete, hasOperationalData };
}
