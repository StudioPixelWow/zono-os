// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · Reconciliation & health. Phase 3C UI (RTL).
// Open discrepancies (type/severity/local vs provider evidence/recommended action)
// + verification status. No token, raw error, webhook payload, signature or lease
// token is ever surfaced.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { listDiscrepancies, canRequestVerification } from "@/lib/meta/reconcile/service";

export const dynamic = "force-dynamic";

const TYPE: Record<string, string> = {
  local_success_provider_missing: "פורסם מקומית, לא נמצא ב-Meta", local_processing_provider_published: "בעיבוד מקומית, פורסם ב-Meta", local_failed_provider_exists: "נכשל מקומית, קיים ב-Meta",
  ambiguous_provider_exists: "תוצאה לא ודאית — פורסם", ambiguous_provider_missing: "תוצאה לא ודאית — לא פורסם", provider_deleted: "הפוסט נמחק ב-Meta", provider_hidden: "הפוסט מוסתר ב-Meta",
  provider_inaccessible: "הפוסט לא נגיש", provider_id_mismatch: "אי-התאמת מזהה", permalink_changed: "הקישור השתנה", webhook_unmatched: "אירוע לא משויך",
  capability_lost_after_publish: "אבדה הרשאה לאחר פרסום", verification_overdue: "אימות באיחור", duplicate_provider_object: "מיפוי כפול", impossible_aggregate_state: "מצב אגרגט לא תקין",
};
const SEV: Record<string, { t: string; c: string }> = { critical: { t: "קריטי", c: "text-red-700 bg-red-50 border-red-200" }, action_required: { t: "נדרשת פעולה", c: "text-amber-800 bg-amber-50 border-amber-200" }, warning: { t: "אזהרה", c: "text-yellow-800 bg-yellow-50 border-yellow-200" }, informational: { t: "מידע", c: "text-gray-600 bg-gray-50 border-gray-200" } };
const STATUS: Record<string, string> = { open: "פתוח", monitoring: "בניטור", resolved: "נפתר", acknowledged: "אושר", false_positive: "התראת שווא" };

export default async function ReconciliationPage() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  if (!canRequestVerification(role)) return <main dir="rtl" className="p-8 text-center text-gray-600">אין הרשאה לצפייה בהתאמת פרסומים.</main>;
  const discrepancies = await listDiscrepancies(sc.profile.org_id);
  const open = discrepancies.filter((d) => d.status === "open" || d.status === "monitoring");
  const closed = discrepancies.filter((d) => d.status !== "open" && d.status !== "monitoring");

  return (
    <main dir="rtl" className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/meta-workspace/scheduled" className="text-sm text-blue-600">→ תור מתוזמן</Link>
        <h1 className="text-2xl font-bold">התאמת פרסומים ובריאות</h1>
      </div>
      <p className="mb-6 text-sm text-gray-500">אי-התאמות בין המצב המקומי לראיות מ-Meta. מערכת ההתאמה מאמתת בלבד — היא לעולם אינה מפרסמת, עורכת או מוחקת תוכן ב-Meta.</p>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">אי-התאמות פתוחות ({open.length})</h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-400">אין אי-התאמות פתוחות. כל הפרסומים תואמים את המצב ב-Meta.</p>
        ) : (
          <ul className="space-y-2">
            {open.map((d) => (
              <li key={d.id} className={`rounded-xl border p-4 ${SEV[d.severity]?.c ?? "border-gray-200"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{TYPE[d.type] ?? d.type}</span>
                  <span className="text-xs">{SEV[d.severity]?.t ?? d.severity} · {STATUS[d.status] ?? d.status}</span>
                </div>
                {d.safeSummary && <p className="mt-1 text-sm text-gray-700">{d.safeSummary}</p>}
                <p className="mt-1 text-xs text-gray-500">התגלה: {new Date(d.detectedAt).toLocaleString("he-IL")} · ראיות: {d.evidenceCount}{d.autoRepairable ? " · תיקון אוטומטי בטוח" : ""}</p>
                <div className="mt-2 flex gap-2">
                  {d.operationId && <Link href={`/meta-workspace/publishing/${d.operationId}`} className="text-sm text-blue-600">צפייה בפעולה ↗</Link>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold text-gray-500">טופלו ({closed.length})</h2>
          <ul className="space-y-1">
            {closed.slice(0, 20).map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-600">
                <span>{TYPE[d.type] ?? d.type}</span>
                <span>{STATUS[d.status] ?? d.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
