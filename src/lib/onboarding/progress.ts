// ============================================================================
// ZONO — shared onboarding-progress selector (server-only). The SINGLE source
// of truth for "how far is this office from a working setup", derived entirely
// from real DB state via the canonical activation resolver. Consumed by the
// getting-started journey, the dashboard first-run surface, and ZI. Never
// fabricates completion; existing offices auto-derive as complete without ever
// being forced through onboarding again.
// ============================================================================
import "server-only";
import { getOfficeActivation } from "@/lib/activation/activation-server";
import {
  computeJourney,
  type ActivationMilestoneKey,
  type JourneyGroupKey,
  type JourneyStepView,
} from "@/lib/activation/activation";
import { createServiceRoleClient } from "@/lib/supabase/server";

export interface OnboardingNextAction {
  group: JourneyGroupKey;
  label: string;
  cta: string;
  href: string;
}

export interface OnboardingProgressView {
  /** False when there is no active org yet (unauthenticated / mid-registration). */
  active: boolean;
  phase: "new" | "activating" | "active" | null;
  // ── Granular signals (stable public shape) ────────────────────────────────
  office: boolean;
  team: boolean;
  property: boolean;
  media: boolean;
  publicSite: boolean;
  facebook: boolean;
  campaign: boolean;
  // ── Roll-ups ───────────────────────────────────────────────────────────────
  completionPercent: number;
  coreComplete: boolean;
  complete: boolean;
  nextRecommendedAction: OnboardingNextAction | null;
  steps: JourneyStepView[];
  skipped: JourneyGroupKey[];
  officeName: string | null;
  ownerFirstName: string | null;
}

const EMPTY: OnboardingProgressView = {
  active: false, phase: null,
  office: false, team: false, property: false, media: false, publicSite: false, facebook: false, campaign: false,
  completionPercent: 0, coreComplete: false, complete: false,
  nextRecommendedAction: null, steps: [], skipped: [], officeName: null, ownerFirstName: null,
};

const GROUP_KEYS: JourneyGroupKey[] = ["office", "team", "property", "site", "marketing", "ready"];

/** Read the office's explicitly deferred groups (best-effort; [] on any error). */
async function readSkipped(orgId: string): Promise<JourneyGroupKey[]> {
  try {
    const db = createServiceRoleClient();
    const { data } = await db
      .from("onboarding_progress" as never)
      .select("skipped")
      .eq("org_id" as never, orgId as never)
      .maybeSingle();
    const raw = (data as { skipped?: unknown } | null)?.skipped;
    if (!Array.isArray(raw)) return [];
    return raw.filter((k): k is JourneyGroupKey => typeof k === "string" && (GROUP_KEYS as string[]).includes(k));
  } catch {
    return [];
  }
}

/**
 * The canonical onboarding snapshot for the current session. One activation
 * resolve + one skipped-groups read + a best-effort extension-readiness probe.
 */
export async function getOnboardingProgress(): Promise<OnboardingProgressView> {
  const act = await getOfficeActivation();
  if (!act) return EMPTY;

  const orgId = act.identity.orgId;
  const skipped = await readSkipped(orgId);
  const journey = computeJourney(act.activation, skipped);

  const stepDone = (k: JourneyGroupKey) => journey.steps.find((s) => s.key === k)?.done ?? false;
  const mDone = (k: ActivationMilestoneKey) => act.activation.milestones.find((m) => m.milestone.key === k)?.done ?? false;

  const campaign = mDone("first_campaign");
  // Facebook = a real marketing campaign exists OR the browser extension is live
  // and connected to Facebook. Best-effort; a probe failure never blocks setup.
  let extReady = false;
  try {
    const { getOrgExtensionReadiness } = await import("@/lib/distribution/extension-service");
    const v = await getOrgExtensionReadiness();
    extReady = v.state === "ready";
  } catch { /* extension state unknown → treat as not connected */ }

  const nr = journey.nextRecommended;
  const nextRecommendedAction: OnboardingNextAction | null = nr
    ? { group: nr.group, label: nr.milestone.label, cta: nr.milestone.cta || nr.milestone.label, href: nr.milestone.href }
    : null;

  return {
    active: true,
    phase: act.activation.phase,
    office: stepDone("office"),
    team: stepDone("team"),
    property: mDone("first_property"),
    media: mDone("first_media"),
    publicSite: stepDone("site"),
    facebook: campaign || extReady,
    campaign,
    completionPercent: journey.percent,
    coreComplete: journey.coreComplete,
    complete: journey.complete,
    nextRecommendedAction,
    steps: journey.steps,
    skipped,
    officeName: act.identity.officeName,
    ownerFirstName: act.identity.ownerFirstName,
  };
}

/** A compact, honest Hebrew summary of setup state for ZI (never hallucinated). */
export function summarizeOnboardingForZi(p: OnboardingProgressView): string {
  if (!p.active) return "אין עדיין משרד פעיל — יש להשלים רישום.";
  const labelDone: Record<string, boolean> = {
    "פרטי המשרד": p.office,
    "הצוות": p.team,
    "הנכס הראשון": p.property,
    "תמונות לנכס": p.media,
    "האתר הציבורי": p.publicSite,
    "קמפיין שיווקי": p.campaign,
  };
  const done = Object.entries(labelDone).filter(([, v]) => v).map(([k]) => k);
  const todo = Object.entries(labelDone).filter(([, v]) => !v).map(([k]) => k);
  const nextLine = p.nextRecommendedAction
    ? ` השלב הבא המומלץ: ${p.nextRecommendedAction.label} (${p.nextRecommendedAction.href}).`
    : "";
  return `הושלמו (${p.completionPercent}%): ${done.length ? done.join(", ") : "אין עדיין"}. ` +
    `נותר להגדיר: ${todo.length ? todo.join(", ") : "הכול הושלם"}.${nextLine}`;
}
