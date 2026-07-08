"use client";
// ============================================================================
// 📣 ZONO — Marketing OS™ view. SCREEN 16. Premium campaign command center (RTL).
// Answers what to promote today, which channels perform, where leads come from,
// and what ZONO recommends next — all from REAL marketing intelligence
// (property marketing DNA, community intel, opportunity signals, segments).
// Publishing stays assisted/manual via Distribution; nothing auto-publishes.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { createCommunityAction, recomputeMarketingAction } from "@/lib/marketing/actions";
import type { MarketingBoard } from "@/lib/marketing/service";

const field = "bg-surface border-line text-ink focus:border-brand-light h-9 rounded-xl border px-3 text-sm outline-none transition";
const LEVEL: Record<string, { t: string; c: string }> = {
  elite: { t: "מצטיינת", c: "bg-success-soft text-success" }, strong: { t: "חזקה", c: "bg-brand-soft text-brand-strong" },
  average: { t: "ממוצעת", c: "bg-surface text-ink" }, weak: { t: "חלשה", c: "bg-warning-soft text-warning" }, dead: { t: "לא פעילה", c: "bg-danger-soft text-danger" },
};
const PLATFORM: Record<string, string> = { facebook: "פייסבוק", whatsapp: "וואטסאפ", telegram: "טלגרם", linkedin: "לינקדאין", investors: "משקיעים", neighborhood: "שכונתי", local: "מקומי" };
const AUDIENCE: Record<string, string> = { buyers: "קונים", sellers: "מוכרים", investors: "משקיעים", luxury: "יוקרה", families: "משפחות", young: "צעירים", commercial: "מסחרי" };
const SIGNAL: Record<string, string> = { high_demand_locality: "ביקוש גבוה", low_inventory_locality: "מלאי נמוך", investor_hotspot: "מוקד משקיעים", luxury_hotspot: "מוקד יוקרה", family_hotspot: "מוקד משפחות", seller_acquisition_hotspot: "גיוס מוכרים", promotion_opportunity: "קידום נכס" };
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-warning");

export function MarketingView({ board }: { board: MarketingBoard }) {
  const router = useRouter();
  const { health, communities, segments, opportunities, propertyDna } = board;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nf, setNf] = useState({ name: "", platform: "facebook", city: "", audienceType: "buyers", membersCount: "" });
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => { setError(null); setMsg(null); start(async () => { const r = await fn(); if (r?.error) setError(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } }); };
  const addCommunity = () => { if (!nf.name.trim()) { setError("נדרש שם קהילה"); return; } run(() => createCommunityAction({ name: nf.name.trim(), platform: nf.platform, city: nf.city || null, audienceType: nf.audienceType, membersCount: Number(nf.membersCount) || 0 })); setNf({ name: "", platform: "facebook", city: "", audienceType: "buyers", membersCount: "" }); };

  const empty = communities.length === 0 && propertyDna.length === 0;
  const best = communities.filter((c) => c.intel && (c.intel.level === "elite" || c.intel.level === "strong")).slice(0, 6);
  const weak = communities.filter((c) => c.intel && (c.intel.level === "weak" || c.intel.level === "dead")).slice(0, 6);
  const leadSources = [...communities].filter((c) => c.intel).sort((a, b) => (b.intel!.lead_quality_score ?? 0) - (a.intel!.lead_quality_score ?? 0)).slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Cinematic marketing hero ────────────────────────────────────────── */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]">
        <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-brand text-xs font-bold">ZONO Marketing OS</p>
            <h1 className="text-ink mt-0.5 text-2xl font-black sm:text-3xl">מרכז השיווק והקמפיינים</h1>
            <p className="text-muted mt-1 max-w-xl text-sm">מה לקדם היום, באילו ערוצים, למי ולמה — פרסום מפוקח אנושית. שום דבר לא מתפרסם או נשלח אוטומטית.</p>
          </div>
          <div className="bg-card grid h-24 w-24 shrink-0 place-items-center rounded-full text-center shadow-[var(--shadow-soft)]">
            <div><div className={`text-4xl font-black leading-none ${tone(health)}`}>{health}</div><div className="text-muted mt-1 text-[10px] font-bold">בריאות שיווק</div></div>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-3">
          <HeroStat label="נכסים לקידום" value={propertyDna.length} tone="text-brand-strong" />
          <HeroStat label="הזדמנויות שיווק" value={opportunities.length} tone="text-warning" border />
          <HeroStat label="קהילות פעילות" value={communities.filter((c) => c.status === "active").length} tone="text-ink" border />
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => run(recomputeMarketingAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{pending ? "מחשב…" : "חשב מודיעין שיווק"}</Button>
        <Link href="/distribution/daily"><Button size="sm" variant="secondary" leadingIcon={<Icon name="Megaphone" size={15} />}>שולחן הפצה יומי</Button></Link>
        <Link href="/distribution"><Button size="sm" variant="ghost" leadingIcon={<Icon name="Send" size={15} />}>קהילות והפצה</Button></Link>
        <Link href="/marketing-core"><Button size="sm" variant="ghost" leadingIcon={<Icon name="Sparkles" size={15} />}>מרכז קמפיינים AI</Button></Link>
        <Button size="sm" variant="ghost" onClick={() => setShowNew((v) => !v)} leadingIcon={<Icon name="Plus" size={15} />}>קהילה חדשה</Button>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      {showNew && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">הוסף קהילה (ידני — ללא API)</p>
          <div className="flex flex-wrap gap-2">
            <input className={field} placeholder="שם הקהילה" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
            <select className={field} value={nf.platform} onChange={(e) => setNf({ ...nf, platform: e.target.value })}>{Object.entries(PLATFORM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select className={field} value={nf.audienceType} onChange={(e) => setNf({ ...nf, audienceType: e.target.value })}>{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input className={field} placeholder="עיר" value={nf.city} onChange={(e) => setNf({ ...nf, city: e.target.value })} />
            <input className={cn(field, "w-28")} placeholder="חברים" value={nf.membersCount} onChange={(e) => setNf({ ...nf, membersCount: e.target.value })} />
            <Button size="sm" disabled={pending || !nf.name.trim()} onClick={addCommunity}>הוסף</Button>
          </div>
        </div>
      )}

      {empty ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-16 w-16 place-items-center rounded-3xl"><Icon name="Megaphone" size={28} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין מודיעין שיווק</p>
          <p className="text-muted max-w-sm text-sm">הוסיפו קהילות ולחצו ״חשב מודיעין שיווק״ כדי לבנות DNA שיווקי לכל נכס, דירוג ערוצים והזדמנויות קידום.</p>
          <Button onClick={() => run(recomputeMarketingAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />} className="mt-1">חשב מודיעין שיווק</Button>
        </div>
      ) : (
        <>
          {/* ── Today's promotion workload ───────────────────────────────────── */}
          <Panel title="נכסים שדורשים קידום" icon="Megaphone" count={propertyDna.length}>
            {propertyDna.length === 0 ? (
              <Empty text="חשב מודיעין שיווק כדי לזהות נכסים לקידום." />
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {propertyDna.slice(0, 8).map((d) => (
                  <div key={d.propertyId} className="border-line rounded-2xl border p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/properties/${d.propertyId}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate text-sm font-black">{d.title}</Link>
                      <span className={cn("shrink-0 text-lg font-black", tone(d.score))}>{d.score}</span>
                    </div>
                    {d.summary && <p className="text-muted mt-1 line-clamp-2 text-[12px] leading-relaxed">{d.summary}</p>}
                    <div className="text-muted mt-1.5 flex flex-wrap gap-x-3 text-[11px] font-semibold">
                      {d.topCommunity && <span>ערוץ: {d.topCommunity}</span>}
                      {d.budget && <span>תקציב: {d.budget}</span>}
                      {d.audience.length > 0 && <span>{d.audience.map((a) => AUDIENCE[a] ?? a).join(", ")}</span>}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Link href={`/creative/new?type=property_sale_post&propertyId=${d.propertyId}`}><Button size="sm" leadingIcon={<Icon name="Sparkles" size={13} />}>צור קריאייטיב</Button></Link>
                      <Link href="/distribution/daily"><Button size="sm" variant="secondary" leadingIcon={<Icon name="Megaphone" size={13} />}>הפץ</Button></Link>
                      <Link href={`/properties/${d.propertyId}`}><Button size="sm" variant="ghost" leadingIcon={<Icon name="ArrowUpRight" size={13} />}>יומן שיווק</Button></Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ── Channel performance: best vs weak ────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="ערוצים מובילים" icon="TrendingUp" count={best.length}>
              {best.length === 0 ? <Empty text="אין ערוצים מובילים עדיין." /> : (
                <ul className="flex flex-col gap-1.5">{best.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink min-w-0 flex-1 truncate font-semibold">{c.name} <span className="text-muted text-[10px]">· {PLATFORM[c.platform] ?? c.platform}</span></span>
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", (LEVEL[c.intel!.level] ?? LEVEL.average).c)}>{(LEVEL[c.intel!.level] ?? LEVEL.average).t}</span>
                    <span className={cn("shrink-0 text-xs font-black", tone(c.intel!.community_health_score ?? 0))}>{c.intel!.community_health_score ?? 0}</span>
                  </li>
                ))}</ul>
              )}
            </Panel>
            <Panel title="ערוצים חלשים / לשיפור" icon="AlertTriangle" count={weak.length}>
              {weak.length === 0 ? <Empty text="אין ערוצים חלשים — כל הערוצים מתפקדים ✓" /> : (
                <ul className="flex flex-col gap-1.5">{weak.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink min-w-0 flex-1 truncate font-semibold">{c.name} <span className="text-muted text-[10px]">· {PLATFORM[c.platform] ?? c.platform}</span></span>
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", (LEVEL[c.intel!.level] ?? LEVEL.average).c)}>{(LEVEL[c.intel!.level] ?? LEVEL.average).t}</span>
                    <span className={cn("shrink-0 text-xs font-black", tone(c.intel!.community_health_score ?? 0))}>{c.intel!.community_health_score ?? 0}</span>
                  </li>
                ))}</ul>
              )}
            </Panel>
          </div>

          {/* ── Opportunities (AI next actions) + Lead sources ───────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="הזדמנויות שיווק · פעולות מומלצות" icon="Flame" count={opportunities.length}>
              {opportunities.length === 0 ? <Empty text="אין הזדמנויות פתוחות כרגע." /> : (
                <ul className="flex flex-col gap-1.5">{opportunities.slice(0, 8).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink min-w-0 flex-1 truncate font-semibold">{o.title} <span className="text-muted text-[10px]">· {SIGNAL[o.signal_type] ?? o.signal_type}</span></span>
                    <span className={cn("shrink-0 text-xs font-black", tone(o.impact_score))}>{o.impact_score}</span>
                  </li>
                ))}</ul>
              )}
            </Panel>
            <Panel title="מקורות לידים" icon="Users" count={leadSources.length}>
              {leadSources.length === 0 ? <Empty text="אין נתוני מקורות לידים עדיין." /> : (
                <ul className="flex flex-col gap-1.5">{leadSources.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink min-w-0 flex-1 truncate font-semibold">{c.name} <span className="text-muted text-[10px]">· {PLATFORM[c.platform] ?? c.platform}</span></span>
                    <span className="text-muted text-[11px]">איכות לידים</span>
                    <span className={cn("shrink-0 text-xs font-black", tone(c.intel!.lead_quality_score ?? 0))}>{c.intel!.lead_quality_score ?? 0}</span>
                  </li>
                ))}</ul>
              )}
            </Panel>
          </div>

          {/* ── Audience segments ────────────────────────────────────────────── */}
          {segments.filter((s) => s.segment_size > 0).length > 0 && (
            <Panel title="פלחי קהל" icon="Users">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{segments.filter((s) => s.segment_size > 0).map((s) => (
                <div key={s.id} className="border-line flex items-center justify-between gap-2 rounded-2xl border p-3">
                  <div className="min-w-0"><p className="text-ink truncate text-[13px] font-bold">{s.label}</p><p className="text-muted text-[11px]">{s.segment_size} קונים · המרה {s.segment_conversion}%</p></div>
                  <span className={cn("shrink-0 text-lg font-black", tone(s.segment_quality))}>{s.segment_quality}</span>
                </div>
              ))}</div>
            </Panel>
          )}

          <p className="text-muted text-center text-[11px]">הפרסום בפועל מתבצע בשולחן ההפצה — פייסבוק ווואטסאפ נשארים מפוקחים אנושית, ללא שליחה או פרסום אוטומטי.</p>
        </>
      )}
    </div>
  );
}

function Panel({ title, icon, count, children }: { title: string; icon?: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">{icon && <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name={icon} size={15} /></span>}<p className="text-ink text-sm font-extrabold">{title}{count != null ? ` (${count})` : ""}</p></div>
      {children}
    </div>
  );
}
function HeroStat({ label, value, tone, border }: { label: string; value: number; tone: string; border?: boolean }) {
  return (
    <div className={`bg-card px-3 py-4 text-center ${border ? "border-line border-r" : ""}`}>
      <p className={`text-2xl font-black ${tone}`}>{value}</p>
      <p className="text-muted mt-0.5 text-[11px] font-bold">{label}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="text-muted text-sm">{text}</p>;
}
