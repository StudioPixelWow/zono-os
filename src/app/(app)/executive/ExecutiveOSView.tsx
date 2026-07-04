"use client";
// ============================================================================
// 🧠 ZONO — Executive Intelligence OS™ view. PHASE 45.0. Premium RTL glass.
// Renders the composed executive brain. All data is consumed from existing
// engines (score/health/recs from Chief of Staff, timeline from Daily OS,
// approval center from Approval Bundles, brokers from calendar availability).
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { askExecutiveAction } from "@/lib/executive-os/actions";
import type { ExecutiveOS, ExecItem, OfficeState, BriefPeriod } from "@/lib/executive-os/types";

const STATE_HE: Record<OfficeState, string> = { healthy: "בריא", needs_attention: "דורש תשומת לב", critical: "קריטי", growth: "צמיחה", decline: "ירידה" };
const STATE_TONE: Record<OfficeState, string> = { healthy: "bg-success-soft text-success", growth: "bg-success-soft text-success", needs_attention: "bg-warning-soft text-warning", critical: "bg-danger-soft text-danger", decline: "bg-danger-soft text-danger" };
const scoreTone = (n: number) => (n >= 80 ? "text-success" : n >= 60 ? "text-brand" : n >= 40 ? "text-warning" : "text-danger");
const time = (iso: string) => new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function ItemCard({ it, tone }: { it: ExecItem; tone: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-ink text-[13px] font-black">{it.title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>דחיפות {it.urgency}</span>
      </div>
      {it.why && <p className="text-muted mt-0.5 text-[12px]">{it.why}</p>}
      {it.evidence.length > 0 && <p className="text-muted mt-1 text-[10px]">📎 {it.evidence.slice(0, 2).join(" · ")}</p>}
      <p className="text-muted mt-1 text-[10px]">מקור: {it.sourceModule} · ביטחון {it.confidence}%</p>
    </div>
  );
}

export function ExecutiveOSView({ os }: { os: ExecutiveOS }) {
  const [tab, setTab] = useState<"overview" | "priorities" | "timeline" | "approvals" | "brokers">("overview");
  const [brief, setBrief] = useState<BriefPeriod>("morning");
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState<{ answer: string; items: { title: string; detail: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const runAsk = (question: string) => { if (!question.trim()) return; start(async () => { const r = await askExecutiveAction(question); setAsk(r.result); }); };
  const briefing = os.briefings.find((b) => b.period === brief) ?? os.briefings[0];

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      {/* Score header */}
      <div className="bg-brand-soft rounded-[22px] p-4">
        <p className="text-brand text-xs font-bold">ZONO Executive Intelligence OS</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-ink text-2xl font-black">🧠 המוח הניהולי</h1>
            <p className="text-muted mt-0.5 text-[12px]">ציון הארגון · נצרך מ-Chief of Staff (ללא חישוב כפול)</p>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-black ${scoreTone(os.score.overall)}`}>{os.score.overall}</div>
            <div className="text-muted text-[10px] font-bold">{os.score.grade} · ביטחון {os.score.confidence}%</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATE_TONE[os.health.state]}`}>{STATE_HE[os.health.state]}</span>
          <span className="bg-card text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">מגמה {os.health.trend === "up" ? "📈" : os.health.trend === "down" ? "📉" : "➡️"}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card border-line mt-4 flex gap-1 overflow-x-auto rounded-2xl border p-1">
        {([["overview", "סקירה"], ["priorities", "עדיפויות"], ["timeline", "ציר זמן"], ["approvals", `אישורים ${os.approvalCenter.count}`], ["brokers", "ברוקרים"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold transition ${tab === k ? "zono-gradient text-white" : "text-muted"}`}>{l}</button>
        ))}
      </div>

      {/* Ask */}
      <div className="bg-card border-line mt-3 rounded-2xl border p-3">
        <div className="text-brand text-[13px] font-black">✨ שאל את המנהל AI</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{["על מה להתמקד?", "איפה אני מפסיד כסף?", "איפה אצמח הכי מהר?", "איזה ברוקר צריך עזרה?", "מה הסיכון הגדול?"].map((sg) => <button key={sg} onClick={() => runAsk(sg)} className="bg-surface text-ink rounded-full px-2.5 py-1 text-[11px] font-bold">{sg}</button>)}</div>
        <div className="mt-2 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAsk(q)} placeholder="שאלה ניהולית…" className="border-line bg-surface text-ink w-full rounded-xl border px-3 py-2 text-sm outline-none" />
          <button onClick={() => runAsk(q)} disabled={pending} className="zono-gradient rounded-xl px-3 text-white disabled:opacity-50"><Icon name="Send" size={16} /></button>
        </div>
        {ask && <div className="mt-2"><p className="text-ink text-[13px] font-bold">{ask.answer}</p><div className="mt-1 space-y-1">{ask.items.map((it, i) => <div key={i} className="bg-surface rounded-lg px-2.5 py-1.5"><p className="text-ink text-[12px] font-bold">{it.title}</p><p className="text-muted text-[11px]">{it.detail}</p></div>)}</div></div>}
      </div>

      {tab === "overview" && (
        <div className="mt-4 space-y-4">
          {/* Briefing */}
          <div className="bg-card border-line rounded-2xl border p-4">
            <div className="flex items-center justify-between"><h2 className="text-ink text-[15px] font-black">תדריך מנהלים</h2>
              <div className="flex gap-1">{os.briefings.map((b) => <button key={b.period} onClick={() => setBrief(b.period)} className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${brief === b.period ? "zono-gradient text-white" : "bg-surface text-muted"}`}>{b.label.replace("תדריך ", "")}</button>)}</div>
            </div>
            {briefing && <><p className="text-ink mt-2 text-[13px] font-bold">{briefing.headline}</p><ul className="mt-1 space-y-0.5">{briefing.points.map((p, i) => <li key={i} className="text-muted text-[12px]">• {p}</li>)}</ul></>}
          </div>
          {/* Dimensions */}
          <div>
            <h2 className="text-ink mb-2 text-[15px] font-black">ממדי ציון (נצרכים מהמנועים)</h2>
            <div className="grid grid-cols-2 gap-2">{os.score.dimensions.map((d) => (
              <div key={d.key} className="bg-card border-line rounded-xl border p-2.5">
                <div className="flex items-center justify-between"><span className="text-ink text-[12px] font-bold">{d.label}</span><span className={`text-sm font-black ${d.score == null ? "text-muted" : scoreTone(d.score)}`}>{d.score ?? "—"}</span></div>
                <p className="text-muted mt-0.5 text-[10px]">{d.status === "insufficient" ? "אין נתונים" : d.basis}</p>
              </div>
            ))}</div>
          </div>
          {/* Risks + Opportunities preview */}
          <div className="grid grid-cols-1 gap-3">
            <div><h2 className="text-ink mb-2 text-[15px] font-black">⚠️ סיכונים ({os.risks.length})</h2>{os.risks.length === 0 ? <Empty t="אין סיכונים בולטים." /> : <div className="space-y-2">{os.risks.slice(0, 3).map((r) => <ItemCard key={r.id} it={r} tone="bg-danger-soft text-danger" />)}</div>}</div>
            <div><h2 className="text-ink mb-2 text-[15px] font-black">🚀 הזדמנויות ({os.opportunities.length})</h2>{os.opportunities.length === 0 ? <Empty t="אין הזדמנויות בולטות." /> : <div className="space-y-2">{os.opportunities.slice(0, 3).map((o) => <ItemCard key={o.id} it={o} tone="bg-success-soft text-success" />)}</div>}</div>
          </div>
        </div>
      )}

      {tab === "priorities" && (
        <div className="mt-4 space-y-4">
          <div><h2 className="text-ink mb-2 text-[15px] font-black">🎯 עדיפויות עליונות ({os.priorities.length})</h2>{os.priorities.length === 0 ? <Empty t="אין עדיפויות פתוחות." /> : <div className="space-y-2">{os.priorities.map((p) => <ItemCard key={p.id} it={p} tone="bg-brand-soft text-brand-strong" />)}</div>}</div>
          <div><h2 className="text-ink mb-2 text-[15px] font-black">החלטות מוכנות</h2>{os.decisions.length === 0 ? <Empty t="אין החלטות." /> : <div className="space-y-2">{os.decisions.map((d, i) => (
            <div key={i} className="bg-card border-line rounded-2xl border p-3"><p className="text-ink text-[13px] font-black">{d.title}</p><p className="text-muted mt-0.5 text-[11px]">השפעה: {d.impact} · סיכון: {d.risk} · עלות: {d.cost}</p><p className="text-muted text-[11px]">מודולים: {d.affectedModules.join(", ")} · ביטחון {d.confidence}%</p>{d.approvalRequired && <span className="bg-warning-soft text-warning mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold">דורש אישור</span>}</div>
          ))}</div>}</div>
        </div>
      )}

      {tab === "timeline" && (
        <section className="mt-4"><h2 className="text-ink mb-2 text-[15px] font-black">🕒 ציר זמן ניהולי מאוחד</h2>{os.timeline.length === 0 ? <Empty t="אין אירועים." /> : <div className="space-y-2">{os.timeline.map((e, i) => {
          const body = <div className="bg-card border-line flex items-center gap-3 rounded-2xl border p-3"><span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-xl"><Icon name="Clock" size={14} /></span><div className="min-w-0 flex-1"><p className="text-ink truncate text-[13px] font-bold">{e.title}</p><p className="text-muted truncate text-[11px]">{e.kind}{e.detail ? ` · ${e.detail}` : ""} · {time(e.at)}</p></div></div>;
          return e.href ? <Link key={i} href={e.href}>{body}</Link> : <div key={i}>{body}</div>;
        })}</div>}</section>
      )}

      {tab === "approvals" && (
        <section className="mt-4"><h2 className="text-ink mb-2 text-[15px] font-black">🎁 מרכז אישורים ({os.approvalCenter.count})</h2>{os.approvalCenter.count === 0 ? <Empty t="אין באנדלים ממתינים." /> : <div className="space-y-2">{os.approvalCenter.bundles.map((b) => {
          const body = <div className="bg-card border-line flex items-center justify-between gap-2 rounded-2xl border p-3"><span className="text-ink text-[13px] font-bold">{b.title}</span><span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[10px] font-bold">עדיפות {b.priority}</span></div>;
          return b.entityHref ? <Link key={b.bundleId} href={b.entityHref}>{body}</Link> : <div key={b.bundleId}>{body}</div>;
        })}</div>}<p className="text-muted mt-2 text-[10px]">אישור מתבצע בעמוד הישות — שום פעולה לא רצה אוטומטית.</p></section>
      )}

      {tab === "brokers" && (
        <section className="mt-4"><h2 className="text-ink mb-2 text-[15px] font-black">👥 השוואת ברוקרים</h2>{os.brokerComparison.length === 0 ? <Empty t="אין נתוני ברוקרים." /> : <div className="space-y-2">{os.brokerComparison.map((b) => (
          <div key={b.brokerId} className="bg-card border-line flex items-center justify-between gap-2 rounded-2xl border p-3"><div><p className="text-ink text-[13px] font-bold">{b.name ?? "ברוקר"}</p><p className="text-muted text-[11px]">{b.label}{b.note ? ` · ${b.note}` : ""}</p></div>{b.score != null && <span className={`text-lg font-black ${scoreTone(b.score)}`}>{b.score}</span>}</div>
        ))}</div>}<p className="text-muted mt-2 text-[10px]">מבוסס על זמינות ועומס מ-Calendar OS — ללא חישוב ציון חדש.</p></section>
      )}

      <p className="text-muted mt-6 text-center text-[10px]">{os.notes[0]}</p>
    </div>
  );
}

function Empty({ t }: { t: string }) { return <div className="bg-card border-line rounded-2xl border p-6 text-center"><p className="text-muted text-sm font-bold">{t}</p></div>; }
