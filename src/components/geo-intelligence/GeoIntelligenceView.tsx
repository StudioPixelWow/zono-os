"use client";
// ============================================================================
// 🗺️ ZONO — Geo Intelligence / Smart Map — view. 32.4.
// One map, many switchable heat layers. Right-side layer menu recolours the area
// choropleth instantly; each layer has its own colour scale + legend; clicking an
// area opens a full side panel with an AI recommendation; filters + AI Insights.
// Imports ONLY pure geo-intelligence submodules (never the server barrel).
// ============================================================================
import { useMemo, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { HEATMAP_LAYERS, LAYER_BY_ID, DEFAULT_LAYER_ID } from "@/lib/geo-intelligence/layers";
import { getHeatColor, metricDomain, formatValue, NEUTRAL } from "@/lib/geo-intelligence/color";
import type { GeoArea, GeoInsight, GeoFilters } from "@/lib/geo-intelligence/types";

interface Props {
  areas: GeoArea[];
  insights: GeoInsight[];
  dataMode: "real" | "partial" | "mock";
  notes: string[];
}

const MODE_LABEL: Record<Props["dataMode"], string> = { real: "נתונים חיים", partial: "נתונים + הערכות", mock: "נתוני הדגמה" };

function readableText(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "#0f172a";
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#0f172a" : "#ffffff";
}

const EMPTY_FILTERS: GeoFilters = { city: null, neighborhood: null, street: null, propertyType: null, roomsMin: null, priceMin: null, priceMax: null, period: "90d" };

export function GeoIntelligenceView({ areas, insights, dataMode, notes }: Props) {
  const [layerId, setLayerId] = useState<string>(DEFAULT_LAYER_ID);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [filters, setFilters] = useState<GeoFilters>(EMPTY_FILTERS);

  const layer = LAYER_BY_ID[layerId] ?? HEATMAP_LAYERS[0];

  const cities = useMemo(() => [...new Set(areas.map((a) => a.city).filter((c): c is string => !!c))], [areas]);
  const types = useMemo(() => [...new Set(areas.flatMap((a) => a.propertyTypes))], [areas]);

  const filtered = useMemo(() => areas.filter((a) => {
    if (filters.city && a.city !== filters.city) return false;
    if (filters.neighborhood && !(a.neighborhood ?? "").includes(filters.neighborhood)) return false;
    if (filters.street && !(a.name).includes(filters.street)) return false;
    if (filters.propertyType && !a.propertyTypes.includes(filters.propertyType)) return false;
    if (filters.priceMin != null && (a.metrics.avgPrice ?? 0) < filters.priceMin) return false;
    if (filters.priceMax != null && (a.metrics.avgPrice ?? Infinity) > filters.priceMax) return false;
    return true;
  }), [areas, filters]);

  const domain = useMemo(() => metricDomain(filtered, layer.metricKey), [filtered, layer]);
  const selected = filtered.find((a) => a.id === selectedId) ?? null;

  const sorted = useMemo(() => [...filtered].sort((a, b) => (b.metrics[layer.metricKey] ?? -Infinity) - (a.metrics[layer.metricKey] ?? -Infinity)), [filtered, layer]);

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      {/* Header */}
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Geo Intelligence</p>
          <h1 className="text-ink mt-1 flex items-center gap-2 text-2xl font-black"><Icon name="Map" size={22} /> מפת מודיעין חכמה</h1>
          <p className="text-muted mt-1 text-sm">בחרו שכבה כדי לראות איפה יקר, איפה יש ביקוש, איפה מעט היצע, איפה כדאי לפרסם ואיפה לגייס בלעדיות.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-3 py-1 text-[11px] font-bold", dataMode === "mock" ? "bg-warning-soft text-warning" : "bg-success-soft text-success")}>{MODE_LABEL[dataMode]}</span>
          <button onClick={() => setShowInsights((v) => !v)} className="bg-brand text-brand-fg inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#7c3aed,#2563eb)" }}>
            <Icon name="Sparkles" size={15} /> תובנות AI
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border-line grid grid-cols-2 gap-2 rounded-[18px] border p-3 sm:grid-cols-4 lg:grid-cols-7">
        <Select label="עיר" value={filters.city ?? ""} onChange={(v) => setFilters((f) => ({ ...f, city: v || null, neighborhood: null }))} options={["", ...cities]} render={(o) => o || "כל הערים"} />
        <TextFilter label="שכונה" value={filters.neighborhood ?? ""} onChange={(v) => setFilters((f) => ({ ...f, neighborhood: v || null }))} />
        <TextFilter label="רחוב" value={filters.street ?? ""} onChange={(v) => setFilters((f) => ({ ...f, street: v || null }))} />
        <Select label="סוג נכס" value={filters.propertyType ?? ""} onChange={(v) => setFilters((f) => ({ ...f, propertyType: v || null }))} options={["", ...types]} render={(o) => o || "כל הסוגים"} />
        <Select label="חדרים" value={String(filters.roomsMin ?? "")} onChange={(v) => setFilters((f) => ({ ...f, roomsMin: v ? Number(v) : null }))} options={["", "2", "3", "4", "5"]} render={(o) => (o ? `${o}+ חדרים` : "הכל")} />
        <NumFilter label='מחיר מ־' value={filters.priceMin} onChange={(v) => setFilters((f) => ({ ...f, priceMin: v }))} />
        <NumFilter label="מחיר עד" value={filters.priceMax} onChange={(v) => setFilters((f) => ({ ...f, priceMax: v }))} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        {/* Map + legend */}
        <div className="flex flex-col gap-3">
          <div className="border-line relative overflow-hidden rounded-[22px] border bg-[#0e0a1f] p-4 shadow-[var(--shadow-card)]">
            <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "44px 44px" }} />
            <div className="relative mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-black text-white"><Icon name={layer.icon} size={16} /> {layer.label}</h2>
              <span className="text-[11px] font-semibold text-white/60">{filtered.length} אזורים</span>
            </div>
            {filtered.length === 0 ? (
              <div className="relative grid h-64 place-items-center text-center text-sm text-white/70">אין אזורים התואמים לסינון.</div>
            ) : (
              <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {sorted.map((a) => {
                  const v = a.metrics[layer.metricKey];
                  const bg = getHeatColor(v, layer, domain);
                  const fg = readableText(bg === NEUTRAL ? "#e5e7eb" : bg);
                  return (
                    <button key={a.id} onClick={() => { setSelectedId(a.id); setShowInsights(false); }}
                      className={cn("group flex min-h-[92px] flex-col justify-between rounded-2xl p-3 text-right transition hover:scale-[1.03] hover:shadow-lg", selectedId === a.id && "ring-2 ring-white ring-offset-2 ring-offset-[#0e0a1f]")}
                      style={{ background: bg, color: fg }}>
                      <span className="line-clamp-1 text-[12px] font-bold opacity-90">{a.name}</span>
                      <span className="text-[18px] font-black leading-tight">{formatValue(v, layer.format)}</span>
                      <span className="text-[10px] opacity-70">{a.city ?? a.neighborhood ?? ""}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[18px] border p-3">
            <span className="text-muted text-[11px] font-bold">{layer.description}</span>
            <div className="flex items-center gap-2">
              {layer.colorScale.map((c, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="h-4 w-6 rounded" style={{ background: c }} />
                  {layer.legend[i] && <span className="text-ink text-[10px] font-semibold">{layer.legend[i]}</span>}
                </div>
              ))}
            </div>
            <span className="text-muted text-[10px]">{formatValue(domain.min, layer.format)} → {formatValue(domain.max, layer.format)}</span>
          </div>
          {notes.length > 0 && <p className="text-muted text-[11px] leading-relaxed">{notes[0]}</p>}
        </div>

        {/* Layer menu */}
        <div className="bg-card border-line flex flex-col gap-1.5 rounded-[22px] border p-2.5">
          <p className="text-muted px-2 pb-1 pt-1 text-[11px] font-bold">שכבות מפה</p>
          <div className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {HEATMAP_LAYERS.map((l) => (
              <button key={l.id} onClick={() => setLayerId(l.id)}
                className={cn("flex min-w-[150px] items-center gap-2.5 rounded-xl px-3 py-2 text-right transition lg:min-w-0", layerId === l.id ? "text-white shadow-md" : "bg-surface hover:bg-brand-soft")}
                style={layerId === l.id ? { background: "linear-gradient(135deg,#7c3aed,#2563eb)" } : undefined}>
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", layerId === l.id ? "bg-white/20" : "bg-card")}>
                  <Icon name={l.icon} size={16} className={layerId === l.id ? "text-white" : "text-brand"} />
                </span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-[13px] font-bold", layerId === l.id ? "text-white" : "text-ink")}>{l.label}</span>
                  <span className={cn("block truncate text-[10px]", layerId === l.id ? "text-white/75" : "text-muted")}>{l.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Insights drawer */}
      {showInsights && (
        <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-ink flex items-center gap-2 text-lg font-black"><Icon name="Sparkles" size={18} /> תובנות AI לשוק</h3>
            <button onClick={() => setShowInsights(false)} className="text-muted"><Icon name="X" size={18} /></button>
          </div>
          {insights.length === 0 ? <p className="text-muted text-sm">אין עדיין מספיק נתונים לתובנות.</p> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {insights.map((ins, i) => (
                <button key={i} onClick={() => { if (ins.layerId) setLayerId(ins.layerId); setShowInsights(false); }} className="bg-surface rounded-2xl p-4 text-right transition hover:shadow-md">
                  <p className="text-ink text-[14px] font-black">{ins.title}</p>
                  <p className="text-muted mt-1 text-[12px] leading-relaxed">{ins.body}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Area side panel */}
      {selected && <AreaPanel area={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function AreaPanel({ area, onClose }: { area: GeoArea; onClose: () => void }) {
  const m = area.metrics;
  const rows: [string, string][] = [
    ["מחיר ממוצע", formatValue(m.avgPrice, "shekel")],
    ["מחיר למ״ר", formatValue(m.pricePerSqm, "shekel_sqm")],
    ["נכסים פעילים", formatValue(m.activeListings, "count")],
    ["עסקאות בתקופה", formatValue(m.transactions, "count")],
    ["ביקוש", formatValue(m.demandScore, "score")],
    ["היצע", formatValue(m.supply, "score")],
    ["זמן מכירה ממוצע", formatValue(m.daysOnMarket, "days")],
    ["בלעדיות", formatValue(m.exclusivityPct, "percent")],
    ["מגמת מחירים", formatValue(m.priceGrowthPct, "signed_percent")],
    ["פוטנציאל גיוס", formatValue(m.recruitmentScore, "score")],
    ["ROI פרסום", formatValue(m.adRoiScore, "score")],
    ["פעילות משקיעים", formatValue(m.investorActivity, "score")],
  ];
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside dir="rtl" className="bg-card border-line fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto border-s p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-ink text-xl font-black">{area.name}</h3>
            <p className="text-muted text-[12px]">{[area.neighborhood, area.city].filter(Boolean).join(" · ")}{area.mock ? " · הדגמה" : area.derived ? " · כולל הערכות" : ""}</p>
          </div>
          <button onClick={onClose} className="text-muted"><Icon name="X" size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {rows.map(([k, v]) => (
            <div key={k} className="bg-surface rounded-xl p-2.5"><p className="text-muted text-[11px] font-bold">{k}</p><p className="text-ink text-[15px] font-black">{v}</p></div>
          ))}
        </div>
        <div className="bg-brand-soft mt-4 rounded-2xl p-4">
          <p className="text-brand flex items-center gap-1.5 text-[12px] font-black"><Icon name="Sparkles" size={14} /> המלצת AI</p>
          <p className="text-ink mt-1 text-[13px] leading-relaxed">{area.aiRecommendation}</p>
        </div>
        {area.reasons.length > 0 && (
          <div className="mt-3">
            <p className="text-muted text-[11px] font-bold">מבוסס על</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">{area.reasons.map((r, i) => <li key={i} className="bg-surface text-ink rounded-lg px-2 py-1 text-[11px] font-semibold">{r}</li>)}</ul>
          </div>
        )}
      </aside>
    </>
  );
}

// ── Small filter controls ─────────────────────────────────────────────────────
function Select({ label, value, onChange, options, render }: { label: string; value: string; onChange: (v: string) => void; options: string[]; render: (o: string) => string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-[10px] font-bold">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="border-line bg-surface text-ink rounded-lg border px-2 py-1.5 text-[12px]">
        {options.map((o) => <option key={o} value={o}>{render(o)}</option>)}
      </select>
    </label>
  );
}
function TextFilter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-[10px] font-bold">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="הכל" className="border-line bg-surface text-ink rounded-lg border px-2 py-1.5 text-[12px]" />
    </label>
  );
}
function NumFilter({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-[10px] font-bold">{label}</span>
      <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} placeholder="₪" className="border-line bg-surface text-ink rounded-lg border px-2 py-1.5 text-[12px]" />
    </label>
  );
}
