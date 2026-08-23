"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { reconcileBuyerIntelligenceAction } from "@/lib/buyer-intelligence/actions";
import type { BuyerRow } from "@/lib/buyers/labels";
import { buyerPreferences, TEMPERATURE_LABELS } from "@/lib/buyers/labels";
import { buyerBudgetLine, type BuyerInsight } from "@/lib/buyers/insights";
import type { BuyersBoard } from "@/lib/buyers/board-query";
import { BuyerKpiStrip, type KpiKey } from "./BuyerKpiStrip";
import { BuyerPriorityCockpit } from "./BuyerPriorityCockpit";
import { BuyerAiInsights } from "./BuyerAiInsights";
import { BuyerFiltersBar, type BuyerFilterState } from "./BuyerFiltersBar";
import { BuyersTable } from "./BuyersTable";
import { BuyerDrawer } from "./BuyerDrawer";
import { BuyerEmptyState } from "./BuyerEmptyState";
import type { PropertyType } from "@/lib/supabase/types";
import type { BuyerTemperature, LeadSource } from "@/lib/supabase/types";
import type { FinancingRisk } from "@/lib/buyers/insights";

const KPI_KEYS: readonly KpiKey[] = ["new", "followUp", "closeToBuy", "financingRisk", "inactive", "withMatches"];
const DEFAULT_PAGE_SIZE = 25;

function toMatch(q: string, b: BuyerRow): boolean {
  if (!q) return true;
  const hay = [b.full_name, b.phone ?? "", b.email ?? "", b.notes ?? "", b.preferred_areas.join(" "), String(b.budget_min ?? ""), String(b.budget_max ?? "")].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function kpiPredicate(key: KpiKey, i: BuyerInsight): boolean {
  switch (key) {
    case "new": return i.isNew || Date.now() - new Date(i.buyer.created_at).getTime() <= 30 * 86_400_000;
    case "followUp": return i.needsFollowUp;
    case "closeToBuy": return i.isCloseToBuy;
    case "financingRisk": return i.isFinancingRisk;
    case "inactive": return i.isInactive;
    case "withMatches": return i.hasMatches;
  }
}

export function BuyersWorkspace({ board, error }: { board: BuyersBoard | null; error?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [reconciling, startReconcile] = useTransition();
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null);

  const setParam = useCallback((patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    if (resetPage && !("page" in patch)) next.delete("page");
    router.push(`/buyers?${next.toString()}`, { scroll: false });
  }, [router, sp]);

  // ── URL-derived state ───────────────────────────────────────────────────
  const filters: BuyerFilterState = useMemo(() => ({
    q: sp.get("q") ?? "",
    city: sp.get("city") ?? "",
    type: (sp.get("type") ?? "") as PropertyType | "",
    status: (sp.get("status") ?? "") as BuyerTemperature | "",
    source: (sp.get("source") ?? "") as LeadSource | "",
    budgetMin: sp.get("budgetMin") ?? "",
    budgetMax: sp.get("budgetMax") ?? "",
    roomsMin: sp.get("roomsMin") ?? "",
    urgency: (sp.get("urgency") ?? "") as BuyerFilterState["urgency"],
    financing: (sp.get("financing") ?? "") as "" | FinancingRisk,
    activity: (sp.get("activity") ?? "") as BuyerFilterState["activity"],
    hasMatches: sp.get("hasMatches") === "1",
  }), [sp]);

  const kpiRaw = sp.get("kpi");
  const kpi: KpiKey | null = KPI_KEYS.includes(kpiRaw as KpiKey) ? (kpiRaw as KpiKey) : null;
  const view: "table" | "cards" = sp.get("view") === "cards" ? "cards" : "table";
  const openId = sp.get("open");
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(Math.max(Number(sp.get("pageSize")) || DEFAULT_PAGE_SIZE, 10), 100);

  const onFilters = (next: BuyerFilterState) => setParam({
    q: next.q || null, city: next.city || null, type: next.type || null, status: next.status || null,
    source: next.source || null, budgetMin: next.budgetMin || null, budgetMax: next.budgetMax || null,
    roomsMin: next.roomsMin || null, urgency: next.urgency || null, financing: next.financing || null,
    activity: next.activity || null, hasMatches: next.hasMatches ? "1" : null,
  });
  const clearAll = () => setParam({
    q: null, city: null, type: null, status: null, source: null, budgetMin: null, budgetMax: null,
    roomsMin: null, urgency: null, financing: null, activity: null, hasMatches: null, kpi: null,
  });

  const runReconcile = () => {
    setReconcileMsg(null);
    startReconcile(async () => {
      const r = await reconcileBuyerIntelligenceAction();
      setReconcileMsg(r.error ?? r.message ?? null);
      router.refresh();
    });
  };

  const insights = useMemo(() => board?.insights ?? [], [board]);

  // Apply search + filters + KPI quick filter (client-side over server set).
  const filtered = useMemo(() => insights.filter((i) => {
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
  }), [insights, filters, kpi]);

  // Pagination (over the filtered set).
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, (safePage - 1) * pageSize + pageSize);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  const openInsight = insights.find((i) => i.buyer.id === openId) ?? null;

  function exportCsv() {
    const header = ["שם", "טלפון", "אימייל", "סטטוס", "תקציב", "אזורים", "שלב", "דחיפות"];
    const lines = filtered.map((i) => {
      const b = i.buyer;
      const cells = [b.full_name, b.phone ?? "", b.email ?? "", b.temperature ? TEMPERATURE_LABELS[b.temperature] : "", buyerBudgetLine(b).replace(/,/g, ""), b.preferred_areas.join(" / "), i.stageLabel, String(i.urgency)];
      return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
    });
    const csv = "﻿" + [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `zono-buyers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (error || !board) {
    return <div className="bg-danger-soft text-danger rounded-2xl px-4 py-3 text-sm font-semibold">לא ניתן לטעון את הקונים כעת. נסה/י לרענן.</div>;
  }

  if (insights.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Hero onExport={exportCsv} view={view} setView={(v) => setParam({ view: v === "cards" ? "cards" : null }, false)} canExport={false} onReconcile={runReconcile} reconciling={reconciling} reconcileMsg={reconcileMsg} />
        <BuyerEmptyState kind="no-buyers" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Hero onExport={exportCsv} view={view} setView={(v) => setParam({ view: v === "cards" ? "cards" : null }, false)} canExport onReconcile={runReconcile} reconciling={reconciling} reconcileMsg={reconcileMsg} />

      {board.truncated && (
        <div className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-[12.5px] font-bold">מוצגים {board.total} הקונים הפעילים ביותר. צמצם עם סינון כדי לראות אחרים.</div>
      )}

      <BuyerKpiStrip kpis={board.kpis} active={kpi} onSelect={(k) => setParam({ kpi: kpi === k ? null : k })} />

      <BuyerPriorityCockpit insights={insights} onOpen={(id) => setParam({ open: id }, false)} />

      <BuyerAiInsights insights={insights} onOpen={(id) => setParam({ open: id }, false)} />

      <div className="flex flex-col gap-4">
        <BuyerFiltersBar filters={filters} onChange={onFilters} onClear={clearAll} cityOptions={board.cityOptions} resultCount={total} />

        {total === 0 ? (
          <BuyerEmptyState kind="no-results" onClear={clearAll} compact />
        ) : (
          <>
            <BuyersTable insights={pageRows} onOpen={(id) => setParam({ open: id }, false)} view={view} />
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

      <BuyerDrawer insight={openInsight} onClose={() => setParam({ open: null }, false)} />
    </div>
  );
}

function Hero({ onExport, view, setView, canExport, onReconcile, reconciling, reconcileMsg }: {
  onExport: () => void; view: "table" | "cards"; setView: (v: "table" | "cards") => void; canExport: boolean;
  onReconcile: () => void; reconciling: boolean; reconcileMsg: string | null;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-brand text-xs font-bold tracking-wide">CRM קונים</p>
        <h1 className="text-ink text-2xl font-black sm:text-[28px]">הקונים שלך</h1>
        <p className="text-muted mt-0.5 text-sm font-medium">ניהול חכם של קונים, תקציבים, התאמות ונקודות טיפול</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="bg-card border-line flex overflow-hidden rounded-xl border">
          <button type="button" onClick={() => setView("table")} className={cn("grid h-9 w-9 place-items-center transition", view === "table" ? "bg-brand-soft text-brand-strong" : "text-muted")} aria-label="תצוגת טבלה"><Icon name="Rows3" size={18} /></button>
          <button type="button" onClick={() => setView("cards")} className={cn("grid h-9 w-9 place-items-center transition", view === "cards" ? "bg-brand-soft text-brand-strong" : "text-muted")} aria-label="תצוגת כרטיסים"><Icon name="LayoutGrid" size={18} /></button>
        </div>
        <Button variant="ghost" size="md" onClick={onExport} disabled={!canExport} leadingIcon={<Icon name="Download" size={16} />}>ייצוא</Button>
        <Button variant="ghost" size="md" onClick={onReconcile} loading={reconciling} title={reconcileMsg ?? "השלמת מודיעין לכל הקונים החסרים"} leadingIcon={<Icon name="Sparkles" size={16} />}>השלמת מודיעין</Button>
        <Link href="/buyers/new"><Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>קונה חדש</Button></Link>
      </div>
    </div>
  );
}
