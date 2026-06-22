"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import {
  BUYER_TYPE_LABELS,
  FINANCING_DISCLAIMER,
  computeMortgage,
  computeYield,
  type MortgageInputs,
} from "@/lib/financing/calculators";

const ils = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const field =
  "bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none";
const lbl = "text-muted text-[11px] font-bold";

const RISK_TONE: Record<string, string> = {
  low: "bg-success-soft text-success",
  medium: "bg-warning-soft text-warning",
  high: "bg-danger-soft text-danger",
};
const RISK_LABEL: Record<string, string> = { low: "סיכון נמוך", medium: "סיכון בינוני", high: "סיכון גבוה" };

export function MortgageCalculators() {
  const [m, setM] = useState<MortgageInputs>({
    propertyPrice: 2_200_000,
    equity: 600_000,
    annualRatePct: 4.8,
    years: 25,
    monthlyIncome: 22_000,
    monthlyObligations: 1_500,
    buyerType: "first_home",
  });
  const res = computeMortgage(m);

  const [y, setY] = useState({ propertyPrice: 1_800_000, monthlyRent: 5_500, monthlyExpenses: 800 });
  const yr = computeYield(y);

  const setMNum = (k: keyof MortgageInputs, v: string) =>
    setM((s) => ({ ...s, [k]: v === "" ? 0 : Number(v) }));

  return (
    <div className="flex flex-col gap-5">
      <p className="bg-surface text-muted rounded-xl px-3 py-2 text-xs font-semibold">
        <Icon name="AlertTriangle" size={13} className="mb-0.5 inline" /> {FINANCING_DISCLAIMER}
      </p>

      {/* Mortgage + affordability */}
      <div className="bg-card border-line grid grid-cols-1 gap-5 rounded-[20px] border p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <h2 className="text-ink text-base font-extrabold">מחשבון משכנתא וכושר החזר</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Num label="מחיר הנכס" value={m.propertyPrice} onChange={(v) => setMNum("propertyPrice", v)} />
            <Num label="הון עצמי" value={m.equity} onChange={(v) => setMNum("equity", v)} />
            <Num label="ריבית שנתית %" value={m.annualRatePct} onChange={(v) => setMNum("annualRatePct", v)} step="0.1" />
            <Num label="שנים" value={m.years} onChange={(v) => setMNum("years", v)} />
            <Num label="הכנסה חודשית" value={m.monthlyIncome} onChange={(v) => setMNum("monthlyIncome", v)} />
            <Num label="התחייבויות חודשיות" value={m.monthlyObligations} onChange={(v) => setMNum("monthlyObligations", v)} />
            <label className="flex flex-col gap-1">
              <span className={lbl}>סוג רוכש</span>
              <select className={field} value={m.buyerType} onChange={(e) => setM((s) => ({ ...s, buyerType: e.target.value as MortgageInputs["buyerType"] }))}>
                {(Object.keys(BUYER_TYPE_LABELS) as MortgageInputs["buyerType"][]).map((k) => (
                  <option key={k} value={k}>{BUYER_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="bg-surface flex flex-col gap-2 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-ink text-sm font-extrabold">תוצאה</span>
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", RISK_TONE[res.risk])}>{RISK_LABEL[res.risk]}</span>
          </div>
          <Row label="החזר חודשי משוער" value={ils(res.monthlyPayment)} strong />
          <Row label="סכום משכנתא" value={ils(res.loanAmount)} />
          <Row label="אחוז מימון (LTV)" value={`${pct(res.financingPct)} (תקרה ${res.maxFinancingPct}%)`} />
          <Row label="יחס החזר להכנסה (DTI)" value={pct(res.dtiPct)} />
          <Row label="החזר חודשי בטוח" value={ils(res.safeMonthlyPayment)} />
          <Row label="פער הון עצמי" value={res.equityGap > 0 ? ils(res.equityGap) : "אין"} />
          <Row label="תקציב מקסימלי משוער" value={ils(res.maxBudget)} />
          <div className="bg-card mt-1 flex items-center justify-between rounded-xl px-3 py-2">
            <span className={lbl}>ציון מוכנות</span>
            <span className="text-brand text-lg font-black">{res.readinessScore}</span>
          </div>
          <p className="text-muted text-[12px] leading-relaxed">{res.nextStep}</p>
        </div>
      </div>

      {/* Investment yield */}
      <div className="bg-card border-line flex flex-col gap-4 rounded-[20px] border p-5">
        <h2 className="text-ink text-base font-extrabold">מחשבון תשואה להשקעה</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Num label="מחיר הנכס" value={y.propertyPrice} onChange={(v) => setY((s) => ({ ...s, propertyPrice: v === "" ? 0 : Number(v) }))} />
          <Num label="שכר דירה חודשי" value={y.monthlyRent} onChange={(v) => setY((s) => ({ ...s, monthlyRent: v === "" ? 0 : Number(v) }))} />
          <Num label="הוצאות חודשיות" value={y.monthlyExpenses} onChange={(v) => setY((s) => ({ ...s, monthlyExpenses: v === "" ? 0 : Number(v) }))} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="תשואה ברוטו" value={pct(yr.grossYieldPct)} />
          <Stat label="תשואה נטו" value={pct(yr.netYieldPct)} />
          <Stat label="הכנסה נטו שנתית" value={ils(yr.annualNetIncome)} />
        </div>
      </div>

      {/* Purchase tax placeholder */}
      <div className="bg-card border-line flex items-start gap-3 rounded-[20px] border p-5">
        <span className="bg-surface text-muted grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="Landmark" size={18} /></span>
        <div>
          <h3 className="text-ink text-sm font-extrabold">מס רכישה</h3>
          <p className="text-muted text-xs">מחשבון מדרגות מס רכישה יתווסף בקרוב. מדרגות המס מתעדכנות תקופתית — עד אז מומלץ להיעזר במחשבון רשות המסים.</p>
        </div>
      </div>
    </div>
  );
}

function Num({ label, value, onChange, step }: { label: string; value: number; onChange: (v: string) => void; step?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={lbl}>{label}</span>
      <input type="number" step={step} className={field} value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={lbl}>{label}</span>
      <span className={cn("text-sm", strong ? "text-ink font-black" : "text-ink font-semibold")}>{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface flex flex-col gap-1 rounded-2xl p-4">
      <span className={lbl}>{label}</span>
      <span className="text-brand text-xl font-black">{value}</span>
    </div>
  );
}
