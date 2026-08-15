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

function Empty({ t }: { t: string }) { return <div className="bg-card border-line text-muted rounded-2xl border p-6 text-center text-[13px]">{t}</div>; }

export function TerritoryOS({ data }: { data: TData }) {
  const [tab, setTab] = useState<Tab>("home");
  const sc = data.score;
  const cityLabel = (data.city ?? "").trim() || "אזור הפעילות";
  // Real, evidence-backed counts (never vanity zeros) for the hero.
  const kpis = [
    { label: "אזורים במעקב", value: data.neighborhoods.length },
    { label: "אזורי שליטה", value: data.marketShare.dominant.length },
    { label: "אזורים לחיזוק", value: data.marketShare.weak.length },
    { label: "יעדי גיוס", value: data.acquisitionPlan.length },
  ].filter((k) => k.value > 0);
  const bandHe: Record<string, string> = { dominant: "שליטה", strong: "חזק", contested: "תחרותי", weak: "חלש" };

  return (
    <div dir="rtl" className="mx-auto max-w-none px-4 pb-16 pt-6 sm:px-6">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-6 py-8 text-white sm:px-9 sm:py-10">
        <div className="absolute -top-24 -left-16 -z-10 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="mb-1 text-[12px] font-bold tracking-wide text-indigo-300">ZONO · מודיעין טריטוריה</div>
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">מרכז השליטה שלך ב{cityLabel}</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-300">תמונת מצב חיה של השוק, המתחרים וההזדמנויות באזור הפעילות שלך — מבוסס נתונים שנצפו.</p>
        {kpis.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 backdrop-blur-md">
                <div className="text-2xl font-black tabular-nums sm:text-3xl">{k.value}</div>
                <div className="mt-0.5 text-[12px] font-semibold text-slate-300">{k.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── STICKY SEGMENTED CONTROL (replaces the bottom app-in-app tab bar) ── */}
      <div className="bg-card/95 border-line sticky top-0 z-20 -mx-4 mt-4 flex gap-1 overflow-x-auto border-b px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-xl px-4 py-2 text-[13px] font-bold transition ${tab === t.id ? "bg-brand-soft text-brand" : "text-muted hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "home" && (
          <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
            {/* Recommendations lead (action first) */}
            <section className="order-2 lg:order-1">
              <h2 className="text-ink mb-3 text-[17px] font-black">תוכנית הפעולה של ZONO</h2>
              {data.recommendations.length === 0 ? <Empty t="ZONO אוספת נתונים כדי לבנות עבורך תוכנית פעולה לאזור." /> : <div className="space-y-3">{data.recommendations.slice(0, 5).map((r, i) => <RecRow key={i} r={r} />)}</div>}
            </section>

            {/* Territory strength — SECONDARY, explained (not the hero) */}
            <aside className="order-1 space-y-4 lg:order-2">
              <div className="bg-card border-line rounded-2xl border p-5">
                <div className="flex items-center justify-between">
                  <div className="text-ink text-[14px] font-black">חוזק הטריטוריה</div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${bandCls(sc.overall)}`}>{bandHe[sc.band] ?? sc.band}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1"><span className="text-ink text-4xl font-black tabular-nums">{sc.overall}</span><span className="text-muted text-[13px] font-bold">/100</span></div>
                <p className="text-muted mt-2 text-[12.5px] leading-relaxed">{sc.aiSummary}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <MiniStat l="כיסוי אזורים" v={`${sc.coverage}%`} />
                  <MiniStat l="נוכחות מוערכת" v={`${sc.marketShare}%`} />
                  <MiniStat l="חדירה" v={`${sc.penetration}%`} />
                  <MiniStat l="מומנטום" v={String(sc.growth)} />
                </div>
                <p className="text-muted mt-3 text-[10.5px]">מדדים מוערכים מנתוני הפעילות שנצפתה — לא נתח שוק רשמי.</p>
              </div>
              {data.notes.length > 0 && <div className="bg-surface border-line rounded-2xl border p-4">{data.notes.map((n, i) => <p key={i} className="text-muted text-[11.5px]">• {n}</p>)}</div>}
            </aside>
          </div>
        )}

        {tab === "hoods" && <div className="grid gap-2 sm:grid-cols-2">{data.neighborhoods.length === 0 ? <Empty t="ZONO ממפה את השכונות באזור שלך." /> : data.neighborhoods.map((n) => <HoodRow key={n.key} n={n} />)}</div>}
        {tab === "streets" && <div className="grid gap-2 sm:grid-cols-2">{data.streets.length === 0 ? <Empty t="אין עדיין נתוני רחובות — נאספים מהפעילות שנצפית." /> : data.streets.map((st) => <StreetRow key={st.key} st={st} />)}</div>}
        {tab === "buildings" && <div className="grid gap-2 sm:grid-cols-2">{data.buildings.length === 0 ? <Empty t="אין עדיין נתוני בניינים." /> : data.buildings.map((b) => <BuildingRow key={b.key} b={b} />)}</div>}

        {tab === "share" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <ShareCol title="אזורי שליטה" items={data.marketShare.dominant.map((d) => ({ name: d.name, detail: d.share != null ? `נוכחות ${d.share}%` : "" }))} />
            <ShareCol title="אזורים לחיזוק" items={data.marketShare.weak.map((w) => ({ name: w.name, detail: `ציון ${w.score}` }))} />
            <ShareCol title="ללא נוכחות שנצפתה" items={data.marketShare.missing.map((m) => ({ name: m.name, detail: "אזור הרחבה" }))} />
            <ShareCol title="אזורי הרחבה" items={data.marketShare.expansion.map((e) => ({ name: e.name, detail: e.why }))} />
            {data.campaigns.length > 0 && <section className="sm:col-span-2"><h2 className="text-ink mb-2 text-[15px] font-black">קמפיינים מומלצים</h2><div className="grid gap-2 sm:grid-cols-2">{data.campaigns.map((c, i) => <Link key={i} href={c.href} className="bg-surface flex items-center justify-between rounded-2xl p-3"><div><div className="text-ink text-[13px] font-bold">{c.title}</div><div className="text-muted text-[11px]">{c.why}</div></div><span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[10px] font-bold">{c.type}</span></Link>)}</div></section>}
          </div>
        )}

        {tab === "acq" && <div className="grid gap-2 sm:grid-cols-2">{data.acquisitionPlan.length === 0 ? <Empty t="אין יעדי גיוס כרגע — יופיעו כשתזוהה הזדמנות." /> : data.acquisitionPlan.map((a, i) => <AcqRow key={i} a={a} />)}</div>}

        {tab === "plans" && (
          <div className="space-y-4">
            <div className="bg-warning-soft text-warning rounded-2xl p-3 text-[12px] font-bold">כל משימה בתוכנית דורשת אישור לפני ביצוע.</div>
            <div className="grid gap-4 lg:grid-cols-3">
              {data.plans.map((p) => (
                <section key={p.horizon}><h2 className="text-ink mb-2 text-[15px] font-black">תוכנית {p.label}</h2>{p.tasks.length === 0 ? <Empty t="אין משימות בטווח זה." /> : <div className="space-y-2">{p.tasks.map((t, i) => <div key={i} className="bg-surface flex items-center gap-3 rounded-2xl p-3"><span className="bg-brand-soft text-brand rounded-lg px-2 py-1 text-[11px] font-bold">{t.area}</span><span className="text-ink text-[13px] font-semibold">{t.task}</span></div>)}</div>}</section>
              ))}
            </div>
          </div>
        )}

        {tab === "ask" && <AskTab />}
      </div>
    </div>
  );
}

function MiniStat({ l, v }: { l: string; v: string }) {
  return <div className="bg-surface rounded-xl px-3 py-2 text-center"><div className="text-ink text-[16px] font-black tabular-nums">{v}</div><div className="text-muted text-[10.5px] font-bold">{l}</div></div>;
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
