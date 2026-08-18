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
  | "first_media"
  | "first_contact"
  | "first_deal"
  | "first_task_meeting"
  | "digital_presence"
  | "first_campaign";

/** The 6 coherent business-outcome steps of the ZONO setup journey. Every
 * activation milestone belongs to exactly one group; the journey UI + the
 * shared getOnboardingProgress() selector are grouped by these. */
export type JourneyGroupKey = "office" | "team" | "property" | "site" | "marketing" | "ready";

export interface ActivationMilestone {
  key: ActivationMilestoneKey;
  /** Which of the 6 journey steps this milestone rolls up into. */
  group: JourneyGroupKey;
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
  { key: "office_created", group: "office", label: "המשרד נוצר", description: "המשרד שלך פעיל ב-ZONO", cta: "", href: "/", auto: true },
  { key: "identity_established", group: "office", label: "הזהות הוגדרה", description: "הבעלים והתפקיד מחוברים", cta: "", href: "/settings", auto: true },
  { key: "city_detected", group: "office", label: "העיר זוהתה", description: "אזור הפעילות שלך מזוהה", cta: "", href: "/settings/operating-areas", auto: true },
  { key: "operating_area", group: "office", label: "אזורי פעילות", description: "בחרו את הערים והשכונות שבהן אתם עובדים", cta: "בחירת אזורים", href: "/settings/operating-areas" },
  { key: "brand_configured", group: "office", label: "מיתוג המשרד", description: "הוסיפו לוגו וצבעי מותג", cta: "הגדרת מיתוג", href: "/settings/brand" },
  { key: "team_invited", group: "team", label: "הזמנת צוות", description: "הזמינו את הסוכנים שלכם — או המשיכו לבד", cta: "הזמנת סוכן", href: "/team" },
  { key: "first_property", group: "property", label: "הנכס הראשון", description: "הוסיפו את הנכס הראשון של המשרד", cta: "הוספת נכס", href: "/properties/new" },
  { key: "first_media", group: "property", label: "מדיה לנכס", description: "העלו תמונות לנכס — שיווק עם תמונות עובד הרבה יותר טוב", cta: "הוספת תמונות", href: "/properties" },
  { key: "digital_presence", group: "site", label: "האתר שלך", description: "האתר נוצר מהנתונים שלכם — צפו ופרסמו אותו", cta: "צפייה באתר", href: "/office-website" },
  { key: "first_campaign", group: "marketing", label: "קמפיין ראשון", description: "צרו את הקמפיין השיווקי הראשון בקבוצות פייסבוק", cta: "יצירת קמפיין", href: "/distribution" },
  { key: "first_contact", group: "ready", label: "הלקוח הראשון", description: "הוסיפו ליד, קונה או מוכר ראשון", cta: "הוספת לקוח", href: "/buyers/new" },
  { key: "first_task_meeting", group: "ready", label: "פעולה ראשונה", description: "צרו משימה או קבעו פגישה ראשונה", cta: "יצירת פעולה", href: "/today" },
  { key: "first_deal", group: "ready", label: "העסקה הראשונה", description: "פתחו את העסקה הראשונה שתנוהל ב-ZONO", cta: "פתיחת עסקה", href: "/deals" },
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
  { key: "first_media", tables: [{ table: "property_media", column: "org_id" }] },
  { key: "first_campaign", tables: [{ table: "distribution_campaigns", column: "org_id" }] },
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
    case "first_media": return c("first_media") > 0;
    case "first_campaign": return c("first_campaign") > 0;
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

// ── 6-step first-value journey (grouping over the activation milestones) ──────
// The registration wizard creates the office; THIS is what guides a brand-new
// office from zero to a working office. Every group's completion derives from
// the same real activation signals — never a client checkbox, never fabricated.

export interface JourneyGroupDef {
  key: JourneyGroupKey;
  label: string;
  blurb: string;
  icon: string;
  /** Non-auto milestone keys whose completion defines this group as done. */
  core: ActivationMilestoneKey[];
  /** "all" → every core key done; "any" → at least one (the operating step). */
  match: "all" | "any";
  /** Groups the office may sensibly defer without losing orientation. */
  skippable?: boolean;
}

export const JOURNEY_GROUPS: JourneyGroupDef[] = [
  { key: "office", label: "המשרד שלי", blurb: "פרטי המשרד, אזורי הפעילות והמיתוג", icon: "Building2", core: ["operating_area"], match: "all" },
  { key: "team", label: "הצוות", blurb: "הזמנת סוכנים — או להתחיל לבד", icon: "Users", core: ["team_invited"], match: "all", skippable: true },
  { key: "property", label: "הנכס הראשון", blurb: "הוספת הנכס הראשון ותמונות", icon: "Home", core: ["first_property"], match: "all" },
  { key: "site", label: "האתר שלי", blurb: "נוכחות דיגיטלית שנוצרת מהנתונים שלכם", icon: "Globe", core: ["digital_presence"], match: "all" },
  { key: "marketing", label: "שיווק ופרסום", blurb: "הקמפיין הראשון בקבוצות פייסבוק", icon: "Megaphone", core: ["first_campaign"], match: "all", skippable: true },
  { key: "ready", label: "המערכת מוכנה", blurb: "לקוחות, פעולות יומיות ו-ZI לצידכם", icon: "Sparkles", core: ["first_contact", "first_task_meeting", "first_deal"], match: "any", skippable: true },
];

export interface JourneyStepView {
  key: JourneyGroupKey;
  label: string;
  blurb: string;
  icon: string;
  done: boolean;
  skippable: boolean;
  /** All member milestones (for sub-item display, e.g. property + media). */
  milestones: ComputedMilestone[];
  /** First incomplete non-auto milestone in this group (the actionable one). */
  next: ActivationMilestone | null;
}

export interface JourneyState {
  steps: JourneyStepView[];
  completedGroups: number;
  totalGroups: number;
  /** Percent over the 6 journey groups (progress ring). */
  percent: number;
  /** Core "ready to work" = office + first property + digital presence. */
  coreComplete: boolean;
  /** The single next recommended action (deferred groups are de-prioritised). */
  nextRecommended: { group: JourneyGroupKey; milestone: ActivationMilestone } | null;
  /** True once every non-skippable group is done. */
  complete: boolean;
}

/**
 * Fold the activation milestones into the 6 coherent journey steps. Pure +
 * deterministic. `skipped` = groups the office explicitly deferred ("later" /
 * "continue alone"); they still show incomplete but are de-prioritised when
 * choosing the single next recommended action, so skipping never destroys
 * orientation.
 */
export function computeJourney(activation: ActivationState, skipped: JourneyGroupKey[] = []): JourneyState {
  const doneSet = new Set(activation.milestones.filter((m) => m.done).map((m) => m.milestone.key));
  const byKey = new Map(activation.milestones.map((m) => [m.milestone.key, m] as const));
  const skippedSet = new Set(skipped);

  const steps: JourneyStepView[] = JOURNEY_GROUPS.map((g) => {
    const members = ACTIVATION_MILESTONES
      .filter((m) => m.group === g.key)
      .map((m) => byKey.get(m.key))
      .filter((m): m is ComputedMilestone => !!m);
    const coreDone = g.match === "any"
      ? g.core.some((k) => doneSet.has(k))
      : g.core.every((k) => doneSet.has(k));
    const next = members.find((m) => !m.done && !m.milestone.auto)?.milestone ?? null;
    return { key: g.key, label: g.label, blurb: g.blurb, icon: g.icon, done: coreDone, skippable: !!g.skippable, milestones: members, next };
  });

  const completedGroups = steps.filter((s) => s.done).length;
  const totalGroups = steps.length;
  const percent = totalGroups === 0 ? 0 : Math.round((completedGroups / totalGroups) * 100);
  const coreComplete = (["office", "property", "site"] as JourneyGroupKey[]).every((k) => steps.find((s) => s.key === k)?.done);
  const complete = steps.filter((s) => !s.skippable).every((s) => s.done);

  const pick = steps.find((s) => !s.done && s.next && !skippedSet.has(s.key))
    ?? steps.find((s) => !s.done && s.next)
    ?? null;
  const nextRecommended = pick && pick.next ? { group: pick.key, milestone: pick.next } : null;

  return { steps, completedGroups, totalGroups, percent, coreComplete, nextRecommended, complete };
}
