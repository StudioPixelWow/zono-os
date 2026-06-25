import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getOnboardingAction } from "@/lib/launch/server/actions";

export const dynamic = "force-dynamic";

export default async function GettingStartedRoute() {
  const res = await getOnboardingAction();
  if (!res.ok) {
    return (
      <div className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <p className="text-ink font-extrabold">לא ניתן לטעון</p>
        <p className="text-muted text-sm">{res.error}</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">חזרה לדשבורד</Link>
      </div>
    );
  }
  const s = res.data;
  return (
    <div dir="rtl" className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <div className="bg-card border-line rounded-[20px] border p-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="bg-surface text-brand-strong grid h-11 w-11 place-items-center rounded-2xl"><Icon name="Sparkles" size={22} /></span>
          <div>
            <h1 className="text-ink text-lg font-black">תחילת עבודה</h1>
            <p className="text-muted text-xs">{s.completedCount}/{s.total} שלבים הושלמו · {s.percent}%</p>
          </div>
        </div>
        <div className="bg-surface h-2.5 w-full overflow-hidden rounded-full">
          <div className="bg-brand-strong h-full rounded-full transition-all" style={{ width: `${s.percent}%` }} />
        </div>
        {s.complete && <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-center text-sm font-bold text-emerald-300">🎉 כל הכבוד! המשרד שלך מוכן לעבודה.</p>}
      </div>

      <div className="flex flex-col gap-2">
        {s.steps.map(({ step, done }) => (
          <Link key={step.key} href={step.href}
            className={`bg-card border-line flex items-center gap-3 rounded-2xl border p-4 transition hover:border-[var(--brand-strong,#7c3aed)] ${done ? "opacity-70" : ""}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-500/15 text-emerald-300" : "bg-surface text-muted"}`}>
              <Icon name={done ? "CheckCircle" : "ChevronLeft"} size={18} />
            </span>
            <span className="flex-1">
              <span className={`text-ink block text-sm font-extrabold ${done ? "line-through" : ""}`}>{step.label}</span>
              <span className="text-muted block text-xs">{step.description}</span>
            </span>
            {!done && <Icon name="ChevronLeft" size={16} className="text-muted" />}
          </Link>
        ))}
      </div>
    </div>
  );
}
