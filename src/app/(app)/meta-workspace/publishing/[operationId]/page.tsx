// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · Operation detail. Phase 3A UI (RTL).
// Per-target timeline/status, immutable content version reference, safe failure
// classification. Retry shown ONLY for eligible failed targets (never ambiguous).
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { getOperationDetail } from "@/lib/meta/publish/service";

export const dynamic = "force-dynamic";

const T: Record<string, string> = { succeeded: "פורסם", failed: "נכשל", executing: "מפרסם…", provider_processing: "בעיבוד ב-Meta", manual_review_required: "נדרשת בדיקה ידנית", cancelled: "בוטל", skipped: "דולג", blocked: "חסום", pending: "ממתין", ready: "מוכן" };

export default async function OperationDetailPage({ params }: { params: Promise<{ operationId: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const { operationId } = await params;
  const detail = await getOperationDetail(sc.profile.org_id, operationId);
  if (!detail) return <main dir="rtl" className="p-8 text-center text-gray-600">הפעולה לא נמצאה.</main>;

  return (
    <main dir="rtl" className="mx-auto max-w-3xl p-6">
      <Link href="/meta-workspace/publishing" className="text-sm text-blue-600">→ חזרה להיסטוריה</Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold">פעולת פרסום</h1>
      <p className="mb-6 text-sm text-gray-500">גרסה קבועה v{detail.operation.draftVersionNumber} · טביעת תוכן {detail.contentHashRef} · {detail.operation.successfulTargetCount}/{detail.operation.targetCount} הצליחו</p>

      <ul className="space-y-3">
        {detail.targets.map((t) => (
          <li key={t.id} className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.platform === "facebook" ? "פייסבוק" : "אינסטגרם"} · {t.contentKind}</span>
              <span className="text-sm text-gray-700">{T[t.status] ?? t.status}</span>
            </div>
            {t.permalink && <a href={t.permalink} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm text-blue-600">צפייה בפוסט ↗</a>}
            {t.safeErrorMessage && <p className="mt-1 text-sm text-red-600">{t.safeErrorMessage}</p>}
            {t.manualReviewRequired && <p className="mt-1 text-sm text-amber-700">התוצאה אינה ודאית — נדרשת בדיקה ידנית ב-Meta לפני ניסיון חוזר.</p>}
            {t.retryEligible && <button className="mt-2 rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">ניסיון חוזר</button>}
          </li>
        ))}
      </ul>
    </main>
  );
}
