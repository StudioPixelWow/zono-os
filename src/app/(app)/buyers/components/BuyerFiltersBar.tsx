"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { PROPERTY_TYPE_OPTIONS } from "@/lib/properties/labels";
import {
  SOURCE_LABELS,
  SOURCE_OPTIONS,
  TEMPERATURE_LABELS,
  TEMPERATURE_OPTIONS,
  PROPERTY_TYPE_LABELS,
} from "@/lib/buyers/labels";
import type { BuyerTemperature, LeadSource, PropertyType } from "@/lib/supabase/types";
import type { FinancingRisk } from "@/lib/buyers/insights";

export interface BuyerFilterState {
  q: string;
  city: string;
  type: PropertyType | "";
  status: BuyerTemperature | "";
  source: LeadSource | "";
  budgetMin: string;
  budgetMax: string;
  roomsMin: string;
  urgency: "" | "high" | "medium";
  financing: "" | FinancingRisk;
  activity: "" | "active" | "inactive";
  hasMatches: boolean;
}

export const EMPTY_FILTERS: BuyerFilterState = {
  q: "",
  city: "",
  type: "",
  status: "",
  source: "",
  budgetMin: "",
  budgetMax: "",
  roomsMin: "",
  urgency: "",
  financing: "",
  activity: "",
  hasMatches: false,
};

const URGENCY_LABELS: Record<"high" | "medium", string> = { high: "דחיפות גבוהה", medium: "דחיפות בינונית" };
const FINANCING_LABELS: Record<FinancingRisk, string> = { high: "סיכון גבוה", medium: "סיכון בינוני", low: "מימון תקין", unknown: "לא ידוע" };
const ACTIVITY_LABELS: Record<"active" | "inactive", string> = { active: "פעילים", inactive: "ללא פעילות" };

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none transition";

interface SavedView {
  name: string;
  filters: BuyerFilterState;
}
const STORE_KEY = "zono.buyers.savedViews";

function activeChips(f: BuyerFilterState): { key: keyof BuyerFilterState; label: string }[] {
  const chips: { key: keyof BuyerFilterState; label: string }[] = [];
  if (f.city) chips.push({ key: "city", label: `עיר: ${f.city}` });
  if (f.type) chips.push({ key: "type", label: PROPERTY_TYPE_LABELS[f.type] });
  if (f.status) chips.push({ key: "status", label: TEMPERATURE_LABELS[f.status] });
  if (f.source) chips.push({ key: "source", label: SOURCE_LABELS[f.source] });
  if (f.budgetMin) chips.push({ key: "budgetMin", label: `תקציב מ-${f.budgetMin}` });
  if (f.budgetMax) chips.push({ key: "budgetMax", label: `תקציב עד ${f.budgetMax}` });
  if (f.roomsMin) chips.push({ key: "roomsMin", label: `${f.roomsMin}+ חד׳` });
  if (f.urgency) chips.push({ key: "urgency", label: URGENCY_LABELS[f.urgency] });
  if (f.financing) chips.push({ key: "financing", label: FINANCING_LABELS[f.financing] });
  if (f.activity) chips.push({ key: "activity", label: ACTIVITY_LABELS[f.activity] });
  if (f.hasMatches) chips.push({ key: "hasMatches", label: "יש התאמות" });
  return chips;
}

export function BuyerFiltersBar({
  filters,
  onChange,
  onClear,
  cityOptions,
  resultCount,
}: {
  filters: BuyerFilterState;
  onChange: (next: BuyerFilterState) => void;
  onClear: () => void;
  cityOptions: string[];
  resultCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  // Lazy, SSR-safe init — reads saved views once without an effect.
  const [views, setViews] = useState<SavedView[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? (JSON.parse(raw) as SavedView[]) : [];
    } catch {
      return [];
    }
  });

  function persist(next: SavedView[]) {
    setViews(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* storage may be unavailable */
    }
  }

  const set = (patch: Partial<BuyerFilterState>) => onChange({ ...filters, ...patch });
  const chips = activeChips(filters);
  const hasActive = chips.length > 0 || filters.q.length > 0;

  function clearChip(key: keyof BuyerFilterState) {
    set({ [key]: key === "hasMatches" ? false : "" } as Partial<BuyerFilterState>);
  }

  function saveView() {
    const name = window.prompt("שם לתצוגה השמורה:");
    if (!name?.trim()) return;
    persist([...views.filter((v) => v.name !== name.trim()), { name: name.trim(), filters }]);
  }

  return (
    <div className="bg-card/95 border-line sticky top-2 z-20 flex flex-col gap-3 rounded-[20px] border p-3 shadow-[var(--shadow-card)] backdrop-blur">
      {/* Row 1: search + controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <span className="text-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <Icon name="Search" size={16} />
          </span>
          <input
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="חיפוש לפי שם, טלפון, עיר, תקציב או הערות..."
            className="bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border pr-10 pl-3 text-sm outline-none transition"
          />
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition",
            expanded ? "bg-brand-soft text-brand-strong border-brand-light" : "bg-surface text-ink border-line",
          )}
        >
          <Icon name="SlidersHorizontal" size={16} />
          סינון מתקדם
        </button>
        <button
          type="button"
          onClick={saveView}
          className="bg-surface text-ink border-line inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition hover:border-brand-light"
        >
          <Icon name="Bookmark" size={16} />
          שמור תצוגה
        </button>
        {hasActive && (
          <button type="button" onClick={onClear} className="text-muted hover:text-danger inline-flex h-10 items-center gap-1 px-2 text-sm font-semibold transition">
            <Icon name="X" size={15} />
            נקה הכל
          </button>
        )}
        <span className="text-muted mr-auto px-1 text-sm font-semibold tabular-nums">
          {resultCount} קונים
        </span>
      </div>

      {/* Saved views */}
      {views.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted text-[11px] font-bold">תצוגות שמורות:</span>
          {views.map((v) => (
            <span key={v.name} className="bg-brand-soft text-brand-strong inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
              <button type="button" onClick={() => onChange(v.filters)}>{v.name}</button>
              <button type="button" onClick={() => persist(views.filter((x) => x.name !== v.name))} aria-label="מחק תצוגה">
                <Icon name="X" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Expanded filter grid (acts as the mobile filter drawer) */}
      {expanded && (
        <div className="border-line grid grid-cols-2 gap-2.5 border-t pt-3 sm:grid-cols-3 lg:grid-cols-4">
          <select value={filters.city} onChange={(e) => set({ city: e.target.value })} className={field}>
            <option value="">כל הערים</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={filters.type} onChange={(e) => set({ type: e.target.value as PropertyType | "" })} className={field}>
            <option value="">כל סוגי הנכס</option>
            {PROPERTY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select value={filters.status} onChange={(e) => set({ status: e.target.value as BuyerTemperature | "" })} className={field}>
            <option value="">כל הסטטוסים</option>
            {TEMPERATURE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select value={filters.source} onChange={(e) => set({ source: e.target.value as LeadSource | "" })} className={field}>
            <option value="">כל המקורות</option>
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input value={filters.budgetMin} onChange={(e) => set({ budgetMin: e.target.value })} type="number" placeholder="תקציב מ-" className={field} />
          <input value={filters.budgetMax} onChange={(e) => set({ budgetMax: e.target.value })} type="number" placeholder="תקציב עד" className={field} />
          <input value={filters.roomsMin} onChange={(e) => set({ roomsMin: e.target.value })} type="number" step="0.5" placeholder="חדרים מ-" className={field} />
          <select value={filters.urgency} onChange={(e) => set({ urgency: e.target.value as BuyerFilterState["urgency"] })} className={field}>
            <option value="">כל רמות הדחיפות</option>
            <option value="high">דחיפות גבוהה</option>
            <option value="medium">דחיפות בינונית ומעלה</option>
          </select>
          <select value={filters.financing} onChange={(e) => set({ financing: e.target.value as BuyerFilterState["financing"] })} className={field}>
            <option value="">כל מצבי המימון</option>
            <option value="high">סיכון מימון גבוה</option>
            <option value="medium">סיכון מימון בינוני</option>
            <option value="low">מימון תקין</option>
          </select>
          <select value={filters.activity} onChange={(e) => set({ activity: e.target.value as BuyerFilterState["activity"] })} className={field}>
            <option value="">כל רמות הפעילות</option>
            <option value="active">פעילים</option>
            <option value="inactive">ללא פעילות</option>
          </select>
          <label className="bg-surface border-line text-ink flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold">
            <input type="checkbox" checked={filters.hasMatches} onChange={(e) => set({ hasMatches: e.target.checked })} className="accent-brand h-4 w-4" />
            יש התאמות נכסים
          </label>
        </div>
      )}

      {/* Active chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <span key={String(c.key)} className="bg-surface border-line text-ink inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold">
              {c.label}
              <button type="button" onClick={() => clearChip(c.key)} aria-label="הסר סינון" className="text-muted hover:text-danger">
                <Icon name="X" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
