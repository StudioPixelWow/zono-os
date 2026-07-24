// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · Content list. Phase 2 UI (RTL).
// Lists the org's drafts with status/approval/planned columns. No Publish action.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { listDrafts } from "@/lib/meta/content/service";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { draft: "טיוטה", in_review: "בבדיקה", changes_requested: "נדרשו שינויים", approved: "מאושר", rejected: "נדחה", archived: "בארכיון" };

export default async function MetaContentPage() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) {
    return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות כדי לגשת ל-Meta Workspace.</main>;
  }
  const drafts = await listDrafts(sc.profile.org_id);

  return (
    <main dir="rtl" className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">תוכן Meta</h1>
          <p className="text-sm text-gray-500">טיוטות לפייסבוק ואינסטגרם — הכנה בלבד (פרסום יגיע בשלב הבא)</p>
        </div>
        <Link href="/meta-workspace/content/new" className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">טיוטה חדשה</Link>
      </header>

      {drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          אין עדיין טיוטות. צרו את הטיוטה הראשונה שלכם.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {drafts.map((d) => (
            <li key={d.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
              <Link href={`/meta-workspace/content/${d.id}`} className="font-medium text-gray-900 hover:text-blue-600">{d.internalName}</Link>
              <div className="flex items-center gap-3 text-sm">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">{STATUS_LABEL[d.status] ?? d.status}</span>
                {d.plannedAt && <span className="text-gray-500">מתוכנן: {new Date(d.plannedAt).toLocaleDateString("he-IL")}</span>}
                <span className="text-gray-400">v{d.currentVersion}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
