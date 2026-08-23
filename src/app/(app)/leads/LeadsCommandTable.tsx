"use client";
// ============================================================================
// ZONO — Leads command table (client). Server-paginated: one page arrives from
// queryLeadsBoard. Sticky toolbar (search / stage tabs / attention / sort as URL
// state), multi-select + the real bulk action bar (bulkLeadAction — mark
// contacted / assign me / move stage), per-row follow-up badge, score and stage,
// deep-link to the lead card. Every filter/sort/page change updates the URL;
// every bulk op persists then router.refresh(). RTL.
// ============================================================================
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { bulkLeadAction, type BulkLeadOp, type BulkLeadResult } from "@/lib/leads/actions";
import { LEAD_STAGE_HE } from "@/lib/i18n/labels";
import { LEAD_SORT_OPTIONS, LEAD_ATTENTION_OPTIONS, LEAD_BOARD_STAGES, type LeadsBoardPage } from "@/lib/leads/board";

const STAGE_TONE: Record<string, string> = {
  new: "bg-brand-soft text-brand-strong", contacted: "bg-warning-soft text-warning", qualified: "bg-success-soft text-success",
  nurturing: "bg-surface text-muted", converted: "bg-success-soft text-success", lost: "bg-danger-soft text-danger", disqualified: "bg-surface text-muted",
};
const FU_TONE: Record<string, string> = { danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", neutral: "bg-surface text-muted" };
const STAGE_TABS = ["all", ...LEAD_BOARD_STAGES];
const BULK_OPS: { value: BulkLeadOp; label: string }[] = [
  { value: "mark_contacted", label: "סמן כנוצר קשר" },
  { value: "assign_me", label: "שייך אליי" },
  { value: "stage:qualified", label: "העבר ל: מוסמך" },
  { value: "stage:nurturing", label: "העבר ל: בטיפוח" },
  { value: "stage:disqualified", label: "העבר ל: נפסל" },
];

export function LeadsCommandTable({ data }: { data: LeadsBoardPage }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [op, setOp] = useState<BulkLeadOp>("mark_contacted");
  const [result, setResult] = useState<BulkLeadResult | null>(null);

  const pageKey = `${sp.toString()}|${data.rows.map((r) => r.id).join(",")}`;
  const [prevPageKey, setPrevPageKey] = useState(pageKey);
  if (pageKey !== prevPageKey) { setPrevPageKey(pageKey); if (selected.size) setSelected(new Set()); if (result) setResult(null); }

  const setParam = useCallback((patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    if (resetPage && !("page" in patch)) next.delete("page");
    router.push(`/leads?${next.toString()}`, { scroll: false });
  }, [router, sp]);

  const urlQ = sp.get("q") ?? "";
  const [qLocal, setQLocal] = useState(urlQ);
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);
  if (urlQ !== prevUrlQ) { setPrevUrlQ(urlQ); setQLocal(urlQ); }
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (v: string) => {
    setQLocal(v);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => setParam({ q: v.trim() || null }), 350);
  };

  const stage = sp.get("stage") ?? "all";
  const attention = sp.get("attention") ?? "";
  const sort = sp.get("sort") ?? "urgency";

  const allOnPage = data.rows.length > 0 && data.rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(data.rows.map((r) => r.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const applyBulk = () => start(async () => {
    if (!selected.size) return;
    setResult(null);
    try {
      const res = await bulkLeadAction(Array.from(selected), op);
      setResult(res);
      if (res.succeeded > 0) { setSelected(new Set()); router.refresh(); }
    } catch { setResult({ ok: false, error: "הפעולה נכשלה", results: [], succeeded: 0, failed: 0 }); }
  });

  const selectCls = "bg-surface border-line text-ink focus:border-brand-light h-9 rounded-xl border px-2.5 text-[12.5px] font-semibold outline-none";
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.page * data.pageSize, data.total);

  const activeChips: { label: string; clear: () => void }[] = [];
  if (urlQ) activeChips.push({ label: `חיפוש: ${urlQ}`, clear: () => setParam({ q: null }) });
  if (attention) activeChips.push({ label: LEAD_ATTENTION_OPTIONS.find((o) => o.value === attention)?.label ?? attention, clear: () => setParam({ attention: null }) });

  const failedById = useMemo(() => new Map((result?.results ?? []).filter((r) => !r.ok).map((r) => [r.id, r.error])), [result]);

  return (
    <div dir="rtl" className="flex w-full flex-col gap-3">
      {/* Toolbar */}
      <div className="border-line bg-card shadow-[var(--shadow-soft)] flex flex-wrap items-center gap-2 rounded-2xl border p-2.5">
        <div className="relative min-w-[200px] flex-1">
          <span className="text-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><Icon name="Search" size={15} /></span>
          <input value={qLocal} onChange={(e) => onSearch(e.target.value)} placeholder="חיפוש לפי שם, טלפון או אימייל"
            className="bg-surface border-line text-ink focus:border-brand-light h-9 w-full rounded-xl border pr-9 pl-3 text-[13px] outline-none" />
        </div>
        <select value={attention} onChange={(e) => setParam({ attention: e.target.value || null })} className={selectCls} aria-label="דורש טיפול">
          <option value="">הכל</option>
          {LEAD_ATTENTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setParam({ sort: e.target.value }, false)} className={selectCls} aria-label="מיון">
          {LEAD_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Stage tabs */}
      <nav className="flex flex-wrap gap-1.5">
        {STAGE_TABS.map((s) => (
          <button key={s} onClick={() => setParam({ stage: s === "all" ? null : s })} className={`rounded-full px-3 py-1 text-[12px] font-bold transition ${stage === s ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>
            {s === "all" ? "הכל" : LEAD_STAGE_HE[s] ?? s}
          </button>
        ))}
      </nav>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((c, i) => (
            <button key={i} onClick={c.clear} className="border-line bg-surface text-ink hover:border-danger-soft inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition">{c.label}<Icon name="X" size={11} /></button>
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="border-brand-light bg-brand-soft/40 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2">
          <span className="text-brand-strong text-[12.5px] font-black">{selected.size} נבחרו</span>
          <select value={op} onChange={(e) => setOp(e.target.value as BulkLeadOp)} className={selectCls}>
            {BULK_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Button size="sm" loading={pending} disabled={!selected.size} onClick={applyBulk}>החל על הנבחרים</Button>
          <button onClick={() => { setSelected(new Set()); setResult(null); }} className="text-muted hover:text-ink text-[12px] font-bold">נקה</button>
          {result && <span className={`text-[12px] font-bold ${result.failed ? "text-warning" : "text-success"}`}>{result.error ? result.error : `${result.succeeded} עודכנו${result.failed ? ` · ${result.failed} נכשלו` : ""}`}</span>}
        </div>
      )}

      {data.rows.length === 0 ? (
        <div className="border-line bg-card text-muted rounded-2xl border p-10 text-center text-[13px] font-semibold">אין לידים התואמים לסינון</div>
      ) : (
        <div className="border-line bg-card shadow-[var(--shadow-soft)] overflow-hidden rounded-2xl border">
          <div className="border-line text-muted flex items-center gap-3 border-b px-3 py-2 text-[11px] font-bold">
            <input type="checkbox" checked={allOnPage} onChange={toggleAll} className="accent-brand h-4 w-4" aria-label="בחר הכל" />
            <span>בחר הכל בעמוד</span>
          </div>
          <div className="flex flex-col">
            {data.rows.map((l) => {
              const sel = selected.has(l.id);
              const rowErr = failedById.get(l.id);
              return (
                <div key={l.id} className={`border-line hover:bg-surface/60 flex items-center gap-3 border-b px-3 py-2.5 transition last:border-0 ${sel ? "bg-brand-soft/20" : ""}`}>
                  <input type="checkbox" checked={sel} onChange={() => toggle(l.id)} className="accent-brand h-4 w-4" aria-label="בחר" />
                  <Link href={`/leads/${l.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:opacity-90">
                    <div className="min-w-0">
                      <p className="text-ink truncate font-bold">{l.full_name}</p>
                      <p className="text-muted truncate text-[11.5px]">{l.phone ?? "—"}{l.email ? ` · ${l.email}` : ""}{l.sourceLabel ? ` · מקור: ${l.sourceLabel}` : ""}{rowErr ? ` · ⚠ ${rowErr}` : ""}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {l.agentName ? <AgentAvatar url={null} name={l.agentName} size={20} ring={false} /> : <span className="text-danger text-[11px] font-bold">ללא אחראי</span>}
                      {l.followUp && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${FU_TONE[l.followUp.tone]}`}>{l.followUp.label}</span>}
                      {l.score != null && <span className="text-muted text-[12px] font-bold tabular-nums">{l.score}</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_TONE[l.stage] ?? "bg-surface text-muted"}`}>{l.stageLabel}</span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {data.total > 0 && (
        <div className="text-muted flex flex-wrap items-center justify-between gap-2 px-1 text-[12px]">
          <span>מציג {from}–{to} מתוך {data.total}</span>
          <div className="flex items-center gap-1.5">
            <select value={String(data.pageSize)} onChange={(e) => setParam({ pageSize: e.target.value, page: null })} className="bg-surface border-line text-ink h-8 rounded-lg border px-2 text-[12px] outline-none">
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n} לעמוד</option>)}
            </select>
            <button disabled={data.page <= 1} onClick={() => setParam({ page: String(data.page - 1) }, false)} className="border-line bg-surface text-ink grid h-8 w-8 place-items-center rounded-lg border transition disabled:opacity-40"><Icon name="ChevronRight" size={15} /></button>
            <span className="min-w-[60px] text-center font-bold">{data.page} / {data.pageCount}</span>
            <button disabled={data.page >= data.pageCount} onClick={() => setParam({ page: String(data.page + 1) }, false)} className="border-line bg-surface text-ink grid h-8 w-8 place-items-center rounded-lg border transition disabled:opacity-40"><Icon name="ChevronLeft" size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
