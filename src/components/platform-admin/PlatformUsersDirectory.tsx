"use client";
// Cross-org platform user directory (P5.3, read-only). Filters the already-loaded
// DAL-fetched safe rows (name/org/role/status — NO email/phone). Row → the user's
// org Customer 360 Users tab, where capability-gated actions live.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { StatusBadge, formatPlatformDate } from "./ui";
import type { PlatformUserRow } from "@/lib/platform-admin/server/user-admin";

const STATUS_OPTIONS = [
  { v: "", label: "כל הסטטוסים" },
  { v: "active", label: "פעיל" },
  { v: "invited", label: "הוזמן" },
  { v: "suspended", label: "מושהה" },
  { v: "disabled", label: "מושבת" },
];

export function PlatformUsersDirectory({ rows }: { rows: PlatformUserRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!s || (r.name ?? "").toLowerCase().includes(s) || (r.orgName ?? "").toLowerCase().includes(s)) &&
      (!status || r.status === status),
    );
  }, [rows, q, status]);

  return (
    <div className="border-line bg-card rounded-2xl border">
      <div className="border-line flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="border-line flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-xl border bg-surface px-3">
          <Icon name="Search" size={15} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="סינון לפי שם משתמש או ארגון…" className="text-ink h-full w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border-line text-ink h-9 rounded-xl border bg-surface px-2 text-[13px] font-semibold outline-none">
          {STATUS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <span className="text-muted text-[12px] font-semibold">{filtered.length} / {rows.length}</span>
      </div>

      <div className="border-line text-muted hidden grid-cols-[1.5fr_1.3fr_1fr_0.8fr_0.9fr] gap-3 border-b px-4 py-2.5 text-[11px] font-bold sm:grid">
        <span>שם</span><span>ארגון</span><span>תפקיד</span><span>סטטוס</span><span>נראה</span>
      </div>
      {filtered.length === 0 ? (
        <p className="text-muted px-4 py-10 text-center text-sm">לא נמצאו משתמשים תואמים</p>
      ) : (
        <ul className="divide-line divide-y">
          {filtered.map((u) => (
            <li key={u.id} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[1.5fr_1.3fr_1fr_0.8fr_0.9fr] sm:items-center sm:gap-3">
              <span className="text-ink inline-flex items-center gap-2 text-[13.5px] font-bold">
                <span className="text-muted bg-surface grid h-7 w-7 shrink-0 place-items-center rounded-full"><Icon name="UserCircle" size={15} /></span>{u.name || "—"}
              </span>
              <Link href={`/platform/customers/${u.orgId}/users`} className="text-brand-strong inline-flex items-center gap-1 truncate text-[13px] font-bold">
                <Icon name="Building2" size={13} />{u.orgName || "—"}
              </Link>
              <span className="text-muted text-[12.5px] font-semibold">{u.roleName || u.roleKey || "—"}</span>
              <span><StatusBadge status={u.status} /></span>
              <span className="text-muted text-[12px]">{u.lastSeenAt ? formatPlatformDate(u.lastSeenAt) : "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
