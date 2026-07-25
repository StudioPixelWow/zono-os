// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Unified Inbox list. Phase 3 UI (RTL).
// One inbox aggregating Facebook + Instagram conversations (comment threads), with
// status/platform/assignee/unread/search filters, sort and pagination. Every field
// shown is canonical + safe (participant, preview, status, unread, labels) — never a
// token, raw Graph payload, or provider model. Sync + state changes go through the
// server (queue / local state); the browser never calls Graph.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { listInboxConversations, getInboxUnreadCount, listInboxLabels, canViewInbox } from "@/lib/meta/inbox/service";
import type { InboxFilter, InboxSort, InboxStatus } from "@/lib/meta/inbox/domain";
import type { MetaPlatform } from "@/lib/meta/types";
import { InboxFilters } from "./_controls";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { open: "פתוח", snoozed: "נדחה", archived: "בארכיון", resolved: "נסגר" };
const PLATFORM_LABEL: Record<string, string> = { facebook: "פייסבוק", instagram: "אינסטגרם" };
const STATUSES = new Set(["open", "snoozed", "archived", "resolved"]);
const PLATFORMS = new Set(["facebook", "instagram"]);
const SORTS = new Set(["recent", "oldest", "priority"]);
const PAGE_SIZE = 25;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  if (!canViewInbox(role)) return <main dir="rtl" className="p-8 text-center text-gray-600">אין הרשאה לצפייה בתיבת הדואר הנכנס.</main>;
  const orgId = sc.profile.org_id;
  const sp = await searchParams;

  const filter: InboxFilter = {};
  const status = one(sp.status); if (status && STATUSES.has(status)) filter.status = status as InboxStatus;
  const platform = one(sp.platform); if (platform && PLATFORMS.has(platform)) filter.platform = platform as MetaPlatform;
  const assignee = one(sp.assignee); if (assignee === "none") filter.assigneeUserId = null; else if (assignee === "me") filter.assigneeUserId = sc.user?.id ?? "";
  if (one(sp.unread) === "1") filter.unreadOnly = true;
  const label = one(sp.label); if (label) filter.labelId = label;
  const q = one(sp.q); if (q && q.trim()) filter.query = q.trim().slice(0, 200);
  const sortParam = one(sp.sort); const sort: InboxSort = sortParam && SORTS.has(sortParam) ? (sortParam as InboxSort) : "recent";
  const offset = Math.max(0, Number(one(sp.offset) ?? 0) || 0);

  const [page, unread, labels] = await Promise.all([
    listInboxConversations(orgId, filter, sort, { limit: PAGE_SIZE, offset }),
    getInboxUnreadCount(orgId),
    listInboxLabels(orgId),
  ]);
  const labelName = new Map(labels.map((l) => [l.id, l.name]));
  const pageNo = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(page.total / PAGE_SIZE));
  const mk = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const cur: Record<string, string | undefined> = { status, platform, assignee, unread: filter.unreadOnly ? "1" : undefined, label, q, sort: sortParam, offset: String(offset), ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `?${s}` : "";
  };

  return (
    <main dir="rtl" className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">{unread} לא נקראו</span>
        <h1 className="text-2xl font-bold">תיבת דואר נכנס מאוחדת</h1>
      </div>
      <p className="mb-4 text-sm text-gray-500">שיחות מפייסבוק ומאינסטגרם במקום אחד. סנכרון ופעולות מתבצעים בשרת דרך התור — הדפדפן אינו פונה ל‑Meta.</p>

      <InboxFilters labels={labels.map((l) => ({ id: l.id, name: l.name }))} />

      {page.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-400">אין שיחות התואמות לסינון. ניתן להריץ סנכרון מהכפתור למעלה.</p>
      ) : (
        <ul className="space-y-2">
          {page.items.map((c) => (
            <li key={c.id} className={`rounded-xl border p-4 ${c.unread ? "border-blue-200 bg-blue-50/40" : "border-gray-200"}`}>
              <Link href={`/meta-workspace/inbox/${c.id}`} className="block">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {c.unread && <span className="inline-block h-2 w-2 rounded-full bg-blue-600" aria-label="לא נקרא" />}
                    <span className="font-medium">{c.participantDisplay ?? "משתמש"}</span>
                  </span>
                  <span className="text-xs text-gray-500">{PLATFORM_LABEL[c.platform] ?? c.platform} · {STATUS_LABEL[c.status] ?? c.status}</span>
                </div>
                <p className="mt-1 truncate text-sm text-gray-700">{c.subjectPreview || "—"}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                  {c.lastActivityAt && <span>{new Date(c.lastActivityAt).toLocaleString("he-IL")}</span>}
                  {c.assigneeUserId && <span className="rounded bg-gray-100 px-1.5 py-0.5">שויך</span>}
                  {c.labelIds.map((id) => <span key={id} className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{labelName.get(id) ?? id}</span>)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center justify-between text-sm">
        <div className="flex gap-2">
          {offset > 0 && <Link href={mk({ offset: String(Math.max(0, offset - PAGE_SIZE)) })} className="rounded border border-gray-300 px-3 py-1">→ הקודם</Link>}
          {offset + PAGE_SIZE < page.total && <Link href={mk({ offset: String(offset + PAGE_SIZE) })} className="rounded border border-gray-300 px-3 py-1">הבא ←</Link>}
        </div>
        <span className="text-gray-400">עמוד {pageNo} מתוך {pageCount} · {page.total} שיחות</span>
      </div>
    </main>
  );
}
