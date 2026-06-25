// ============================================================================
// ZONO — onboarding checklist (pure). The 8 first-run milestones, progress
// computation, and next-step selection. Deterministic; the "done" state comes
// from real org data via the server layer (never faked).
// ============================================================================
import type { OnboardingProgress, OnboardingState, OnboardingStep, OnboardingStepKey } from "./types";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { key: "org_created", label: "ארגון נוצר", description: "המשרד שלך מוגדר במערכת", href: "/" },
  { key: "operating_areas", label: "אזורי פעילות נבחרו", description: "בחר/י ערים ושכונות לניטור", href: "/settings/operating-areas" },
  { key: "first_radar_scan", label: "סריקת רדאר ראשונה", description: "הפעל/י סנכרון נכסים ראשון", href: "/property-radar" },
  { key: "ai_configured", label: "AI הוגדר", description: "חיבור ספק AI לסיכומים (אופציונלי)", href: "/settings" },
  { key: "first_buyers", label: "קונים ראשונים", description: "הוסף/י או ייבא/י קונים", href: "/buyers" },
  { key: "first_seller_opportunity", label: "הזדמנות מוכר ראשונה", description: "זיהוי מוכר פוטנציאלי ראשון", href: "/sellers" },
  { key: "first_workflow", label: "תהליך אוטומציה פעיל", description: "הפעל/י מסע/אוטומציה ראשונה", href: "/journey-automation" },
  { key: "first_dashboard", label: "דשבורד נצפה", description: "צפייה ראשונה במרכז הפיקוד", href: "/command" },
];

export const ONBOARDING_STEP_KEYS: OnboardingStepKey[] = ONBOARDING_STEPS.map((s) => s.key);

export function emptyProgress(): OnboardingProgress {
  return { steps: {}, dismissed: false, completedAt: null };
}

/** Build the full onboarding state from a (real) progress record. */
export function computeOnboarding(progress: OnboardingProgress): OnboardingState {
  const steps = ONBOARDING_STEPS.map((step) => {
    const at = progress.steps[step.key] ?? null;
    return { step, done: !!at, at };
  });
  const completedCount = steps.filter((s) => s.done).length;
  const total = ONBOARDING_STEPS.length;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);
  const nextStep = steps.find((s) => !s.done)?.step ?? null;
  return { steps, completedCount, total, percent, complete: completedCount === total, nextStep };
}

/** Mark a step complete (idempotent — keeps the earliest completion time). */
export function markStep(progress: OnboardingProgress, key: OnboardingStepKey, atIso: string): OnboardingProgress {
  if (progress.steps[key]) return progress;
  const steps = { ...progress.steps, [key]: atIso };
  const complete = ONBOARDING_STEP_KEYS.every((k) => !!steps[k]);
  return { ...progress, steps, completedAt: complete ? (progress.completedAt ?? atIso) : progress.completedAt };
}
