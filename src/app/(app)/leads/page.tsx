import { listLeads, type LeadListRow } from "@/lib/leads/service";
import { getOfficeFollowUpStates } from "@/lib/follow-up/service";
import { LeadsListView, type LeadFollowUpBadge } from "./LeadsListView";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  let leads: LeadListRow[] = [];
  let failed = false;
  try {
    leads = await listLeads();
  } catch (e) {
    console.error("[leads] list load failed:", e);
    failed = true;
  }
  // Canonical follow-up state per lead → compact list badges (no duplicate logic).
  const followUp: Record<string, LeadFollowUpBadge> = {};
  try {
    const fu = await getOfficeFollowUpStates({ limit: 500 });
    for (const st of fu.states) {
      if (st.state === "followup_overdue" || st.state === "unassigned") followUp[st.leadId] = { label: st.label, tone: "danger" };
      else if (st.state === "new_waiting" || st.state === "needs_action") followUp[st.leadId] = { label: st.label, tone: "warning" };
    }
  } catch (e) { console.error("[leads] follow-up states failed:", e); }
  return <LeadsListView leads={leads} failed={failed} followUp={followUp} />;
}
