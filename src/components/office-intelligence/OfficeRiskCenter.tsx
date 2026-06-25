"use client";
import { ShieldAlert } from "lucide-react";
import type { RiskItem } from "@/lib/office-intelligence/types";

const SEV: Record<string, string> = { urgent: "border-red-300 bg-red-50", high: "border-amber-300 bg-amber-50", medium: "border-sky-200 bg-sky-50", low: "border-black/10 bg-white" };
const DOT: Record<string, string> = { urgent: "bg-red-500", high: "bg-amber-500", medium: "bg-sky-500", low: "bg-ink/30" };

export function OfficeRiskCenter({ risks }: { risks: RiskItem[] }) {
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><ShieldAlert size={16} className="text-red-500" /> מרכז סיכונים</h2>
      {risks.length === 0 ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-5 text-center text-sm font-bold text-emerald-700">אין סיכונים פעילים. המשרד בריא ✓</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {risks.map((r) => (
            <li key={r.id} className={`rounded-2xl border p-3 ${SEV[r.severity]}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${DOT[r.severity]}`} />
                <p className="text-[13px] font-black text-ink">{r.title}</p>
                {r.owner && <span className="ms-auto text-[11px] font-bold text-ink/45">{r.owner}</span>}
              </div>
              <p className="mt-1 text-[12px] text-ink/65">{r.reason}</p>
              <p className="mt-0.5 text-[11px] text-ink/45">{r.businessImpact}</p>
              <p className="mt-1.5 text-[12px] font-bold text-brand-strong">{r.recommendedAction}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
