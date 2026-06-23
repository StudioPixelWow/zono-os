"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { SELLER_TYPE_LABELS } from "@/lib/sellers/insights";

export interface SellerFilterState {
  q: string;
  city: string;
  type: string;
  churn: "" | "stable" | "watch" | "risk" | "critical";
  trust: "" | "high" | "medium" | "low";
  urgency: "" | "high" | "medium";
  activity: "" | "active" | "noContact";
  hasProperties: boolean;
}

export const EMPTY_FILTERS: SellerFilterState = {
  q: "",
  city: "",
  type: "",
  churn: "",
  trust: "",
  urgency: "",
  activity: "",
  hasProperties: false,
};

const SELLER_TYPE_OPTIONS = Object.entries(SELLER_TYPE_LABELS).map(([value, label]) => ({ value, label }));

const CHURN_LABELS: Record<Exclude<SellerFilterState["churn"], "">, string> = {
  stable: "יציב",
  watch: "דורש תשומת לב",
  risk: "בסיכון",
  critical: "קריטי",
};
const TRUST_LABELS: Record<Exclude<SellerFilterState["trust"], "">, string> = {
  high: "אמון גבוה",
  medium: "אמון בינוני",
  low: "אמון נמוך",
};
const URGENCY_LABELS: Record<"high" | "medium", string> = { high: "דחיפות גבוהה", medium: "דחיפות בינונית" };
const ACTIVITY_LABELS: Record<"active" | "noContact", string> = { active: "פעילים", noContact: "ללא קשר" };

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none transition";

interface SavedView {
  name: string;
  filters: SellerFilterState;
}
const STORE_KEY = "zono.sellers.savedViews";

function activeChips(f: SellerFilterState): { key: keyof SellerFilterState; label: string }[] {
  const chips: { key: keyof SellerFilterState; label: string }[] = [];
  if (f.city) chips.push({ key: "city", label: `עיר: ${f.city}` });
  if (f.type) chips.push({ key: "type", label: SELLER_TYPE_LABELS[f.type] ?? f.type });
  if (f.churn) chips.push({ key: "churn", label: CHURN_LABELS[f.churn] });
  if (f.trust) chips.push({ key: "trust", label: TRUST_LABELS[f.trust] });
  if (f.urgency) chips.push({ key: "urgency", label: URGENCY_LABELS[f.urgency] });
  if (f.activity) chips.push({ key: "activity", label: ACTIVITY_LABELS[f.activity] });
  if (f.hasProperties) chips.push({ key: "hasProperties", label: "עם נכס משויך" });
  return chips;
}

export function SellerFiltersBar({
  filters,
  onChange,
  onClear,
  cityOptions,
  resultCount,
}: {
  filters: SellerFilterState;
  onChange: (next: SellerFilterState) => void;
  onClear: () => void;
  cityOptions: string[];
  resultCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
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

  const set = (patch: Partial<SellerFilterState>) => onChange({ ...filters, ...patch });
  const chips = activeChips(filters);
  const hasActive = chips.length > 0 || filters.q.length > 0;

  function clearChip(key: keyof SellerFilterState) {
    set({ [key]: key === "hasProperties" ? false : "" } as Partial<SellerFilterState>);
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
            placeholder="חיפוש לפי שם, טלפון, עיר או הערות..."
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
          {resultCount} מוכרים
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

      {/* Expanded filter grid */}
      {expanded && (
        <div className="border-line grid grid-cols-2 gap-2.5 border-t pt-3 sm:grid-cols-3 lg:grid-cols-4">
          <select value={filters.city} onChange={(e) => set({ city: e.target.value })} className={field}>
            <option value="">כל הערים</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={filters.type} onChange={(e) => set({ type: e.target.value })} className={field}>
            <option value="">כל סוגי המוכר</option>
            {SELLER_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select value={filters.churn} onChange={(e) => set({ churn: e.target.value as SellerFilterState["churn"] })} className={field}>
            <option value="">כל רמות הסיכון</option>
            <option value="critical">קריטי</option>
            <option value="risk">בסיכון</option>
            <option value="watch">דורש תשומת לב</option>
            <option value="stable">יציב</option>
          </select>
          <select value={filters.trust} onChange={(e) => set({ trust: e.target.value as SellerFilterState["trust"] })} className={field}>
            <option value="">כל רמות האמון</option>
            <option value="high">אמון גבוה</option>
            <option value="medium">אמון בינוני</option>
            <option value="low">אמון נמוך</option>
          </select>
          <select value={filters.urgency} onChange={(e) => set({ urgency: e.target.value as SellerFilterState["urgency"] })} className={field}>
            <option value="">כל רמות הדחיפות</option>
            <option value="high">דחיפות גבוהה</option>
            <option value="medium">דחיפות בינונית ומעלה</option>
          </select>
          <select value={filters.activity} onChange={(e) => set({ activity: e.target.value as SellerFilterState["activity"] })} className={field}>
            <option value="">כל רמות הפעילות</option>
            <option value="active">פעילים</option>
            <option value="noContact">ללא קשר</option>
          </select>
          <label className="bg-surface border-line text-ink flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold">
            <input type="checkbox" checked={filters.hasProperties} onChange={(e) => set({ hasProperties: e.target.checked })} className="accent-brand h-4 w-4" />
            עם נכס משויך
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
