"use client";
// Customer directory (P5.2). Search + plan filter + sort over the already-loaded,
// DAL-fetched, audited safe org list. This filters data the server already
// authorized — it opens NO new data path and does NOT loop per-org (no N+1).
// Per-org usage/activity columns are intentionally deferred until an aggregated
// group-by DAL exists (see delivery notes) rather than N+1 per row.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { PlanBadge, IdChip, PLAN_LABEL, formatPlatformDate } from "./ui";
import type { PlatformOrgSummary } from "@/lib/platform-admin/server/dal";

type SortKey = "created_desc" | "created_asc" | "name";

export function CustomersDirectory({ orgs }: { orgs: PlatformOrgSummary[] }) {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [sort, setSort] = useState<SortKey>("created_desc");

  const plans = useMemo(() => [...new Set(orgs.map((o) => o.plan).filter(Boolean))] as string[], [orgs]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = orgs.filter((o) =>
      (!s || o.name.toLowerCase().includes(s) || o.id.toLowerCase().startsWith(s)) &&
      (!plan || o.plan === plan),
    );
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "he");
      const cmp = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
      return sort === "created_asc" ? cmp : -cmp;
    });
    return list;
  }, [orgs, q, plan, sort]);

  return (
    <div className="border-line bg-card rounded-2xl border">
      <div className="border-line flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="border-line flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-xl border bg-surface px-3">
          <Icon name="Search" size={15} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="סינון לפי שם ארגון…" className="text-ink h-full w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted" />
        </div>
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className="border-line text-ink h-9 rounded-xl border bg-surface px-2 text-[13px] font-semibold outline-none">
          <option value="">כל התוכניות</option>
          {plans.map((p) => <option key={p} value={p}>{PLAN_LABEL[p] ?? p}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="border-line text-ink h-9 rounded-xl border bg-surface px-2 text-[13px] font-semibold outline-none">
          <option value="created_desc">חדש → ישן</option>
          <option value="created_asc">ישן → חדש</option>
          <option value="name">לפי שם</option>
        </select>
        <span className="text-muted text-[12px] font-semibold">{filtered.length} / {orgs.length}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted px-4 py-10 text-center text-sm">לא נמצאו ארגונים תואמים</p>
      ) : (
        <ul className="divide-line divide-y">
          {filtered.map((o) => (
            <li key={o.id}>
              <Link href={`/platform/customers/${o.id}`} className="hover:bg-surface flex items-center gap-3 px-4 py-3 transition-colors">
                <span className="text-muted bg-surface grid h-9 w-9 shrink-0 place-items-center rounded-lg"><Icon name="Building2" size={16} /></span>
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-bold">{o.name}</span>
                <PlanBadge plan={o.plan} />
                <span className="text-muted hidden w-20 text-[12px] sm:inline">{formatPlatformDate(o.createdAt)}</span>
                <IdChip id={o.id} />
                <Icon name="ChevronLeft" size={16} className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
