"use client";
import { useState } from "react";
import type { OpportunityCard, OpportunityTab } from "@/lib/office-intelligence/types";

const TABS: { key: OpportunityTab; label: string }[] = [
  { key: "exclusive", label: "בלעדיות" }, { key: "hot_deals", label: "עסקאות חמות" },
  { key: "buyer_matches", label: "התאמות קונים" }, { key: "price_drops", label: "ירידות מחיר" },
  { key: "back_on_market", label: "חזרו לשוק" }, { key: "no_contact", label: "ללא יצירת קשר" },
  { key: "follow_up", label: "מעקב" },
];
const URG: Record<string, string> = { urgent: "bg-red-100 text-red-700", high: "bg-amber-100 text-amber-700", medium: "bg-sky-100 text-sky-700", low: "bg-black/5 text-ink/60" };

export function OfficeOpportunityBoard({ opportunities }: { opportunities: OpportunityCard[] }) {
  const counts = TABS.map((t) => ({ ...t, n: opportunities.filter((o) => o.tab === t.key).length }));
  const [tab, setTab] = useState<OpportunityTab>(counts.find((c) => c.n > 0)?.key ?? "exclusive");
  const items = opportunities.filter((o) => o.tab === tab);

  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-2 text-sm font-black text-ink">לוח הזדמנויות</h2>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {counts.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-full px-3 py-1 text-[12px] font-bold transition ${tab === t.key ? "bg-brand-strong text-white" : "bg-black/5 text-ink/60 hover:bg-black/10"}`}>
            {t.label}{t.n > 0 ? ` ${t.n}` : ""}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין הזדמנויות בקטגוריה זו כעת.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((o) => (
            <article key={o.id} className="rounded-2xl border border-black/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-black text-ink">{o.addressText ?? o.city ?? "הזדמנות"}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${URG[o.urgency]}`}>{o.urgency}</span>
              </div>
              <p className="mt-1 text-[12px] text-ink/60">{o.reason}</p>
              <p className="mt-1.5 text-[12px] font-bold text-brand-strong">{o.recommendedAction}</p>
              <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] font-bold text-ink/45">
                {o.opportunityScore != null && <span>ציון {o.opportunityScore}</span>}
                {o.exclusiveProbability != null && <span>בלעדיות {o.exclusiveProbability}%</span>}
                {o.buyerCount > 0 && <span>{o.buyerCount} קונים</span>}
                {o.agentOwner && <span>· {o.agentOwner}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
