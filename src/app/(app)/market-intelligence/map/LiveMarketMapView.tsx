"use client";
// ============================================================================
// 🗺️ Live Market Intelligence Map™ — flagship intelligence experience (RTL).
// Presentation only. Layer system + Zone Explorer + live feed over the existing
// MapLibre map. Everything shown already exists in persisted intelligence;
// nothing is recomputed. White, minimal, financial-terminal.
// ============================================================================
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ZonoMap, type ZonoMapPoint } from "@/components/maps/ZonoMap";
import { TerminalSection, Metric, MetricGrid, StatusBadge, Pill, TerminalEmpty, val, pct01, type StatusTone } from "@/components/intelligence/terminal";
import {
  IntelligencePage, IntelligenceHeader, IntelligenceActionBar, IntelligenceActionLink,
  IntelligenceSidebar, IntelligenceDrawer, IntelligenceEmptyState,
} from "@/components/intelligence/framework";
import { MarketIntelNav } from "@/components/market-intelligence/MarketIntelNav";
import { getZoneIntelligenceAction } from "@/lib/intelligence-explorer/zone-actions";
import type { MapIntelligenceDTO, MapLayer, MapZone } from "@/lib/intelligence-explorer/map";
import type { TerritoryIntelligenceDTO } from "@/lib/agencies/api/agencyIntelligenceApiTypes";

const LAYERS: { id: MapLayer; label: string; emoji: string }[] = [
  { id: "external", label: "מודעות חיצוניות", emoji: "🌍" },
  { id: "office", label: "נכסי המשרד", emoji: "🏢" },
  { id: "mine", label: "הנכסים שלי", emoji: "🏠" },
  { id: "new", label: "מודעות חדשות", emoji: "🆕" },
  { id: "offmarket", label: "אוף-מרקט / ללא מתווך", emoji: "🔓" },
  { id: "opportunity", label: "הזדמנויות", emoji: "🎯" },
];
const COMP_TONE: Record<string, StatusTone> = { high: "rising", moderate: "contender", low: "runner", none: "neutral" };
const COMP_HE: Record<string, string> = { high: "תחרות גבוהה", moderate: "תחרות בינונית", low: "תחרות נמוכה", none: "ללא תחרות" };
const FEED_HE: Record<string, string> = { new_listing: "מודעה חדשה", off_market: "ללא מתווך", opportunity: "הזדמנות" };

export function LiveMarketMapView({ data }: { data: MapIntelligenceDTO }) {
  const [active, setActive] = useState<Set<MapLayer>>(new Set(LAYERS.map((l) => l.id)));
  const [heatmap, setHeatmap] = useState(false);
  const [zone, setZone] = useState<MapZone | null>(null);
  const [zoneData, setZoneData] = useState<TerritoryIntelligenceDTO | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: MapLayer) => setActive((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const points: ZonoMapPoint[] = useMemo(() =>
    data.points
      .filter((p) => p.layers.some((l) => active.has(l)))
      .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.title, details: p.details, tone: p.tone, href: p.href })),
    [data.points, active]);

  const openZone = (z: MapZone) => {
    setZone(z); setZoneData(null);
    start(async () => { setZoneData(await getZoneIntelligenceAction(z.city || null, z.neighborhood)); });
  };

  const hasPoints = data.points.length > 0;

  return (
    <IntelligencePage wide>
      <MarketIntelNav active="map" crumbs={[{ label: "מפת שוק חיה" }]} />

      <IntelligenceHeader
        emoji="🗺️"
        eyebrow="LIVE MARKET MAP"
        title="מפת שוק חיה"
        subtitle="שכבות מודיעין על נכסי שוק, הזדמנויות, ירידות מחיר ואזורים פעילים."
        actions={
          <IntelligenceActionBar>
            <IntelligenceActionLink href="/market-intelligence/listings">🌍 נכסי השוק</IntelligenceActionLink>
            <IntelligenceActionLink href="/market-intelligence/dashboard">📊 דשבורד מודיעין</IntelligenceActionLink>
            <IntelligenceActionLink href="/property-radar">📡 רדאר נכסים</IntelligenceActionLink>
          </IntelligenceActionBar>
        }
      />

      {!hasPoints ? (
        <IntelligenceEmptyState
          title="עדיין אין מספיק נכסים עם מיקום להצגת מפה"
          steps={["סנכרן נכסים חיצוניים כדי להתחיל", "רענן מערכת", "חזור למפה לאחר הסנכרון"]}
        />
      ) : (
      <div className="grid gap-4 lg:grid-cols-[240px_1fr_280px]">
        {/* Layer panel + zones (compact) */}
        <IntelligenceSidebar>
          <TerminalSection title="שכבות מפה" subtitle="הפעל/כבה עצמאית">
            <div className="flex flex-col gap-1.5">
              {LAYERS.map((l) => {
                const on = active.has(l.id);
                return (
                  <button key={l.id} onClick={() => toggle(l.id)} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${on ? "border-brand-light bg-brand-soft text-brand-strong" : "border-line bg-card text-muted"}`}>
                    <span>{l.emoji} {l.label}</span>
                    <span className="text-[11px] tabular-nums">{data.counts[l.id]}</span>
                  </button>
                );
              })}
              <button onClick={() => setHeatmap((v) => !v)} className={`mt-1 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${heatmap ? "border-brand-light bg-brand-soft text-brand-strong" : "border-line bg-card text-muted"}`}>
                <span>🔥 מפת חום</span><span className="text-[11px]">{heatmap ? "פעיל" : "כבוי"}</span>
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Link href="/transactions" className="border-line bg-surface text-ink rounded-lg border px-2 py-1 text-[11px] font-bold">🏛️ עסקאות רשמיות ↗</Link>
              <Link href="/property-radar" className="border-line bg-surface text-ink rounded-lg border px-2 py-1 text-[11px] font-bold">📡 רדאר נכסים ↗</Link>
            </div>
          </TerminalSection>

          <TerminalSection title="סייר אזורים" subtitle="בחר שכונה לפתיחת מודיעין">
            {data.zones.length ? (
              <div className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
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

        {/* Map — visually dominant */}
        <div className="min-w-0">
          <ZonoMap points={points} heatmap={heatmap} heightClass="h-[74vh]" emptyMessage="אין מיקומים גאוקודדים לשכבות שנבחרו." clusterThreshold={80} />
        </div>

        {/* Live feed — secondary */}
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
      )}

      {/* Zone drawer — one reusable Intelligence drawer (Phase 26.8) */}
      <IntelligenceDrawer
        open={!!zone}
        onClose={() => setZone(null)}
        eyebrow="אזור שנבחר"
        title={zone?.neighborhood ?? ""}
        subtitle={zone?.city || "—"}
      >
        {zone && (
          <>
            <MetricGrid>
              <Metric label="מודעות באזור" value={String(zone.listings)} accent />
              <Metric label="ללא מתווך" value={String(zone.privateListings)} />
            </MetricGrid>
            <div className="mt-4">
              {pending && !zoneData ? <TerminalEmpty text="טוען מודיעין אזור…" /> : zoneData ? <ZoneIntel dto={zoneData} /> : <TerminalEmpty text="אין מודיעין מפורט לאזור זה עדיין." />}
            </div>
          </>
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
        <span className="text-ink text-sm font-black">מודיעין אזור</span>
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
