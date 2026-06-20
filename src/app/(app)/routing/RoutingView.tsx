"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { recomputeRoutingAction } from "@/lib/routing/actions";
import type { RoutingBoard } from "@/lib/routing/service";

const scoreTone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

export function RoutingView({ board }: { board: RoutingBoard }) {
  const router = useRouter();
  const { cc, twins, incoming, territory, signals } = board;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const recalc = () => { setError(null); setMsg(null); start(async () => { const r = await recomputeRoutingAction(); if (r.error) setError(r.error); else { setMsg(r.message ?? "חושב"); router.refresh(); } }); };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Lead Routing Intelligence</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מודיעין הקצאת לידים</h1>
          <p className="text-muted mt-1 text-sm">מי הכי סביר לסגור כל ליד — לפי טריטוריה, מומחיות, המרה ועומס. תאומי מודיעין לכל סוכן.</p>
        </div>
        <Button onClick={recalc} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{pending ? "מחשב…" : "חשב תאומי סוכנים ונתב"}</Button>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      {/* Command center */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="לידים נכנסים" value={cc.incoming} icon="Users" />
        <Stat label="בתור ניתוב" value={cc.queue} icon="Route" tone="text-brand-strong" />
        <Stat label="המלצות" value={cc.recommended} icon="Sparkles" tone="text-success" />
        <Stat label="הוקצו היום" value={cc.assignedToday} icon="UserCheck" />
        <Stat label="דיוק ניתוב" value={cc.routingAccuracy} suffix="%" icon="BarChart3" tone="text-success" />
        <Stat label="סוכנים עמוסים" value={cc.overloaded} icon="AlertTriangle" tone="text-danger" />
      </div>

      {twins.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Route" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין מודיעין ניתוב</p>
          <p className="text-muted max-w-sm text-sm">לחץ ״חשב תאומי סוכנים ונתב״ כדי לבנות פרופיל ביצועים לכל סוכן ולנתב לידים נכנסים.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Incoming leads + recommendation */}
          <div className="bg-card border-line rounded-[20px] border p-4 lg:col-span-2">
            <p className="text-ink mb-2 text-sm font-extrabold">לידים נכנסים — סוכן מומלץ</p>
            {incoming.length === 0 ? <p className="text-muted text-sm">אין לידים נכנסים</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-start text-sm">
                  <thead className="text-muted border-line border-b text-xs"><tr>{["ליד", "עיר", "סוכן מומלץ", "ציון ניתוב", "צפי סגירה"].map((h) => <th key={h} className="px-3 py-2 text-start font-bold">{h}</th>)}</tr></thead>
                  <tbody>
                    {incoming.map((l) => (
                      <tr key={l.leadId} className="border-line hover:bg-surface border-b last:border-0">
                        <td className="text-ink px-3 py-2 font-bold">{l.leadName}</td>
                        <td className="text-muted px-3 py-2">{l.city ?? "—"}</td>
                        <td className="text-ink px-3 py-2 font-semibold">{l.recommended ?? "— הרץ ניתוב"}</td>
                        <td className={cn("px-3 py-2 font-bold", scoreTone(l.score))}>{l.score || "—"}</td>
                        <td className={cn("px-3 py-2 font-bold", scoreTone(l.probability))}>{l.probability ? `${l.probability}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Agent rankings (twins) */}
          <div className="bg-card border-line rounded-[20px] border p-4 lg:col-span-2">
            <p className="text-ink mb-2 text-sm font-extrabold">דירוג סוכנים (תאומי מודיעין)</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-start text-sm">
                <thead className="text-muted border-line border-b text-xs"><tr>{["סוכן", "ציון", "המרה", "טריטוריה", "מומחיות", "זמינות", "מומנטום", "עומס פנוי", "עסקאות", "הכנסות"].map((h) => <th key={h} className="px-3 py-2 text-start font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {twins.map((t) => (
                    <tr key={t.id} className="border-line hover:bg-surface border-b last:border-0">
                      <td className="text-ink px-3 py-2 font-bold">{t.name}</td>
                      <td className={cn("px-3 py-2 font-black", scoreTone(t.agent_score))}>{t.agent_score}</td>
                      <td className={cn("px-3 py-2", scoreTone(t.conversion_score))}>{t.conversion_score}</td>
                      <td className={cn("px-3 py-2", scoreTone(t.territory_score))}>{t.territory_score}</td>
                      <td className={cn("px-3 py-2", scoreTone(t.expertise_score))}>{t.expertise_score}</td>
                      <td className={cn("px-3 py-2", scoreTone(t.responsiveness_score))}>{t.responsiveness_score}</td>
                      <td className={cn("px-3 py-2", scoreTone(t.momentum_score))}>{t.momentum_score}</td>
                      <td className={cn("px-3 py-2", t.workload_score < 35 ? "text-danger font-bold" : "text-muted")}>{t.workload_score}</td>
                      <td className="text-muted px-3 py-2">{t.total_closed_deals}</td>
                      <td className="text-muted px-3 py-2">{formatShekels(t.total_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Territory intelligence / team heatmap */}
          <div className="bg-card border-line rounded-[20px] border p-4">
            <p className="text-ink mb-2 text-sm font-extrabold">מפת חום צוותית — מוביל לפי אזור</p>
            {territory.length === 0 ? <p className="text-muted text-sm">אין נתוני טריטוריה</p> : (
              <ul className="flex flex-col gap-1.5">
                {territory.map((t) => (
                  <li key={t.locality} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink min-w-0 flex-1 truncate font-semibold">{t.locality}</span>
                    <span className="text-muted text-[11px]">{t.topAgent}</span>
                    <span className={cn("shrink-0 text-[11px] font-bold", t.deals < 2 ? "text-warning" : "text-success")}>{t.deals} עסקאות</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Signals / missed opportunities */}
          <div className="bg-card border-line rounded-[20px] border p-4">
            <p className="text-ink mb-2 text-sm font-extrabold">סיגנלים והזדמנויות</p>
            {signals.length === 0 ? <p className="text-muted text-sm">אין סיגנלים</p> : (
              <ul className="flex flex-col gap-1.5">
                {signals.map((s, i) => (
                  <li key={i} className="border-line border-b py-1.5 last:border-0 text-sm">
                    <p className={cn("font-semibold", s.type === "overloaded_top" ? "text-danger" : "text-warning")}>{s.title}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong", suffix = "" }: { label: string; value: number; icon: string; tone?: string; suffix?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-2xl font-black">{value}{suffix}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
