"use client";
// ============================================================================
// 🗺️ Live Market Intelligence Map™ — flagship territory experience (RTL).
// Presentation only. Territory dashboard + weighted-intelligence heat + dynamic
// layers + live filters + saved views + area comparison + territory search +
// internal property preview, over the existing MapLibre map. Nothing is
// recomputed server-side; every value is already-persisted intelligence.
// No external navigation — sources are data providers only. Nothing fabricated.
// ============================================================================
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ZonoMap, type ZonoMapPoint } from "@/components/maps/ZonoMap";
import { TerminalSection, Metric, MetricGrid, StatusBadge, Pill, TerminalEmpty, val, pct01, type StatusTone } from "@/components/intelligence/terminal";
import {
  IntelligencePage, IntelligenceHeader, IntelligenceActionBar, IntelligenceActionLink,
  IntelligenceSidebar, IntelligenceDrawer, IntelligenceEmptyState,
} from "@/components/intelligence/framework";
import { MarketIntelNav } from "@/components/market-intelligence/MarketIntelNav";
import { getZoneIntelligenceAction } from "@/lib/intelligence-explorer/zone-actions";
import type { MapIntelligenceDTO, MapLayer, MapZone, MapPoint, MapPointMetrics } from "@/lib/intelligence-explorer/map";
import type { TerritoryIntelligenceDTO } from "@/lib/agencies/api/agencyIntelligenceApiTypes";

const LAYERS: { id: MapLayer; label: string; emoji: string }[] = [
  { id: "external", label: "מודעות חיצוניות", emoji: "🌍" },
  { id: "office", label: "נכסי המשרד", emoji: "🏢" },
  { id: "mine", label: "הנכסים שלי", emoji: "🏠" },
  { id: "new", label: "מודעות חדשות", emoji: "🆕" },
  { id: "offmarket", label: "אוף-מרקט / ללא מתווך", emoji: "🔓" },
  { id: "opportunity", label: "הזדמנויות", emoji: "🎯" },
];

type HeatMetric = "density" | "opportunity" | "ai" | "fresh" | "offmarket" | "exclusive";
const HEAT_METRICS: { id: HeatMetric; label: string; emoji: string }[] = [
  { id: "density", label: "עוצמת שוק", emoji: "🔥" },
  { id: "opportunity", label: "הזדמנויות", emoji: "🎯" },
  { id: "ai", label: "המלצות AI", emoji: "🧠" },
  { id: "fresh", label: "טריות מודעות", emoji: "🆕" },
  { id: "offmarket", label: "מוכר / ללא מתווך", emoji: "🔓" },
  { id: "exclusive", label: "בלעדיות", emoji: "💎" },
];
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
function weightOf(m: MapPointMetrics, metric: HeatMetric): number {
  switch (metric) {
    case "opportunity": return clamp01((m.opportunity ?? 0) / 100);
    case "ai": return clamp01((m.ai ?? 0) / 100);
    case "fresh": return m.freshnessDays == null ? 0.2 : clamp01(1 - Math.min(m.freshnessDays, 60) / 60);
    case "offmarket": return m.offmarket ? 1 : 0.12;
    case "exclusive": return m.exclusive ? 1 : 0.1;
    default: return 1;
  }
}

interface Filters { priceMin: string; priceMax: string; roomsMin: string; sqmMin: string; source: string; propertyType: string; oppMin: string; freshMax: string; text: string }
const EMPTY: Filters = { priceMin: "", priceMax: "", roomsMin: "", sqmMin: "", source: "", propertyType: "", oppMin: "", freshMax: "", text: "" };
const numF = (s: string): number | null => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
const ilsShort = (n: number | null): string => (n == null ? "—" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${Math.round(n)}`);

function matchFilters(m: MapPointMetrics, f: Filters): boolean {
  const pMin = numF(f.priceMin), pMax = numF(f.priceMax), rMin = numF(f.roomsMin), sMin = numF(f.sqmMin), oMin = numF(f.oppMin), frMax = numF(f.freshMax);
  if (pMin != null && (m.price == null || m.price < pMin)) return false;
  if (pMax != null && (m.price == null || m.price > pMax)) return false;
  if (rMin != null && (m.rooms == null || m.rooms < rMin)) return false;
  if (sMin != null && (m.sqm == null || m.sqm < sMin)) return false;
  if (oMin != null && ((m.opportunity ?? m.ai ?? 0) < oMin)) return false;
  if (frMax != null && (m.freshnessDays == null || m.freshnessDays > frMax)) return false;
  if (f.source && m.source !== f.source) return false;
  if (f.propertyType && m.propertyType !== f.propertyType) return false;
  if (f.text) { const q = f.text.toLowerCase(); if (![m.city, m.neighborhood, m.street].some((v) => v && v.toLowerCase().includes(q))) return false; }
  return true;
}

const COMMISSION_RATE = 0.02;
interface Agg { count: number; exclusives: number; offmarket: number; fresh: number; opportunities: number; avgPrice: number | null; avgPpsqm: number | null; avgOpp: number | null; commission: number }
function aggregate(pts: MapPoint[]): Agg {
  const prices = pts.map((p) => p.m.price).filter((n): n is number => n != null);
  const ppsqm = pts.map((p) => (p.m.price != null && p.m.sqm ? p.m.price / p.m.sqm : null)).filter((n): n is number => n != null);
  const opp = pts.map((p) => p.m.opportunity ?? p.m.ai).filter((n): n is number => n != null);
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  const internalPrice = pts.filter((p) => p.m.kind === "internal").reduce((s, p) => s + (p.m.price ?? 0), 0);
  return {
    count: pts.length,
    exclusives: pts.filter((p) => p.m.exclusive).length,
    offmarket: pts.filter((p) => p.m.offmarket).length,
    fresh: pts.filter((p) => p.m.fresh).length,
    opportunities: pts.filter((p) => (p.m.opportunity ?? 0) >= 70).length,
    avgPrice: avg(prices), avgPpsqm: avg(ppsqm), avgOpp: avg(opp),
    commission: Math.round(internalPrice * COMMISSION_RATE),
  };
}
const inZone = (p: MapPoint, z: MapZone) => p.m.neighborhood === z.neighborhood && (p.m.city ?? "") === (z.city ?? "");

const COMP_TONE: Record<string, StatusTone> = { high: "rising", moderate: "contender", low: "runner", none: "neutral" };
const COMP_HE: Record<string, string> = { high: "תחרות גבוהה", moderate: "תחרות בינונית", low: "תחרות נמוכה", none: "ללא תחרות" };
const FEED_HE: Record<string, string> = { new_listing: "מודעה חדשה", off_market: "ללא מתווך", opportunity: "הזדמנות" };

function nextAction(m: MapPointMetrics): string {
  if ((m.opportunity ?? 0) >= 70) return "🎯 הזדמנות חמה — פנה למוכר/בעל הנכס";
  if (m.offmarket) return "🔓 ללא מתווך — צור קשר ישיר";
  if (m.fresh) return "🆕 מודעה טרייה — פעל מהר לפני התחרות";
  if ((m.ai ?? 0) >= 70) return "🧠 מומלץ ע\"י AI — בדוק התאמות קונים";
  return "בדוק התאמות קונים ושייך לפעולה";
}

interface SavedView { name: string; filters: Filters; metric: HeatMetric; heatmap: boolean; layers: MapLayer[] }
const VIEWS_KEY = "zono-territory-views";

// ── Dashboard card ──────────────────────────────────────────────────────────
function DashCard({ emoji, label, value, hint, tone = "brand" }: { emoji: string; label: string; value: string; hint?: string; tone?: "brand" | "success" | "warning" }) {
  const v = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-brand-strong";
  return (
    <div className="bg-card/90 border-line rounded-2xl border p-3 shadow-[var(--shadow-card)] backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <p className="text-muted flex items-center gap-1 text-[11px] font-bold">{emoji} {label}</p>
      <p className={`mt-1 truncate text-lg font-black ${v}`}>{value}</p>
      {hint && <p className="text-muted truncate text-[10px]">{hint}</p>}
    </div>
  );
}

export function LiveMarketMapView({ data }: { data: MapIntelligenceDTO }) {
  const [active, setActive] = useState<Set<MapLayer>>(new Set(LAYERS.map((l) => l.id)));
  const [heatmap, setHeatmap] = useState(false);
  const [metric, setMetric] = useState<HeatMetric>("density");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [zone, setZone] = useState<MapZone | null>(null);
  const [zoneData, setZoneData] = useState<TerritoryIntelligenceDTO | null>(null);
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const [copied, setCopied] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [cmpOpen, setCmpOpen] = useState(false);
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => { queueMicrotask(() => { try { const raw = localStorage.getItem(VIEWS_KEY); if (raw) setViews(JSON.parse(raw)); } catch { /* storage unavailable */ } }); }, []);
  const persist = (v: SavedView[]) => { setViews(v); try { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); } catch { /* ignore */ } };

  const toggle = (id: MapLayer) => setActive((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setF = (k: keyof Filters, v: string) => setFilters((p) => ({ ...p, [k]: v }));

  const sources = useMemo(() => Array.from(new Set(data.points.map((p) => p.m.source).filter(Boolean))) as string[], [data.points]);
  const types = useMemo(() => Array.from(new Set(data.points.map((p) => p.m.propertyType).filter(Boolean))) as string[], [data.points]);

  const filtered = useMemo(() => data.points.filter((p) => p.layers.some((l) => active.has(l)) && matchFilters(p.m, filters)), [data.points, active, filters]);

  const points: ZonoMapPoint[] = useMemo(() =>
    filtered.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.title, details: p.details, tone: p.tone, href: p.href, imageUrl: p.imageUrl, weight: heatmap ? weightOf(p.m, metric) : undefined })),
    [filtered, heatmap, metric]);

  // Territory dashboard aggregates (from all points; action/commission from own).
  const dash = useMemo(() => {
    const agg = aggregate(data.points);
    const streets = new Map<string, { sum: number; n: number }>();
    for (const p of data.points) { if (!p.m.street) continue; const o = p.m.opportunity ?? p.m.ai ?? 0; const e = streets.get(p.m.street) ?? { sum: 0, n: 0 }; e.sum += o; e.n++; streets.set(p.m.street, e); }
    let topStreet: { street: string; score: number } | null = null;
    for (const [street, e] of streets) if (e.n >= 2) { const score = Math.round(e.sum / e.n); if (!topStreet || score > topStreet.score) topStreet = { street, score }; }
    const internal = data.points.filter((p) => p.m.kind === "internal");
    const action = internal.filter((p) => (p.m.freshnessDays ?? 0) > 60 || (p.m.opportunity ?? 0) >= 70).length;
    return { agg, topStreet, action, topZone: data.zones[0] ?? null, signal: data.signals[0] ?? null };
  }, [data]);

  const runSearch = () => {
    const q = filters.text.trim().toLowerCase();
    if (!q) return;
    const hit = filtered.find((p) => [p.m.city, p.m.neighborhood, p.m.street, p.title].some((v) => v && v.toLowerCase().includes(q)));
    const zoneHit = data.zones.find((z) => [z.neighborhood, z.city].some((v) => v && v.toLowerCase().includes(q)));
    const t = hit ?? zoneHit;
    if (t) setFocus({ lat: t.lat, lng: t.lng, zoom: hit ? 16 : 14 });
  };

  const copyLink = () => {
    if (!selected?.href) return;
    const url = typeof window !== "undefined" ? new URL(selected.href, window.location.origin).href : selected.href;
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => { /* clipboard unavailable */ });
  };

  const openZone = (z: MapZone) => { setZone(z); setZoneData(null); start(async () => { setZoneData(await getZoneIntelligenceAction(z.city || null, z.neighborhood)); }); };

  const saveView = () => {
    const name = (filters.text.trim() || `תצוגה ${views.length + 1}`).slice(0, 24);
    persist([...views.filter((v) => v.name !== name), { name, filters, metric, heatmap, layers: [...active] }].slice(-12));
  };
  const restoreView = (v: SavedView) => { setFilters(v.filters); setMetric(v.metric); setHeatmap(v.heatmap); setActive(new Set(v.layers)); };
  const deleteView = (name: string) => persist(views.filter((v) => v.name !== name));

  const zoneA = data.zones.find((z) => z.id === cmpA) ?? null;
  const zoneB = data.zones.find((z) => z.id === cmpB) ?? null;
  const aggA = zoneA ? aggregate(data.points.filter((p) => inZone(p, zoneA))) : null;
  const aggB = zoneB ? aggregate(data.points.filter((p) => inZone(p, zoneB))) : null;

  const hasPoints = data.points.length > 0;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const field = "bg-card border-line text-ink focus:border-brand-light h-9 rounded-lg border px-2.5 text-[13px] outline-none w-full";

  return (
    <IntelligencePage wide>
      <MarketIntelNav active="map" crumbs={[{ label: "מפת שוק חיה" }]} />
      <IntelligenceHeader
        emoji="🗺️" eyebrow="LIVE MARKET MAP" title="מפת שוק חיה"
        subtitle="דשבורד טריטוריה, מודיעין משוקלל, שכבות חכמות, סינון חי, השוואה ותצוגות שמורות."
        actions={
          <IntelligenceActionBar>
            <button onClick={() => setCmpOpen(true)} className="border-line bg-card text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition">⚖️ השוואת אזורים</button>
            <IntelligenceActionLink href="/market-intelligence/listings">🌍 נכסי השוק</IntelligenceActionLink>
            <IntelligenceActionLink href="/property-radar">📡 רדאר נכסים</IntelligenceActionLink>
          </IntelligenceActionBar>
        }
      />

      {!hasPoints ? (
        <IntelligenceEmptyState title="עדיין אין מספיק נכסים עם מיקום להצגת מפה" steps={["סנכרן נכסים חיצוניים כדי להתחיל", "רענן מערכת", "חזור למפה לאחר הסנכרון"]} />
      ) : (
      <>
        {/* Territory dashboard */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <DashCard emoji="🎯" label="הזדמנות היום" value={dash.signal?.label ?? `${dash.agg.opportunities} הזדמנויות`} hint={dash.signal?.neighborhood ?? undefined} />
          <DashCard emoji="🔥" label="השכונה הפעילה" value={dash.topZone?.neighborhood ?? "—"} hint={dash.topZone ? `${dash.topZone.listings} מודעות` : undefined} tone="success" />
          <DashCard emoji="🛣️" label="רחוב עם פוטנציאל" value={dash.topStreet?.street ?? "—"} hint={dash.topStreet ? `ציון ${dash.topStreet.score}` : undefined} />
          <DashCard emoji="💰" label="עמלה פוטנציאלית" value={ilsShort(dash.agg.commission || null)} hint="הערכה 2% על מלאי המשרד" tone="success" />
          <DashCard emoji="⚠️" label="נכסים לפעולה" value={String(dash.action)} hint="מלאי ישן / הזדמנות" tone="warning" />
          <DashCard emoji="🆕" label="מודעות טריות" value={String(dash.agg.fresh)} hint="30 ימים אחרונים" />
        </div>

        {/* Saved views */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <button onClick={saveView} className="btn-zono-primary rounded-lg px-3 py-1.5 text-[12px] font-bold text-white">💾 שמור תצוגה</button>
          {views.map((v) => (
            <span key={v.name} className="border-line bg-card text-ink inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] font-bold">
              <button onClick={() => restoreView(v)} className="hover:text-brand-strong">{v.name}</button>
              <button onClick={() => deleteView(v.name)} className="text-muted hover:text-danger">×</button>
            </span>
          ))}
          {views.length === 0 && <span className="text-muted text-[11px]">שמור פילטרים, שכבות ותצוגת חום כדי לחזור אליהם מיידית.</span>}
        </div>

        <div className="grid gap-4 lg:grid-cols-[250px_1fr_280px]">
          <IntelligenceSidebar>
            <TerminalSection title="חיפוש טריטוריה" subtitle="עיר · שכונה · רחוב · נכס">
              <div className="flex gap-1.5">
                <input value={filters.text} onChange={(e) => setF("text", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }} placeholder="חפש והזז את המפה…" className={field} />
                <button onClick={runSearch} className="btn-zono-primary shrink-0 rounded-lg px-3 text-[13px] font-bold text-white">➤</button>
              </div>
            </TerminalSection>

            <TerminalSection title="שכבות מפה" subtitle="הפעל/כבה עצמאית">
              <div className="flex flex-col gap-1.5">
                {LAYERS.map((l) => {
                  const on = active.has(l.id);
                  return (
                    <button key={l.id} onClick={() => toggle(l.id)} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${on ? "border-brand-light bg-brand-soft text-brand-strong" : "border-line bg-card text-muted"}`}>
                      <span>{l.emoji} {l.label}</span><span className="text-[11px] tabular-nums">{data.counts[l.id]}</span>
                    </button>
                  );
                })}
                <button onClick={() => setHeatmap((v) => !v)} className={`mt-1 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${heatmap ? "border-brand-light bg-brand-soft text-brand-strong" : "border-line bg-card text-muted"}`}>
                  <span>🔥 מפת חום חכמה</span><span className="text-[11px]">{heatmap ? "פעיל" : "כבוי"}</span>
                </button>
              </div>
              {heatmap && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {HEAT_METRICS.map((h) => (
                    <button key={h.id} onClick={() => setMetric(h.id)} className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${metric === h.id ? "border-brand-light bg-brand-soft text-brand-strong" : "border-line bg-card text-muted"}`}>{h.emoji} {h.label}</button>
                  ))}
                </div>
              )}
            </TerminalSection>

            <TerminalSection title={`מסננים${activeFilterCount ? ` · ${activeFilterCount}` : ""}`} subtitle="מעדכן את המפה מיידית">
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5"><input value={filters.priceMin} onChange={(e) => setF("priceMin", e.target.value)} inputMode="numeric" placeholder="מחיר מ-" className={field} /><input value={filters.priceMax} onChange={(e) => setF("priceMax", e.target.value)} inputMode="numeric" placeholder="עד" className={field} /></div>
                <div className="flex gap-1.5"><input value={filters.roomsMin} onChange={(e) => setF("roomsMin", e.target.value)} inputMode="numeric" placeholder="חדרים מ-" className={field} /><input value={filters.sqmMin} onChange={(e) => setF("sqmMin", e.target.value)} inputMode="numeric" placeholder="מ״ר מ-" className={field} /></div>
                <div className="flex gap-1.5"><input value={filters.oppMin} onChange={(e) => setF("oppMin", e.target.value)} inputMode="numeric" placeholder="ציון הזדמנות מ-" className={field} /><input value={filters.freshMax} onChange={(e) => setF("freshMax", e.target.value)} inputMode="numeric" placeholder="גיל מודעה עד (ימים)" className={field} /></div>
                <select value={filters.source} onChange={(e) => setF("source", e.target.value)} className={field}><option value="">כל המקורות</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                <select value={filters.propertyType} onChange={(e) => setF("propertyType", e.target.value)} className={field}><option value="">כל סוגי הנכס</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-muted text-[11px] tabular-nums">{filtered.length} מתוך {data.points.length}</span>
                  {activeFilterCount > 0 && <button onClick={() => setFilters(EMPTY)} className="text-brand-strong text-[11px] font-bold">נקה מסננים</button>}
                </div>
              </div>
            </TerminalSection>

            <TerminalSection title="סייר אזורים" subtitle="בחר שכונה למודיעין">
              {data.zones.length ? (
                <div className="flex max-h-[30vh] flex-col gap-1 overflow-y-auto">
                  {data.zones.slice(0, 40).map((z) => (
                    <button key={z.id} onClick={() => openZone(z)} className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-right text-sm transition ${zone?.id === z.id ? "bg-brand-soft text-brand-strong" : "hover:bg-surface text-ink"}`}>
                      <span className="truncate font-bold">{z.neighborhood}<span className="text-muted font-normal"> · {z.city}</span></span>
                      <span className="text-muted shrink-0 text-[11px] tabular-nums">{z.listings}</span>
                    </button>
                  ))}
                </div>
              ) : <TerminalEmpty text="אין שכונות גאוקודדות עדיין." />}
            </TerminalSection>
          </IntelligenceSidebar>

          <div className="relative min-w-0">
            <ZonoMap points={points} heatmap={heatmap} markersWithHeat={heatmap} focus={focus}
              onSelect={(id) => setSelected(filtered.find((p) => p.id === id) ?? null)}
              heightClass="h-[74vh]" emptyMessage="אין מיקומים גאוקודדים לשכבות/מסננים שנבחרו." clusterThreshold={80} />
            {heatmap && (
              <div className="border-line bg-card/90 pointer-events-none absolute bottom-3 left-3 z-[5] rounded-2xl border px-3 py-2 shadow-[var(--shadow-card)] backdrop-blur-sm">
                <p className="text-ink text-[11px] font-black">{HEAT_METRICS.find((h) => h.id === metric)?.emoji} {HEAT_METRICS.find((h) => h.id === metric)?.label}</p>
                <div className="mt-1 h-2 w-32 rounded-full" style={{ background: "linear-gradient(90deg, rgba(167,139,250,.5), #8b5cf6, #6d28d9, #43148c)" }} />
                <div className="text-muted mt-0.5 flex justify-between text-[9px] font-bold"><span>נמוך</span><span>גבוה</span></div>
              </div>
            )}
          </div>

          <aside>
            <TerminalSection title="פיד שוק חי" subtitle="כרונולוגי — אירועים קיימים">
              {data.feed.length ? (
                <div className="flex max-h-[64vh] flex-col overflow-y-auto">
                  {data.feed.map((f) => (
                    <Link key={f.id} href={f.href ?? "#"} prefetch={false} className="border-line/60 hover:bg-surface flex flex-col gap-0.5 border-b py-2 transition last:border-0">
                      <span className="flex items-center justify-between gap-2">
                        <Pill tone={f.kind === "opportunity" ? "rising" : f.kind === "off_market" ? "contender" : "neutral"}>{FEED_HE[f.kind] ?? f.kind}</Pill>
                        <span className="text-muted text-[10px]">{f.at ? new Date(f.at).toLocaleDateString("he-IL") : ""}</span>
                      </span>
                      <span className="text-ink truncate text-xs font-bold">{f.title}</span>
                      {f.detail && <span className="text-muted truncate text-[11px]">{f.detail}</span>}
                    </Link>
                  ))}
                </div>
              ) : <TerminalEmpty text="אין אירועים אחרונים." />}
            </TerminalSection>
          </aside>
        </div>
      </>
      )}

      {/* Zone intelligence drawer */}
      <IntelligenceDrawer open={!!zone} onClose={() => setZone(null)} eyebrow="אזור שנבחר" title={zone?.neighborhood ?? ""} subtitle={zone?.city || "—"}>
        {zone && (() => { const za = aggregate(data.points.filter((p) => inZone(p, zone))); return (
          <>
            <MetricGrid>
              <Metric label="מודעות באזור" value={String(zone.listings)} accent />
              <Metric label="ללא מתווך" value={String(zone.privateListings)} />
              <Metric label="מחיר ממוצע" value={ilsShort(za.avgPrice)} />
              <Metric label="₪ למ״ר" value={za.avgPpsqm != null ? ilsShort(za.avgPpsqm) : "—"} />
              <Metric label="הזדמנויות" value={String(za.opportunities)} />
              <Metric label="בלעדיות" value={String(za.exclusives)} />
              <Metric label="מודעות טריות" value={String(za.fresh)} />
              <Metric label="ציון הזדמנות ממוצע" value={za.avgOpp != null ? String(za.avgOpp) : "—"} />
            </MetricGrid>
            <div className="mt-4">
              {pending && !zoneData ? <TerminalEmpty text="טוען מודיעין אזור…" /> : zoneData ? <ZoneIntel dto={zoneData} /> : <TerminalEmpty text="אין מודיעין תחרותי מפורט לאזור זה עדיין." />}
            </div>
          </>
        ); })()}
      </IntelligenceDrawer>

      {/* Area comparison drawer */}
      <IntelligenceDrawer open={cmpOpen} onClose={() => setCmpOpen(false)} eyebrow="מודיעין השוואתי" title="השוואת אזורים" subtitle="בחר שני אזורים להשוואה">
        <div className="flex gap-2">
          <select value={cmpA} onChange={(e) => setCmpA(e.target.value)} className={field}><option value="">אזור א׳…</option>{data.zones.map((z) => <option key={z.id} value={z.id}>{z.neighborhood} · {z.city}</option>)}</select>
          <select value={cmpB} onChange={(e) => setCmpB(e.target.value)} className={field}><option value="">אזור ב׳…</option>{data.zones.map((z) => <option key={z.id} value={z.id}>{z.neighborhood} · {z.city}</option>)}</select>
        </div>
        {aggA && aggB ? (
          <div className="mt-4">
            <div className="mb-2 grid grid-cols-3 gap-2 text-center text-[12px] font-black">
              <span className="text-brand-strong truncate">{zoneA?.neighborhood}</span><span className="text-muted">מדד</span><span className="text-brand-strong truncate">{zoneB?.neighborhood}</span>
            </div>
            {([
              ["מודעות", String(aggA.count), String(aggB.count)],
              ["מחיר ממוצע", ilsShort(aggA.avgPrice), ilsShort(aggB.avgPrice)],
              ["₪ למ״ר", aggA.avgPpsqm != null ? ilsShort(aggA.avgPpsqm) : "—", aggB.avgPpsqm != null ? ilsShort(aggB.avgPpsqm) : "—"],
              ["הזדמנויות", String(aggA.opportunities), String(aggB.opportunities)],
              ["ללא מתווך", String(aggA.offmarket), String(aggB.offmarket)],
              ["מודעות טריות", String(aggA.fresh), String(aggB.fresh)],
              ["בלעדיות", String(aggA.exclusives), String(aggB.exclusives)],
              ["ציון הזדמנות ממוצע", aggA.avgOpp != null ? String(aggA.avgOpp) : "—", aggB.avgOpp != null ? String(aggB.avgOpp) : "—"],
            ] as [string, string, string][]).map(([label, a, b]) => (
              <div key={label} className="border-line/60 grid grid-cols-3 items-center gap-2 border-b py-2 text-center text-[13px] last:border-0">
                <span className="text-ink font-black tabular-nums">{a}</span><span className="text-muted text-[11px]">{label}</span><span className="text-ink font-black tabular-nums">{b}</span>
              </div>
            ))}
          </div>
        ) : <TerminalEmpty text="בחר שני אזורים כדי לראות השוואה." />}
      </IntelligenceDrawer>

      {/* Property preview drawer — opens INSIDE ZONO (never navigates out). */}
      <IntelligenceDrawer open={!!selected} onClose={() => setSelected(null)} eyebrow="נכס נבחר" title={selected?.title ?? "נכס"} subtitle={[selected?.m.neighborhood, selected?.m.city].filter(Boolean).join(" · ") || "—"}>
        {selected && (
          <div className="flex flex-col gap-3">
            {selected.imageUrl && <div className="h-44 w-full rounded-2xl bg-cover bg-center shadow-[var(--shadow-card)]" style={{ backgroundImage: `url(${selected.imageUrl})` }} />}
            <MetricGrid>
              {selected.m.price != null && <Metric label="מחיר" value={`₪${Math.round(selected.m.price).toLocaleString("he-IL")}`} accent />}
              {(selected.m.rooms != null || selected.m.sqm != null) && <Metric label="גודל" value={[selected.m.rooms != null ? `${selected.m.rooms} חד׳` : null, selected.m.sqm != null ? `${selected.m.sqm} מ״ר` : null].filter(Boolean).join(" · ") || "—"} />}
              {(selected.m.opportunity ?? selected.m.ai) != null && <Metric label="ציון AI" value={String(selected.m.opportunity ?? selected.m.ai)} />}
              {selected.m.freshnessDays != null && <Metric label="גיל מודעה" value={`${selected.m.freshnessDays} ימים`} />}
            </MetricGrid>
            <div className="flex flex-wrap gap-1.5">
              {selected.m.propertyType && <Pill tone="neutral">{selected.m.propertyType}</Pill>}
              {selected.m.status && <Pill tone="neutral">{selected.m.status}</Pill>}
              {selected.m.source && <Pill tone="neutral">מקור: {selected.m.source}</Pill>}
              {selected.m.exclusive && <Pill tone="rising">בלעדיות</Pill>}
              {selected.m.offmarket && <Pill tone="contender">ללא מתווך</Pill>}
            </div>
            <div className="bg-brand-soft text-brand-strong rounded-xl px-3 py-2 text-[13px] font-bold">➤ פעולה מומלצת: {nextAction(selected.m)}</div>
            {selected.m.street && <p className="text-muted text-[12px]">📍 {[selected.m.street, selected.m.neighborhood, selected.m.city].filter(Boolean).join(", ")}</p>}
            <div className="mt-1 flex flex-col gap-2">
              {selected.href && <Link href={selected.href} prefetch={false} className="btn-zono-primary inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-black text-white">פתח נכס בתוך ZONO ←</Link>}
              <div className="flex gap-2">
                <Link href="/action-center" className="border-line bg-surface text-ink hover:border-brand-light flex flex-1 items-center justify-center rounded-xl border px-3 py-2 text-[13px] font-bold transition">🎯 צור משימה</Link>
                <button type="button" onClick={copyLink} className="border-line bg-surface text-ink hover:border-brand-light flex flex-1 items-center justify-center rounded-xl border px-3 py-2 text-[13px] font-bold transition">{copied ? "הקישור הועתק ✓" : "🔗 שתף"}</button>
              </div>
              {selected.href && <Link href={selected.href} prefetch={false} className="text-muted text-center text-[11px] font-semibold hover:underline">התאמות קונים, לוח זמנים ומצב שיווק — בעמוד הנכס ←</Link>}
            </div>
            <p className="text-muted text-[11px] leading-relaxed">מקורות חיצוניים (יד2/מדלן) משמשים כמידע בלבד — הצפייה והפעולה נשארות בתוך ZONO.</p>
          </div>
        )}
      </IntelligenceDrawer>
    </IntelligencePage>
  );
}

function ZoneIntel({ dto }: { dto: TerritoryIntelligenceDTO }) {
  const ranked = dto.agencies.slice().sort((a, b) => (b.dominance ?? 0) - (a.dominance ?? 0));
  const leader = ranked.find((a) => a.agencyId === dto.leaderAgencyId) ?? ranked[0] ?? null;
  const comp = dto.competitionLevel ?? "none";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink text-sm font-black">משרדים מובילים באזור</span>
        <StatusBadge label={COMP_HE[comp]} tone={COMP_TONE[comp] ?? "neutral"} />
      </div>
      <MetricGrid>
        <Metric label="משרד מוביל" value={leader?.agencyName ?? "—"} accent />
        <Metric label="שליטה אזורית" value={val(leader?.dominance)} />
        <Metric label="נתח מלאי מוביל" value={pct01(leader?.inventoryShare)} />
        <Metric label="משרדים פעילים" value={String(dto.agencies.length)} />
      </MetricGrid>
      <div>
        <p className="text-ink mb-1 text-xs font-black">דירוג שליטה</p>
        {ranked.length ? (
          <div className="flex flex-col">
            {ranked.slice(0, 8).map((a, i) => (
              <Link key={a.agencyId} href={`/office-intelligence/${encodeURIComponent(a.agencyId)}`} prefetch={false} className="border-line/60 hover:bg-surface flex items-center justify-between gap-2 border-b py-1.5 text-xs transition last:border-0">
                <span className="text-ink truncate font-bold">{i + 1}. {a.agencyName}</span>
                <span className="text-brand-strong shrink-0 tabular-nums">{val(a.dominance)}</span>
              </Link>
            ))}
          </div>
        ) : <TerminalEmpty text="—" />}
      </div>
      <Link href={`/neighborhood-intelligence/${encodeURIComponent([dto.territory.city ?? "", dto.territory.neighborhood ?? ""].join("|"))}`} prefetch={false} className="bg-brand-soft text-brand-strong inline-flex justify-center rounded-xl px-4 py-2.5 text-sm font-black">פתח מודיעין שכונה מלא ←</Link>
    </div>
  );
}
