"use client";
// ============================================================================
// ZONO Brokerage EVOLUTION INTELLIGENCE™ — historical BI dashboard (RTL).
// Added BELOW the Knowledge Layer (additive, modular). Surfaces the temporal
// intelligence: a Time Machine (replay the market at any past month), growth
// leaders (rising/declining offices & agents), neighborhood dominance, market
// DNA per city, and trend-based predictions. Predictions are framed as
// estimates with confidence + evidence — NEVER as fact. Owner gets recompute.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import {
  getEvolutionDashboardAction, getMarketAtDateAction, recomputeEvolutionAction,
} from "@/lib/brokerage-data/evolution/actions";
import type { EvolutionDashboard, TimeMachineSnapshot } from "@/lib/brokerage-data/evolution/service";
import type { GrowthRow } from "@/lib/brokerage-data/evolution/types";

type Tab = "timemachine" | "leaders" | "neighborhoods" | "market" | "predictions";

const PRED_HE: Record<string, string> = { office_growth: "צמיחת משרד", office_decline: "האטת משרד", branch_expansion: "התרחבות סניפים", office_closure: "סיכון סגירה", agent_movement: "תנועת סוכן", specialization_change: "שינוי התמחות" };
const COMP_HE: Record<string, string> = { low: "תחרות נמוכה", medium: "תחרות בינונית", high: "תחרות גבוהה" };

function Badge({ children, tone = "white" }: { children: React.ReactNode; tone?: "white" | "green" | "amber" | "red" | "violet" }) {
  const c = tone === "green" ? "bg-emerald-500/15 text-emerald-300" : tone === "amber" ? "bg-amber-500/15 text-amber-300" : tone === "red" ? "bg-rose-500/15 text-rose-300" : tone === "violet" ? "bg-violet-500/15 text-violet-200" : "bg-white/10 text-white/70";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${c}`}>{children}</span>;
}
function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className={`text-2xl font-black ${tone ?? "text-white"}`}>{value}</div><div className="mt-1 text-xs font-bold text-white/55">{label}</div></div>;
}
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-sm text-white/50">{text}</div>; }

function LeaderList({ title, rows, positive }: { title: string; rows: GrowthRow[]; positive: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-black text-white/80">
        <Icon name={positive ? "TrendingUp" : "TrendingDown"} size={15} className={positive ? "text-emerald-300" : "text-rose-300"} />{title}
      </h4>
      {rows.length === 0 ? <Empty text="אין מספיק היסטוריה עדיין." /> : (
        <div className="grid gap-1.5">
          {rows.map((r, i) => (
            <div key={`${r.key}_${i}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-white/80">{i + 1}. {r.label}{r.city ? ` · ${r.city}` : ""}</span>
              <span className="flex items-center gap-2 text-xs text-white/55"><Badge tone={positive ? "green" : "red"}>{r.deltaPct > 0 ? "+" : ""}{r.deltaPct}%</Badge>{r.prev}→{r.curr}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EvolutionView() {
  const router = useRouter();
  const [data, setData] = useState<EvolutionDashboard | null>(null);
  const [tab, setTab] = useState<Tab>("timemachine");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tmDate, setTmDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tm, setTm] = useState<TimeMachineSnapshot | null>(null);

  useEffect(() => { getEvolutionDashboardAction().then(setData).catch(() => setData(null)); }, []);

  const recompute = () => {
    setMsg(null); setErr(null);
    start(async () => {
      const r = await recomputeEvolutionAction();
      if (r?.error) setErr(r.error);
      else { if (r?.message) setMsg(r.message); setData(await getEvolutionDashboardAction()); router.refresh(); }
    });
  };
  const replay = () => { setTm(null); start(async () => { setTm(await getMarketAtDateAction(tmDate)); }); };

  if (!data) {
    return <section dir="rtl" className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/50">טוען מנוע אבולוציה…</section>;
  }
  const owner = data.access.isOwner;

  const tabs: { id: Tab; label: string }[] = [
    { id: "timemachine", label: "מכונת זמן" },
    { id: "leaders", label: "מובילי צמיחה" },
    { id: "neighborhoods", label: `שכונות (${data.neighborhoodLeaders.length})` },
    { id: "market", label: "DNA שוק" },
    { id: "predictions", label: `תחזיות (${data.predictions.length})` },
  ];

  return (
    <section dir="rtl" className="flex flex-col gap-5">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0c1a2e] via-[#111d40] to-[#0a1429] p-6">
        <div className="pointer-events-none absolute -bottom-24 -end-24 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white sm:text-2xl">מנוע אבולוציה — מודיעין היסטורי לאורך זמן</h2>
            <p className="mt-1 max-w-2xl text-sm text-white/60">איך משרדים, סוכנים, שכונות והשוק מתפתחים לאורך זמן: מכונת זמן, מובילי צמיחה, שליטה שכונתית, DNA שוק ותחזיות מבוססות מגמה. כל תחזית מלווה בביטחון והסבר — הערכה בלבד, לא ודאות. מידע ציבורי/עסקי בלבד.</p>
          </div>
          {owner && <Button size="sm" onClick={recompute} disabled={pending} leadingIcon={<Icon name="Sparkles" size={15} />}>חשב אבולוציה מחדש</Button>}
        </div>
        {(msg || err) && <p className={`relative mt-3 text-sm font-bold ${err ? "text-rose-300" : "text-emerald-300"}`}>{err ?? msg}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-xl px-3 py-1.5 text-sm font-bold transition ${tab === t.id ? "bg-brand-strong text-white" : "border border-white/10 bg-white/5 text-white/60 hover:text-white"}`}>{t.label}</button>
        ))}
      </div>

      {/* ── Time Machine ── */}
      {tab === "timemachine" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Icon name="Clock" size={18} className="text-cyan-300" />
            <span className="text-sm font-bold text-white/70">הצג את תמונת השוק נכון לתאריך:</span>
            <input type="date" value={tmDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setTmDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white [color-scheme:dark]" />
            <Button size="sm" onClick={replay} disabled={pending}>הצג</Button>
          </div>
          {!tm ? <Empty text={pending ? "משחזר את ההיסטוריה…" : "בחר תאריך ולחץ 'הצג' כדי לשחזר את תמונת השוק כפי שהייתה."} /> : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="נכון לתאריך" value={tm.date} tone="text-cyan-300" />
                <Stat label="משרדים פעילים" value={tm.market.offices} />
                <Stat label="סוכנים פעילים" value={tm.market.agents} />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="mb-2 text-sm font-black text-white/80">משרדים מובילים (לפי מלאי) באותו זמן</h4>
                {tm.market.topOffices.length === 0 ? <Empty text="אין נתונים לתאריך זה." /> : (
                  <div className="grid gap-1.5">
                    {tm.market.topOffices.map((o, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-white/80">{i + 1}. {o.label}{o.city ? ` · ${o.city}` : ""}</span>
                        <span className="text-xs text-white/55">{o.listings} מודעות</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Growth leaders ── */}
      {tab === "leaders" && (
        <div className="grid gap-3 md:grid-cols-2">
          <LeaderList title="משרדים בצמיחה" rows={data.officeLeaders.rising} positive />
          <LeaderList title="משרדים בהאטה" rows={data.officeLeaders.declining} positive={false} />
          <LeaderList title="סוכנים בצמיחה" rows={data.agentLeaders.rising} positive />
          <LeaderList title="סוכנים בהאטה" rows={data.agentLeaders.declining} positive={false} />
        </div>
      )}

      {/* ── Neighborhood dominance ── */}
      {tab === "neighborhoods" && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.neighborhoodLeaders.length === 0 && <Empty text="אין נתוני שכונות עדיין — הרץ חישוב אבולוציה." />}
          {data.neighborhoodLeaders.map((nb, i) => (
            <div key={`${nb.city}_${nb.neighborhood}_${i}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-black text-white">{nb.neighborhood}<span className="text-white/45"> · {nb.city}</span></span>
                <Badge tone={nb.competitionLevel === "high" ? "green" : nb.competitionLevel === "medium" ? "amber" : "violet"}>{COMP_HE[nb.competitionLevel ?? ""] ?? "—"}</Badge>
              </div>
              <p className="mt-2 text-[11px] text-white/55">{nb.listingVolume} מודעות · נתח מוביל {nb.marketShare}% · ריכוזיות {Math.round(nb.concentration * 100)}%{nb.avgPrice ? ` · ממוצע ₪${nb.avgPrice.toLocaleString()}` : ""}</p>
              <div className="mt-2 text-[11px] text-white/40">ביטחון {nb.confidence}%</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Market DNA ── */}
      {tab === "market" && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.marketDna.length === 0 && <Empty text="אין נתוני DNA שוק עדיין." />}
          {data.marketDna.map((m, i) => (
            <div key={`${m.city}_${i}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between"><span className="text-sm font-black text-white">{m.city}</span><Badge tone="violet">{m.dominantOfficeCategory}</Badge></div>
              <p className="mt-2 text-[11px] text-white/55">סוג נכס מוביל: {m.dominantPropertyCategory} · עצמת תחרות {m.competitionIntensity}%</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge tone="amber">יוקרה {m.luxuryConcentration}%</Badge>
                <Badge>{m.officeDensity} משרדים</Badge>
                <Badge>{m.agentDensity} סוכנים</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Predictions ── */}
      {tab === "predictions" && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.predictions.length === 0 && <Empty text="אין מספיק היסטוריה לתחזיות עדיין. תחזיות נוצרות לאחר מספר חודשי מעקב." />}
          {data.predictions.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-black text-white">{PRED_HE[p.predictionType] ?? p.predictionType}{p.city ? <span className="text-white/45"> · {p.city}</span> : null}</div>
                <Badge tone={p.confidence >= 70 ? "green" : p.confidence >= 50 ? "amber" : "white"}>ביטחון {p.confidence}%</Badge>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-white/55">
                <span>סבירות {p.likelihood}%</span><span>·</span><span>אופק {p.horizonDays} ימים</span>
              </div>
              {p.evidence.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{p.evidence.slice(0, 4).map((e, i) => <Badge key={i}>{e}</Badge>)}</div>}
              {p.explanation && <p className="mt-2 text-[11px] text-violet-300">{p.explanation}</p>}
              <p className="mt-1 text-[10px] text-white/35">הערכה בלבד — לא ודאות.</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-white/35">מנוע אבולוציה — חישוב דטרמיניסטי על בסיס היסטוריה מצטברת. תחזיות אינן עובדות. מידע ציבורי/עסקי בלבד · ללא מחיקה אוטומטית · הסבר לכל פלט.</p>
    </section>
  );
}
