"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import type { SellerRow } from "@/lib/sellers/repository";
import {
  sellerInsight,
  computeKpis,
  SELLER_TYPE_LABELS,
  type SellerInsight,
  type SellerIntel,
  type IntelSets,
} from "@/lib/sellers/insights";
import { SellerKpiStrip, type KpiKey } from "./SellerKpiStrip";
import { SellerPriorityCockpit } from "./SellerPriorityCockpit";
import { SellerAiInsights } from "./SellerAiInsights";
import { SellerFiltersBar, EMPTY_FILTERS, type SellerFilterState } from "./SellerFiltersBar";
import { SellersTable } from "./SellersTable";
import { SellerDrawer } from "./SellerDrawer";
import { SellerEmptyState } from "./SellerEmptyState";

/** Raw intel-board membership (sellerId arrays) passed from the server. */
export interface IntelMembership {
  needingAttention: string[];
  highChurn: string[];
  lowTrust: string[];
  noContact: string[];
  upcomingCommitments: string[];
  trustChanges: string[];
}

function toMatch(q: string, s: SellerRow): boolean {
  if (!q) return true;
  const hay = [
    s.full_name,
    s.phone ?? "",
    s.secondary_phone ?? "",
    s.email ?? "",
    s.city ?? "",
    s.address ?? "",
    s.notes ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function kpiPredicate(key: KpiKey, i: SellerInsight): boolean {
  switch (key) {
    case "new":
      return Date.now() - new Date(i.seller.created_at).getTime() <= 30 * 86_400_000;
    case "needsTreatment":
      return i.needsTreatment;
    case "highChurn":
      return i.isHighChurn;
    case "trustChanges":
      return i.isTrustDrop || i.isLowTrust;
    case "noContact":
      return i.isNoContact;
    case "nearOpportunity":
      return i.isNearOpportunity;
  }
}

export function SellersWorkspace({
  sellers,
  profiles,
  counts,
  intel,
  error,
}: {
  sellers: SellerRow[];
  profiles: Record<string, SellerIntel>;
  counts: Record<string, number>;
  intel: IntelMembership | null;
  error?: boolean;
}) {
  const [filters, setFilters] = useState<SellerFilterState>(EMPTY_FILTERS);
  const [kpi, setKpi] = useState<KpiKey | null>(null);
  const [view, setView] = useState<"table" | "cards">("table");
  const [openId, setOpenId] = useState<string | null>(null);

  const insights = useMemo<SellerInsight[]>(() => {
    const sets: IntelSets | undefined = intel
      ? {
          needingAttention: new Set(intel.needingAttention),
          highChurn: new Set(intel.highChurn),
          lowTrust: new Set(intel.lowTrust),
          noContact: new Set(intel.noContact),
          upcomingCommitments: new Set(intel.upcomingCommitments),
          trustChanges: new Set(intel.trustChanges),
        }
      : undefined;
    return sellers
      .map((s) => sellerInsight(s, { propertyCount: counts[s.id] ?? 0, intel: profiles[s.id], sets }))
      .sort((a, b) => b.urgency - a.urgency);
  }, [sellers, profiles, counts, intel]);

  const kpis = useMemo(() => computeKpis(insights), [insights]);

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of sellers) if (s.city) set.add(s.city);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [sellers]);

  const filtered = useMemo(() => {
    return insights.filter((i) => {
      const s = i.seller;
      if (!toMatch(filters.q, s)) return false;
      if (filters.city && s.city !== filters.city) return false;
      if (filters.type && s.seller_type !== filters.type) return false;
      if (filters.churn && i.churnLevel !== filters.churn) return false;
      if (filters.trust === "high" && i.trustScore < 70) return false;
      if (filters.trust === "medium" && (i.trustScore < 45 || i.trustScore >= 70)) return false;
      if (filters.trust === "low" && i.trustScore >= 45) return false;
      if (filters.urgency === "high" && i.urgency < 70) return false;
      if (filters.urgency === "medium" && i.urgency < 40) return false;
      if (filters.activity === "active" && !i.isActive) return false;
      if (filters.activity === "noContact" && !i.isNoContact) return false;
      if (filters.hasProperties && !i.hasProperties) return false;
      if (kpi && !kpiPredicate(kpi, i)) return false;
      return true;
    });
  }, [insights, filters, kpi]);

  const openInsight =
    filtered.find((i) => i.seller.id === openId) ??
    insights.find((i) => i.seller.id === openId) ??
    null;

  const hasActiveFilter =
    kpi != null ||
    filters.q.length > 0 ||
    JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  function clearAll() {
    setFilters(EMPTY_FILTERS);
    setKpi(null);
  }

  function exportCsv() {
    const header = ["שם", "טלפון", "אימייל", "עיר", "סוג", "אמון", "סיכון נטישה", "נכסים", "שלב", "דחיפות"];
    const lines = filtered.map((i) => {
      const s = i.seller;
      const cells = [
        s.full_name,
        s.phone ?? "",
        s.email ?? "",
        s.city ?? "",
        s.seller_type ? SELLER_TYPE_LABELS[s.seller_type] ?? s.seller_type : "",
        String(i.trustScore),
        String(i.churnRisk),
        String(i.propertyCount),
        i.stageLabel,
        String(i.urgency),
      ];
      return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
    });
    const csv = "﻿" + [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `zono-sellers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <div className="bg-danger-soft text-danger rounded-2xl px-4 py-3 text-sm font-semibold">
        לא ניתן לטעון את המוכרים כעת. נסה/י לרענן.
      </div>
    );
  }

  if (sellers.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Hero onExport={exportCsv} view={view} setView={setView} canExport={false} />
        <SellerEmptyState kind="no-sellers" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Hero onExport={exportCsv} view={view} setView={setView} canExport />

      <SellerKpiStrip kpis={kpis} active={kpi} onSelect={(k) => setKpi((cur) => (cur === k ? null : k))} />

      <SellerPriorityCockpit insights={insights} onOpen={setOpenId} />

      <SellerAiInsights insights={insights} onOpen={setOpenId} />

      <div className="flex flex-col gap-4">
        <SellerFiltersBar
          filters={filters}
          onChange={setFilters}
          onClear={clearAll}
          cityOptions={cityOptions}
          resultCount={filtered.length}
        />

        {filtered.length === 0 ? (
          <SellerEmptyState kind="no-results" onClear={clearAll} compact />
        ) : (
          <SellersTable insights={filtered} onOpen={setOpenId} view={view} />
        )}
      </div>

      <SellerDrawer insight={openInsight} onClose={() => setOpenId(null)} />

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
        <p className="text-brand text-xs font-bold tracking-wide">Seller Intelligence OS</p>
        <h1 className="text-ink text-2xl font-black sm:text-[28px]">המוכרים שלך</h1>
        <p className="text-muted mt-0.5 text-sm font-medium">
          ניהול חכם של מוכרים, נכסים, סיכוני נטישה ופעולות מומלצות
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
        <Link href="/sellers/new">
          <Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>מוכר חדש</Button>
        </Link>
      </div>
    </div>
  );
}
