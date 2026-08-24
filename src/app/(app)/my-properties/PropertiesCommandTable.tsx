"use client";
// ============================================================================
// ZONO — Properties command table (client). A dense, scannable inventory tool:
// server-paginated table (default) + compact grid, one sticky toolbar (search /
// sort / view / filters as URL state), multi-select + a real bulk action bar,
// and per-row real actions (status change, reassign [manager], archive). All
// data comes pre-paginated from queryInventory — the client holds only one page.
// Every search/filter/sort/page/view change updates the URL; the server re-queries.
// Every action persists via a server action, then router.refresh(). RTL.
// ============================================================================
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { PROPERTY_STATUS_OPTIONS, PROPERTY_TYPE_OPTIONS, LISTING_KIND_OPTIONS } from "@/lib/properties/labels";
import { SORT_OPTIONS } from "@/lib/properties/inventory-center";
import { setPropertyStatusInlineAction, archivePropertyInlineAction, assignPropertyAgentAction, bulkPropertyAction } from "@/lib/properties/inventory-actions";
import type { InventoryPage, InventoryRow } from "@/lib/properties/inventory-query";
import type { PropertyStatus } from "@/lib/supabase/types";
import { ZonoEmptyState } from "@/components/zono/ZonoEmptyState";

type AgentOption = { id: string; name: string; avatarUrl: string | null };
const TONE_TXT: Record<string, string> = { warning: "text-warning", danger: "text-danger", neutral: "text-muted" };

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(d)) return "—";
  if (d <= 0) return "היום";
  if (d === 1) return "אתמול";
  if (d < 30) return `לפני ${d} ימים`;
  const m = Math.floor(d / 30);
  return m === 1 ? "לפני חודש" : `לפני ${m} חודשים`;
}

export function PropertiesCommandTable({ data, view, canManage, agentOptions }: {
  data: InventoryPage; view: "table" | "grid"; canManage: boolean; agentOptions: AgentOption[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkErr, setBulkErr] = useState<string | null>(null);

  // Reset selection whenever the underlying page changes (new fetch).
  // Adjust-state-during-render (no effect) — avoids cascading re-render lint.
  const pageKey = `${sp.toString()}|${data.rows.map((r) => r.id).join(",")}`;
  const [prevPageKey, setPrevPageKey] = useState(pageKey);
  if (pageKey !== prevPageKey) {
    setPrevPageKey(pageKey);
    if (selected.size) setSelected(new Set());
    if (bulkErr) setBulkErr(null);
  }

  const setParam = useCallback((patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    if (resetPage && !("page" in patch)) next.delete("page");
    router.push(`/my-properties?${next.toString()}`, { scroll: false });
  }, [router, sp]);

  // Debounced search — mirror URL → local via adjust-during-render (no effect).
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

  const allOnPage = data.rows.length > 0 && data.rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(data.rows.map((r) => r.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const rowAct = (fn: () => Promise<{ ok?: boolean; error?: string }>) => start(async () => {
    const r = await fn(); if (r.error) setBulkErr(r.error); router.refresh();
  });
  const runBulk = (op: Parameters<typeof bulkPropertyAction>[1]) => start(async () => {
    setBulkErr(null);
    const r = await bulkPropertyAction([...selected], op);
    if (r.failed > 0) setBulkErr(`עודכנו ${r.updated}, נכשלו ${r.failed}${r.errors[0] ? ` · ${r.errors[0]}` : ""}`);
    setSelected(new Set()); router.refresh();
  });

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    const st = sp.get("status"); if (st) chips.push({ key: "status", label: PROPERTY_STATUS_OPTIONS.find((o) => o.value === st)?.label ?? st });
    const ty = sp.get("type"); if (ty) chips.push({ key: "type", label: PROPERTY_TYPE_OPTIONS.find((o) => o.value === ty)?.label ?? ty });
    const ki = sp.get("kind"); if (ki) chips.push({ key: "kind", label: LISTING_KIND_OPTIONS.find((o) => o.value === ki)?.label ?? ki });
    const ci = sp.get("city"); if (ci) chips.push({ key: "city", label: ci });
    const at = sp.get("attention"); if (at) chips.push({ key: "attention", label: at === "any" ? "דורשים טיפול" : "התראה" });
    const qq = sp.get("q"); if (qq) chips.push({ key: "q", label: `"${qq}"` });
    return chips;
  }, [sp]);

  const selCls = "border-line bg-card text-ink rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold outline-none focus:border-brand-light";

  // §4 FIRST-RUN — a truly empty inventory (0 rows AND no active filter/search) is a
  // brand-new office, NOT a filtered-to-empty result. Show a real first-property CTA
  // instead of the misleading "no match / clear filters" box + filter chrome.
  if (data.rows.length === 0 && activeChips.length === 0) {
    return (
      <div dir="rtl">
        <ZonoEmptyState
          title="הנכס הראשון שלך עוד לא כאן"
          description="ברגע שתוסיפו נכס, ZONO תתחיל לבנות סביבו התאמות לקונים, שיווק בקבוצות, משימות ומעקב — הכול במקום אחד."
          actions={[{ label: "הוספת נכס", href: "/properties/new", primary: true }]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      {/* Toolbar */}
      <div className="border-line bg-card sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl border p-2.5 shadow-[var(--shadow-soft)]">
        <div className="relative min-w-[220px] flex-1">
          <Icon name="Search" size={15} className="text-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
          <input value={qLocal} onChange={(e) => onSearch(e.target.value)} placeholder="חיפוש לפי כתובת, עיר, שכונה…" aria-label="חיפוש נכסים"
            className="border-line bg-surface text-ink w-full rounded-xl border py-2 pr-9 pl-3 text-[13px] outline-none focus:border-brand-light" />
          {qLocal && <button type="button" aria-label="נקה חיפוש" onClick={() => { setQLocal(""); setParam({ q: null }); }} className="text-muted hover:text-ink absolute left-2 top-1/2 -translate-y-1/2"><Icon name="X" size={14} /></button>}
        </div>
        <select aria-label="סוג עסקה" className={selCls} value={sp.get("kind") ?? ""} onChange={(e) => setParam({ kind: e.target.value || null })}>
          <option value="">מכירה/השכרה</option>{LISTING_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="סוג נכס" className={selCls} value={sp.get("type") ?? ""} onChange={(e) => setParam({ type: e.target.value || null })}>
          <option value="">כל הסוגים</option>{PROPERTY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="סטטוס" className={selCls} value={sp.get("status") ?? ""} onChange={(e) => setParam({ status: e.target.value || null })}>
          <option value="">כל הסטטוסים</option>{PROPERTY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="מיון" className={selCls} value={sp.get("sort") ?? "recent"} onChange={(e) => setParam({ sort: e.target.value })}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="border-line flex overflow-hidden rounded-lg border">
          <button type="button" aria-label="טבלה" onClick={() => setParam({ view: "table" }, false)} className={`grid h-8 w-8 place-items-center ${view === "table" ? "bg-brand text-white" : "text-muted hover:bg-surface"}`}><Icon name="Menu" size={15} /></button>
          <button type="button" aria-label="כרטיסים" onClick={() => setParam({ view: "grid" }, false)} className={`grid h-8 w-8 place-items-center ${view === "grid" ? "bg-brand text-white" : "text-muted hover:bg-surface"}`}><Icon name="LayoutGrid" size={15} /></button>
        </div>
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((c) => (
            <button key={c.key} type="button" onClick={() => setParam({ [c.key]: null })} className="bg-brand-soft text-brand-strong hover:bg-brand-soft/70 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold">{c.label}<Icon name="X" size={11} /></button>
          ))}
          <button type="button" onClick={() => router.push("/my-properties", { scroll: false })} className="text-muted hover:text-ink text-[11.5px] font-bold">נקה הכל</button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="border-brand-light bg-brand-soft/50 flex flex-wrap items-center gap-2 rounded-2xl border p-2.5">
          <span className="text-brand-strong text-[12.5px] font-black">{selected.size} נבחרו</span>
          <select aria-label="שנה סטטוס" defaultValue="" className={selCls} disabled={pending} onChange={(e) => { if (e.target.value) runBulk({ kind: "status", status: e.target.value as PropertyStatus }); e.target.value = ""; }}>
            <option value="">שנה סטטוס…</option>{PROPERTY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {canManage && (
            <select aria-label="שייך לסוכן" defaultValue="" className={selCls} disabled={pending} onChange={(e) => { runBulk({ kind: "assign", agentUserId: e.target.value || null }); e.target.value = ""; }}>
              <option value="">שייך לסוכן…</option><option value="">— בטל שיוך —</option>{agentOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <button type="button" disabled={pending} onClick={() => runBulk({ kind: "archive" })} className="border-line text-danger hover:bg-danger-soft rounded-lg border px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-50">העבר לארכיון</button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-muted hover:text-ink text-[12px] font-bold">ביטול בחירה</button>
          {bulkErr && <span className="text-danger text-[11.5px] font-bold">{bulkErr}</span>}
        </div>
      )}

      {data.rows.length === 0 ? (
        <div className="border-line bg-card text-muted flex flex-col items-center gap-2 rounded-2xl border p-10 text-center">
          <Icon name="Building2" size={28} />
          <p className="text-[13px] font-bold">לא נמצאו נכסים שמתאימים לסינון</p>
          <button type="button" onClick={() => router.push("/my-properties", { scroll: false })} className="text-brand-strong text-[12px] font-bold">נקה מסננים</button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data.rows.map((r) => <GridCard key={r.id} r={r} selected={selected.has(r.id)} onToggle={() => toggle(r.id)} />)}
        </div>
      ) : (
        <div className="border-line bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[920px] border-collapse text-right">
            <thead>
              <tr className="border-line text-muted border-b text-[11px] font-bold">
                <th className="w-10 p-2"><input type="checkbox" aria-label="בחר הכל" checked={allOnPage} onChange={toggleAll} /></th>
                <th className="p-2 text-right">נכס</th>
                <th className="p-2 text-right">מחיר</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">סוכן</th>
                <th className="p-2 text-right">עניין</th>
                <th className="p-2 text-right">פעילות</th>
                <th className="p-2 text-right">התראה</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <Row key={r.id} r={r} selected={selected.has(r.id)} onToggle={() => toggle(r.id)} canManage={canManage} agentOptions={agentOptions} pending={pending}
                  onStatus={(s) => rowAct(() => setPropertyStatusInlineAction(r.id, s))}
                  onAssign={(a) => rowAct(() => assignPropertyAgentAction(r.id, a))}
                  onArchive={() => rowAct(() => archivePropertyInlineAction(r.id))} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <span className="text-muted text-[12px] font-semibold">מציג {data.rangeStart}–{data.rangeEnd} מתוך {data.total}</span>
          <div className="flex items-center gap-1.5">
            <select aria-label="גודל עמוד" className={selCls} value={String(data.pageSize)} onChange={(e) => setParam({ pageSize: e.target.value })}>
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n} בעמוד</option>)}
            </select>
            <button type="button" disabled={data.page <= 1} onClick={() => setParam({ page: String(data.page - 1) }, false)} className="border-line text-ink hover:bg-surface rounded-lg border px-3 py-1.5 text-[12px] font-bold disabled:opacity-40">הקודם</button>
            <span className="text-muted text-[12px] font-bold tabular-nums">{data.page} / {data.pageCount}</span>
            <button type="button" disabled={data.page >= data.pageCount} onClick={() => setParam({ page: String(data.page + 1) }, false)} className="border-line text-ink hover:bg-surface rounded-lg border px-3 py-1.5 text-[12px] font-bold disabled:opacity-40">הבא</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ r, size }: { r: InventoryRow; size: number }) {
  return (
    <div className="bg-surface relative shrink-0 overflow-hidden rounded-lg" style={{ width: size, height: Math.round(size * 0.72) }}>
      {r.coverUrl
        // eslint-disable-next-line @next/next/no-img-element -- listing photos from arbitrary hosts; next/image remote loader not configured
        ? <img src={r.coverUrl} alt={r.title} loading="lazy" className="h-full w-full object-cover" />
        : <div className="text-muted grid h-full w-full place-items-center"><Icon name="Building2" size={Math.round(size / 3)} /></div>}
    </div>
  );
}

function Row({ r, selected, onToggle, canManage, agentOptions, pending, onStatus, onAssign, onArchive }: {
  r: InventoryRow; selected: boolean; onToggle: () => void; canManage: boolean; agentOptions: AgentOption[]; pending: boolean;
  onStatus: (s: PropertyStatus) => void; onAssign: (a: string | null) => void; onArchive: () => void;
}) {
  const selCls = "border-line bg-card text-ink rounded-md border px-1.5 py-1 text-[11px] font-semibold outline-none focus:border-brand-light";
  return (
    <tr className={`border-line hover:bg-surface/60 border-b align-middle ${selected ? "bg-brand-soft/30" : ""}`}>
      <td className="p-2 text-center"><input type="checkbox" aria-label={`בחר ${r.title}`} checked={selected} onChange={onToggle} /></td>
      <td className="p-2">
        <Link href={r.href} className="flex items-center gap-2.5">
          <Thumb r={r} size={56} />
          <div className="min-w-0">
            <p className="text-ink truncate text-[13px] font-bold">{r.title}</p>
            <p className="text-muted truncate text-[11px]">{r.addressLine}</p>
            <p className="text-muted truncate text-[10.5px]">{r.typeLabel} · {r.kindLabel}{r.rooms ? ` · ${r.rooms} חד׳` : ""}{r.sizeSqm ? ` · ${r.sizeSqm} מ״ר` : ""}</p>
          </div>
        </Link>
      </td>
      <td className="p-2"><span className="text-ink text-[12.5px] font-black tabular-nums">{r.priceLabel}</span></td>
      <td className="p-2">
        <select aria-label="סטטוס" className={selCls} value={r.status} disabled={pending} onChange={(e) => onStatus(e.target.value as PropertyStatus)}>
          {PROPERTY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
      <td className="p-2">
        {canManage ? (
          <select aria-label="סוכן מטפל" className={selCls} value={r.agent?.id ?? ""} disabled={pending} onChange={(e) => onAssign(e.target.value || null)}>
            <option value="">ללא סוכן</option>{agentOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : r.agent ? (
          <span className="flex items-center gap-1.5"><AgentAvatar url={r.agent.avatarUrl} name={r.agent.name} size={22} ring={false} /><span className="text-ink truncate text-[11.5px] font-semibold">{r.agent.name}</span></span>
        ) : <span className="text-muted text-[11px]">—</span>}
      </td>
      <td className="p-2">{r.matchCount > 0 ? <span className="bg-brand-soft text-brand-strong inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black"><Icon name="Users" size={11} />{r.matchCount}</span> : <span className="text-muted text-[11px]">—</span>}</td>
      <td className="p-2"><span className="text-muted text-[11.5px]">{relTime(r.updatedAt)}</span></td>
      <td className="p-2">{r.attention ? <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${TONE_TXT[r.attention.tone]}`}><Icon name="AlertTriangle" size={12} />{r.attention.reason}</span> : r.hasExclusivity ? <Badge tone="success" size="sm">בלעדיות</Badge> : <span className="text-success text-[11px]">תקין</span>}</td>
      <td className="p-2 text-left">
        <span className="flex items-center justify-end gap-1">
          <Link href={r.href} className="text-brand-strong hover:bg-surface rounded-md px-2 py-1 text-[11.5px] font-bold">פתח</Link>
          {canManage && <button type="button" aria-label="ארכיון" disabled={pending} onClick={onArchive} className="text-muted hover:text-danger hover:bg-danger-soft grid h-7 w-7 place-items-center rounded-md disabled:opacity-40"><Icon name="Inbox" size={14} /></button>}
        </span>
      </td>
    </tr>
  );
}

function GridCard({ r, selected, onToggle }: { r: InventoryRow; selected: boolean; onToggle: () => void }) {
  return (
    <div className={`border-line bg-card relative flex flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-soft)] ${selected ? "ring-2 ring-[color:var(--color-brand)]" : ""}`}>
      <input type="checkbox" aria-label={`בחר ${r.title}`} checked={selected} onChange={onToggle} className="absolute right-2 top-2 z-10 h-4 w-4" />
      <Link href={r.href} className="block">
        <div className="bg-surface relative aspect-[16/10] w-full overflow-hidden">
          {r.coverUrl
            // eslint-disable-next-line @next/next/no-img-element -- listing photos from arbitrary hosts
            ? <img src={r.coverUrl} alt={r.title} loading="lazy" className="h-full w-full object-cover" />
            : <div className="text-muted flex h-full w-full flex-col items-center justify-center gap-1"><Icon name="Building2" size={26} /><span className="text-[10px] font-semibold">אין תמונה</span></div>}
          <span className="absolute right-2 top-8"><Badge tone={r.statusTone} size="sm">{r.statusLabel}</Badge></span>
          {r.priceLabel !== "—" && <span className="text-ink absolute bottom-2 right-2 rounded-lg bg-white/95 px-2 py-0.5 text-[12px] font-black shadow-sm">{r.priceLabel}</span>}
        </div>
        <div className="flex flex-col gap-1 p-3">
          <p className="text-ink truncate text-[13px] font-black">{r.title}</p>
          <p className="text-muted truncate text-[11px]">{r.addressLine}</p>
          <p className="text-muted truncate text-[10.5px]">{r.typeLabel} · {r.kindLabel}{r.rooms ? ` · ${r.rooms} חד׳` : ""}{r.sizeSqm ? ` · ${r.sizeSqm} מ״ר` : ""}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            {r.agent ? <span className="flex min-w-0 items-center gap-1.5"><AgentAvatar url={r.agent.avatarUrl} name={r.agent.name} size={20} ring={false} /><span className="text-muted truncate text-[11px]">{r.agent.name}</span></span> : <span className="text-muted text-[11px]">ללא סוכן</span>}
            {r.matchCount > 0 && <span className="bg-brand-soft text-brand-strong inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-black"><Icon name="Users" size={10} />{r.matchCount}</span>}
          </div>
          {r.attention && <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${TONE_TXT[r.attention.tone]}`}><Icon name="AlertTriangle" size={11} />{r.attention.reason}</span>}
        </div>
      </Link>
    </div>
  );
}
