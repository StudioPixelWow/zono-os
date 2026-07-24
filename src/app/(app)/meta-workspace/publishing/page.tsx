// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · Publishing history. Phase 3A UI (RTL).
// Immediate publish operations with per-operation status + target counts. Shows
// partial success distinctly. No scheduling controls, no auto-retry countdown.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { listPublishHistory } from "@/lib/meta/publish/service";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  succeeded: { label: "פורסם", cls: "bg-green-100 text-green-700" },
  partially_succeeded: { label: "פורסם חלקית", cls: "bg-amber-100 text-amber-700" },
  failed: { label: "נכשל", cls: "bg-red-100 text-red-700" },
  executing: { label: "מפרסם…", cls: "bg-blue-100 text-blue-700" },
  cancelled: { label: "בוטל", cls: "bg-gray-100 text-gray-600" },
  blocked: { label: "חסום", cls: "bg-gray-100 text-gray-600" },
  ready: { label: "מוכן", cls: "bg-gray-100 text-gray-600" },
  created: { label: "נוצר", cls: "bg-gray-100 text-gray-600" },
};

export default async function PublishingHistoryPage() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const ops = await listPublishHistory(sc.profile.org_id);

  return (
    <main dir="rtl" className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-bold">היסטוריית פרסום</h1>
      <p className="mb-6 text-sm text-gray-500">פרסום מיידי — כל פעולה נשלחה ל-Meta לפי בקשת המשתמש</p>
      {ops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-500">עדיין לא בוצע פרסום.</div>
      ) : (
        <ul className="space-y-3">
          {ops.map((o) => {
            const s = STATUS[o.status] ?? { label: o.status, cls: "bg-gray-100 text-gray-600" };
            return (
              <li key={o.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-4">
                <Link href={`/meta-workspace/publishing/${o.id}`} className="font-medium text-gray-900 hover:text-blue-600">גרסה v{o.draftVersionNumber} · {new Date(o.requestedAt).toLocaleString("he-IL")}</Link>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-500">{o.successfulTargetCount}/{o.targetCount} יעדים</span>
                  <span className={`rounded-full px-3 py-1 ${s.cls}`}>{s.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
