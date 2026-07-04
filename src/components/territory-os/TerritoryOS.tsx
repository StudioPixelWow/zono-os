"use client";
// ============================================================================
// 🗺️ ZONO Territory Intelligence OS™ — command center UI (premium RTL). 39.0.
// One operating system over the EXISTING territory engines. Official ZONO
// tokens/glass/cards; deep-links into /market-domination, /acquisition, campaign
// wizard, facebook, landing. Read-only; approval-gated CTAs. Ask ZONO built in.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import type { TerritoryOS as TData, NeighborhoodCard, StreetLean, BuildingLean, AcquisitionTarget } from "@/lib/territory-os/types";
import { askTerritoryAction } from "@/lib/territory-os/actions";

type Tab = "home" | "hoods" | "streets" | "buildings" | "share" | "acq" | "plans" | "ask";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "בית", icon: "🗺️" }, { id: "hoods", label: "שכונות", icon: "🏘️" },
  { id: "streets", label: "רחובות", icon: "🛣️" }, { id: "buildings", label: "בניינים", icon: "🏢" },
  { id: "share", label: "נתח שוק", icon: "📊" }, { id: "acq", label: "גיוס", icon: "🎯" },
  { id: "plans", label: "תוכניות", icon: "📅" }, { id: "ask", label: "שאל", icon: "🔮" },
];
const priCls: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const priHe: Record<string, string> = { high: "גבוה", medium: "בינוני", low: "נמוך" };
const bandCls = (v: number) => (v >= 70 ? "bg-success-soft text-success" : v >= 45 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger");
const HEAT: Record<string, string> = { hot: "🔥", warm: "🌤️", opportunity: "💡", cool: "❄️", cold: "🧊" };

function Tile({ l, v }: { l: string; v: number | string }) {
  return <div className="bg-card border-line rounded-2xl border px-3 py-3 text-center shadow-[var(--shadow-card)]"><div className="text-brand text-2xl font-black">{v}</div><div className="text-muted text-[11px] font-bold">{l}</div></div>;
}
function Empty({ t }: { t: string }) { return <div className="bg-card border-line text-muted rounded-2xl border p-6 text-center text-[13px]">{t}</div>; }

export function TerritoryOS({ data }: { data: TData }) {
  const [tab, setTab] = useState<Tab>("home");
  const sc = data.score;
  return (
    <div dir="rtl" className="mx-auto max-w-5xl px-4 pb-24 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-brand text-xs font-bold">ZONO Territory Intelligence</p><h1 className="text-ink text-2xl font-black">🗺️ מערכת הפעלת הטריטוריה{data.city ? ` · ${data.city}` : ""}</h1></div>
          <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-lg font-black ${bandCls(sc.overall)}`}>{sc.overall}</span>
        </div>
        <p className="text-muted mt-2 text-[13px]">{sc.aiSummary}</p>
      </div>

      <div className="mt-4">
        {tab === "home" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Tile l="ציון" v={sc.overall} /><Tile l="כיסוי" v={`${sc.coverage}%`} /><Tile l="נתח שוק" v={`${sc.marketShare}%`} /><Tile l="חדירה" v={`${sc.penetration}%`} /><Tile l="צמיחה" v={sc.growth} />
            </div>
            <section>
              <h2 className="text-ink mb-2 text-[15px] font-black">📈 סקירת מנהל</h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[["שליטה", data.executive.domination], ["חדירה", `${data.executive.penetration}%`], ["צמיחה", data.executive.growth], ["גיוס", data.executive.recruitment], ["הרחבה", data.executive.expansion], ["חלשים", data.executive.weakTerritories]].map(([l, v]) => <Tile key={String(l)} l={l as string} v={v as number} />)}
              </div>
            </section>
            <section><h2 className="text-ink mb-2 text-[15px] font-black">✨ המלצות מובילות</h2>{data.recommendations.length === 0 ? <Empty t="אין המלצות כרגע." /> : <div className="space-y-2">{data.recommendations.slice(0, 5).map((r, i) => <RecRow key={i} r={r} />)}</div>}</section>
            {data.notes.map((n, i) => <p key={i} className="text-muted text-[11px]">• {n}</p>)}
          </div>
        )}

        {tab === "hoods" && <div className="space-y-2">{data.neighborhoods.length === 0 ? <Empty t="אין נתוני שכונות." /> : data.neighborhoods.map((n) => <HoodRow key={n.key} n={n} />)}</div>}
        {tab === "streets" && <div className="space-y-2">{data.streets.length === 0 ? <Empty t="אין נתוני רחובות." /> : data.streets.map((st) => <StreetRow key={st.key} st={st} />)}</div>}
        {tab === "buildings" && <div className="space-y-2">{data.buildings.length === 0 ? <Empty t="אין נתוני בניינים." /> : data.buildings.map((b) => <BuildingRow key={b.key} b={b} />)}</div>}

        {tab === "share" && (
          <div className="space-y-5">
            <ShareCol title="🏆 אזורי שליטה" items={data.marketShare.dominant.map((d) => ({ name: d.name, detail: d.share != null ? `נתח ${d.share}%` : "" }))} />
            <ShareCol title="⚠️ אזורים חלשים" items={data.marketShare.weak.map((w) => ({ name: w.name, detail: `ציון ${w.score}` }))} />
            <ShareCol title="🕳️ ללא נוכחות" items={data.marketShare.missing.map((m) => ({ name: m.name, detail: "אזור הרחבה" }))} />
            <ShareCol title="🚀 אזורי הרחבה" items={data.marketShare.expansion.map((e) => ({ name: e.name, detail: e.why }))} />
            {data.campaigns.length > 0 && <section><h2 className="text-ink mb-2 text-[15px] font-black">📣 קמפיינים מומלצים</h2><div className="space-y-2">{data.campaigns.map((c, i) => <Link key={i} href={c.href} className="bg-surface flex items-center justify-between rounded-2xl p-3"><div><div className="text-ink text-[13px] font-bold">{c.title}</div><div className="text-muted text-[11px]">{c.why}</div></div><span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[10px] font-bold">{c.type}</span></Link>)}</div></section>}
          </div>
        )}

        {tab === "acq" && <div className="space-y-2">{data.acquisitionPlan.length === 0 ? <Empty t="אין יעדי גיוס כרגע." /> : data.acquisitionPlan.map((a, i) => <AcqRow key={i} a={a} />)}</div>}

        {tab === "plans" && (
          <div className="space-y-4">
            <div className="bg-warning-soft text-warning rounded-2xl p-3 text-[12px] font-bold">📌 כל משימה בתוכנית דורשת אישור לפני ביצוע.</div>
            {data.plans.map((p) => (
              <section key={p.horizon}><h2 className="text-ink mb-2 text-[15px] font-black">תוכנית {p.label}</h2>{p.tasks.length === 0 ? <Empty t="אין משימות בטווח זה." /> : <div className="space-y-2">{p.tasks.map((t, i) => <div key={i} className="bg-surface flex items-center gap-3 rounded-2xl p-3"><span className="bg-brand-soft text-brand rounded-lg px-2 py-1 text-[11px] font-bold">{t.area}</span><span className="text-ink text-[13px] font-semibold">{t.task}</span></div>)}</div>}</section>
            ))}
          </div>
        )}

        {tab === "ask" && <AskTab />}
      </div>

      <nav className="bg-card/95 border-line fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-5xl justify-between border-t px-1 py-1.5 backdrop-blur">
        {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-bold transition ${tab === t.id ? "text-brand bg-brand-soft" : "text-muted"}`}><span className="text-sm leading-none">{t.icon}</span>{t.label}</button>)}
      </nav>
    </div>
  );
}

function RecRow({ r }: { r: TData["recommendations"][number] }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <div className="flex items-start justify-between gap-2"><span className="text-ink text-[13px] font-black">{r.title}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${priCls[r.impact]}`}>{priHe[r.impact]}</span></div>
      <div className="text-muted mt-1 text-[12px]">{r.why}</div>
      {r.evidence.length > 0 && <div className="text-muted mt-1 text-[11px]">📌 {r.evidence.join(" · ")}</div>}
      <Link href={r.ctaHref} className="bg-brand-soft text-brand mt-2 inline-block rounded-lg px-3 py-1.5 text-[11px] font-bold">{r.ctaLabel} ←</Link>
    </div>
  );
}
function HoodRow({ n }: { n: NeighborhoodCard }) {
  return (
    <div className="bg-surface rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[13px] font-black ${bandCls(n.score)}`}>{n.score}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="text-ink text-[14px] font-bold">{n.name}</span>{n.heatLevel && <span className="text-sm">{HEAT[n.heatLevel] ?? ""}</span>}</div>
          <div className="text-muted mt-0.5 flex flex-wrap gap-2 text-[11px]">{n.marketShare != null && <span>נתח {n.marketShare}%</span>}{n.demand != null && <span>ביקוש {n.demand}</span>}{n.competition != null && <span>תחרות {n.competition}</span>}{n.momentum != null && <span>מומנטום {n.momentum}</span>}</div>
          {n.recommendation && <p className="text-brand mt-1 text-[11px] font-bold">💡 {n.recommendation}</p>}
        </div>
      </div>
    </div>
  );
}
function StreetRow({ st }: { st: StreetLean }) {
  return (
    <div className="bg-surface flex items-center gap-3 rounded-2xl p-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[13px] font-black ${bandCls(st.recruitmentScore)}`}>{st.recruitmentScore}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><span className="text-ink text-[14px] font-bold">{st.street}{st.city ? <span className="text-muted font-normal"> · {st.city}</span> : null}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${priCls[st.opportunity]}`}>{priHe[st.opportunity]}</span></div>
        <div className="text-muted mt-0.5 flex flex-wrap gap-2 text-[11px]"><span>{st.transactions} עסקאות</span>{st.marketShare != null && <span>נתח {st.marketShare}%</span>}</div>
        <p className="text-muted mt-1 text-[11px]">{st.aiRecommendation}</p>
      </div>
      <Link href="/distribution/campaign-wizard" className="bg-brand shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold text-white">גיוס</Link>
    </div>
  );
}
function BuildingRow({ b }: { b: BuildingLean }) {
  return (
    <div className="bg-surface flex items-center justify-between gap-3 rounded-2xl p-3">
      <div className="min-w-0"><div className="text-ink text-[13px] font-bold">{b.label}{b.city ? <span className="text-muted font-normal"> · {b.city}</span> : null}</div><div className="text-muted mt-0.5 flex flex-wrap gap-2 text-[11px]"><span>{b.transactions} עסקאות</span><span>הזדמנות {b.opportunityScore}</span>{b.luxuryScore >= 40 && <span>יוקרה {b.luxuryScore}</span>}</div></div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${priCls[b.recruitmentPriority]}`}>{priHe[b.recruitmentPriority]}</span>
    </div>
  );
}
function AcqRow({ a }: { a: AcquisitionTarget }) {
  const icon = a.kind === "street" ? "🛣️" : a.kind === "building" ? "🏢" : "🗺️";
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <div className="flex items-start justify-between gap-2"><span className="text-ink text-[13px] font-black">{icon} {a.label}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${priCls[a.priority]}`}>{priHe[a.priority]}</span></div>
      <div className="text-muted mt-1 text-[12px]">{a.why}</div>
      <Link href={a.ctaHref} className="bg-brand-soft text-brand mt-2 inline-block rounded-lg px-3 py-1.5 text-[11px] font-bold">{a.ctaLabel} ←</Link>
    </div>
  );
}
function ShareCol({ title, items }: { title: string; items: { name: string; detail: string }[] }) {
  if (items.length === 0) return null;
  return <section><h2 className="text-ink mb-2 text-[15px] font-black">{title}</h2><div className="space-y-1.5">{items.map((it, i) => <div key={i} className="bg-surface flex items-center justify-between rounded-xl px-3 py-2"><span className="text-ink text-[13px] font-bold">{it.name}</span><span className="text-muted text-[11px]">{it.detail}</span></div>)}</div></section>;
}
function AskTab() {
  const [res, setRes] = useState<{ answer: string; items: { title: string; detail: string; href: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const suggestions = ["איפה כדאי לגייס נכסים השבוע?", "איזה רחוב הכי חם?", "איפה אנחנו חלשים?", "איזה בניין הכי מעניין?", "איפה המתחרים מתחזקים?"];
  const ask = (q: string) => { if (!q.trim()) return; start(async () => { const r = await askTerritoryAction(q); setRes(r.ok && r.result ? { answer: r.result.answer, items: r.result.items } : { answer: "לא ניתן לענות כרגע.", items: [] }); }); };
  return (
    <div className="space-y-3">
      <div className="bg-brand-soft rounded-2xl p-3"><div className="text-brand text-[13px] font-black">🔮 שאל את ZONO על הטריטוריה</div></div>
      <div className="flex flex-wrap gap-1.5">{suggestions.map((s) => <button key={s} onClick={() => ask(s)} className="bg-surface text-ink rounded-full px-3 py-1.5 text-[11px] font-bold">{s}</button>)}</div>
      {pending && <div className="text-muted text-[12px]">חושב…</div>}
      {res && <div className="bg-card border-line rounded-2xl border p-3"><div className="text-ink text-[13px] font-bold">{res.answer}</div><div className="mt-2 space-y-1">{res.items.map((it, i) => <Link key={i} href={it.href} className="bg-surface flex items-center justify-between rounded-lg px-2.5 py-1.5"><span className="text-ink text-[12px] font-bold">{it.title}</span><span className="text-muted text-[10px]">{it.detail}</span></Link>)}</div></div>}
    </div>
  );
}
