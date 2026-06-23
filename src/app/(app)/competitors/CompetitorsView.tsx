"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { recomputeCompetitorsAction } from "@/lib/competitor/actions";
import type { getCompetitorBoard } from "@/lib/competitor/service";

type Board = Awaited<ReturnType<typeof getCompetitorBoard>>;
const TYPE_LABEL: Record<string, string> = { agency: "משרד", office: "משרד", independent_broker: "מתווך", team: "צוות", unknown: "לא ידוע" };
const scoreTone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

export function CompetitorsView({ board, embedded = false }: { board: Board; embedded?: boolean }) {
  const router = useRouter();
  const { cc, competitors, localities, signals } = board;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const recalc = () => { setError(null); setMsg(null); start(async () => { const r = await recomputeCompetitorsAction(); if (r.error) setError(r.error); else { setMsg(r.message ?? "חושב"); router.refresh(); } }); };

  // When embedded under the premium dashboard, the dashboard owns the hero +
  // empty state + command center; this view becomes the full management table.
  if (embedded && competitors.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-ink text-lg font-black">רשימת מתחרים מלאה</h2>
            <p className="text-muted text-xs">דירוג מלא, שליטה לפי אזור ואיתותים.</p>
          </div>
        </div>
      ) : (
        <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
          <div>
            <p className="text-brand text-xs font-bold">ZONO Competitor Intelligence</p>
            <h1 className="text-ink mt-1 text-2xl font-black">מודיעין מתחרים</h1>
            <p className="text-muted mt-1 text-sm">מי שולט בכל אזור, מי מתחזק, מי נחלש, ואיפה כדאי למקד מאמצי גיוס.</p>
          </div>
          <Button onClick={recalc} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{pending ? "מחשב…" : "חשב מודיעין מתחרים"}</Button>
        </div>
      )}
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      {/* Command center (hidden when embedded — dashboard shows the KPI strip) */}
      {!embedded && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="מתחרים" value={cc.total} icon="Users" />
          <Stat label="שולטים" value={cc.dominant} icon="Flame" tone="text-danger" />
          <Stat label="מתחזקים" value={cc.growing} icon="TrendingUp" tone="text-success" />
          <Stat label="נחלשים" value={cc.declining} icon="TrendingDown" tone="text-warning" />
          <Stat label="הזדמנויות גיוס" value={cc.opportunities} icon="Building" tone="text-success" />
          <Stat label="ריכוזיות ממוצעת" value={cc.avgConcentration} icon="BarChart3" suffix="%" />
        </div>
      )}

      {competitors.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Users" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין נתוני מתחרים</p>
          <p className="text-muted max-w-sm text-sm">ודא שזוהו מתווכים (מודיעין מתווכים) ולחץ ״חשב מודיעין מתחרים״.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Competitor rankings */}
          <div className="bg-card border-line rounded-[20px] border p-4 lg:col-span-2">
            <p className="text-ink mb-2 text-sm font-extrabold">דירוג מתחרים</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-start text-sm">
                <thead className="text-muted border-line border-b text-xs"><tr>{["מתחרה", "סוג", "מודעות", "אזורים", "נתח שוק", "צמיחה", "בלעדיות", "הזדמנות", ""].map((h) => <th key={h} className="px-3 py-2 text-start font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {competitors.slice(0, 50).map((c) => (
                    <tr key={c.id} className="border-line hover:bg-surface border-b last:border-0">
                      <td className="px-3 py-2"><Link href={`/competitors/${c.id}`} className="text-ink hover:text-brand font-bold">{c.display_name}</Link></td>
                      <td className="text-muted px-3 py-2">{TYPE_LABEL[c.competitor_type] ?? c.competitor_type}</td>
                      <td className="text-muted px-3 py-2">{c.total_listings}</td>
                      <td className="text-muted px-3 py-2">{c.active_localities}</td>
                      <td className={cn("px-3 py-2 font-bold", scoreTone(c.market_share_score))}>{c.market_share_score}</td>
                      <td className={cn("px-3 py-2 font-bold", scoreTone(c.growth_score))}>{c.growth_score}</td>
                      <td className="text-muted px-3 py-2">{c.exclusivity_score}</td>
                      <td className={cn("px-3 py-2 font-bold", scoreTone(c.opportunity_score))}>{c.opportunity_score}</td>
                      <td className="px-3 py-2"><Link href={`/competitors/${c.id}`} className="text-brand-strong text-xs font-bold">פתח</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Locality rankings / market share */}
          <div className="bg-card border-line rounded-[20px] border p-4">
            <p className="text-ink mb-2 text-sm font-extrabold">שליטה לפי אזור</p>
            {localities.length === 0 ? <p className="text-muted text-sm">אין נתונים</p> : (
              <ul className="flex flex-col gap-1.5">
                {localities.slice(0, 12).map((l) => (
                  <li key={l.locality} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink min-w-0 flex-1 truncate font-semibold">{l.locality}</span>
                    <span className="text-muted text-[11px]">{l.leader} · {l.leaderShare}%</span>
                    <span className="text-muted shrink-0 text-[11px]">ריכוז {l.concentration}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Signals */}
          <div className="bg-card border-line rounded-[20px] border p-4">
            <p className="text-ink mb-2 text-sm font-extrabold">סיגנלים תחרותיים</p>
            {signals.length === 0 ? <p className="text-muted text-sm">אין סיגנלים</p> : (
              <ul className="flex flex-col gap-1.5">
                {signals.slice(0, 12).map((s) => (
                  <li key={s.id} className="border-line border-b py-1.5 last:border-0 text-sm">
                    <p className={cn("font-semibold", s.severity === "warning" ? "text-warning" : "text-ink")}>{s.title}</p>
                    <p className="text-muted text-[11px]">{s.description}</p>
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
