// ============================================================================
// 🗓️ ZONO — Calendar OS page (/calendar). Calendar-FIRST workspace. Server
// fetches the current month's 6-week grid range (reusing getOfficeCalendar), the
// AI day plan, team availability, provider statuses + connector health — all
// EXISTING services. The client CalendarView renders real Month/Week/Day/Agenda
// views and lazily fetches other ranges via the existing getCalendarAction.
// No new backend, no mock events.
// ============================================================================
import { getDayPlan, getOfficeCalendar, getTeamAvailability, getProviderStatuses } from "@/lib/calendar-os/service";
import { getConnectorHealth } from "@/lib/calendar-os/booking-service";
import { CalendarView } from "./CalendarView";

export const dynamic = "force-dynamic";

/** Sunday on/before the 1st of the month (Israel week starts Sunday). */
function gridStartOf(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(first.getFullYear(), first.getMonth(), first.getDate() - first.getDay());
}

export default async function CalendarPage() {
  const now = new Date();
  const gridStart = gridStartOf(now);
  const gridEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42, 23, 59, 59);

  const [plan, events, team, connectors] = await Promise.all([
    getDayPlan(now.toISOString()).catch(() => ({ date: now.toISOString().slice(0, 10), slots: [], summary: { total: 0, meetings: 0, tasks: 0, overdue: 0, freeAfter: null } })),
    getOfficeCalendar(gridStart.toISOString(), gridEnd.toISOString()).catch(() => []),
    getTeamAvailability().catch(() => []),
    getConnectorHealth().catch(() => []),
  ]);
  const providers = getProviderStatuses();

  return (
    <CalendarView
      plan={plan}
      initialEvents={events}
      initialStartIso={gridStart.toISOString()}
      initialEndIso={gridEnd.toISOString()}
      team={team}
      providers={providers}
      connectors={connectors}
      todayIso={now.toISOString()}
    />
  );
}
