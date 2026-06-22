import { getCommunicationCommandCenter, type CommunicationCommandCenter } from "@/lib/comm-intelligence/service";
import { CommunicationView } from "./CommunicationView";

export const dynamic = "force-dynamic";

const EMPTY: CommunicationCommandCenter = {
  kpis: { newObjections: 0, brokenCommitments: 0, communicationRisks: 0, readyBuyers: 0, readySellers: 0, openOpportunities: 0, recentEvents: 0 },
  timeline: [], objections: [], risks: [], opportunities: [], brokenCommitments: [], isManager: false,
};

export default async function CommunicationPage() {
  let cc: CommunicationCommandCenter = EMPTY;
  try { cc = await getCommunicationCommandCenter(); }
  catch (e) { console.error("[communication] load failed:", e); }
  return <CommunicationView cc={cc} />;
}
