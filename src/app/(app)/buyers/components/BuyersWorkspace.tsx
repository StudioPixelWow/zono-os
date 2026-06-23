"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import type { BuyerRow } from "@/lib/buyers/labels";
import { buyerPreferences, TEMPERATURE_LABELS } from "@/lib/buyers/labels";
import {
  buyerInsight,
  computeKpis,
  buyerBudgetLine,
  type BuyerInsight,
  type IntelSets,
} from "@/lib/buyers/insights";
import type { BuyerMatchCounts } from "@/lib/buyers/matches";
import { BuyerKpiStrip, type KpiKey } from "./BuyerKpiStrip";
import { BuyerPriorityCockpit } from "./BuyerPriorityCockpit";
import { BuyerAiInsights } from "./BuyerAiInsights";
import { BuyerFiltersBar, EMPTY_FILTERS, type BuyerFilterState } from "./BuyerFiltersBar";
import { BuyersTable } from "./BuyersTable";
import { BuyerDrawer } from "./BuyerDrawer";
import { BuyerEmptyState } from "./BuyerEmptyState";

/** Raw intel-board membership (buyerId arrays) passed from the server. */
export interface IntelMembership {
  needingAttention: string[];
  closeToPurchase: string[];
  financingRisks: string[];
  highEngagement: string[];
  noActivity: string[];
}

function toMatch(q: string, b: BuyerRow): boolean {
  if (!q) return true;
  const hay = [
    b.full_name,
    b.phone ?? "",
    b.email ?? "",
    b.notes ?? "",
    b.preferred_areas.join(" "),
    String(b.budget_min ?? ""),
    String(b.budget_max ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function kpiPredicate(key: KpiKey, i: BuyerInsight): boolean {
  switch (key) {
    case "new":
      return i.isNew || Date.now() - new Date(i.buyer.created_at).getTime() <= 30 * 86_400_000;
    case "followUp":
      return i.needsFollowUp;
    case "closeToBuy":
      return i.isCloseToBuy;
    case "financingRisk":
      return i.isFinancingRisk;
    case "inactive":
      return i.isInactive;
    case "withMatches":
      return i.hasMatches;
  }
}

export function BuyersWorkspace({
  buyers,
  intel,
  matchCounts,
  error,
}: {
  buyers: BuyerRow[];
  intel: IntelMembership | null;
  matchCounts: BuyerMatchCounts;
  error?: boolean;
}) {
  const [filters, setFilters] = useState<BuyerFilterState>(EMPTY_FILTERS);
  const [kpi, setKpi] = useState<KpiKey | null>(null);
  const [view, setView] = useState<"table" | "cards">("table");
  const [openId, setOpenId] = useState<string | null>(null);

  // Build insights once per data change.
  const insights = useMemo<BuyerInsight[]>(() => {
    const sets: IntelSets | undefined = intel
      ? {
          needingAttention: new Set(intel.needingAttention),
          closeToPurchase: new Set(intel.closeToPurchase),
          financingRisks: new Set(intel.financingRisks),
          highEngagement: new Set(intel.highEngagement),
          noActivity: new Set(intel.noActivity),
        }
      : undefined;
    return buyers
      .map((b) => buyerInsight(b, { matchCount: matchCounts[b.id] ?? null, intel: sets }))
      .sort((a, b) => b.urgency - a.urgency);
  }, [buyers, intel, matchCounts]);

  const kpis = useMemo(() => computeKpis(insights), [insights]);

  const cityOptions = useMemo(() => {
    const s = new Set<string>();
    for (const b of buyers) for (const a of b.preferred_areas) s.add(a);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "he"));
  }, [buyers]);

  // Apply search + filters + KPI quick filter.
  const filtered = useMemo(() => {
    return insights.filter((i) => {
      const b = i.buyer;
      if (!toMatch(filters.q, b)) return false;
      if (filters.city && !b.preferred_areas.includes(filters.city)) return false;
      if (filters.type && !b.preferred_types.includes(filters.type)) return false;
      if (filters.status && b.temperature !== filters.status) return false;
      if (filters.source && buyerPreferences(b).source !== filters.source) return false;
      if (filters.budgetMin && (b.budget_max ?? Infinity) < Number(filters.budgetMin)) return false;
      if (filters.budgetMax && (b.budget_min ?? 0) > Number(filters.budgetMax)) return false;
      if (filters.roomsMin && (b.rooms_max ?? b.rooms_min ?? 0) < Number(filters.roomsMin)) return false;
      if (filters.urgency === "high" && i.urgency < 70) return false;
      if (filters.urgency === "medium" && i.urgency < 40) return false;
      if (filters.financing && i.financingRisk !== filters.financing) return false;
      if (filters.activity === "active" && i.isInactive) return false;
      if (filters.activity === "inactive" && !i.isInactive) return false;
      if (filters.hasMatches && !i.hasMatches) return false;
      if (kpi && !kpiPredicate(kpi, i)) return false;
      return true;
    });
  }, [insights, filters, kpi]);

  const openInsight = filtered.find((i) => i.buyer.id === openId)
    ?? insights.find((i) => i.buyer.id === openId)
    ?? null;

  const hasActiveFilter =
    kpi != null ||
    filters.q.length > 0 ||
    JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  function clearAll() {
    setFilters(EMPTY_FILTERS);
    setKpi(null);
  }

  function exportCsv() {
    const header = ["שם", "טלפון", "אימייל", "סטטוס", "תקציב", "אזורים", "שלב", "דחיפות"];
    const lines = filtered.map((i) => {
      const b = i.buyer;
      const cells = [
        b.full_name,
        b.phone ?? "",
        b.email ?? "",
        b.temperature ? TEMPERATURE_LABELS[b.temperature] : "",
        buyerBudgetLine(b).replace(/,/g, ""),
        b.preferred_areas.join(" / "),
        i.stageLabel,
        String(i.urgency),
      ];
      return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
    });
    const csv = "﻿" + [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `zono-buyers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-danger-soft text-danger rounded-2xl px-4 py-3 text-sm font-semibold">
        לא ניתן לטעון את הקונים כעת. נסה/י לרענן.
      </div>
    );
  }

  if (buyers.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Hero onExport={exportCsv} view={view} setView={setView} canExport={false} />
        <BuyerEmptyState kind="no-buyers" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Hero onExport={exportCsv} view={view} setView={setView} canExport />

      <BuyerKpiStrip kpis={kpis} active={kpi} onSelect={(k) => setKpi((cur) => (cur === k ? null : k))} />

      <BuyerPriorityCockpit insights={insights} onOpen={setOpenId} />

      <BuyerAiInsights insights={insights} onOpen={setOpenId} />

      <div className="flex flex-col gap-4">
        <BuyerFiltersBar
          filters={filters}
          onChange={setFilters}
          onClear={clearAll}
          cityOptions={cityOptions}
          resultCount={filtered.length}
        />

        {filtered.length === 0 ? (
          <BuyerEmptyState kind="no-results" onClear={clearAll} compact />
        ) : (
          <BuyersTable insights={filtered} onOpen={setOpenId} view={view} />
        )}
      </div>

      <BuyerDrawer insight={openInsight} onClose={() => setOpenId(null)} />

      {/* hint when filters hide everyone but data exists */}
      {hasActiveFilter && filtered.length === 0 && null}
    </div>
  );
}

function Hero({
  onExport,
  view,
  setView,
  canExport,
}: {
  onExport: () => void;
  view: "table" | "cards";
  setView: (v: "table" | "cards") => void;
  canExport: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-brand text-xs font-bold tracking-wide">CRM קונים</p>
        <h1 className="text-ink text-2xl font-black sm:text-[28px]">הקונים שלך</h1>
        <p className="text-muted mt-0.5 text-sm font-medium">
          ניהול חכם של קונים, תקציבים, התאמות ונקודות טיפול
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="bg-card border-line flex overflow-hidden rounded-xl border">
          <button
            type="button"
            onClick={() => setView("table")}
            className={cn("grid h-9 w-9 place-items-center transition", view === "table" ? "bg-brand-soft text-brand-strong" : "text-muted")}
            aria-label="תצוגת טבלה"
          >
            <Icon name="Rows3" size={18} />
          </button>
          <button
            type="button"
            onClick={() => setView("cards")}
            className={cn("grid h-9 w-9 place-items-center transition", view === "cards" ? "bg-brand-soft text-brand-strong" : "text-muted")}
            aria-label="תצוגת כרטיסים"
          >
            <Icon name="LayoutGrid" size={18} />
          </button>
        </div>
        <Button variant="ghost" size="md" onClick={onExport} disabled={!canExport} leadingIcon={<Icon name="Download" size={16} />}>
          ייצוא
        </Button>
        <Link href="/buyers/new">
          <Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>קונה חדש</Button>
        </Link>
      </div>
    </div>
  );
}
