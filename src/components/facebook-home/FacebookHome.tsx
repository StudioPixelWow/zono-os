"use client";
// ============================================================================
// 📘 ZONO Facebook Growth Platform™ — cockpit UI (mobile-first RTL). 37.0.
// UNIFIES the existing Facebook stack into one dashboard and DEEP-LINKS into the
// existing surfaces (/distribution, groups intelligence, campaign wizard). It
// adds no publishing — assisted/manual + approval-gated everywhere.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import type { FacebookHome as FBData, FbGroup, FbRecommendation, FbMarketplaceItem } from "@/lib/facebook-home/types";
import { askFacebookAction } from "@/lib/facebook-home/actions";

type Tab = "home" | "groups" | "comments" | "calendar" | "performance" | "recs" | "market" | "ask";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "בית", icon: "🏠" }, { id: "groups", label: "קבוצות", icon: "👥" },
  { id: "comments", label: "תגובות", icon: "💬" }, { id: "calendar", label: "יומן", icon: "📅" },
  { id: "performance", label: "ביצועים", icon: "📊" }, { id: "recs", label: "המלצות", icon: "✨" },
  { id: "market", label: "מרקטפלייס", icon: "🛒" }, { id: "ask", label: "שאל", icon: "🔮" },
];
const impCls: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const impHe: Record<string, string> = { high: "גבוה", medium: "בינוני", low: "נמוך" };

function Tile({ label, value }: { label: string; value: number | string }) {
  return <div className="bg-card border-line rounded-2xl border px-2 py-2.5 text-center"><div className="text-brand text-xl font-black">{value}</div><div className="text-muted text-[10px] font-bold">{label}</div></div>;
}
function GroupRow({ g }: { g: FbGroup }) {
  return (
    <Link href={g.href} className="bg-surface flex items-center gap-3 rounded-2xl p-3">
      <span className="text-brand grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[12px] font-black shadow">{g.performance}</span>
      <div className="min-w-0 flex-1">
        <div className="text-ink line-clamp-1 text-[13px] font-bold">{g.name}{g.city ? <span className="text-muted font-normal"> · {g.city}</span> : null}</div>
        <div className="text-muted text-[11px]">{g.totalLeads} לידים{g.daysSincePost != null ? ` · ${g.daysSincePost} ימים מפרסום` : ""}</div>
      </div>
      {g.recommendation && <span className="bg-brand-soft text-brand shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">{g.recommendation}</span>}
    </Link>
  );
}
function Empty({ t }: { t: string }) { return <div className="bg-card border-line text-muted rounded-2xl border p-4 text-center text-[13px]">{t}</div>; }

export function FacebookHome({ data }: { data: FBData }) {
  const [tab, setTab] = useState<Tab>("home");
  const k = data.kpis;
  return (
    <div dir="rtl" className="mx-auto max-w-xl px-4 pb-24 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-4">
        <div className="flex items-center justify-between">
          <div><p className="text-brand text-xs font-bold">ZONO Facebook</p><h1 className="text-ink text-2xl font-black">📘 פלטפורמת צמיחה</h1></div>
          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${data.connection.connected ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{data.connection.connected ? "מחובר" : "לא מחובר"}</span>
        </div>
        {data.connection.warnings.map((w, i) => <div key={i} className="text-warning mt-1 text-[11px] font-bold">⚠️ {w}</div>)}
      </div>

      <div className="mt-4">
        {tab === "home" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              <Tile label="קבוצות" value={k.groups} /><Tile label="קמפיינים" value={k.activeCampaigns} /><Tile label="מתוזמנים" value={k.scheduledPosts} /><Tile label="לידים" value={k.leads} />
              <Tile label="תגובות" value={k.comments} /><Tile label="למענה" value={k.needsReply} /><Tile label="חשיפה" value={k.reach} /><Tile label="המרה" value={`${k.conversionRate}%`} />
            </div>
            <button onClick={() => { try { window.dispatchEvent(new Event("zono:open-daily-publishing")); } catch { /* ignore */ } }} className="bg-brand-soft text-brand flex w-full items-center justify-center gap-2 rounded-2xl p-3 text-center text-[13px] font-black">📣 פתח שולחן פרסום היומי{k.scheduledPosts > 0 ? ` · ${k.scheduledPosts} מתוזמנים` : ""}</button>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/distribution/campaign-wizard" className="bg-brand rounded-2xl p-3 text-center text-[13px] font-bold text-white">אשף קמפיין</Link>
              <Link href="/distribution/groups/intelligence" className="bg-card border-line text-brand rounded-2xl border p-3 text-center text-[13px] font-bold">מודיעין קבוצות</Link>
            </div>
            {data.recommendations.length > 0 && (
              <section><h2 className="text-ink mb-2 text-[15px] font-black">✨ המלצות מובילות</h2><div className="space-y-2">{data.recommendations.slice(0, 3).map((r, i) => <RecRow key={i} r={r} />)}</div></section>
            )}
            {data.notes.map((n, i) => <p key={i} className="text-muted text-[11px]">• {n}</p>)}
          </div>
        )}

        {tab === "groups" && (
          <div className="space-y-5">
            <div className="grid grid-cols-4 gap-2"><Tile label="סה״כ" value={data.groups.summary.total} /><Tile label="חזקות" value={data.groups.summary.strong} /><Tile label="חלשות" value={data.groups.summary.weak} /><Tile label="רדומות" value={data.groups.summary.inactive} /></div>
            <GroupSection title="🏆 הקבוצות הטובות" items={data.groups.best} />
            <GroupSection title="🌱 הזדמנות לידים" items={data.groups.opportunity} />
            <GroupSection title="😴 רדומות (ללא פרסום 3+ שבועות)" items={data.groups.inactive} />
            <GroupSection title="⚠️ חלשות" items={data.groups.weak} />
            {data.groups.coverageGaps.length > 0 && <section><h2 className="text-ink mb-2 text-[15px] font-black">🕳️ פערי כיסוי</h2><div className="space-y-2">{data.groups.coverageGaps.map((c, i) => <div key={i} className="bg-surface flex items-center justify-between rounded-2xl p-3"><span className="text-ink text-[13px] font-bold">{c.area}</span><span className="text-muted text-[11px]">{c.why}</span></div>)}</div></section>}
          </div>
        )}

        {tab === "comments" && (
          <div className="space-y-5">
            <div className="grid grid-cols-4 gap-2"><Tile label="תגובות" value={data.comments.counts.total} /><Tile label="למענה" value={data.comments.counts.needsReply} /><Tile label="חמים" value={data.comments.counts.hotLeads} /><Tile label="לידים" value={data.comments.counts.leads} /></div>
            <section><h2 className="text-ink mb-2 text-[15px] font-black">💬 ממתינות למענה</h2>{data.comments.needsReplyItems.length === 0 ? <Empty t="אין תגובות ממתינות." /> : <div className="space-y-2">{data.comments.needsReplyItems.map((c) => <CommentRow key={c.id} c={c} />)}</div>}</section>
            <section><h2 className="text-ink mb-2 text-[15px] font-black">🎯 מועמדים ללידים</h2>{data.comments.leadCandidates.length === 0 ? <Empty t="אין מועמדים." /> : <div className="space-y-2">{data.comments.leadCandidates.map((c) => <CommentRow key={c.id} c={c} lead />)}</div>}</section>
            <div className="text-muted text-center text-[11px]">אישור ליד מתבצע במרכז ההפצה — לא נוצר אוטומטית.</div>
          </div>
        )}

        {tab === "calendar" && (
          <section><h2 className="text-ink mb-2 text-[15px] font-black">📅 פוסטים מתוזמנים</h2>{data.scheduled.length === 0 ? <Empty t="אין פוסטים מתוזמנים." /> : <div className="space-y-2">{data.scheduled.map((p) => (
            <Link key={p.id} href={p.href} className="bg-surface flex items-center justify-between rounded-2xl p-3"><div className="min-w-0"><div className="text-ink line-clamp-1 text-[13px] font-bold">{p.title}</div><div className="text-muted text-[11px]">{p.scheduledAt ? new Date(p.scheduledAt).toLocaleString("he-IL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</div></div><span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[10px] font-bold">{p.status}</span></Link>
          ))}</div>}<div className="text-muted mt-3 text-center text-[11px]">אישור ופרסום ידני בלבד — אין פרסום אוטומטי.</div></section>
        )}

        {tab === "performance" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2"><Tile label="חשיפה" value={data.performance.reach} /><Tile label="פוסטים" value={data.performance.posts} /><Tile label="תגובות" value={data.performance.comments} /><Tile label="לידים" value={data.performance.leads} /><Tile label="המרות" value={data.performance.conversions} /><Tile label="שיעור המרה" value={`${data.performance.conversionRate}%`} /></div>
            <section><h2 className="text-ink mb-2 text-[15px] font-black">קבוצות מובילות</h2>{data.performance.topGroups.length === 0 ? <Empty t="אין נתונים." /> : <div className="space-y-2">{data.performance.topGroups.map((g, i) => <div key={i} className="bg-surface flex items-center justify-between rounded-2xl p-3"><span className="text-ink text-[13px] font-bold">{g.name}</span><span className="text-muted text-[11px]">{g.leads} לידים · ביצועים {g.performance}</span></div>)}</div>}</section>
            <section><h2 className="text-ink mb-2 text-[15px] font-black">קמפיינים מובילים</h2>{data.performance.topCampaigns.length === 0 ? <Empty t="אין נתונים." /> : <div className="space-y-2">{data.performance.topCampaigns.map((c, i) => <div key={i} className="bg-surface flex items-center justify-between rounded-2xl p-3"><span className="text-ink text-[13px] font-bold">{c.name}</span><span className="text-muted text-[11px]">{c.leads} לידים</span></div>)}</div>}</section>
          </div>
        )}

        {tab === "recs" && (<section><h2 className="text-ink mb-2 text-[15px] font-black">✨ המלצות AI</h2>{data.recommendations.length === 0 ? <Empty t="אין המלצות כרגע." /> : <div className="space-y-2">{data.recommendations.map((r, i) => <RecRow key={i} r={r} />)}</div>}</section>)}

        {tab === "market" && (
          <section><h2 className="text-ink mb-1 text-[15px] font-black">🛒 מרקטפלייס — תכנון</h2><p className="text-muted mb-3 text-[11px]">שכבת תכנון בלבד — אין אוטומציה של מרקטפלייס.</p>{data.marketplace.length === 0 ? <Empty t="אין נכסים פעילים." /> : <div className="space-y-2">{data.marketplace.map((m) => <MarketRow key={m.id} m={m} />)}</div>}</section>
        )}

        {tab === "ask" && <AskBox />}
      </div>

      <nav className="bg-card/95 border-line fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl justify-between border-t px-1 py-1.5 backdrop-blur">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[9px] font-bold transition ${tab === t.id ? "text-brand bg-brand-soft" : "text-muted"}`}><span className="text-sm leading-none">{t.icon}</span>{t.label}</button>
        ))}
      </nav>
    </div>
  );
}

function GroupSection({ title, items }: { title: string; items: FbGroup[] }) {
  if (items.length === 0) return null;
  return <section><h2 className="text-ink mb-2 text-[15px] font-black">{title}</h2><div className="space-y-2">{items.map((g) => <GroupRow key={g.id} g={g} />)}</div></section>;
}
function RecRow({ r }: { r: FbRecommendation }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <div className="flex items-start justify-between gap-2"><span className="text-ink text-[13px] font-black">{r.title}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${impCls[r.impact]}`}>{impHe[r.impact]}</span></div>
      <div className="text-muted mt-1 text-[12px]">{r.why}</div>
      {r.evidence.length > 0 && <div className="text-muted mt-1 text-[11px]">📌 {r.evidence.join(" · ")}</div>}
      {r.cta && <Link href={r.cta.href} className="bg-brand-soft text-brand mt-2 inline-block rounded-lg px-3 py-1.5 text-[11px] font-bold">{r.cta.label} ←</Link>}
    </div>
  );
}
function CommentRow({ c, lead }: { c: { id: string; author: string; text: string; category: string; suggestedReply: string; href: string }; lead?: boolean }) {
  return (
    <Link href={c.href} className="bg-surface block rounded-2xl p-3">
      <div className="flex items-center justify-between gap-2"><span className="text-ink text-[13px] font-bold">{c.author}</span>{lead && <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-[10px] font-bold">ליד</span>}</div>
      <div className="text-muted line-clamp-2 text-[12px]">{c.text}</div>
      {c.suggestedReply && <div className="text-brand mt-1 line-clamp-1 text-[11px]">💬 {c.suggestedReply}</div>}
    </Link>
  );
}
function MarketRow({ m }: { m: FbMarketplaceItem }) {
  return (
    <Link href={m.href} className="bg-surface flex items-center justify-between gap-3 rounded-2xl p-3">
      <div className="min-w-0"><div className="text-ink line-clamp-1 text-[13px] font-bold">{m.title}{m.city ? <span className="text-muted font-normal"> · {m.city}</span> : null}</div><div className="text-muted text-[11px]">{m.lastExposureAt ? `חשיפה אחרונה ${m.lastExposureAt.slice(0, 10)}` : "ללא חשיפה"}</div></div>
      {m.recommendRenew && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${impCls[m.priority]}`}>לחדש</span>}
    </Link>
  );
}
function AskBox() {
  const [res, setRes] = useState<{ answer: string; items: { title: string; detail: string; href: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const suggestions = ["איפה כדאי לפרסם היום?", "אילו קבוצות הפסיקו לעבוד?", "איפה חסרים לי פוסטים?", "איפה אני מפספס לידים?"];
  const ask = (query: string) => { if (!query.trim()) return; start(async () => { const r = await askFacebookAction(query); setRes(r.ok && r.result ? { answer: r.result.answer, items: r.result.items } : { answer: "לא ניתן לענות כרגע.", items: [] }); }); };
  return (
    <div className="space-y-3">
      <div className="bg-brand-soft rounded-2xl p-3"><div className="text-brand text-[13px] font-black">🔮 שאל את ZONO על פייסבוק</div></div>
      <div className="flex flex-wrap gap-1.5">{suggestions.map((s) => <button key={s} onClick={() => ask(s)} className="bg-surface text-ink rounded-full px-3 py-1.5 text-[11px] font-bold">{s}</button>)}</div>
      {pending && <div className="text-muted text-[12px]">חושב…</div>}
      {res && (<div className="bg-card border-line rounded-2xl border p-3"><div className="text-ink text-[13px] font-bold">{res.answer}</div><div className="mt-2 space-y-1">{res.items.map((it, i) => <Link key={i} href={it.href} className="bg-surface flex items-center justify-between rounded-lg px-2.5 py-1.5"><span className="text-ink text-[12px] font-bold">{it.title}</span><span className="text-muted text-[10px]">{it.detail}</span></Link>)}</div></div>)}
    </div>
  );
}
