// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Messaging (Messenger + IG DM). Phase 6 UI (RTL).
// A DM inbox for connected Meta assets. Conversation list (filters + search) + a
// thread pane with the 24h-window indicator, decrypted messages (server-side), a
// Copilot draft, and an APPROVAL-GATED send (never auto-sends). The browser never
// calls Meta — every action POSTs to the server. Message bodies are encrypted at
// rest and decrypted only for this authorized view; no token/cursor/key is exposed.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { listConversations, getConversation, canViewMessaging, canApproveSendRole } from "@/lib/meta/messaging/service";
import type { ConversationFilter, ConversationSort } from "@/lib/meta/messaging/domain";
import { isConversationStatus } from "@/lib/meta/messaging/domain";
import type { MetaPlatform } from "@/lib/meta/types";
import { MessagingFilters, MessageThread } from "./_thread";

export const dynamic = "force-dynamic";
const PLATFORM = new Set(["facebook", "instagram"]);
const PLATFORM_LABEL: Record<string, string> = { facebook: "מסנג׳ר", instagram: "אינסטגרם" };
const STATUS_LABEL: Record<string, string> = { open: "פתוח", assigned: "שויך", snoozed: "נדחה", resolved: "נסגר" };
const PAGE = 25;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MessagingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  if (!canViewMessaging(role)) return <main dir="rtl" className="p-8 text-center text-gray-600">אין הרשאה להודעות.</main>;
  const orgId = sc.profile.org_id;
  const sp = await searchParams;

  const filter: ConversationFilter = {};
  const platform = one(sp.platform); if (platform && PLATFORM.has(platform)) filter.platform = platform as MetaPlatform;
  const status = one(sp.status); if (status && isConversationStatus(status)) filter.status = status;
  if (one(sp.unread) === "1") filter.unreadOnly = true;
  const q = one(sp.q); if (q && q.trim()) filter.query = q.trim().slice(0, 200);
  const sort: ConversationSort = one(sp.sort) === "oldest" ? "oldest" : "recent";
  const offset = Math.max(0, Number(one(sp.offset) ?? 0) || 0);
  const selectedId = one(sp.c) ?? null;

  const [page, selected] = await Promise.all([
    listConversations(orgId, filter, sort, { limit: PAGE, offset }),
    selectedId ? getConversation(orgId, selectedId) : Promise.resolve(null),
  ]);
  const mk = (patch: Record<string, string | undefined>) => { const u = new URLSearchParams(); const cur: Record<string, string | undefined> = { platform, status, unread: filter.unreadOnly ? "1" : undefined, q, sort: one(sp.sort), c: selectedId ?? undefined, offset: String(offset), ...patch }; for (const [k, v] of Object.entries(cur)) if (v) u.set(k, v); const s = u.toString(); return s ? `?${s}` : ""; };

  return (
    <main dir="rtl" className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-500">{page.total} שיחות</span>
        <h1 className="text-2xl font-bold">הודעות (Messenger + Instagram)</h1>
      </div>
      <p className="mb-4 text-sm text-gray-500">שיחות פרטיות מנכסים מחוברים. גופי הודעות מוצפנים במנוחה. שליחה יוצאת דורשת אישור וכפופה לחלון 24 השעות ולתגיות המדיניות של Meta. הדפדפן אינו פונה ל‑Meta.</p>

      <MessagingFilters />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,20rem)_1fr]">
        <ul className="space-y-1">
          {page.items.length === 0 && <li className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400">אין שיחות.</li>}
          {page.items.map((cv) => (
            <li key={cv.id}>
              <a href={mk({ c: cv.id })} className={`block rounded-lg border p-3 ${cv.id === selectedId ? "border-blue-400 bg-blue-50" : cv.unread ? "border-blue-200 bg-blue-50/30" : "border-gray-200"}`}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-sm font-medium">{cv.unread && <span className="inline-block h-2 w-2 rounded-full bg-blue-600" />}{cv.participantDisplay ?? "משתמש"}</span>
                  <span className="text-xs text-gray-500">{PLATFORM_LABEL[cv.platform] ?? cv.platform}</span>
                </div>
                <div className="mt-1 text-xs text-gray-400">{STATUS_LABEL[cv.status] ?? cv.status}{cv.lastMessageAt ? ` · ${new Date(cv.lastMessageAt).toLocaleString("he-IL")}` : ""}</div>
              </a>
            </li>
          ))}
          <li className="flex justify-between pt-2 text-xs">
            {offset > 0 ? <a href={mk({ offset: String(Math.max(0, offset - PAGE)) })} className="text-blue-600">→ הקודם</a> : <span />}
            {offset + PAGE < page.total && <a href={mk({ offset: String(offset + PAGE) })} className="text-blue-600">הבא ←</a>}
          </li>
        </ul>

        <div>
          {selected ? (
            <MessageThread conversationId={selected.id} windowOpen={selected.windowOpen} participant={selected.participantDisplay} canApprove={canApproveSendRole(role)} />
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">בחר שיחה כדי לצפות בהודעות.</div>
          )}
        </div>
      </div>
    </main>
  );
}
