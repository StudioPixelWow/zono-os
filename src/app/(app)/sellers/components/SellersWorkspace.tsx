"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import type { SellerRow } from "@/lib/sellers/repository";
import { SELLER_TYPE_LABELS, type SellerInsight } from "@/lib/sellers/insights";
import type { SellersBoard } from "@/lib/sellers/board-query";
import { SellerKpiStrip, type KpiKey } from "./SellerKpiStrip";
import { SellerPriorityCockpit } from "./SellerPriorityCockpit";
import { SellerAiInsights } from "./SellerAiInsights";
import { SellerFiltersBar, type SellerFilterState } from "./SellerFiltersBar";
import { SellersTable } from "./SellersTable";
import { SellerDrawer } from "./SellerDrawer";
import { SellerEmptyState } from "./SellerEmptyState";

const KPI_KEYS: readonly KpiKey[] = ["new", "needsTreatment", "highChurn", "trustChanges", "noContact", "nearOpportunity"];
const DEFAULT_PAGE_SIZE = 25;

function toMatch(q: string, s: SellerRow): boolean {
  if (!q) return true;
  const hay = [s.full_name, s.phone ?? "", s.secondary_phone ?? "", s.email ?? "", s.city ?? "", s.address ?? "", s.notes ?? ""].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function kpiPredicate(key: KpiKey, i: SellerInsight): boolean {
  switch (key) {
    case "new": return Date.now() - new Date(i.seller.created_at).getTime() <= 30 * 86_400_000;
    case "needsTreatment": return i.needsTreatment;
    case "highChurn": return i.isHighChurn;
    case "trustChanges": return i.isTrustDrop || i.isLowTrust;
    case "noContact": return i.isNoContact;
    case "nearOpportunity": return i.isNearOpportunity;
  }
}

export function SellersWorkspace({ board, error }: { board: SellersBoard | null; error?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();

  const setParam = useCallback((patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    if (resetPage && !("page" in patch)) next.delete("page");
    router.push(`/sellers?${next.toString()}`, { scroll: false });
  }, [router, sp]);

  const filters: SellerFilterState = useMemo(() => ({
    q: sp.get("q") ?? "",
    city: sp.get("city") ?? "",
    type: sp.get("type") ?? "",
    churn: (sp.get("churn") ?? "") as SellerFilterState["churn"],
    trust: (sp.get("trust") ?? "") as SellerFilterState["trust"],
    urgency: (sp.get("urgency") ?? "") as SellerFilterState["urgency"],
    activity: (sp.get("activity") ?? "") as SellerFilterState["activity"],
    hasProperties: sp.get("hasProperties") === "1",
  }), [sp]);

  const kpiRaw = sp.get("kpi");
  const kpi: KpiKey | null = KPI_KEYS.includes(kpiRaw as KpiKey) ? (kpiRaw as KpiKey) : null;
  const view: "table" | "cards" = sp.get("view") === "cards" ? "cards" : "table";
  const openId = sp.get("open");
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(Math.max(Number(sp.get("pageSize")) || DEFAULT_PAGE_SIZE, 10), 100);

  const onFilters = (n: SellerFilterState) => setParam({
    q: n.q || null, city: n.city || null, type: n.type || null, churn: n.churn || null,
    trust: n.trust || null, urgency: n.urgency || null, activity: n.activity || null, hasProperties: n.hasProperties ? "1" : null,
  });
  const clearAll = () => setParam({ q: null, city: null, type: null, churn: null, trust: null, urgency: null, activity: null, hasProperties: null, kpi: null });

  const insights = useMemo(() => board?.insights ?? [], [board]);

  const filtered = useMemo(() => insights.filter((i) => {
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
  }), [insights, filters, kpi]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, (safePage - 1) * pageSize + pageSize);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  const openInsight = insights.find((i) => i.seller.id === openId) ?? null;

  function exportCsv() {
    const header = ["שם", "טלפון", "אימייל", "עיר", "סוג", "אמון", "סיכון נטישה", "נכסים", "שלב", "דחיפות"];
    const lines = filtered.map((i) => {
      const s = i.seller;
      const cells = [s.full_name, s.phone ?? "", s.email ?? "", s.city ?? "", s.seller_type ? SELLER_TYPE_LABELS[s.seller_type] ?? s.seller_type : "", String(i.trustScore), String(i.churnRisk), String(i.propertyCount), i.stageLabel, String(i.urgency)];
      return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
    });
    const csv = "﻿" + [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `zono-sellers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (error || !board) {
    return <div className="bg-danger-soft text-danger rounded-2xl px-4 py-3 text-sm font-semibold">לא ניתן לטעון את המוכרים כעת. נסה/י לרענן.</div>;
  }

  if (insights.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Hero onExport={exportCsv} view={view} setView={(v) => setParam({ view: v === "cards" ? "cards" : null }, false)} canExport={false} />
        <SellerEmptyState kind="no-sellers" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Hero onExport={exportCsv} view={view} setView={(v) => setParam({ view: v === "cards" ? "cards" : null }, false)} canExport />

      {board.truncated && (
        <div className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-[12.5px] font-bold">מוצגים {board.total} המוכרים הפעילים ביותר. צמצם עם סינון כדי לראות אחרים.</div>
      )}

      <SellerKpiStrip kpis={board.kpis} active={kpi} onSelect={(k) => setParam({ kpi: kpi === k ? null : k })} />

      <SellerPriorityCockpit insights={insights} onOpen={(id) => setParam({ open: id }, false)} />

      <SellerAiInsights insights={insights} onOpen={(id) => setParam({ open: id }, false)} />

      <div className="flex flex-col gap-4">
        <SellerFiltersBar filters={filters} onChange={onFilters} onClear={clearAll} cityOptions={board.cityOptions} resultCount={total} />

        {total === 0 ? (
          <SellerEmptyState kind="no-results" onClear={clearAll} compact />
        ) : (
          <>
            <SellersTable insights={pageRows} onOpen={(id) => setParam({ open: id }, false)} view={view} />
            <div className="text-muted flex flex-wrap items-center justify-between gap-2 px-1 text-[12px]">
              <span>מציג {from}–{to} מתוך {total}</span>
              <div className="flex items-center gap-1.5">
                <select value={String(pageSize)} onChange={(e) => setParam({ pageSize: e.target.value, page: null })} className="bg-surface border-line text-ink h-8 rounded-lg border px-2 text-[12px] outline-none">
                  {[25, 50, 100].map((n) => <option key={n} value={n}>{n} לעמוד</option>)}
                </select>
                <button disabled={safePage <= 1} onClick={() => setParam({ page: String(safePage - 1) }, false)} className="border-line bg-surface text-ink grid h-8 w-8 place-items-center rounded-lg border transition disabled:opacity-40"><Icon name="ChevronRight" size={15} /></button>
                <span className="min-w-[60px] text-center font-bold">{safePage} / {pageCount}</span>
                <button disabled={safePage >= pageCount} onClick={() => setParam({ page: String(safePage + 1) }, false)} className="border-line bg-surface text-ink grid h-8 w-8 place-items-center rounded-lg border transition disabled:opacity-40"><Icon name="ChevronLeft" size={15} /></button>
              </div>
            </div>
          </>
        )}
      </div>

      <SellerDrawer insight={openInsight} onClose={() => setParam({ open: null }, false)} />
    </div>
  );
}

function Hero({ onExport, view, setView, canExport }: { onExport: () => void; view: "table" | "cards"; setView: (v: "table" | "cards") => void; canExport: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-brand text-xs font-bold tracking-wide">מודיעין מוכרים</p>
        <h1 className="text-ink text-2xl font-black sm:text-[28px]">המוכרים שלך</h1>
        <p className="text-muted mt-0.5 text-sm font-medium">ניהול חכם של מוכרים, נכסים, סיכוני נטישה ופעולות מומלצות</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="bg-card border-line flex overflow-hidden rounded-xl border">
          <button type="button" onClick={() => setView("table")} className={cn("grid h-9 w-9 place-items-center transition", view === "table" ? "bg-brand-soft text-brand-strong" : "text-muted")} aria-label="תצוגת טבלה"><Icon name="Rows3" size={18} /></button>
          <button type="button" onClick={() => setView("cards")} className={cn("grid h-9 w-9 place-items-center transition", view === "cards" ? "bg-brand-soft text-brand-strong" : "text-muted")} aria-label="תצוגת כרטיסים"><Icon name="LayoutGrid" size={18} /></button>
        </div>
        <Button variant="ghost" size="md" onClick={onExport} disabled={!canExport} leadingIcon={<Icon name="Download" size={16} />}>ייצוא</Button>
        <Link href="/sellers/new"><Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>מוכר חדש</Button></Link>
      </div>
    </div>
  );
}
