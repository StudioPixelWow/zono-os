// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Comment moderation. Phase 1 UI (RTL).
// Threaded comments for a published post with approval-gated moderation actions.
// Content (author + message) is shown; no token, provider call, or raw payload is
// ever handled in the browser — moderation goes through the server + approval + queue.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { listComments, listThreads, canViewComments } from "@/lib/meta/engagement/service";
import { ModerateControl } from "./_moderate";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { visible: "גלוי", hidden: "מוסתר", deleted: "נמחק", pending: "ממתין", unknown: "לא ידוע" };

export default async function CommentsPage({ params }: { params: Promise<{ objectId: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  if (!canViewComments(role)) return <main dir="rtl" className="p-8 text-center text-gray-600">אין הרשאה לצפייה בתגובות.</main>;
  const { objectId } = await params;
  const [comments, threads] = await Promise.all([listComments(sc.profile.org_id, objectId), listThreads(sc.profile.org_id, objectId)]);
  const roots = comments.filter((c) => !c.parentExternalId || c.rootExternalId === c.externalId);
  const repliesByRoot = new Map<string, (typeof comments)[number][]>();
  for (const c of comments) { if (c.rootExternalId && c.rootExternalId !== c.externalId) { const arr = repliesByRoot.get(c.rootExternalId) ?? []; arr.push(c); repliesByRoot.set(c.rootExternalId, arr); } }
  const unaddressed = threads.filter((t) => t.hasUnaddressed).length;

  return (
    <main dir="rtl" className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/meta-workspace/publishing" className="text-sm text-blue-600">→ היסטוריית פרסום</Link>
        <h1 className="text-2xl font-bold">תגובות</h1>
      </div>
      <p className="mb-6 text-sm text-gray-500">{comments.length} תגובות · {unaddressed} שרשורים ללא מענה. פעולות ניהול (השבה/הסתרה/מחיקה) דורשות אישור לפני ביצוע.</p>

      {roots.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-400">אין תגובות עדיין. ניתן להריץ סנכרון מלא מכפתור הרענון בפרסום.</p>
      ) : (
        <ul className="space-y-4">
          {roots.map((c) => (
            <li key={c.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.authorDisplay ?? "משתמש"}{c.isFromPage ? " (העמוד)" : ""}</span>
                <span className="text-xs text-gray-500">{STATUS[c.status] ?? c.status} · ❤ {c.likeCount}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-gray-800">{c.message}</p>
              {!c.isFromPage && c.status !== "deleted" && <ModerateControl commentId={c.id} isHidden={c.status === "hidden"} />}
              {(repliesByRoot.get(c.rootExternalId) ?? []).length > 0 && (
                <ul className="mt-3 space-y-2 border-r-2 border-gray-100 pr-3">
                  {(repliesByRoot.get(c.rootExternalId) ?? []).map((r) => (
                    <li key={r.id} className="rounded-lg bg-gray-50 p-2">
                      <div className="flex items-center justify-between"><span className="text-sm font-medium">{r.authorDisplay ?? "משתמש"}{r.isFromPage ? " (העמוד)" : ""}</span><span className="text-xs text-gray-400">{STATUS[r.status] ?? r.status}</span></div>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{r.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
