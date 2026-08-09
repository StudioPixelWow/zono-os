"use client";
// Client-side filter over the already-loaded, DAL-fetched safe org directory
// (P5.1). This filters data the server already authorized + audited — it opens
// NO new data path. The platform-wide DAL search lives in the ⌘K command
// palette; this is the convenience filter on the directory screen.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { PlanBadge, IdChip, formatPlatformDate } from "./ui";
import type { PlatformOrgSummary } from "@/lib/platform-admin/server/dal";

export function CustomersDirectory({ orgs }: { orgs: PlatformOrgSummary[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return orgs;
    return orgs.filter((o) => o.name.toLowerCase().includes(s) || o.id.toLowerCase().startsWith(s));
  }, [orgs, q]);

  return (
    <div className="border-line bg-card rounded-2xl border">
      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="border-line flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-xl border bg-surface px-3">
          <Icon name="Search" size={15} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="סינון לפי שם ארגון…"
            className="text-ink h-full w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted"
          />
        </div>
        <span className="text-muted text-[12px] font-semibold">{filtered.length} / {orgs.length} ארגונים</span>
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
