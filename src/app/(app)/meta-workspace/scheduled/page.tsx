// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · Scheduled queue + dead-letter. Phase 3B UI (RTL).
// Lists scheduled / queued / retry-waiting / dead-lettered publish jobs with their
// intended LOCAL time (timezone-safe) and safe status. Dead-letters are shown as a
// terminal, no-auto-replay list; ambiguous ones warn to verify at Meta first. No
// token / raw error / lease token is ever surfaced.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { listScheduledOperations, listDeadLetters } from "@/lib/meta/schedule/service";

export const dynamic = "force-dynamic";

const JOB_STATUS: Record<string, string> = {
  scheduled: "מתוזמן", available: "בתור", claimed: "נתפס", executing: "מפרסם…", retry_wait: "ממתין לניסיון חוזר",
  succeeded: "פורסם", failed: "נכשל", cancelled: "בוטל", dead_letter: "דורש טיפול ידני", blocked: "חסום (נדרש חיבור מחדש)",
};
const DL_REASON: Record<string, string> = {
  retries_exhausted: "מוצו הניסיונות", permanent_failure: "כשל קבוע", ambiguous_result: "תוצאה לא ודאית",
  budget_exhausted: "מוצה תקציב", manual: "ידני", recovery_ambiguous: "התאוששות לא ודאית",
};

function localLabel(iso: string, tz: string | null, local: string | null): string {
  if (local && tz) return `${local.replace("T", " ")} (${tz})`;
  try { return new Date(iso).toLocaleString("he-IL"); } catch { return iso; }
}

export default async function ScheduledQueuePage() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const [jobs, deadLetters] = await Promise.all([listScheduledOperations(sc.profile.org_id), listDeadLetters(sc.profile.org_id)]);
  const active = jobs.filter((j) => !["succeeded", "cancelled", "dead_letter", "failed"].includes(j.status));
  const done = jobs.filter((j) => ["succeeded", "cancelled", "failed"].includes(j.status));

  return (
    <main dir="rtl" className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/meta-workspace/publishing" className="text-sm text-blue-600">→ היסטוריית פרסום</Link>
        <h1 className="text-2xl font-bold">תור פרסום מתוזמן</h1>
      </div>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">ממתינים ({active.length})</h2>
        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-400">אין פרסומים מתוזמנים.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((j) => (
              <li key={j.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{JOB_STATUS[j.status] ?? j.status}{j.jobKind === "automatic_retry" ? " · ניסיון חוזר אוטומטי" : ""}</span>
                  <span className="text-sm text-gray-600">{localLabel(j.runAfterIso, j.timezone, j.localDateTime)}</span>
                </div>
                {j.status === "retry_wait" && <p className="mt-1 text-sm text-amber-700">ניסיון חוזר אוטומטי מתוזמן (נותרו {j.retryBudgetRemaining}).</p>}
                {j.status === "blocked" && <p className="mt-1 text-sm text-red-600">נדרש חיבור מחדש של החשבון לפני ניסיון נוסף.</p>}
                {j.status === "scheduled" && (
                  <form action={`/api/meta/publish/schedule/${j.operationId}`} method="post" className="mt-2">
                    <Link href={`/meta-workspace/publishing/${j.operationId}`} className="text-sm text-blue-600">צפייה בפעולה ↗</Link>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {deadLetters.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold text-red-700">דורש טיפול ידני ({deadLetters.length})</h2>
          <p className="mb-2 text-xs text-gray-500">פריטים אלו אינם מנוסים שוב אוטומטית. יש לבדוק ולטפל ידנית.</p>
          <ul className="space-y-2">
            {deadLetters.map((d) => (
              <li key={d.id} className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{DL_REASON[d.reason] ?? d.reason}</span>
                  <Link href={`/meta-workspace/publishing/${d.operationId}`} className="text-sm text-blue-600">צפייה ↗</Link>
                </div>
                {d.requiresProviderVerification && <p className="mt-1 text-sm text-amber-800">התוצאה אינה ודאית — יש לוודא ב-Meta שלא פורסם כפל לפני פרסום חוזר ידני.</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold text-gray-500">הושלמו ({done.length})</h2>
          <ul className="space-y-1">
            {done.slice(0, 20).map((j) => (
              <li key={j.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-600">
                <span>{JOB_STATUS[j.status] ?? j.status}</span>
                <span>{localLabel(j.runAfterIso, j.timezone, j.localDateTime)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
