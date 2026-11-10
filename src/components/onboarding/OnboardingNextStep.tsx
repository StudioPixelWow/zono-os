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
import { getOnboardingChecklist } from "@/lib/commercial/checklist";

export async function OnboardingNextStep() {
  let p;
  try {
    p = await getOnboardingProgress();
  } catch {
    return null;
  }
  // Show only while there is a real next step to take. Once complete, the normal
  // dashboard takes over — no lingering nag.
  if (!p.active || p.complete || !p.nextRecommendedAction) return <SetupChecklistStrip />;

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

/** Fallback when the onboarding journey is inactive: the account setup checklist
 *  (logo · agents · Google · WhatsApp · Facebook · areas …) as a slim progress strip
 *  on the dashboard — previously it was buried in /account. Hidden at 100%. */
async function SetupChecklistStrip() {
  let c;
  try { c = await getOnboardingChecklist(); } catch { return null; }
  if (c.percentage >= 100) return null;
  const next = c.steps.find((s) => !s.done);
  if (!next) return null;
  return (
    <div dir="rtl" className="mb-3 w-full">
      <div className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-3.5 sm:flex-row sm:items-center sm:gap-4">
        <span className="zono-gradient grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white">
          <Icon name="Flag" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted text-[11px] font-bold">הקמת המשרד · {c.completed}/{c.total} שלבים</p>
            <span className="text-brand-strong text-[11px] font-black">{c.percentage}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2,#efedff)]">
            <div className="zono-gradient h-full rounded-full" style={{ width: `${c.percentage}%` }} />
          </div>
          <p className="text-ink mt-1.5 truncate text-sm font-extrabold">השלב הבא: {next.label}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/account" className="text-muted hidden px-2 text-xs font-semibold hover:underline sm:inline">כל השלבים</Link>
          <Link href={next.href} className="bg-brand-strong rounded-xl px-4 py-2 text-sm font-bold text-white">להשלמה</Link>
        </div>
      </div>
    </div>
  );
}
