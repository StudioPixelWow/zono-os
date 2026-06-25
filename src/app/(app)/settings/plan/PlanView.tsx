"use client";
// ============================================================================
// ZONO — Plan & License (Phase 21, sections 11–12). Shows the four tiers with
// entitlements + soft limits, marks the current plan, and lets an admin switch
// plan (feature gating routes through the existing Feature Flags layer). Billing
// (Stripe/invoices/subscriptions) is prepared but no payment flow runs yet.
// ============================================================================
import { useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { PLANS, PLAN_ORDER, ENTITLEMENTS } from "@/lib/launch";
import { setPlanAction } from "@/lib/launch/server/actions";
import type { OrgPlan, PlanTier } from "@/lib/launch";

const ENTITLEMENT_LABEL: Record<string, string> = {
  [ENTITLEMENTS.PROPERTY_RADAR]: "רדאר נכסים", [ENTITLEMENTS.BUYER_MATCHING]: "התאמת קונים",
  [ENTITLEMENTS.SELLER_INTELLIGENCE]: "מודיעין מוכרים", [ENTITLEMENTS.AI_COPILOT]: "AI Copilot",
  [ENTITLEMENTS.JOURNEY_AUTOMATION]: "אוטומציית מסעות", [ENTITLEMENTS.OFFICE_INTELLIGENCE]: "מודיעין משרד",
  [ENTITLEMENTS.EXECUTIVE_INTELLIGENCE]: "מודיעין מנהלים", [ENTITLEMENTS.COMPETITOR_INTELLIGENCE]: "מודיעין מתחרים",
  [ENTITLEMENTS.MULTI_AGENT]: "ריבוי סוכנים", [ENTITLEMENTS.PRIORITY_SUPPORT]: "תמיכה מועדפת",
  [ENTITLEMENTS.PLATFORM_ADMIN]: "ניהול פלטפורמה",
};

export function PlanView({ current }: { current: OrgPlan }) {
  const [plan, setPlan] = useState<PlanTier>(current.plan);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function choose(tier: PlanTier) {
    setMsg(null);
    start(async () => { const r = await setPlanAction(tier); if (r.ok) { setPlan(tier); setMsg("החבילה עודכנה."); } else setMsg(r.error); });
  }

  return (
    <div dir="rtl" className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <div className="bg-card border-line rounded-[20px] border p-5">
        <h1 className="text-ink text-lg font-black">חבילה ורישוי</h1>
        <p className="text-muted text-xs">החבילה הנוכחית: <span className="text-brand-strong font-bold">{PLANS[plan].label}</span> · סטטוס {current.status}</p>
        {msg && <p className="text-muted mt-2 text-xs font-semibold">{msg}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((tier) => {
          const p = PLANS[tier];
          const isCurrent = tier === plan;
          return (
            <div key={tier} className={`flex flex-col gap-3 rounded-2xl border p-4 ${isCurrent ? "border-brand-strong bg-brand-soft/40" : "bg-card border-line"}`}>
              <div className="flex items-center justify-between">
                <span className="text-ink font-black">{p.label}</span>
                {p.highlight && <span className="bg-brand-strong rounded-full px-2 py-0.5 text-[10px] font-bold text-white">פופולרי</span>}
              </div>
              <p className="text-ink text-sm font-bold">{p.priceHintIls == null ? "התאמה אישית" : p.priceHintIls === 0 ? "חינם" : `₪${p.priceHintIls}/חודש`}</p>
              <ul className="flex flex-col gap-1">
                {p.features.slice(0, 6).map((f) => (
                  <li key={f} className="text-muted flex items-center gap-1.5 text-xs"><Icon name="Check" size={13} className="text-emerald-400" /> {ENTITLEMENT_LABEL[f] ?? f}</li>
                ))}
              </ul>
              <div className="text-muted mt-auto text-[11px]">
                {p.limits.seats < 0 ? "מושבים: ללא הגבלה" : `מושבים: ${p.limits.seats}`} · {p.limits.operatingAreas < 0 ? "אזורים: ∞" : `אזורים: ${p.limits.operatingAreas}`}
              </div>
              <button onClick={() => choose(tier)} disabled={pending || isCurrent}
                className={`rounded-xl px-3 py-2 text-sm font-bold ${isCurrent ? "bg-surface text-muted" : "bg-brand-strong text-white hover:opacity-90"} disabled:opacity-60`}>
                {isCurrent ? "החבילה הנוכחית" : pending ? "מעדכן…" : "בחירה"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-muted text-center text-[11px]">
        חיוב (Stripe, חשבוניות, מנויים, מגבלות שימוש) מוכן לאינטגרציה — אין עדיין תהליך תשלום פעיל. שינוי חבילה זמין למנהלי מערכת.
      </p>
    </div>
  );
}
