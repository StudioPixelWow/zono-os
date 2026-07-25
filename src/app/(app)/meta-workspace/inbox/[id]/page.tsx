// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Inbox conversation detail. Phase 3 UI (RTL).
// One unified conversation (a comment thread projected canonically) with local
// state controls (read/archive/resolve/snooze/assign/label). Content shown is the
// safe preview; the linked source post opens the Phase-1 comment thread. No token /
// raw Graph payload / provider call ever touches the browser.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { getInboxConversation, listInboxLabels, canViewInbox, canManageInbox, canAssignInbox } from "@/lib/meta/inbox/service";
import { canViewIntelligence, canRescore } from "@/lib/meta/intelligence/service";
import { InboxActions } from "./_actions";
import { InboxIntelligence } from "./_intelligence";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { open: "פתוח", snoozed: "נדחה", archived: "בארכיון", resolved: "נסגר" };
const PLATFORM_LABEL: Record<string, string> = { facebook: "פייסבוק", instagram: "אינסטגרם" };

export default async function InboxConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  if (!canViewInbox(role)) return <main dir="rtl" className="p-8 text-center text-gray-600">אין הרשאה.</main>;
  const { id } = await params;
  const [conversation, labels] = await Promise.all([getInboxConversation(sc.profile.org_id, id), listInboxLabels(sc.profile.org_id)]);
  if (!conversation) return <main dir="rtl" className="p-8 text-center text-gray-600">השיחה לא נמצאה.</main>;

  return (
    <main dir="rtl" className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/meta-workspace/inbox" className="text-sm text-blue-600">→ חזרה לתיבה</Link>
        <span className="text-xs text-gray-500">{PLATFORM_LABEL[conversation.platform] ?? conversation.platform} · {STATUS_LABEL[conversation.status] ?? conversation.status}</span>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">{conversation.participantDisplay ?? "משתמש"}</h1>
          {conversation.unread ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">לא נקרא</span> : <span className="text-xs text-gray-400">נקרא</span>}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-gray-800">{conversation.subjectPreview || "—"}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
          <span>{conversation.replyCount} תגובות בשרשור</span>
          {conversation.lastActivityAt && <span>פעילות אחרונה: {new Date(conversation.lastActivityAt).toLocaleString("he-IL")}</span>}
          {conversation.snoozedUntil && <span>נדחה עד: {new Date(conversation.snoozedUntil).toLocaleString("he-IL")}</span>}
        </div>
        {conversation.providerObjectId && (
          <Link href={`/meta-workspace/comments/${conversation.providerObjectId}`} className="mt-3 inline-block text-sm text-blue-600">פתח את שרשור התגובות המלא ←</Link>
        )}
      </div>

      <InboxActions
        conversationId={conversation.id}
        status={conversation.status}
        unread={conversation.unread}
        assigneeUserId={conversation.assigneeUserId}
        currentUserId={sc.user?.id ?? null}
        labels={labels.map((l) => ({ id: l.id, name: l.name }))}
        canManage={canManageInbox(role)}
        canAssign={canAssignInbox(role)}
      />

      {canViewIntelligence(role) && <InboxIntelligence conversationId={conversation.id} canManage={canRescore(role)} />}
    </main>
  );
}
