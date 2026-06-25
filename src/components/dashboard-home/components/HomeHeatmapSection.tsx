"use client";
// ============================================================================
// ZONO — Home live-property map (Phase 24.6). A large, ZONO-purple map card on
// the Home Dashboard showing REAL internal + external properties in the agent's
// operating area, with a glass filter panel. Real coordinates only — clustered
// branded markers (no fake heat, no invented pins). Honest empty states.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { ZonoMap, type ZonoMapPoint } from "@/components/maps/ZonoMap";
import { getHomeMapDataAction } from "@/lib/home-map/actions";
import { DEFAULT_HOME_MAP_FILTERS, type HomeMapData, type HomeMapFilters, type MapDeal, type MapPropertyType, type MapScope, type MapSource } from "@/lib/home-map/types";

const SCOPES: { v: MapScope; label: string }[] = [{ v: "all", label: "הכל" }, { v: "internal", label: "פנימיים" }, { v: "external", label: "חיצוניים" }];
const DEALS: { v: MapDeal; label: string }[] = [{ v: "all", label: "הכל" }, { v: "sale", label: "למכירה" }, { v: "rent", label: "להשכרה" }];
const SOURCES: { v: MapSource; label: string }[] = [{ v: "all", label: "כל המקורות" }, { v: "yad2", label: "יד2" }, { v: "madlan", label: "מדלן" }, { v: "manual", label: "ידני" }];
const TYPES: { v: MapPropertyType; label: string }[] = [{ v: "all", label: "כל הסוגים" }, { v: "apartment", label: "דירה" }, { v: "house", label: "בית" }, { v: "commercial", label: "מסחרי" }, { v: "land", label: "מגרש" }];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-xl border px-3 py-1.5 text-sm font-bold transition ${active ? "bg-brand-strong border-brand-strong text-white" : "bg-white/5 border-white/10 text-white/70 hover:text-white"}`}>
      {children}
    </button>
  );
}

export function HomeHeatmapSection() {
  const [filters, setFilters] = useState<HomeMapFilters>(DEFAULT_HOME_MAP_FILTERS);
  const [data, setData] = useState<HomeMapData | null>(null);
  const [view, setView] = useState<"heat" | "markers">("heat");
  const [pending, start] = useTransition();

  function load(next: HomeMapFilters) {
    start(async () => { setData(await getHomeMapDataAction(next)); });
  }
  useEffect(() => { load(DEFAULT_HOME_MAP_FILTERS); /* initial */ }, []);

  function set<K extends keyof HomeMapFilters>(key: K, value: HomeMapFilters[K]) {
    const next = { ...filters, [key]: value };
    setFilters(next); load(next);
  }

  const points: ZonoMapPoint[] = (data?.points ?? []).map((p) => ({
    id: p.id, lat: p.lat, lng: p.lng, title: p.title, details: p.details,
    tone: p.origin === "internal" ? "brand" : "success", href: p.href ?? undefined,
  }));

  const noKey = data && !data.hasGoogleKey;
  const needArea = data && data.hasGoogleKey && !data.hasOperatingArea && data.total === 0;

  return (
    <section dir="rtl" className="relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-[#1a1033] via-[#241246] to-[#150a2b] p-5 shadow-[0_24px_70px_-20px_rgba(124,58,237,0.55)]">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-24 -start-24 h-64 w-64 rounded-full bg-purple-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -end-24 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white sm:text-2xl">מפת הנכסים החיה באזור שלך</h2>
          <p className="text-sm text-white/55">נכסים פנימיים וחיצוניים מתוך אזור ההתמחות שלך — מבוסס מיקום אמיתי בלבד</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-0.5">
            <button onClick={() => setView("heat")} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition ${view === "heat" ? "bg-brand-strong text-white" : "text-white/60"}`}><Icon name="Flame" size={13} /> חום</button>
            <button onClick={() => setView("markers")} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition ${view === "markers" ? "bg-brand-strong text-white" : "text-white/60"}`}><Icon name="MapPin" size={13} /> נקודות</button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 font-bold text-white/80"><span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-strong,#7c3aed)]" /> פנימי {data?.internalCount ?? 0}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 font-bold text-white/80"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> חיצוני {data?.externalCount ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Glass filter panel */}
      <div className="relative mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {SCOPES.map((s) => <Chip key={s.v} active={filters.scope === s.v} onClick={() => set("scope", s.v)}>{s.label}</Chip>)}
          <span className="mx-1 h-5 w-px bg-white/10" />
          {DEALS.map((d) => <Chip key={d.v} active={filters.deal === d.v} onClick={() => set("deal", d.v)}>{d.label}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {TYPES.map((tp) => <Chip key={tp.v} active={filters.propertyType === tp.v} onClick={() => set("propertyType", tp.v)}>{tp.label}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filters.source} onChange={(e) => set("source", e.target.value as MapSource)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-bold text-white/80">
            {SOURCES.map((s) => <option key={s.v} value={s.v} className="bg-[#241246]">{s.label}</option>)}
          </select>
          {(data?.areaCities.length ?? 0) > 0 && (
            <select value={filters.city ?? ""} onChange={(e) => set("city", e.target.value || null)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-bold text-white/80">
              <option value="" className="bg-[#241246]">כל אזור ההתמחות</option>
              {data!.areaCities.map((c) => <option key={c} value={c} className="bg-[#241246]">{c}</option>)}
            </select>
          )}
          <input inputMode="numeric" placeholder="מחיר מ־" value={filters.priceMin ?? ""} onChange={(e) => set("priceMin", e.target.value ? Number(e.target.value) : null)} className="w-28 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80" />
          <input inputMode="numeric" placeholder="עד" value={filters.priceMax ?? ""} onChange={(e) => set("priceMax", e.target.value ? Number(e.target.value) : null)} className="w-24 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80" />
          <Chip active={filters.newOnly} onClick={() => set("newOnly", !filters.newOnly)}>חדשים (14 ימים)</Chip>
          <Chip active={filters.privateOnly} onClick={() => set("privateOnly", !filters.privateOnly)}>בעלי בית פרטיים</Chip>
        </div>
      </div>

      {/* Map / empty states */}
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/10">
        {noKey ? (
          <div className="flex h-[380px] flex-col items-center justify-center gap-2 bg-black/20 text-center"><Icon name="Map" size={28} className="text-white/40" /><p className="text-sm font-bold text-white/70">מפה לא זמינה</p></div>
        ) : needArea ? (
          <div className="flex h-[380px] flex-col items-center justify-center gap-3 bg-black/20 text-center">
            <Icon name="MapPin" size={28} className="text-white/40" />
            <p className="text-sm font-bold text-white/80">יש להגדיר אזור התמחות כדי להציג מפת חום</p>
            <Link href="/settings/operating-areas" className="bg-brand-strong rounded-xl px-3 py-2 text-sm font-bold text-white">הגדרת אזור התמחות</Link>
          </div>
        ) : (
          <ZonoMap points={points} heightClass="h-[380px] lg:h-[460px]" clusterThreshold={60} heatmap={view === "heat"} emptyMessage="אין עדיין נכסים עם מיקום מדויק להצגה על המפה" />
        )}
        {pending && <div className="absolute end-3 top-3 rounded-full bg-black/40 px-3 py-1 text-xs font-bold text-white/80">טוען…</div>}
      </div>

      {/* Honest sub-notes */}
      <div className="relative mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/45">
        {data?.areaLabel && <span>אזור התמחות: {data.areaLabel}</span>}
        {view === "heat" && <span>עוצמת החום משקפת צפיפות מודעות אמיתית — חזק יותר היכן שיש יותר נכסים.</span>}
        {data && data.externalCount === 0 && <span>נכסים חיצוניים יוצגו לאחר סנכרון מקורות כמו Yad2 / Madlan.</span>}
        <span>מבוסס מיקום אמיתי בלבד — נכסים ללא קואורדינטות אינם מוצגים.</span>
      </div>
    </section>
  );
}
