"use client";

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
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

export function MarketingView({ board }: { board: MarketingBoard }) {
  const router = useRouter();
  const { health, communities, topCommunities, segments, opportunities, propertyDna } = board;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nf, setNf] = useState({ name: "", platform: "facebook", city: "", audienceType: "buyers", membersCount: "" });
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => { setError(null); setMsg(null); start(async () => { const r = await fn(); if (r?.error) setError(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } }); };
  const addCommunity = () => { if (!nf.name.trim()) { setError("נדרש שם קהילה"); return; } run(() => createCommunityAction({ name: nf.name.trim(), platform: nf.platform, city: nf.city || null, audienceType: nf.audienceType, membersCount: Number(nf.membersCount) || 0 })); setNf({ name: "", platform: "facebook", city: "", audienceType: "buyers", membersCount: "" }); };

  const empty = communities.length === 0 && propertyDna.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Marketing Intelligence OS</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מודיעין שיווק</h1>
          <p className="text-muted mt-1 text-sm">מה לשווק, היכן, למי, מתי ולמה — לפני שמערכת פרסום קיימת. דטרמיניסטי, ללא פרסום אוטומטי.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/distribution"><Button size="sm" variant="ghost" leadingIcon={<Icon name="Send" size={15} />}>קהילות והפצה</Button></Link>
          <Link href="/distribution/daily"><Button size="sm" variant="ghost" leadingIcon={<Icon name="Megaphone" size={15} />}>שולחן יומי</Button></Link>
          <Button size="sm" variant="secondary" onClick={() => setShowNew((v) => !v)} leadingIcon={<Icon name="Plus" size={15} />}>קהילה חדשה</Button>
          <Button onClick={() => run(recomputeMarketingAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{pending ? "מחשב…" : "חשב מודיעין שיווק"}</Button>
        </div>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="בריאות שיווק" value={String(health)} icon="Shield" tone={tone(health)} />
        <Stat label="קהילות" value={String(communities.length)} icon="Users" />
        <Stat label="הזדמנויות שיווק" value={String(opportunities.length)} icon="Flame" tone="text-warning" />
        <Stat label="נכסים עם DNA" value={String(propertyDna.length)} icon="Megaphone" tone="text-brand-strong" />
      </div>

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
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Megaphone" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין מודיעין שיווק</p>
          <p className="text-muted max-w-sm text-sm">הוסף קהילות ולחץ ״חשב מודיעין שיווק״ כדי לבנות DNA שיווקי לכל נכס, דירוג קהילות והזדמנויות.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Best opportunities */}
          <Panel title="הזדמנויות שיווק" icon="Flame">
            {opportunities.length === 0 ? <p className="text-muted text-sm">אין הזדמנויות פתוחות</p> : (
              <ul className="flex flex-col gap-1.5">{opportunities.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink min-w-0 flex-1 truncate font-semibold">{o.title} <span className="text-muted text-[10px]">· {SIGNAL[o.signal_type] ?? o.signal_type}</span></span>
                  <span className={cn("shrink-0 text-xs font-black", tone(o.impact_score))}>{o.impact_score}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Top communities */}
          <Panel title="קהילות מובילות" icon="Users">
            {topCommunities.length === 0 ? <p className="text-muted text-sm">אין קהילות — הוסף קהילה</p> : (
              <ul className="flex flex-col gap-1.5">{topCommunities.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink min-w-0 flex-1 truncate font-semibold">{c.name} <span className="text-muted text-[10px]">· {PLATFORM[c.platform] ?? c.platform} · {AUDIENCE[c.audience_type] ?? c.audience_type}</span></span>
                  {c.intel && <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", (LEVEL[c.intel.level] ?? LEVEL.average).c)}>{(LEVEL[c.intel.level] ?? LEVEL.average).t}</span>}
                  <span className={cn("shrink-0 text-xs font-black", tone(c.intel?.community_health_score ?? 0))}>{c.intel?.community_health_score ?? 0}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Property marketing DNA */}
          <Panel title="DNA שיווקי לנכסים" icon="Megaphone">
            {propertyDna.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-1.5">{propertyDna.slice(0, 8).map((d) => (
                <li key={d.propertyId} className="border-line rounded-xl border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/properties/${d.propertyId}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{d.title}</Link>
                    <span className={cn("shrink-0 text-xs font-black", tone(d.score))}>{d.score}</span>
                  </div>
                  <p className="text-muted text-[11px]">{d.topCommunity ? `קהילה: ${d.topCommunity} · ` : ""}תקציב: {d.budget ?? "—"}{d.audience.length ? ` · ${d.audience.map((a) => AUDIENCE[a] ?? a).join(", ")}` : ""}</p>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Audience segments */}
          <Panel title="פלחי קהל" icon="Users">
            {segments.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-1.5">{segments.filter((s) => s.segment_size > 0).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink min-w-0 flex-1 truncate font-semibold">{s.label}</span>
                  <span className="text-muted text-[11px]">{s.segment_size} קונים · המרה {s.segment_conversion}%</span>
                  <span className={cn("shrink-0 text-xs font-black", tone(s.segment_quality))}>{s.segment_quality}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Community rankings (all) */}
          <Panel title="דירוג קהילות מלא" icon="BarChart3">
            {communities.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-start text-sm">
                  <thead className="text-muted border-line border-b text-xs"><tr>{["קהילה", "קהל", "לידים", "עסקאות", "ROI", "רמה"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-bold">{h}</th>)}</tr></thead>
                  <tbody>{communities.slice(0, 12).map((c) => (
                    <tr key={c.id} className="border-line border-b last:border-0">
                      <td className="text-ink px-2 py-1.5 font-semibold">{c.name}</td>
                      <td className="text-muted px-2 py-1.5">{AUDIENCE[c.audience_type] ?? c.audience_type}</td>
                      <td className="text-muted px-2 py-1.5">{c.intel?.lead_quality_score ?? 0}</td>
                      <td className="text-muted px-2 py-1.5">{c.intel?.deal_generation_score ?? 0}</td>
                      <td className="text-muted px-2 py-1.5">{c.intel?.roi_score ?? 0}</td>
                      <td className="px-2 py-1.5">{c.intel && <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", (LEVEL[c.intel.level] ?? LEVEL.average).c)}>{(LEVEL[c.intel.level] ?? LEVEL.average).t}</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Publishing recommendations */}
          <Panel title="המלצות פרסום" icon="Clock">
            {propertyDna.length === 0 ? <p className="text-muted text-sm">חשב מודיעין כדי לקבל המלצות פרסום</p> : (
              <ul className="flex flex-col gap-1.5">{propertyDna.slice(0, 6).map((d) => (
                <li key={d.propertyId} className="text-sm">
                  <Link href={`/properties/${d.propertyId}`} className="text-ink hover:text-brand font-semibold">{d.title}</Link>
                  <p className="text-muted text-[11px]">{d.summary}</p>
                </li>
              ))}</ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <div className="mb-2 flex items-center gap-2">{icon && <span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name={icon} size={14} /></span>}<p className="text-ink text-sm font-extrabold">{title}</p></div>
      {children}
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: string; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
