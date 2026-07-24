// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · Calendar. Phase 2 UI (RTL).
// Editorial planning view (scheduled + unscheduled). Planning ONLY — nothing here
// publishes or schedules a job.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { getCalendar } from "@/lib/meta/content/service";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const cal = await getCalendar(sc.profile.org_id);

  return (
    <main dir="rtl" className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-bold">לוח תוכן</h1>
      <p className="mb-6 text-sm text-gray-500">תכנון עריכתי בלבד — הפרסום מתבצע ידנית בשלב הפרסום</p>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">מתוכננים</h2>
        {cal.scheduled.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-400">אין פריטים מתוכננים.</p>
        ) : (
          <ul className="space-y-2">
            {cal.scheduled.map((i) => (
              <li key={i.draftId} className={`flex items-center justify-between rounded-lg border p-3 ${i.conflict ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
                <Link href={`/meta-workspace/content/${i.draftId}`} className="font-medium hover:text-blue-600">{i.internalName}</Link>
                <span className="text-sm text-gray-600">{new Date(i.plannedAt!).toLocaleString("he-IL")}{i.conflict && " · חפיפה"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">ללא תאריך ({cal.unscheduled.length})</h2>
        <ul className="space-y-2">
          {cal.unscheduled.map((i) => (
            <li key={i.draftId} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <Link href={`/meta-workspace/content/${i.draftId}`} className="font-medium hover:text-blue-600">{i.internalName}</Link>
              <span className="text-sm text-gray-400">{i.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
