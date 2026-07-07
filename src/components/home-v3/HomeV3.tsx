"use client";
// ============================================================================
// 🌅 ZONO — Home V3 = THE MORNING + Premium Real-Estate AI Workspace. PHASE 61.RESTORE.
// COMPOSITION ONLY — no business logic, no new engines, no schema, no AI changes.
// Morning layer (Orb + voice + Start My Day + One Thing + Opportunity/Risk/Plan)
// is driven by the EXISTING Daily OS read. The rich real-estate layer REUSES the
// loved dashboard-home components (search hero + hot property + property cards +
// live map) fed by the EXISTING buildDashboardHomeData pipeline. One accent, glass,
// depth — no rainbow cards, no dashboard widget wall. Everything answers: what to
// do · opportunity · risk · who needs me · what's happening in the field.
// ============================================================================
import { useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Reveal } from "@/components/dashboard/motion";
import { tr, type DashboardDict } from "@/lib/dashboard-home/i18n";
import type { DashboardHomeData } from "@/lib/dashboard-home/types";
import type { DailyOS } from "@/lib/daily-os/types";
// Loved premium real-estate sections — reused verbatim (no duplication).
import { DashboardHero, DashboardKpiStrip } from "@/components/dashboard-home/components/DashboardHero";
import { HotPropertiesSection } from "@/components/dashboard-home/components/HotPropertiesSection";
import { HomeHeatmapSection } from "@/components/dashboard-home/components/HomeHeatmapSection";
import { TodayAttentionSection } from "@/components/dashboard-home/components/TodayAttentionSection";

const priCls: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };

export function HomeV3({ dict, data, daily }: { dict: DashboardDict; data: DashboardHomeData; daily: DailyOS | null }) {
  const t = useMemo(() => (k: string) => tr(dict, k), [dict]);
  const b = daily?.briefing ?? null;
  const one = daily?.actionFeed?.[0] ?? null;
  const plan = (daily?.actionFeed ?? []).slice(0, 3);

  return (
    <div dir="rtl" className="relative flex flex-col gap-12 sm:gap-14">
      {/* ── ACT 1 · THE MORNING (Orb + voice + Start My Day) — compact, doesn't dominate ── */}
      <Reveal>
        <section className="bg-brand-soft/50 zono-glass relative overflow-hidden rounded-[28px] p-6 sm:p-7">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            {/* Orb — the heart, kept modest so real-estate stays visible */}
            <div className="relative shrink-0">
              <div className="zono-gradient zono-glow grid h-24 w-24 place-items-center rounded-full text-white shadow-[var(--zono-glow-shadow)]">
                <div className="text-center leading-none">
                  <div className="text-2xl font-black">{b?.dailyScore ?? "—"}</div>
                  <div className="mt-0.5 text-[9px] font-bold opacity-90">ציון היום</div>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-brand text-xs font-bold">ZONO · הבוקר שלך</p>
              <h1 className="text-ink mt-1 text-2xl font-black sm:text-3xl">{b?.greeting ?? "בוקר טוב"}</h1>
              <p className="text-muted mt-1 max-w-2xl text-sm leading-relaxed">{b?.aiSummary ?? "אני מרכיב לך את היום — כל פעולה תעשה אותי חכם יותר."}</p>
              {b?.focus && <p className="text-brand-strong mt-1.5 text-[13px] font-bold">🎯 {b.focus}</p>}
            </div>
            <Link href="/today" className="btn-zono-primary zono-focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-5 py-3 text-sm font-bold text-white">
              להתחיל את היום <span>←</span>
            </Link>
          </div>
        </section>
      </Reveal>

      {/* ── ACT 1b · LOVED HERO — prominent smart search + hot property (big image) ── */}
      <Reveal>
        <div className="flex flex-col gap-5">
          <DashboardHero t={t} data={data} />
          <DashboardKpiStrip t={t} kpis={data.kpis} />
        </div>
      </Reveal>

      {/* ── ACT 2 · THE DECISIONS (from Daily OS) — one accent, no rainbow ── */}
      {daily && (one || b?.biggestOpportunity || b?.biggestRisk || plan.length > 0) && (
        <Reveal>
          <section className="flex flex-col gap-4">
            {/* The One Thing */}
            {one && (
              <Link href={one.href} className="bg-card border-line hover:border-brand-light block rounded-[22px] border p-5 shadow-[var(--shadow-card)] transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-brand text-[11px] font-bold">הדבר האחד להיום</p>
                    <p className="text-ink mt-1 text-lg font-black">{one.title}</p>
                    {one.why && <p className="text-muted mt-0.5 text-sm">{one.why}</p>}
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", priCls[one.priority] ?? priCls.low)}>{one.priority === "high" ? "דחוף" : one.priority === "medium" ? "חשוב" : "רגיל"}</span>
                </div>
              </Link>
            )}

            {/* Opportunity ↔ Risk (single balance row) */}
            {(b?.biggestOpportunity || b?.biggestRisk) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {b?.biggestOpportunity && (
                  <Link href={b.biggestOpportunity.href} className="bg-success-soft/40 border-line hover:border-brand-light rounded-[20px] border p-4 transition">
                    <p className="text-success text-[11px] font-bold">🚀 ההזדמנות הגדולה</p>
                    <p className="text-ink mt-1 text-[15px] font-black">{b.biggestOpportunity.label}</p>
                    <p className="text-muted text-[12px]">{b.biggestOpportunity.detail}</p>
                  </Link>
                )}
                {b?.biggestRisk && (
                  <Link href={b.biggestRisk.href} className="bg-danger-soft/30 border-line hover:border-brand-light rounded-[20px] border p-4 transition">
                    <p className="text-danger text-[11px] font-bold">⚠️ הסיכון הגדול</p>
                    <p className="text-ink mt-1 text-[15px] font-black">{b.biggestRisk.label}</p>
                    <p className="text-muted text-[12px]">{b.biggestRisk.detail}</p>
                  </Link>
                )}
              </div>
            )}

            {/* Today's Plan (capped) */}
            {plan.length > 0 && (
              <div className="bg-card border-line rounded-[20px] border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-ink text-sm font-extrabold">מה עוד דורש אותך</p>
                  <Link href="/today" className="text-brand-strong text-[12px] font-bold">תוכנית מלאה →</Link>
                </div>
                <div className="space-y-1.5">
                  {plan.map((a) => (
                    <Link key={a.id} href={a.href} className="bg-surface hover:border-brand-light border-line flex items-center justify-between gap-2 rounded-xl border p-2.5 transition">
                      <span className="text-ink min-w-0 flex-1 truncate text-[13px] font-bold">{a.title}</span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", priCls[a.priority] ?? priCls.low)}>{a.priority === "high" ? "דחוף" : a.priority === "medium" ? "חשוב" : "רגיל"}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        </Reveal>
      )}

      {/* ── ACT 3 · RICH REAL-ESTATE CANVAS (reused loved sections) ── */}
      {/* Premium property cards */}
      <HotPropertiesSection t={t} properties={data.hotProperties} />
      {/* Live property map / territory — a rich visual module, not a KPI */}
      <HomeHeatmapSection />

      {/* ── ACT 4 · WHO NEEDS YOU / WHAT NEEDS ATTENTION (reused) ── */}
      <TodayAttentionSection t={t} items={data.attention} />

      {/* Ask ZONO / Broker Brain entry — reuses the existing search + brain */}
      <Reveal>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => { try { window.dispatchEvent(new CustomEvent("zono:open-search")); } catch { /* ignore */ } }} className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-bold transition">
            <Icon name="Sparkles" size={16} /> שאל את ZONO · ⌘K
          </button>
          <Link href="/brain" className="text-brand-strong text-sm font-bold hover:underline">מוח הברוקר — מטרה אסטרטגית ←</Link>
        </div>
      </Reveal>
    </div>
  );
}
