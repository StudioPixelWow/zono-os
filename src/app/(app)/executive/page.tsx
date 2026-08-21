// ============================================================================
// 🧭 מרכז הפיקוד הניהולי — Management Center (/executive). The daily executive
// cockpit for an office owner/manager. ONE canonical selector (getManagementCockpit)
// REUSES the existing engines (Executive OS score/health/risks, the Deals board
// money+pipeline, the office management board team, the Executive Decision queue)
// and recomputes nothing. Role/org isolation is the engines' existing RLS/role
// gating (team data fails closed for non-managers). Nothing auto-executed.
// ============================================================================
import { getManagementCockpit } from "@/lib/management/service";
import { ManagementCockpitView } from "./ManagementCockpitView";

export const dynamic = "force-dynamic";

export default async function ExecutivePage() {
  const bundle = await getManagementCockpit();
  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <ManagementCockpitView bundle={bundle} />
    </div>
  );
}
