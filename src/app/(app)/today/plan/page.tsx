// ============================================================================
// ZONO — "תכנן לי את היום" · Agent Daily Autopilot workboard (/today/plan). ONE
// operational screen that answers, in five seconds: what to do next, what's fixed
// in the calendar, who's waiting, what marketing needs attention, what ZONO can
// prepare, and how much is left. Read-derived from getAgentDailyPlan (the existing
// Command Center + real meetings), so it replans on every load. Server component;
// records daily_plan_opened; renders the interactive board. RTL, desktop main+rail.
// ============================================================================
import { getAgentDailyPlan } from "@/lib/daily/daily-plan";
import { recordUsage } from "@/lib/launch/server/services";
import { DailyPlanBoard } from "./DailyPlanBoard";

export const dynamic = "force-dynamic";

export default async function DailyPlanPage() {
  const view = await getAgentDailyPlan();
  await recordUsage({ category: "screen", name: "daily_plan_opened", props: view ? { items: view.plan.summary.total, mustDo: view.plan.summary.mustDo, fixed: view.plan.summary.fixed } : { empty: true } });

  if (!view) {
    return (
      <div dir="rtl" className="mx-auto max-w-2xl p-6 text-center">
        <p className="text-ink text-lg font-black">אין עדיין נתונים לתכנון היום</p>
        <p className="text-muted mt-2 text-sm">חזרו לאחר שהמשרד יתחיל לעבוד, או השלימו את ההגדרה.</p>
      </div>
    );
  }

  return <DailyPlanBoard plan={view.plan} rail={view.rail} />;
}
