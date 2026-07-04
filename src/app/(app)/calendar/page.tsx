// ============================================================================
// 🗓️ ZONO — Calendar OS™ page (/calendar). PHASE 43.0.
// The single scheduling surface. Server-loads the AI day plan + the week's
// unified events + team availability + provider status from Calendar OS.
// ============================================================================
import { getDayPlan, getOfficeCalendar, getTeamAvailability, getProviderStatuses } from "@/lib/calendar-os/service";
import { CalendarView } from "./CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59).toISOString();

  const [plan, weekEvents, team] = await Promise.all([
    getDayPlan(now.toISOString()).catch(() => ({ date: now.toISOString().slice(0, 10), slots: [], summary: { total: 0, meetings: 0, tasks: 0, overdue: 0, freeAfter: null } })),
    getOfficeCalendar(weekStart, weekEnd).catch(() => []),
    getTeamAvailability().catch(() => []),
  ]);
  const providers = getProviderStatuses();

  return <CalendarView plan={plan} weekEvents={weekEvents} team={team} providers={providers} todayIso={now.toISOString()} />;
}
