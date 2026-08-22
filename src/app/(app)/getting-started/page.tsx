// ============================================================================
// ZONO — "תחילת עבודה" (getting-started). The ONE coherent first-value journey
// for a brand-new office: 6 business-outcome steps, every completion derived
// from real system state via getOnboardingProgress(). Deep-links into the
// existing flows (no duplicate forms). RTL, mobile-first, restrained.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getOnboardingProgress } from "@/lib/onboarding/progress";
import { skipOnboardingGroupFormAction } from "@/lib/onboarding/journey-actions";

export const dynamic = "force-dynamic";

export default async function GettingStartedRoute() {
  const p = await getOnboardingProgress();

  if (!p.active) {
    return (
      <div dir="rtl" className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <p className="text-ink font-extrabold">בואו נשלים את הקמת המשרד</p>
        <p className="text-muted text-sm">עוד רגע והמערכת מוכנה לעבודה.</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">המשך</Link>
      </div>
    );
  }

  const greeting = p.ownerFirstName ? `${p.ownerFirstName}, ` : "";

  return (
    <div dir="rtl" className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
      {/* Header + progress */}
      <div className="bg-card border-line rounded-[22px] border p-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="bg-surface text-brand-strong grid h-11 w-11 place-items-center rounded-2xl">
            <Icon name="Flag" size={22} />
          </span>
          <div className="min-w-0">
            <h1 className="text-ink text-lg font-black">{greeting}הנה מה שנשאר להקמת המשרד</h1>
            <p className="text-muted text-xs">{p.completionPercent}% הושלם</p>
          </div>
        </div>
        <div className="bg-surface h-2.5 w-full overflow-hidden rounded-full">
          <div className="bg-brand-strong h-full rounded-full transition-all" style={{ width: `${p.completionPercent}%` }} />
        </div>
        {p.complete ? (
          <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-center text-sm font-bold text-emerald-300">
            ZONO מוכן לעבודה ✓ — כל הכבוד!
          </p>
        ) : p.nextRecommendedAction ? (
          <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-[var(--brand-soft,rgba(124,58,237,0.08))] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-muted text-[11px] font-bold">השלב הבא שלך</p>
              <p className="text-ink truncate text-sm font-extrabold">{p.nextRecommendedAction.label}</p>
            </div>
            <Link href={p.nextRecommendedAction.href}
              className="bg-brand-strong shrink-0 rounded-xl px-4 py-2 text-center text-sm font-bold text-white">
              {p.nextRecommendedAction.cta}
            </Link>
          </div>
        ) : null}
      </div>

      {/* The 6 steps */}
      <ol className="flex flex-col gap-3">
        {p.steps.map((step, i) => {
          const isNext = p.nextRecommendedAction?.group === step.key;
          const skipped = p.skipped.includes(step.key);
          return (
            <li key={step.key}
              className={`bg-card rounded-2xl border p-4 transition ${isNext ? "border-[var(--brand-strong,#7c3aed)] shadow-sm" : "border-line"} ${step.done ? "opacity-90" : ""}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${step.done ? "bg-emerald-500/15 text-emerald-400" : isNext ? "bg-brand-strong text-white" : "bg-surface text-muted"}`}>
                  <Icon name={step.done ? "CheckCircle" : step.icon} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted text-[11px] font-bold">שלב {i + 1}</span>
                    {step.done && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">הושלם</span>}
                    {!step.done && skipped && <span className="text-muted rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold">נדחה למועד מאוחר</span>}
                  </div>
                  <p className="text-ink text-sm font-extrabold">{step.label}</p>
                  <p className="text-muted text-xs">{step.blurb}</p>

                  {/* Sub-milestones (e.g. property + media) when more than one */}
                  {step.milestones.length > 1 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {step.milestones.map((m) => (
                        <li key={m.milestone.key} className="flex items-center gap-2 text-xs">
                          <Icon name={m.done ? "Check" : "Circle"} size={13}
                            className={m.done ? "text-emerald-400" : "text-muted"} />
                          <span className={m.done ? "text-muted line-through" : "text-ink"}>{m.milestone.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Actions */}
                  {!step.done && step.next && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Link href={step.next.href}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold ${isNext ? "bg-brand-strong text-white" : "bg-surface text-ink border-line border"}`}>
                        {step.next.cta}
                      </Link>
                      {step.skippable && !skipped && (
                        <form action={skipOnboardingGroupFormAction.bind(null, step.key)}>
                          <button type="submit" className="text-muted px-2 py-1.5 text-xs font-semibold hover:underline">
                            אחר כך
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Support discovery — make human help findable without settings/help. */}
      <div className="border-line text-muted rounded-2xl border border-dashed p-4 text-center text-xs">
        צריכים עזרה? פתחו את <span className="text-ink font-bold">ZICHAT</span> וכתבו “אני רוצה לדבר עם נציג” — ותיפתח פנייה לצוות התמיכה.
      </div>
    </div>
  );
}
