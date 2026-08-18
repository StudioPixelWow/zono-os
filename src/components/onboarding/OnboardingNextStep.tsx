// ============================================================================
// ZONO — restrained dashboard first-run surface. A single-line "next step"
// strip shown on the main dashboard while the office setup journey is still
// incomplete, so a new office is never dropped into a complex dashboard
// wondering "מה אני אמור לעשות עכשיו?". NOT a wizard, NOT a modal, NOT
// permanent — it disappears the moment the journey is complete. Server
// component: derives everything from getOnboardingProgress() (real state).
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getOnboardingProgress } from "@/lib/onboarding/progress";

export async function OnboardingNextStep() {
  let p;
  try {
    p = await getOnboardingProgress();
  } catch {
    return null;
  }
  // Show only while there is a real next step to take. Once complete, the normal
  // dashboard takes over — no lingering nag.
  if (!p.active || p.complete || !p.nextRecommendedAction) return null;

  const a = p.nextRecommendedAction;
  return (
    <div dir="rtl" className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
      <div className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-3.5 sm:flex-row sm:items-center sm:gap-4">
        <span className="bg-brand-strong grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white">
          <Icon name="Flag" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted text-[11px] font-bold">השלב הבא שלך · {p.completionPercent}% מהקמת המשרד הושלמו</p>
          <p className="text-ink truncate text-sm font-extrabold">{a.label}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/getting-started" className="text-muted hidden px-2 text-xs font-semibold hover:underline sm:inline">
            כל השלבים
          </Link>
          <Link href={a.href} className="bg-brand-strong rounded-xl px-4 py-2 text-sm font-bold text-white">
            {a.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
