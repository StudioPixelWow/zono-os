// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · Approvals. Phase 2 UI (RTL).
// Drafts currently in review, for approvers to decide. No publish action.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { listDrafts } from "@/lib/meta/content/service";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const inReview = (await listDrafts(sc.profile.org_id)).filter((d) => d.status === "in_review");

  return (
    <main dir="rtl" className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold">אישורים</h1>
      <p className="mb-6 text-sm text-gray-500">טיוטות הממתינות לאישור</p>
      {inReview.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-500">אין טיוטות הממתינות לאישור.</div>
      ) : (
        <ul className="space-y-3">
          {inReview.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
              <Link href={`/meta-workspace/content/${d.id}`} className="font-medium text-gray-900 hover:text-blue-600">{d.internalName}</Link>
              <span className="text-sm text-amber-700">גרסה v{d.currentVersion} · ממתין</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
