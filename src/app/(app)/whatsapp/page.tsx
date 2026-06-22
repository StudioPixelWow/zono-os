import { getWhatsappCommandCenter, type WhatsappCommandCenter } from "@/lib/whatsapp/service";
import { WhatsappView } from "./WhatsappView";

export const dynamic = "force-dynamic";

const EMPTY: WhatsappCommandCenter = {
  connectionStatus: "not_configured", autoReplyAllowed: false, approvalRequired: true,
  conversations: [], pendingApprovals: [], missedCalls: [], followupsDue: [], campaigns: [], smartLinks: [],
  segments: [], missions: [], kpis: { needsReply: 0, hotLeads: 0, missedCalls: 0, pendingApprovals: 0, followupsDue: 0, openConversations: 0 }, isManager: false,
};

export default async function WhatsappPage() {
  let cc: WhatsappCommandCenter = EMPTY;
  try {
    cc = await getWhatsappCommandCenter();
  } catch (e) {
    console.error("[whatsapp] load failed:", e);
  }
  return <WhatsappView cc={cc} />;
}
