"use client";
import { useTransition } from "react";
import { Bell, Check } from "lucide-react";
import { markCompetitorAlertReadAction } from "@/lib/competitor-intelligence/actions";
import type { CompetitorAlert } from "@/lib/competitor-intelligence/types";

const SEV: Record<string, string> = { urgent: "border-red-300 bg-red-50", high: "border-amber-300 bg-amber-50", medium: "border-sky-200 bg-sky-50", low: "border-black/10 bg-white" };
const TYPE_LABEL: Record<string, string> = {
  competitor_spike: "זינוק פעילות", competitor_price_drop_wave: "גל ירידות מחיר", competitor_new_area: "כניסה לאזור חדש",
  market_share_change: "שינוי נתח שוק", aggressive_pricing: "תמחור אגרסיבי",
};

export function CompetitorAlertsPanel({ alerts, onChanged }: { alerts: CompetitorAlert[]; onChanged?: () => void }) {
  const [pending, start] = useTransition();
  const read = (id: string) => start(async () => { await markCompetitorAlertReadAction(id); onChanged?.(); });
  const unread = alerts.filter((a) => a.status === "unread");
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Bell size={16} className="text-brand-strong" /> התראות מתחרים{unread.length > 0 ? <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">{unread.length}</span> : null}</h2>
      {alerts.length === 0 ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-5 text-center text-sm font-bold text-emerald-700">אין התראות מתחרים פתוחות. הרץ צילום יומי כדי לזהות מגמות.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li key={a.id} className={`rounded-2xl border p-3 ${SEV[a.severity]} ${a.status === "read" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-black text-ink">{a.title}</p>
                  <span className="text-[10px] font-bold text-ink/45">{TYPE_LABEL[a.alertType] ?? a.alertType}{a.city ? ` · ${a.city}` : ""}</span>
                </div>
                {a.status === "unread" && <button onClick={() => read(a.id)} disabled={pending} className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1 text-[11px] font-bold text-ink/60 hover:bg-black/10"><Check size={12} /> סמן כנקרא</button>}
              </div>
              <p className="mt-1 text-[12px] text-ink/65">{a.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
