"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { saveFinancialProfileAction, recomputeAllFinancingAction } from "@/lib/financing/actions";
import { RISK_LABELS, BAND_LABELS, RISK_TONE, BAND_TONE } from "@/lib/financing/engine";
import type { FinancingCommandCenter, BuyerFinancing } from "@/lib/financing/service";

type Tab = "all" | "ready" | "risks" | "cashgap" | "add";
const ils = (n: number | null | undefined) => (n != null ? `${Math.round(n).toLocaleString("he-IL")} ₪` : "—");

export function FinancingView({ cc }: { cc: FinancingCommandCenter }) {
  const [tab, setTab] = useState<Tab>("all");
  const r = useActionRunner();

  const list = tab === "ready" ? cc.profiles.filter((p) => p.readiness_band === "ready")
    : tab === "risks" ? cc.profiles.filter((p) => p.financing_risk === "high" || p.financing_risk === "critical")
    : tab === "cashgap" ? cc.profiles.filter((p) => (p.cash_gap ?? 0) > 0)
    : cc.profiles;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "all", label: "כל הקונים", icon: "Users" },
    { id: "ready", label: "מוכנים לרכישה", icon: "TrendingUp" },
    { id: "risks", label: "סיכוני מימון", icon: "AlertTriangle" },
    { id: "cashgap", label: "פערי מזומן", icon: "Minus" },
    { id: "add", label: "הוסף פרופיל", icon: "Plus" },
  ];

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Landmark" size={18} /></span>
            <h1 className="text-ink text-2xl font-black">משכנתא ומימון</h1>
          </div>
          <p className="text-muted text-sm">מודיעין פיננסי — מי באמת מוכן לרכוש, מה כושר הקנייה, היכן סיכון מימוני והיכן הזדמנות. הערכות בלבד, אינן ייעוץ פיננסי.</p>
        </div>
        {cc.isManager && (
          <Button size="sm" variant="ghost" loading={r.busyId === "recompute"}
            onClick={() => r.run(async () => { const res = await recomputeAllFinancingAction(); if (res.error) throw new Error(res.error); return res; }, { id: "recompute", pendingMessage: "מחשב מחדש...", success: (x) => x.message ?? null })}>
            <Icon name="TrendingUp" size={14} />חשב מחדש הכל
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="קונים מוכנים מימונית" value={cc.financingReady} icon="TrendingUp" tone="text-success" />
        <Stat label="סיכוני מימון" value={cc.financingRisks} icon="AlertTriangle" tone="text-danger" />
        <Stat label="התראות פער מזומן" value={cc.cashGapAlerts} icon="Minus" tone="text-warning" />
        <Stat label="מוכנים לרכישה" value={cc.readyToPurchase} icon="Handshake" tone="text-brand-strong" />
      </div>
      <div className="bg-brand-soft/40 text-brand-strong flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold">
        <Icon name="Landmark" size={15} />כוח קנייה כולל ב-CRM: {ils(cc.totalPurchasingPower)}
      </div>

      <ActionFeedback runner={r} />

      <nav className="border-line flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-bold ${tab === t.id ? "text-brand-strong border-brand border-b-2" : "text-muted"}`}>
            <Icon name={t.icon} size={15} />{t.label}
          </button>
        ))}
      </nav>

      {tab === "add" ? <AddProfile cc={cc} r={r} /> : (
        list.length === 0 ? <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין פרופילים להצגה</div>
          : <div className="flex flex-col gap-2">{list.map((p) => <ProfileCard key={p.buyer_id} p={p} />)}</div>
      )}
    </main>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-4 shadow-sm">
      <span className={`flex items-center gap-1.5 text-[12px] font-bold ${tone}`}><Icon name={icon} size={14} />{label}</span>
      <span className="text-ink text-2xl font-black">{value}</span>
    </div>
  );
}

type Runner = ReturnType<typeof useActionRunner>;

function ProfileCard({ p }: { p: BuyerFinancing }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-ink font-black">{p.buyer_name}</p>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BAND_TONE[p.readiness_band] ?? "bg-surface text-muted"}`}>{BAND_LABELS[p.readiness_band] ?? p.readiness_band}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${RISK_TONE[p.financing_risk] ?? "bg-surface text-muted"}`}>סיכון: {RISK_LABELS[p.financing_risk] ?? p.financing_risk}</span>
        </div>
        {p.overall_readiness != null && <span className="text-brand-strong text-sm font-black">{p.overall_readiness}<span className="text-muted text-[11px]"> מוכנות</span></span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
        <Field label="תקציב מומלץ" value={ils(p.recommended_budget)} tone="text-ink" />
        <Field label="תקרת יכולת" value={ils(p.max_budget)} />
        <Field label="החזר חודשי משוער" value={ils(p.monthly_payment_estimate)} />
        <Field label="סבירות אישור" value={p.approval_probability != null ? `${p.approval_probability}%` : "—"} />
        <Field label="הון נדרש" value={ils(p.recommended_budget != null ? p.recommended_budget * 0.25 : null)} />
        <Field label="פער מזומן" value={ils(p.cash_gap)} tone={(p.cash_gap ?? 0) > 0 ? "text-danger" : "text-success"} />
        <Field label="תקציב מבוקש" value={ils(p.desired_budget)} />
        <Field label="פער ליכולת" value={(p.financing_gap ?? 0) > 0 ? ils(p.financing_gap) : "—"} tone={(p.financing_gap ?? 0) > 0 ? "text-warning" : "text-muted"} />
      </div>
      {p.primary_gap && <p className="text-warning mt-2 text-[12px] font-semibold">⚠ {p.primary_gap}</p>}
    </div>
  );
}
function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div><span className="text-muted block text-[10px] font-bold">{label}</span><span className={`font-bold ${tone ?? "text-ink"}`}>{value}</span></div>;
}

function AddProfile({ cc, r }: { cc: FinancingCommandCenter; r: Runner }) {
  const [buyerId, setBuyerId] = useState("");
  const [v, setV] = useState({ monthlyIncome: "", householdIncome: "", monthlyDebt: "", existingMortgage: "", availableDownPayment: "", availableEquity: "", investmentCapital: "" });
  const [self, setSelf] = useState(false);
  const num = (s: string) => { const n = Number(s.replace(/[^\d]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
  const fields: { key: keyof typeof v; label: string }[] = [
    { key: "monthlyIncome", label: "הכנסה חודשית (₪)" }, { key: "householdIncome", label: "הכנסת משק בית (₪)" },
    { key: "monthlyDebt", label: "החזרי חוב חודשיים (₪)" }, { key: "existingMortgage", label: "החזר משכנתא קיים (₪)" },
    { key: "availableDownPayment", label: "הון עצמי זמין (₪)" }, { key: "availableEquity", label: "הון נוסף/נכס קיים (₪)" },
    { key: "investmentCapital", label: "הון להשקעה (₪)" },
  ];
  const submit = () => {
    if (!buyerId) return;
    r.run(async () => {
      const res = await saveFinancialProfileAction(buyerId, {
        monthlyIncome: num(v.monthlyIncome), householdIncome: num(v.householdIncome), monthlyDebt: num(v.monthlyDebt),
        existingMortgage: num(v.existingMortgage), availableDownPayment: num(v.availableDownPayment),
        availableEquity: num(v.availableEquity), investmentCapital: num(v.investmentCapital),
        selfEmployed: self, salaryEmployed: !self,
      });
      if (res.error) throw new Error(res.error); return res;
    }, { id: "save", pendingMessage: "מחשב מוכנות...", success: (x) => x.message ?? null });
  };

  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <p className="text-ink font-black">פרופיל פיננסי לקונה</p>
      <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)} className="border-line bg-surface text-ink h-10 rounded-lg border px-3 text-sm">
        <option value="">בחר קונה...</option>
        {cc.buyersNeedingProfile.map((b) => <option key={b.id} value={b.id}>{b.name}{b.budget_max ? ` · תקציב ${ils(b.budget_max)}` : ""}</option>)}
      </select>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-muted text-[11px] font-bold">{f.label}</span>
            <input inputMode="numeric" value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" />
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={self} onChange={(e) => setSelf(e.target.checked)} />עצמאי (לא שכיר)</label>
      <Button size="sm" className="w-fit" loading={r.busyId === "save"} disabled={!buyerId} onClick={submit}>
        <Icon name="Plus" size={14} />חשב ושמור מוכנות
      </Button>
      {cc.buyersNeedingProfile.length === 0 && <p className="text-muted text-[12px]">לכל הקונים כבר קיים פרופיל פיננסי</p>}
    </div>
  );
}
