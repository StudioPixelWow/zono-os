import { listLeads, type LeadListRow } from "@/lib/leads/service";
import { LeadsListView } from "./LeadsListView";

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
  return <LeadsListView leads={leads} failed={failed} />;
}
