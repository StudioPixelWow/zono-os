// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Post insights. Phase 2 UI (RTL).
// Metric cards (latest + delta) with an inline sparkline drawn from the append-only
// series. Read-only analytics; no token/provider call/raw payload in the browser.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { getObjectInsights, canViewInsights } from "@/lib/meta/insights/service";
import { RefreshInsights } from "./_refresh";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { impressions: "חשיפות", reach: "טווח", engagement: "מעורבות", likes: "לייקים", comments: "תגובות", shares: "שיתופים", saves: "שמירות", video_views: "צפיות בווידאו", reactions: "תגובות רגש", clicks: "קליקים", followers: "עוקבים", profile_views: "צפיות בפרופיל" };

function sparkline(points: readonly { value: number }[]): string {
  if (points.length < 2) return "";
  const vals = points.map((p) => p.value); const max = Math.max(...vals, 1); const min = Math.min(...vals);
  const w = 120, h = 28; const span = max - min || 1;
  return points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p.value - min) / span) * h}`).join(" ");
}

export default async function InsightsPage({ params }: { params: Promise<{ objectId: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const role = await resolveRoleKey(sc.profile);
  if (!canViewInsights(role)) return <main dir="rtl" className="p-8 text-center text-gray-600">אין הרשאה לצפייה בנתונים.</main>;
  const { objectId } = await params;
  const insights = await getObjectInsights(sc.profile.org_id, objectId);

  return (
    <main dir="rtl" className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/meta-workspace/publishing" className="text-sm text-blue-600">→ היסטוריית פרסום</Link>
        <RefreshInsights objectId={objectId} platform="facebook" />
      </div>
      <h1 className="mb-1 text-2xl font-bold">נתוני הפוסט</h1>
      <p className="mb-6 text-sm text-gray-500">מדדים מצטברים לאורך זמן. הנתונים מתעדכנים ברקע בקצב יורד ועוצרים עבור תוכן ותיק.</p>

      {insights.series.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-400">אין נתונים עדיין. לחצו על רענון הנתונים כדי לתזמן איסוף.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {insights.series.map((s) => (
            <div key={s.metricKey} className="rounded-xl border border-gray-200 p-4">
              <div className="text-sm text-gray-500">{LABEL[s.metricKey] ?? s.metricKey}</div>
              <div className="mt-1 text-2xl font-bold">{s.latest.toLocaleString("he-IL")}</div>
              {s.delta !== 0 && <div className={`text-xs ${s.delta > 0 ? "text-green-600" : "text-red-600"}`}>{s.delta > 0 ? "▲" : "▼"} {Math.abs(s.delta).toLocaleString("he-IL")}</div>}
              {s.points.length >= 2 && (
                <svg viewBox="0 0 120 28" className="mt-2 h-7 w-full" preserveAspectRatio="none"><polyline points={sparkline(s.points)} fill="none" stroke="#6366f1" strokeWidth="1.5" /></svg>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
