// ============================================================================
// ZONO — /today → canonical daily screen. The daily hub was consolidated into the
// ONE "המרכז היומי" plan-and-execute screen at /today/plan (product decision:
// remove the duplicate purple-banner hub; keep a single daily command center).
// This route now forwards there so the nav item "היום · מרכז יומי", old links and
// bookmarks all land on the canonical screen. The former DailyOS hub components
// remain in the codebase and are reachable from their own surfaces.
// ============================================================================
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function TodayHubRedirect() {
  redirect("/today/plan");
}
