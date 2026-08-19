// ============================================================================
// ZONO — "השבוע ב-ZONO" · portfolio weekly command surface (Phase 15). Managers
// and agents see, in one place: which properties need marketing (no plan yet),
// which plan DRAFTS await approval, which plans are ACTIVE, and which have failed
// actions. "הכן תוכניות ל-N נכסים" prepares individual drafts for review — never
// auto-approved. Each card links into the property's plan workboard. Server
// component, RTL, image-led. Reuses the deterministic scan + stateful plans.
// ============================================================================
import Link from "next/link";
import Image from "next/image";
import { getMarketingWeekReview } from "@/lib/marketing-autopilot/plan-view";
import { PLAN_STATUS_LABEL } from "@/lib/marketing-autopilot/plan-core";
import { Icon } from "@/components/dashboard/Icon";
import { BatchPrepareButton } from "./BatchPrepareButton";

export const dynamic = "force-dynamic";

export default async function MarketingWeekPage() {
  const w = await getMarketingWeekReview({ limit: 200 });
  const totalPubs = w.drafts.reduce((s, p) => s + p.itemCount, 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-brand text-xs font-extrabold">שיווק אוטומטי</p>
          <h1 className="text-ink text-2xl font-black">השבוע ב-ZONO</h1>
        </div>
        <Link href="/distribution" className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold"><Icon name="ChevronRight" size={16} /> מרכז ההפצה</Link>
      </div>

      {/* Headline metrics */}
      <div className="border-line bg-card grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border sm:grid-cols-4">
        <Metric n={w.counts.needsPlan} label="דורשים שיווק" tone="warning" />
        <Metric n={w.counts.drafts} label="טיוטות לאישור" tone="brand" />
        <Metric n={w.counts.active} label="תוכניות פעילות" tone="success" />
        <Metric n={w.counts.attention} label="דורשות טיפול" tone="danger" />
      </div>

      {/* Needs a plan */}
      {w.needsPlan.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-ink text-lg font-black">נכסים שדורשים שיווק</h2>
            <BatchPrepareButton propertyIds={w.needsPlan.map((p) => p.propertyId)} label={`הכן תוכניות ל-${w.needsPlan.length} נכסים`} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {w.needsPlan.map((p) => (
              <Link key={p.propertyId} href={`/distribution/marketing-plan/${p.propertyId}`} className="bg-card border-line flex gap-3 rounded-[18px] border p-3 hover:shadow-[var(--shadow-card)]">
                {p.imageUrl ? <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl"><Image src={p.imageUrl} alt="" fill className="object-cover" sizes="80px" /></div> : <div className="bg-surface h-16 w-20 shrink-0 rounded-xl" />}
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-extrabold">{p.title}</p>
                  <p className="text-muted truncate text-xs">{p.primaryReason}</p>
                  <span className="bg-warning-soft text-warning mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold">{p.primaryTitle}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Drafts awaiting approval */}
      {w.drafts.length > 0 && <PlanBucket title={`טיוטות שמחכות לאישור${totalPubs ? ` · ${totalPubs} פעולות` : ""}`} rows={w.drafts} />}
      {/* Active */}
      {w.active.length > 0 && <PlanBucket title="תוכניות פעילות" rows={w.active} />}
      {/* Attention */}
      {w.attention.length > 0 && <PlanBucket title="תוכניות שדורשות טיפול" rows={w.attention} danger />}

      {w.needsPlan.length === 0 && w.drafts.length === 0 && w.active.length === 0 && w.attention.length === 0 && (
        <div className="bg-card border-line rounded-[20px] border p-8 text-center"><div className="text-3xl">✓</div><p className="text-ink mt-2 font-bold">כל הנכסים הפעילים משווקים כראוי השבוע.</p></div>
      )}
    </div>
  );
}

function Metric({ n, label, tone }: { n: number; label: string; tone: "brand" | "success" | "warning" | "danger" }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-brand";
  return <div className="bg-card flex flex-col items-center justify-center px-3 py-5"><span className={`text-3xl font-black ${c}`}>{n}</span><span className="text-muted text-xs font-semibold">{label}</span></div>;
}

function PlanBucket({ title, rows, danger }: { title: string; rows: { planId: string; propertyId: string; propertyTitle: string | null; imageUrl: string | null; status: string; itemCount: number; failedItems: number }[]; danger?: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-ink text-lg font-black">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((p) => (
          <Link key={p.planId} href={`/distribution/marketing-plan/${p.propertyId}`} className="bg-card border-line flex gap-3 rounded-[18px] border p-3 hover:shadow-[var(--shadow-card)]">
            {p.imageUrl ? <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl"><Image src={p.imageUrl} alt="" fill className="object-cover" sizes="80px" /></div> : <div className="bg-surface h-16 w-20 shrink-0 rounded-xl" />}
            <div className="min-w-0 flex-1">
              <p className="text-ink truncate text-sm font-extrabold">{p.propertyTitle ?? "נכס"}</p>
              <p className="text-muted text-xs">{p.itemCount} פעולות בתוכנית</p>
              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${danger ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand"}`}>{PLAN_STATUS_LABEL[p.status as keyof typeof PLAN_STATUS_LABEL] ?? p.status}</span>
                {p.failedItems > 0 && <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[11px] font-bold">{p.failedItems} נכשלו</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
