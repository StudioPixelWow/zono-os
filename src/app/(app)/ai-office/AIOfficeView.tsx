"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { saveBriefAction, createGrowthPlanAction, runSimulationAction } from "@/lib/ai-office/actions";
import { SEVERITY_TONE, ROLE_LABELS, SCENARIOS, type GrowthPlanType, type ScenarioKey } from "@/lib/ai-office/engine";
import type { AIOfficeCommandCenter } from "@/lib/ai-office/service";

type Tab = "focus" | "opportunities" | "risks" | "brief" | "growth" | "executive";
const ils = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

export function AIOfficeView({ cc }: { cc: AIOfficeCommandCenter | null }) {
  const [tab, setTab] = useState<Tab>("focus");
  const r = useActionRunner();
  if (!cc) return <main dir="rtl" className="mx-auto max-w-3xl px-4 py-10 text-center"><p className="text-muted">לא ניתן לטעון את שכבת ה-AI כרגע.</p></main>;

  const tabs: { id: Tab; label: string; icon: string; exec?: boolean }[] = [
    { id: "focus", label: "מוקד היום", icon: "Flame" },
    { id: "opportunities", label: "הזדמנויות", icon: "Sparkles" },
    { id: "risks", label: "סיכונים", icon: "AlertTriangle" },
    { id: "brief", label: "תדריך", icon: "Presentation" },
    { id: "growth", label: "צמיחה", icon: "TrendingUp" },
    { id: "executive", label: "מבט הנהלה", icon: "Landmark", exec: true },
  ];
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-brand text-white grid h-9 w-9 place-items-center rounded-xl"><Icon name="Sparkles" size={18} /></span>
            <h1 className="text-ink text-2xl font-black">מוח המשרד · ZONO AI</h1>
            <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">{ROLE_LABELS[cc.role]}</span>
          </div>
          <p className="text-muted text-sm">שכבת ההיגיון מעל כל המערכות — מתבוננת, מנתחת, מתעדפת ומסבירה. אינה מבצעת פעולות לבד; היא מנחה אותך מה חשוב, מה השתנה ומה לעשות עכשיו.</p>
        </div>
        <Button size="sm" variant="ghost" loading={r.busyId === "save"} onClick={() => wrap(() => saveBriefAction(), "save", "שומר תדריך...")}>
          <Icon name="Presentation" size={14} />שמור תדריך
        </Button>
      </header>

      <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
        <p className="text-ink font-black">{cc.brief.headline}</p>
        <p className="text-muted mt-1 text-[13px]">{cc.brief.summary}</p>
      </div>

      <ActionFeedback runner={r} />

      <nav className="border-line flex gap-1 overflow-x-auto border-b">
        {tabs.filter((t) => !t.exec || cc.canExecutive).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-bold ${tab === t.id ? "text-brand-strong border-brand border-b-2" : "text-muted"}`}>
            <Icon name={t.icon} size={15} />{t.label}
          </button>
        ))}
      </nav>

      {tab === "focus" && (
        cc.focus.length === 0 ? <Empty text="אין מוקדי פעולה כרגע — מנוע ההחלטות לא הניב אותות פתוחים" /> : (
          <div className="flex flex-col gap-2">
            {cc.focus.map((f) => (
              <div key={f.rank} className="bg-card border-line flex items-start gap-3 rounded-2xl border p-4 shadow-sm">
                <span className="bg-brand-soft text-brand-strong grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-black">{f.rank}</span>
                <div className="min-w-0">
                  <p className="text-ink font-bold">{f.title}</p>
                  {f.reason && <p className="text-muted mt-0.5 text-[12px]">{f.reason}</p>}
                  {f.recommended_action && <p className="text-brand-strong mt-1 text-[12px]">← {f.recommended_action}</p>}
                  <span className="bg-surface text-muted mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold">{f.source_module}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "opportunities" && <OppRisk items={cc.opportunities.map((o) => ({ title: o.title, reason: o.reason, action: o.recommended_action, badge: o.revenue_impact ? ils(o.revenue_impact) : `${o.score}`, tone: "bg-success-soft text-success", module: o.source_module }))} empty="אין הזדמנויות פתוחות" />}
      {tab === "risks" && <OppRisk items={cc.risks.map((rk) => ({ title: rk.title, reason: rk.reason, action: rk.recommended_action, badge: rk.severity, tone: SEVERITY_TONE[rk.severity], module: rk.source_module }))} empty="אין סיכונים פתוחים" />}

      {tab === "brief" && (
        <div className="flex flex-col gap-3">
          {cc.brief.sections.map((s, i) => (
            <div key={i} className="bg-card border-line rounded-2xl border p-4 shadow-sm">
              <p className="text-ink mb-2 font-black">{s.title}</p>
              <ul className="flex flex-col gap-1">{s.items.map((it, j) => <li key={j} className="text-ink text-[13px]">• {it}</li>)}</ul>
            </div>
          ))}
        </div>
      )}

      {tab === "growth" && (
        <div className="flex flex-col gap-3">
          {cc.isManager && (
            <div className="bg-card border-line flex flex-wrap items-center gap-2 rounded-2xl border p-4 shadow-sm">
              <span className="text-ink text-sm font-bold">צור תוכנית:</span>
              {([["growth_90d", "צמיחה 90 יום"], ["revenue_acceleration", "האצת הכנסה"], ["territory_expansion", "הרחבת טריטוריה"], ["recruitment", "גיוס סוכנים"], ["market_share", "נתח שוק"]] as [GrowthPlanType, string][]).map(([k, l]) => (
                <Button key={k} size="sm" variant="ghost" loading={r.busyId === `gp-${k}`} onClick={() => wrap(() => createGrowthPlanAction(k), `gp-${k}`, "יוצר תוכנית...")}>{l}</Button>
              ))}
            </div>
          )}
          {cc.growthPlans.length === 0 ? <Empty text="עדיין לא נוצרו תוכניות צמיחה" /> : cc.growthPlans.map((p) => (
            <div key={p.id} className="bg-card border-line rounded-2xl border p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-ink font-black">{p.title}</p>
                {p.expected_revenue_impact > 0 && <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-[11px] font-bold">{ils(p.expected_revenue_impact)}</span>}
              </div>
              {p.summary && <p className="text-muted mt-1 text-[12px]">{p.summary}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === "executive" && cc.canExecutive && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="צנרת משוקללת" value={ils(cc.metrics.pipelineWeightedRevenue)} tone="text-brand-strong" />
            <Metric label="הכנסה בסיכון" value={ils(cc.metrics.atRiskRevenue)} tone="text-danger" />
            <Metric label="עסקאות פתוחות" value={String(cc.metrics.openDeals)} tone="text-ink" />
            <Metric label="הכנסה מהפניות" value={ils(cc.metrics.referralRevenue)} tone="text-success" />
          </div>
          <section className="flex flex-col gap-2">
            <h2 className="text-ink flex items-center gap-2 text-lg font-black"><Icon name="Sparkles" size={17} />סימולציות ״מה אם״</h2>
            {cc.isManager && (
              <div className="flex flex-wrap gap-2">
                {SCENARIOS.map((s) => (
                  <Button key={s.key} size="sm" variant="secondary" loading={r.busyId === `sim-${s.key}`} onClick={() => wrap(() => runSimulationAction(s.key as ScenarioKey), `sim-${s.key}`, "מריץ סימולציה...")}>{s.label}</Button>
                ))}
              </div>
            )}
            {cc.simulations.length === 0 ? <Empty text="עדיין לא הורצו סימולציות" /> : (
              <div className="flex flex-col gap-2">
                {cc.simulations.map((s) => (
                  <div key={s.id} className="bg-card border-line rounded-2xl border p-4 shadow-sm">
                    <p className="text-ink font-bold">{s.title}</p>
                    {s.summary && <p className="text-muted mt-0.5 text-[12px]">{s.summary}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function OppRisk({ items, empty }: { items: { title: string; reason: string | null; action: string | null; badge: string; tone: string; module: string }[]; empty: string }) {
  if (items.length === 0) return <Empty text={empty} />;
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="bg-card border-line rounded-2xl border p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-ink font-bold">{it.title}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${it.tone}`}>{it.badge}</span>
          </div>
          {it.reason && <p className="text-muted mt-0.5 text-[12px]">{it.reason}</p>}
          {it.action && <p className="text-brand-strong mt-1 text-[12px]">← {it.action}</p>}
          <span className="bg-surface text-muted mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold">{it.module}</span>
        </div>
      ))}
    </div>
  );
}
function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-4 shadow-sm"><span className="text-muted text-[12px] font-bold">{label}</span><span className={`text-xl font-black ${tone}`}>{value}</span></div>;
}
function Empty({ text }: { text: string }) { return <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">{text}</div>; }
