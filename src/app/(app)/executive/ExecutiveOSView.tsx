"use client";
// ============================================================================
// 🧠 ZONO — Executive Intelligence OS™ view. SCREEN 14. Premium office-manager
// cockpit (RTL). Everything is CONSUMED from existing engines — office score /
// health / risks / opportunities from Chief of Staff, brokers from Calendar OS,
// approvals from Approval Bundles, money & at-risk from the Deals board. Nothing
// recomputed, nothing auto-executed, no fabricated revenue or performance.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import { formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { askExecutiveAction } from "@/lib/executive-os/actions";
import type { ExecutiveOS, ExecItem, OfficeState, BriefPeriod } from "@/lib/executive-os/types";

export interface ExecDealsSummary {
  activeCount: number;
  pipelineValue: number;
  weightedRevenue: number;
  expectedCommission: number;
  atRisk: { id: string; title: string; risk: number; value: number; buyerId: string | null; propertyId: string | null; nextAction: string | null }[];
}

const STATE_HE: Record<OfficeState, string> = { healthy: "בריא", needs_attention: "דורש תשומת לב", critical: "קריטי", growth: "צמיחה", decline: "ירידה" };
const STATE_TONE: Record<OfficeState, string> = { healthy: "bg-success-soft text-success", growth: "bg-success-soft text-success", needs_attention: "bg-warning-soft text-warning", critical: "bg-danger-soft text-danger", decline: "bg-danger-soft text-danger" };
const scoreTone = (n: number) => (n >= 80 ? "text-success" : n >= 60 ? "text-brand" : n >= 40 ? "text-warning" : "text-danger");
const riskTone = (n: number) => (n >= 60 ? "text-danger" : n >= 35 ? "text-warning" : "text-success");
const time = (iso: string) => new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Section({ title, icon, count, action, children }: { title: string; icon: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name={icon} size={15} /></span><h2 className="text-ink text-sm font-extrabold">{title}{count != null ? ` (${count})` : ""}</h2></div>
        {action}
      </div>
      {children}
    </div>
  );
}
function Empty({ t }: { t: string }) { return <p className="text-muted text-sm">{t}</p>; }

function ItemBig({ it, kind }: { it: ExecItem; kind: "risk" | "opportunity" }) {
  const accent = kind === "risk" ? "bg-danger-soft text-danger" : "bg-success-soft text-success";
  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black ${accent}`}><Icon name={kind === "risk" ? "AlertTriangle" : "TrendingUp"} size={13} />{kind === "risk" ? "הסיכון הגדול ביותר" : "ההזדמנות הגדולה ביותר"}</span>
        <span className="text-muted text-[11px] font-bold">דחיפות {it.urgency}</span>
      </div>
      <p className="text-ink text-[16px] font-black leading-tight">{it.title}</p>
      {it.why && <p className="text-muted text-[13px] leading-relaxed">{it.why}</p>}
      {it.impact && <p className="text-ink text-[12px] font-bold">השפעה: {it.impact}</p>}
      {it.evidence.length > 0 && <p className="text-muted text-[11px]">📎 {it.evidence.slice(0, 2).join(" · ")}</p>}
      <p className="text-muted mt-auto text-[10px]">מקור: {it.sourceModule} · ביטחון {it.confidence}%</p>
    </div>
  );
}

export function ExecutiveOSView({ os, deals }: { os: ExecutiveOS; deals: ExecDealsSummary | null }) {
  const [brief, setBrief] = useState<BriefPeriod>("morning");
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState<{ answer: string; items: { title: string; detail: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const runAsk = (question: string) => { if (!question.trim()) return; start(async () => { const r = await askExecutiveAction(question); setAsk(r.result); }); };
  const briefing = os.briefings.find((b) => b.period === brief) ?? os.briefings[0];

  const topRisk = os.risks[0] ?? null;
  const topOpp = os.opportunities[0] ?? null;
  const firstAction = os.priorities[0] ?? null;
  const hasMoney = deals && deals.activeCount > 0;

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 pb-24 pt-5">
      {/* ── Cinematic executive hero ────────────────────────────────────────── */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]">
        <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-brand text-xs font-bold">ZONO Executive Intelligence OS</p>
            <h1 className="text-ink mt-0.5 text-2xl font-black sm:text-3xl">מרכז הפיקוד הניהולי</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATE_TONE[os.health.state]}`}>{STATE_HE[os.health.state]}</span>
              <span className="bg-card text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">מגמה {os.health.trend === "up" ? "עולה ↑" : os.health.trend === "down" ? "יורדת ↓" : "יציבה →"}</span>
            </div>
            {briefing && <p className="text-ink mt-2 max-w-xl text-[13px] font-semibold leading-relaxed">{briefing.headline}</p>}
          </div>
          <div className="bg-card grid h-24 w-24 shrink-0 place-items-center rounded-full text-center shadow-[var(--shadow-soft)]">
            <div><div className={`text-4xl font-black leading-none ${scoreTone(os.score.overall)}`}>{os.score.overall}</div><div className="text-muted mt-1 text-[10px] font-bold">{os.score.grade}</div></div>
          </div>
        </div>
      </div>

      {/* ── Money / pipeline ────────────────────────────────────────────────── */}
      <div className="mt-4">
        <Section title="כסף וצנרת" icon="BarChart3" action={<Link href="/deals" className="text-brand text-[12px] font-bold">מרכז עסקאות ←</Link>} >
          {hasMoney ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Money label="שווי צנרת" value={formatShekels(deals!.pipelineValue)} tone="text-ink" />
              <Money label="עמלה משוקללת" value={formatShekels(deals!.weightedRevenue)} tone="text-success" />
              <Money label="פוטנציאל עמלה" value={formatShekels(deals!.expectedCommission)} tone="text-brand-strong" />
              <Money label="עסקאות בסיכון" value={String(deals!.atRisk.length)} tone={deals!.atRisk.length ? "text-danger" : "text-success"} />
            </div>
          ) : (
            <div className="bg-surface rounded-2xl p-5 text-center">
              <p className="text-ink text-sm font-bold">אין עדיין מספיק נתוני עסקאות</p>
              <p className="text-muted mt-1 text-[12px]">כשייבנו עסקאות פעילות, סיכום ההכנסות והצנרת יופיע כאן. <Link href="/deals" className="text-brand font-bold">פתח מרכז עסקאות ←</Link></p>
            </div>
          )}
        </Section>
      </div>

      {/* ── Biggest opportunity vs biggest risk ─────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {topRisk ? <ItemBig it={topRisk} kind="risk" /> : <div className="bg-card border-line rounded-[20px] border p-5"><p className="text-danger text-[11px] font-black">הסיכון הגדול ביותר</p><p className="text-muted mt-2 text-sm">אין סיכונים בולטים כרגע ✓</p></div>}
        {topOpp ? <ItemBig it={topOpp} kind="opportunity" /> : <div className="bg-card border-line rounded-[20px] border p-5"><p className="text-success text-[11px] font-black">ההזדמנות הגדולה ביותר</p><p className="text-muted mt-2 text-sm">אין הזדמנויות בולטות כרגע.</p></div>}
      </div>

      {/* ── What to do first + briefing ─────────────────────────────────────── */}
      <div className="mt-4">
        <Section title="מה לעשות קודם" icon="Target" action={
          <div className="flex gap-1">{os.briefings.map((b) => <button key={b.period} onClick={() => setBrief(b.period)} className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${brief === b.period ? "zono-gradient text-white" : "bg-surface text-muted"}`}>{b.label.replace("תדריך ", "")}</button>)}</div>
        }>
          {firstAction && (
            <div className="bg-brand-soft mb-3 flex items-start gap-3 rounded-2xl p-3.5">
              <span className="bg-brand mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white"><Icon name="ArrowUpRight" size={16} /></span>
              <div className="min-w-0"><p className="text-brand text-[11px] font-bold">הפעולה הראשונה שלך</p><p className="text-ink text-[14px] font-black leading-snug">{firstAction.title}</p>{firstAction.why && <p className="text-muted mt-0.5 text-[12px]">{firstAction.why}</p>}</div>
            </div>
          )}
          {briefing ? <ul className="space-y-1">{briefing.points.map((p, i) => <li key={i} className="text-muted flex items-start gap-2 text-[13px]"><span className="bg-brand mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />{p}</li>)}</ul> : <Empty t="אין תדריך זמין." />}
        </Section>
      </div>

      {/* ── Two columns: brokers/deals · approvals/automation/dimensions ─────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Section title="השוואת ברוקרים · עומסים" icon="Users" count={os.brokerComparison.length}>
            {os.brokerComparison.length === 0 ? <Empty t="אין נתוני ברוקרים זמינים כרגע." /> : (
              <div className="space-y-2">{os.brokerComparison.map((b) => (
                <div key={b.brokerId} className="border-line flex items-center justify-between gap-2 rounded-2xl border p-3">
                  <div className="min-w-0"><p className="text-ink text-[13px] font-bold">{b.name ?? "ברוקר"}</p><p className="text-muted truncate text-[11px]">{b.label}{b.note ? ` · ${b.note}` : ""}</p></div>
                  {b.score != null && <span className={`text-lg font-black ${scoreTone(b.score)}`}>{b.score}</span>}
                </div>
              ))}</div>
            )}
            <p className="text-muted mt-2 text-[10px]">מבוסס על זמינות ועומס מ-Calendar OS — ללא חישוב ציון חדש.</p>
          </Section>

          <Section title="עסקאות בסיכון" icon="AlertTriangle" count={deals?.atRisk.length ?? 0} action={<Link href="/deals" className="text-brand text-[12px] font-bold">הכל ←</Link>}>
            {!deals || deals.atRisk.length === 0 ? <Empty t={deals ? "אין עסקאות בסיכון ✓" : "אין מספיק נתוני עסקאות."} /> : (
              <div className="space-y-2">{deals.atRisk.map((d) => (
                <div key={d.id} className="border-line rounded-2xl border p-3">
                  <div className="flex items-start justify-between gap-2"><p className="text-ink truncate text-[13px] font-bold">{d.title}</p><span className={`shrink-0 text-sm font-black ${riskTone(d.risk)}`}>סיכון {d.risk}</span></div>
                  <div className="bg-surface mt-2 h-1.5 w-full overflow-hidden rounded-full"><div className="bg-danger h-full rounded-full" style={{ width: `${d.risk}%` }} /></div>
                  {d.nextAction && <p className="text-brand-strong mt-1.5 text-[11px] font-bold">→ {d.nextAction}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {d.buyerId && <Link href={`/buyers/${d.buyerId}`} className="text-muted text-[11px] font-bold">קונה ↗</Link>}
                    {d.propertyId && <Link href={`/properties/${d.propertyId}`} className="text-muted text-[11px] font-bold">נכס ↗</Link>}
                  </div>
                </div>
              ))}</div>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="מרכז אישורים" icon="ListChecks" count={os.approvalCenter.count} action={<Link href="/automation" className="text-brand text-[12px] font-bold">אוטומציות ←</Link>}>
            {os.approvalCenter.count === 0 ? <Empty t="אין באנדלים ממתינים לאישור ✓" /> : (
              <div className="space-y-2">{os.approvalCenter.bundles.map((b) => {
                const body = <div className="border-line flex items-center justify-between gap-2 rounded-2xl border p-3"><span className="text-ink text-[13px] font-bold">{b.title}</span><span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[10px] font-bold">עדיפות {b.priority}</span></div>;
                return b.entityHref ? <Link key={b.bundleId} href={b.entityHref}>{body}</Link> : <div key={b.bundleId}>{body}</div>;
              })}</div>
            )}
            <p className="text-muted mt-2 text-[10px]">האישור מתבצע בעמוד הישות — שום פעולה לא רצה אוטומטית.</p>
          </Section>

          {os.automation && (
            <Link href="/automation" className="bg-card border-line block rounded-[20px] border p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-ink flex items-center gap-2 text-sm font-extrabold"><span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Zap" size={15} /></span> אוטומציות</h2>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${os.automation.state === "at_risk" ? "bg-danger-soft text-danger" : os.automation.state === "needs_attention" ? "bg-warning-soft text-warning" : os.automation.state === "idle" ? "bg-line/70 text-muted" : "bg-success-soft text-success"}`}>{os.automation.state === "healthy" ? "תקין" : os.automation.state === "needs_attention" ? "דורש תשומת לב" : os.automation.state === "at_risk" ? "בסיכון" : "לא פעיל"}</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[["הצלחה", `${os.automation.successRate}%`], ["אישור", `${os.automation.approvalRate}%`], ["ממתינות", os.automation.pending], ["הצעות", os.automation.suggested]].map(([l, v]) => (
                  <div key={String(l)} className="bg-surface rounded-xl px-1 py-2 text-center"><div className="text-brand text-base font-black">{v as string | number}</div><div className="text-muted text-[9px] font-bold">{l as string}</div></div>
                ))}
              </div>
            </Link>
          )}

          <Section title="ממדי ציון הארגון" icon="BarChart3">
            <div className="grid grid-cols-2 gap-2">{os.score.dimensions.map((d) => (
              <div key={d.key} className="border-line rounded-xl border p-2.5">
                <div className="flex items-center justify-between"><span className="text-ink text-[12px] font-bold">{d.label}</span><span className={`text-sm font-black ${d.score == null ? "text-muted" : scoreTone(d.score)}`}>{d.score ?? "—"}</span></div>
                <p className="text-muted mt-0.5 text-[10px]">{d.status === "insufficient" ? "אין מספיק נתונים" : d.basis}</p>
              </div>
            ))}</div>
          </Section>
        </div>
      </div>

      {/* ── Timeline ────────────────────────────────────────────────────────── */}
      <div className="mt-4">
        <Section title="ציר זמן ניהולי מאוחד" icon="Clock">
          {os.timeline.length === 0 ? <Empty t="אין אירועים אחרונים." /> : (
            <div className="space-y-2">{os.timeline.slice(0, 8).map((e, i) => {
              const body = <div className="border-line flex items-center gap-3 rounded-2xl border p-3"><span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-xl"><Icon name="Clock" size={14} /></span><div className="min-w-0 flex-1"><p className="text-ink truncate text-[13px] font-bold">{e.title}</p><p className="text-muted truncate text-[11px]">{e.kind}{e.detail ? ` · ${e.detail}` : ""} · {time(e.at)}</p></div></div>;
              return e.href ? <Link key={i} href={e.href}>{body}</Link> : <div key={i}>{body}</div>;
            })}</div>
          )}
        </Section>
      </div>

      {/* ── Ask Executive AI ────────────────────────────────────────────────── */}
      <div className="mt-4">
        <Section title="שאל את המנהל AI" icon="Sparkles">
          <div className="flex flex-wrap gap-1.5">{["על מה להתמקד?", "איפה אני מפסיד כסף?", "איפה אצמח הכי מהר?", "איזה ברוקר צריך עזרה?", "מה הסיכון הגדול?"].map((sg) => <button key={sg} onClick={() => runAsk(sg)} className="bg-surface text-ink rounded-full px-2.5 py-1 text-[11px] font-bold">{sg}</button>)}</div>
          <div className="mt-2 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAsk(q)} placeholder="שאלה ניהולית…" className="border-line bg-surface text-ink w-full rounded-xl border px-3 py-2 text-sm outline-none" />
            <button onClick={() => runAsk(q)} disabled={pending} className="zono-gradient shrink-0 rounded-xl px-3 text-white disabled:opacity-50"><Icon name="Send" size={16} /></button>
          </div>
          {ask && <div className="mt-2"><p className="text-ink text-[13px] font-bold">{ask.answer}</p><div className="mt-1 space-y-1">{ask.items.map((it, i) => <div key={i} className="bg-surface rounded-lg px-2.5 py-1.5"><p className="text-ink text-[12px] font-bold">{it.title}</p><p className="text-muted text-[11px]">{it.detail}</p></div>)}</div></div>}
        </Section>
      </div>

      {os.notes[0] && <p className="text-muted mt-6 text-center text-[10px]">{os.notes[0]}</p>}
    </div>
  );
}

function Money({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-surface rounded-2xl p-3 text-center">
      <p className={`text-xl font-black sm:text-2xl ${tone}`}>{value}</p>
      <p className="text-muted mt-0.5 text-[11px] font-bold">{label}</p>
    </div>
  );
}
