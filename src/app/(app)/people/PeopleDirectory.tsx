"use client";
// ============================================================================
// ZONO — People directory (client). A dense, scannable relationship command
// center over the unified-person model: server-paginated table (default) +
// compact grid, one toolbar (search / role / attention / sort / view as URL
// state), multi-select + a real bulk owner-assign bar [manager], and per-row
// real owner reassignment. All data arrives pre-paginated from
// queryPeopleDirectory — the client holds only one page. Every filter/sort/
// page/view change updates the URL; every assign persists via a server action,
// then router.refresh(). RTL.
// ============================================================================
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import {
  PEOPLE_SORT_OPTIONS, PEOPLE_ROLE_OPTIONS, PEOPLE_ROLE_LABEL,
  type PeopleDirectoryPage, type PersonDirectoryRow, type PersonRole,
} from "@/lib/people/directory";
import { assignPersonOwnerAction, bulkAssignPeopleOwnerAction } from "@/lib/people/directory-actions";

type AgentOption = { id: string; name: string; avatarUrl: string | null };
const ROLE_TONE: Record<PersonRole, "brand" | "success" | "warning"> = { buyer: "brand", seller: "success", lead: "warning" };
const ATT_BADGE: Record<string, "danger" | "warning" | "neutral"> = { uncontactable: "danger", unassigned: "warning", stale: "neutral" };
const ATTENTION_OPTIONS = [
  { value: "any", label: "כל מה שדורש טיפול" }, { value: "uncontactable", label: "ללא פרטי קשר" },
  { value: "unassigned", label: "לא משויכים" }, { value: "stale", label: "ללא פעילות" },
];

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
const personHref = (r: PersonDirectoryRow): string => { const t = r.targets[0]; return t ? `/people/${t.type}/${t.id}` : "/people"; };

export function PeopleDirectory({ data, view, canManage, agentOptions }: {
  data: PeopleDirectoryPage; view: "table" | "grid"; canManage: boolean; agentOptions: AgentOption[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  // Reset selection when the page changes — adjust-during-render (no effect).
  const pageKey = `${sp.toString()}|${data.rows.map((r) => r.key).join(",")}`;
  const [prevPageKey, setPrevPageKey] = useState(pageKey);
  if (pageKey !== prevPageKey) { setPrevPageKey(pageKey); if (selected.size) setSelected(new Set()); if (err) setErr(null); }

  const setParam = useCallback((patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    if (resetPage && !("page" in patch)) next.delete("page");
    router.push(`/people?${next.toString()}`, { scroll: false });
  }, [router, sp]);

  // Debounced search — mirror URL → local via adjust-during-render.
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

  const rowByKey = useMemo(() => new Map(data.rows.map((r) => [r.key, r])), [data.rows]);
  const allOnPage = data.rows.length > 0 && data.rows.every((r) => selected.has(r.key));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(data.rows.map((r) => r.key)));
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const rowAssign = (r: PersonDirectoryRow, agentUserId: string | null) => start(async () => {
    setErr(null);
    const res = await assignPersonOwnerAction(r.targets, agentUserId);
    if (res.error) setErr(res.error);
    router.refresh();
  });
  const runBulkAssign = (agentUserId: string | null) => start(async () => {
    setErr(null);
    const people = Array.from(selected).map((k) => rowByKey.get(k)?.targets).filter((t): t is { type: PersonRole; id: string }[] => !!t);
    if (!people.length) return;
    const res = await bulkAssignPeopleOwnerAction(people, agentUserId);
    if (!res.ok && res.errors[0]) setErr(res.errors[0]);
    setSelected(new Set());
    router.refresh();
  });

  const role = sp.get("role") ?? "";
  const attention = sp.get("attention") ?? "";
  const sort = sp.get("sort") ?? "activity";

  const activeChips: { label: string; clear: () => void }[] = [];
  if (urlQ) activeChips.push({ label: `חיפוש: ${urlQ}`, clear: () => setParam({ q: null }) });
  if (role) activeChips.push({ label: PEOPLE_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role, clear: () => setParam({ role: null }) });
  if (attention) activeChips.push({ label: ATTENTION_OPTIONS.find((o) => o.value === attention)?.label ?? attention, clear: () => setParam({ attention: null }) });

  const selCount = selected.size;
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.page * data.pageSize, data.total);

  const selectCls = "bg-surface border-line text-ink focus:border-brand-light h-9 rounded-xl border px-2.5 text-[12.5px] font-semibold outline-none";

  return (
    <div dir="rtl" className="flex w-full flex-col gap-3">
      {/* Toolbar */}
      <div className="border-line bg-card shadow-[var(--shadow-soft)] flex flex-wrap items-center gap-2 rounded-2xl border p-2.5">
        <div className="relative min-w-[200px] flex-1">
          <span className="text-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><Icon name="Search" size={15} /></span>
          <input value={qLocal} onChange={(e) => onSearch(e.target.value)} placeholder="חיפוש לפי שם, טלפון או אימייל"
            className="bg-surface border-line text-ink focus:border-brand-light h-9 w-full rounded-xl border pr-9 pl-3 text-[13px] outline-none" />
        </div>
        <select value={role} onChange={(e) => setParam({ role: e.target.value || null })} className={selectCls} aria-label="תפקיד">
          <option value="">כל התפקידים</option>
          {PEOPLE_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={attention} onChange={(e) => setParam({ attention: e.target.value || null })} className={selectCls} aria-label="דורש טיפול">
          <option value="">הכל</option>
          {ATTENTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setParam({ sort: e.target.value }, false)} className={selectCls} aria-label="מיון">
          {PEOPLE_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="border-line flex overflow-hidden rounded-xl border">
          <button onClick={() => setParam({ view: null }, false)} className={`grid h-9 w-9 place-items-center transition ${view === "table" ? "bg-brand text-white" : "bg-surface text-muted"}`} aria-label="טבלה"><Icon name="Menu" size={15} /></button>
          <button onClick={() => setParam({ view: "grid" }, false)} className={`grid h-9 w-9 place-items-center transition ${view === "grid" ? "bg-brand text-white" : "bg-surface text-muted"}`} aria-label="כרטיסים"><Icon name="LayoutGrid" size={15} /></button>
        </div>
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((c, i) => (
            <button key={i} onClick={c.clear} className="border-line bg-surface text-ink hover:border-danger-soft inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition">
              {c.label}<Icon name="X" size={11} />
            </button>
          ))}
        </div>
      )}

      {err && <div className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-[12.5px] font-bold">{err}</div>}

      {/* Bulk action bar (manager) */}
      {canManage && selCount > 0 && (
        <div className="border-brand-light bg-brand-soft/40 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2">
          <span className="text-brand-strong text-[12.5px] font-black">{selCount} נבחרו</span>
          <span className="text-muted text-[12px]">שייך ל:</span>
          <select disabled={pending} defaultValue="" onChange={(e) => { const v = e.target.value; if (v) runBulkAssign(v === "__none__" ? null : v); e.currentTarget.value = ""; }} className={selectCls}>
            <option value="" disabled>בחר סוכן…</option>
            {agentOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="__none__">— הסר שיוך —</option>
          </select>
          <button onClick={() => setSelected(new Set())} className="text-muted hover:text-ink mr-auto text-[12px] font-bold">נקה בחירה</button>
        </div>
      )}

      {data.rows.length === 0 ? (
        <div className="border-line bg-card text-muted rounded-2xl border p-10 text-center text-[13px] font-semibold">אין אנשים התואמים לסינון</div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {data.rows.map((r) => (
            <div key={r.key} className="border-line bg-card hover:border-brand-light group relative flex flex-col gap-2 rounded-2xl border p-3.5 transition">
              {canManage && <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} className="accent-brand absolute left-3 top-3 h-4 w-4" aria-label="בחר" />}
              <Link href={personHref(r)} className="min-w-0 pl-6">
                <p className="text-ink truncate font-black">{r.name}</p>
                <p className="text-muted truncate text-[12px]">{r.phone ?? "—"}{r.email ? ` · ${r.email}` : ""}</p>
              </Link>
              <div className="flex flex-wrap gap-1">
                {r.roles.map((rl) => <Badge key={rl} tone={ROLE_TONE[rl]}>{PEOPLE_ROLE_LABEL[rl]}</Badge>)}
                {r.attention && <Badge tone={ATT_BADGE[r.attention.key]}>{r.attention.label}</Badge>}
              </div>
              <div className="text-muted flex items-center justify-between text-[11.5px]">
                <span className="inline-flex items-center gap-1">{r.agentName ? <><AgentAvatar url={null} name={r.agentName} size={18} ring={false} /> {r.agentName}</> : r.ownerMixed ? "כמה סוכנים" : "לא משויך"}</span>
                <span className="inline-flex items-center gap-1"><Icon name="Clock" size={11} />{relTime(r.lastActivity)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border-line bg-card shadow-[var(--shadow-soft)] overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[720px] text-right">
            <thead>
              <tr className="border-line text-muted border-b text-[11px] font-bold">
                {canManage && <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allOnPage} onChange={toggleAll} className="accent-brand h-4 w-4" aria-label="בחר הכל" /></th>}
                <th className="px-3 py-2.5">איש קשר</th>
                <th className="px-3 py-2.5">תפקידים</th>
                <th className="px-3 py-2.5">סוכן</th>
                <th className="px-3 py-2.5">פעילות</th>
                <th className="px-3 py-2.5">התראה</th>
                <th className="w-16 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.key} className="border-line hover:bg-surface/60 border-b transition last:border-0">
                  {canManage && <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} className="accent-brand h-4 w-4" aria-label="בחר" /></td>}
                  <td className="px-3 py-2.5">
                    <Link href={personHref(r)} className="block min-w-0">
                      <p className="text-ink truncate font-bold">{r.name}</p>
                      <p className="text-muted truncate text-[11.5px]">{r.phone ?? "—"}{r.email ? ` · ${r.email}` : ""}</p>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{r.roles.map((rl) => <Badge key={rl} tone={ROLE_TONE[rl]}>{PEOPLE_ROLE_LABEL[rl]}</Badge>)}</div></td>
                  <td className="px-3 py-2.5">
                    {canManage ? (
                      <select disabled={pending} value={r.ownerId ?? ""} onChange={(e) => rowAssign(r, e.target.value || null)} className="bg-surface border-line text-ink focus:border-brand-light h-8 max-w-[130px] rounded-lg border px-2 text-[11.5px] font-semibold outline-none">
                        <option value="">{r.ownerMixed ? "כמה סוכנים" : "לא משויך"}</option>
                        {agentOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-muted inline-flex items-center gap-1.5 text-[12px]">{r.agentName ? <><AgentAvatar url={null} name={r.agentName} size={18} ring={false} /> {r.agentName}</> : r.ownerMixed ? "כמה סוכנים" : "—"}</span>
                    )}
                  </td>
                  <td className="text-muted px-3 py-2.5 text-[12px]">{relTime(r.lastActivity)}</td>
                  <td className="px-3 py-2.5">{r.attention ? <Badge tone={ATT_BADGE[r.attention.key]}>{r.attention.label}</Badge> : <span className="text-muted text-[12px]">—</span>}</td>
                  <td className="px-3 py-2.5"><Link href={personHref(r)} className="text-brand-strong hover:bg-brand-soft inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold transition">פתח</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
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
