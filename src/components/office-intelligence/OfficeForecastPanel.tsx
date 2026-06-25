"use client";
import { LineChart } from "lucide-react";
import type { ForecastResult, Benchmark } from "@/lib/office-intelligence/types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/5 p-2.5 text-center">
      <p className="text-lg font-black text-brand-strong">{value}</p>
      <p className="text-[11px] font-bold text-ink/50">{label}</p>
    </div>
  );
}

const DIR: Record<string, string> = { up: "text-emerald-600", down: "text-red-500", flat: "text-ink/40" };
const ARR: Record<string, string> = { up: "▲", down: "▼", flat: "—" };

export function OfficeForecastPanel({ forecast, benchmarks }: { forecast: ForecastResult; benchmarks: Benchmark[] }) {
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><LineChart size={16} /> צפי ומגמות <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">הערכה · ודאות {forecast.confidencePct}%</span></h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="בלעדיות צפויות" value={String(forecast.likelyExclusives)} />
        <Stat label="עסקאות צפויות" value={String(forecast.likelyDeals)} />
        <Stat label="פגישות צפויות" value={String(forecast.likelyMeetings)} />
        <Stat label="עמלה צפויה" value={`₪${Math.round(forecast.estimatedCommission).toLocaleString("he-IL")}`} />
      </div>
      {forecast.assumptions.length > 0 && (
        <div className="mt-2 rounded-xl bg-black/[0.03] p-2.5">
          <p className="mb-1 text-[10px] font-black text-ink/45">הנחות החישוב</p>
          <ul className="flex flex-col gap-0.5 text-[11px] text-ink/55">
            {forecast.assumptions.map((a, i) => <li key={i}>• {a}</li>)}
          </ul>
        </div>
      )}
      {benchmarks.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] font-bold text-ink/55">השוואה לתקופה קודמת</p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {benchmarks.map((b) => (
              <div key={b.metric} className="flex items-center justify-between rounded-xl border border-black/5 p-2 text-[12px]">
                <span className="font-bold text-ink">{b.label}</span>
                <span className="flex items-center gap-1.5">
                  <span className="font-black text-ink">{b.current.toLocaleString("he-IL")}</span>
                  <span className={`text-[11px] font-bold ${DIR[b.direction]}`}>{ARR[b.direction]} {b.deltaPct == null ? "—" : `${Math.abs(b.deltaPct)}%`}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
