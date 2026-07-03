"use client";
// ============================================================================
// 📣 ZONO — Marketing Core — Marketing Dashboard. 33.0.
// Dashboard / Campaign Library / Calendar / Audience Center / Budget Center /
// Approvals / Insights + Marketing Ask. Read-only over the computed workspace;
// nothing publishes, nothing auto-executes. Glass, RTL, mobile-first.
// ============================================================================
import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { OBJECTIVE_HE, CHANNEL_HE, STATUS_HE, PRIORITY_HE, APPROVAL_HE } from "@/lib/marketing-core/types";
import type { MarketingWorkspace, Campaign } from "@/lib/marketing-core/types";

const fmt = (n: number) => `₪${n.toLocaleString("he-IL")}`;
const TABS = [
  { id: "dashboard", label: "לוח בקרה", icon: "LayoutGrid" }, { id: "campaigns", label: "ספריית קמפיינים", icon: "Megaphone" },
  { id: "calendar", label: "לוח שנה", icon: "Calendar" }, { id: "audiences", label: "קהלים", icon: "Users" },
  { id: "budget", label: "תקציב", icon: "Wallet" }, { id: "approvals", label: "אישורים", icon: "ShieldCheck" }, { id: "insights", label: "תובנות", icon: "Sparkles" },
];
const IMPACT_HE: Record<string, string> = { high: "השפעה גבוהה", medium: "השפעה בינונית", low: "השפעה נמוכה" };

export function MarketingDashboard({ workspace }: { workspace: MarketingWorkspace }) {
  const [tab, setTab] = useState("dashboard");
  const ws = workspace;

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Marketing Core</p>
          <h1 className="text-ink mt-1 flex items-center gap-2 text-2xl font-black"><Icon name="Megaphone" size={22} /> מערכת השיווק</h1>
          <p className="text-muted mt-1 text-sm">תכנון, קהלים, תקציב ואישורים — הכל מבוסס נתונים. שום דבר לא מתפרסם ולא רץ אוטומטית.</p>
        </div>
        <div className="text-end">
          <div className="text-3xl font-black" style={{ color: "var(--brand, #7c3aed)" }}>{ws.health.score}</div>
          <div className="text-muted text-[11px] font-bold">בריאות שיווקית · {ws.health.label}</div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold transition", tab === t.id ? "bg-brand text-white" : "bg-card text-muted hover:bg-brand-soft")}>
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>

      {ws.campaigns.length === 0 && tab !== "insights" && (
        <div className="bg-card border-line rounded-[22px] border p-10 text-center"><p className="text-ink text-lg font-black">אין עדיין תוכנית שיווק</p><p className="text-muted mt-1 text-sm">{ws.notes[0] ?? "הוסיפו קונים, מוכרים ונכסים כדי שה-AI יבנה תוכנית."}</p></div>
      )}

      {tab === "dashboard" && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="קמפיינים בתכנון" value={`${ws.health.activeCampaigns}`} />
            <Stat label="כיסוי יעדים" value={`${ws.health.coverage}%`} />
            <Stat label="אישורים ממתינים" value={`${ws.health.pendingApprovals}`} />
            <Stat label="קהלים זמינים" value={`${ws.audiences.length}`} />
          </section>
          <section className="mt-2"><h2 className="text-ink mb-2 text-lg font-black">קמפיינים מובילים</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ws.campaigns.slice(0, 6).map((c) => <CampaignCard key={c.id} c={c} />)}</div>
          </section>
        </>
      )}

      {tab === "campaigns" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ws.campaigns.map((c) => <CampaignCard key={c.id} c={c} detailed />)}</div>
      )}

      {tab === "calendar" && (
        <div className="bg-card border-line rounded-[22px] border p-4">
          {ws.calendar.length === 0 ? <p className="text-muted p-6 text-center text-sm">אין אירועים בלוח.</p> : (
            <ol className="space-y-2">{ws.calendar.map((e, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-slate-100 py-2 last:border-0">
                <span className="bg-brand-soft text-brand rounded-lg px-2 py-1 text-[11px] font-bold">{e.date}</span>
                <span className="text-[12px]">{e.kind === "launch" ? "🚀" : e.kind === "reminder" ? "🔔" : "📊"}</span>
                <span className="text-ink text-[13px] font-bold">{e.name}</span>
                <span className="text-muted text-[11px]">{e.note}</span>
              </li>
            ))}</ol>
          )}
        </div>
      )}

      {tab === "audiences" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ws.audiences.map((a) => (
          <div key={a.kind} className="bg-card border-line rounded-[18px] border p-4">
            <div className="flex items-center justify-between"><h3 className="text-ink text-[15px] font-black">{a.label}</h3><span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[11px] font-bold">{a.size}</span></div>
            <div className="text-muted mt-1 text-[11px]">איכות התאמה {a.matchQuality}/100</div>
            <ul className="mt-2 flex flex-wrap gap-1">{a.evidence.map((e, i) => <li key={i} className="bg-surface text-ink rounded px-2 py-0.5 text-[11px]">{e}</li>)}</ul>
          </div>
        ))}</div>
      )}

      {tab === "budget" && (
        <div className="bg-card border-line overflow-x-auto rounded-[22px] border p-4">
          <table className="w-full text-right text-[13px]">
            <thead className="text-muted text-[11px]"><tr><th className="p-2">קמפיין</th><th className="p-2">מינימום</th><th className="p-2">מומלץ</th><th className="p-2">אידיאלי</th><th className="p-2">חשיפה</th><th className="p-2">לידים</th><th className="p-2">ROI</th><th className="p-2">ביטחון</th></tr></thead>
            <tbody>{ws.campaigns.map((c) => (
              <tr key={c.id} className="border-t border-slate-100"><td className="text-ink p-2 font-bold">{c.name}</td><td className="p-2">{fmt(c.budget.min)}</td><td className="text-brand p-2 font-black">{fmt(c.budget.recommended)}</td><td className="p-2">{fmt(c.budget.ideal)}</td><td className="p-2">{c.budget.expectedReach.toLocaleString("he-IL")}</td><td className="p-2">~{c.budget.expectedLeads}</td><td className="p-2">{c.budget.expectedRoi}</td><td className="p-2">{c.budget.confidence}%</td></tr>
            ))}</tbody>
          </table>
          <p className="text-muted mt-2 text-[11px]">כל הנתונים הם הערכות המבוססות על מדדי שוק — לא הבטחה.</p>
        </div>
      )}

      {tab === "approvals" && (
        <div className="bg-card border-line rounded-[22px] border p-4">
          {ws.pendingApprovals.length === 0 ? <p className="text-muted p-6 text-center text-sm">אין אישורים ממתינים.</p> : (
            <ul className="space-y-2">{ws.pendingApprovals.map((p, i) => (
              <li key={i} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2">
                <span className="text-ink text-[13px] font-bold">{p.campaignName}</span>
                <span className="bg-warning-soft text-warning rounded-full px-2 py-0.5 text-[11px] font-bold">{APPROVAL_HE[p.approval.type]} · ממתין</span>
              </li>
            ))}</ul>
          )}
          <p className="text-muted mt-2 text-[11px]">כל שלב מחייב אישור אנושי מפורש. שום דבר אינו מתפרסם או מופעל אוטומטית בשלב זה.</p>
        </div>
      )}

      {tab === "insights" && (
        <div className="grid gap-3 sm:grid-cols-2">{ws.insights.length === 0 ? <p className="text-muted p-6 text-center text-sm">אין עדיין תובנות.</p> : ws.insights.map((ins, i) => (
          <div key={i} className="bg-card border-line rounded-[18px] border p-4">
            <div className="flex items-center justify-between"><h3 className="text-ink text-[15px] font-black">{ins.title}</h3><span className="text-muted text-[10px] font-bold">{IMPACT_HE[ins.impact]}</span></div>
            <p className="text-muted mt-1 text-[13px]">{ins.body}</p>
            {ins.evidence.length > 0 && <p className="text-muted mt-2 text-[11px]">מבוסס על: {ins.evidence.join(" · ")}</p>}
          </div>
        ))}</div>
      )}

      <AskMarketing />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-card border-line rounded-2xl border px-4 py-3 text-center"><div className="text-brand text-2xl font-black">{value}</div><div className="text-muted text-[11px]">{label}</div></div>;
}

function CampaignCard({ c, detailed }: { c: Campaign; detailed?: boolean }) {
  return (
    <div className="bg-card border-line rounded-[18px] border p-4">
      <div className="flex items-start justify-between gap-2">
        <div><h3 className="text-ink text-[15px] font-black">{c.name}</h3><p className="text-muted text-[11px]">{OBJECTIVE_HE[c.goal.objective]} · {STATUS_HE[c.status]} · עדיפות {PRIORITY_HE[c.priority]}</p></div>
        <span className="text-brand text-lg font-black">{c.analytics.health}</span>
      </div>
      <p className="text-muted mt-2 text-[12px]">{c.recommendation.why}</p>
      <div className="mt-2 flex flex-wrap gap-1">{c.channels.map((ch) => <span key={ch} className="bg-surface text-ink rounded px-2 py-0.5 text-[10px] font-semibold">{CHANNEL_HE[ch]}</span>)}</div>
      <div className="text-muted mt-2 flex flex-wrap gap-3 text-[11px]"><span>תקציב מומלץ: <b className="text-ink">{fmt(c.budget.recommended)}</b></span><span>~{c.budget.expectedLeads} לידים</span><span>ROI {c.budget.expectedRoi}</span></div>
      {detailed && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <div className="text-muted text-[11px]">קהלים: {c.audiences.map((a) => a.label).join(", ") || "—"}</div>
          <div className="mt-1 flex flex-wrap gap-1">{c.approvals.map((a) => <span key={a.type} className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", a.state === "approved" ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{APPROVAL_HE[a.type]}</span>)}</div>
          {c.evidence.length > 0 && <p className="text-muted mt-2 text-[11px]">ראיות: {c.evidence.join(" · ")}</p>}
        </div>
      )}
    </div>
  );
}

function AskMarketing() {
  const [q, setQ] = useState(""); const [a, setA] = useState<string | null>(null); const [pending, setPending] = useState(false);
  const ask = async (query: string) => {
    if (!query.trim() || pending) return; setPending(true); setA(null);
    try { const r = await fetch("/api/marketing/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) }); const j = await r.json(); setA(j?.data?.answer ?? "לא הצלחתי לענות."); }
    catch { setA("אירעה שגיאה — נסו שוב."); } finally { setPending(false); }
  };
  const sugg = ["איזה קמפיין כדאי להשיק?", "איפה כדאי לפרסם?", "מה אזור השיווק החלש שלי?"];
  return (
    <div className="bg-card border-line rounded-[22px] border p-5">
      <h3 className="text-ink flex items-center gap-2 text-lg font-black"><Icon name="Sparkles" size={18} /> שאלו את ZONO על שיווק</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">{sugg.map((s) => <button key={s} onClick={() => { setQ(s); ask(s); }} className="border-line text-muted rounded-full border px-2.5 py-1 text-[11px] font-semibold">{s}</button>)}</div>
      {a && <p className="bg-surface text-ink mt-3 rounded-2xl p-3 text-[13px]">{a}</p>}
      <div className="mt-3 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(q); }} placeholder="שאלה שיווקית…" className="border-line bg-surface text-ink flex-1 rounded-xl border px-3 py-2 text-[13px]" />
        <button onClick={() => ask(q)} disabled={pending || !q.trim()} className="bg-brand rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60">שאל</button>
      </div>
    </div>
  );
}
