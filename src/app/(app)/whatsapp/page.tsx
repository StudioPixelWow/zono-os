// ============================================================================
// 📘 ZONO — WhatsApp OS page (/whatsapp). State-driven: renders the honest
// connection GATE (setup / connect / webhook-pending / connected-empty) until a
// real Cloud-API connection with conversations exists — then the full WhatsApp
// OS dashboard. Never opens as an empty demo dashboard with zeros. Manual mode
// is always reachable via ?mode=manual. Assisted only; nothing sends here.
// ============================================================================
import { getWhatsappCommandCenter, type WhatsappCommandCenter } from "@/lib/whatsapp/service";
import { getWhatsappConnection, type WhatsappConnection } from "@/lib/whatsapp/connection";
import { WhatsappView } from "./WhatsappView";
import { WhatsappConnectionGate } from "./WhatsappConnectionGate";

export const dynamic = "force-dynamic";

const EMPTY: WhatsappCommandCenter = {
  connectionStatus: "not_configured", autoReplyAllowed: false, approvalRequired: true,
  conversations: [], pendingApprovals: [], missedCalls: [], followupsDue: [], campaigns: [], smartLinks: [],
  segments: [], missions: [], kpis: { needsReply: 0, hotLeads: 0, missedCalls: 0, pendingApprovals: 0, followupsDue: 0, openConversations: 0 }, isManager: false,
};

const FALLBACK_CONN: WhatsappConnection = {
  state: "not_configured", mode: "mock", configured: false,
  missingEnv: ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"],
  wabaStatus: null, phoneNumberId: null, displayPhoneNumber: null, webhookVerified: false, lastWebhookAt: null,
  templatesStatus: "none", templatesCount: 0, appSecretConfigured: false, health: "down", conversationCount: 0, needsReplyCount: 0,
};

export default async function WhatsappPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const sp = await searchParams;
  const forceManual = sp?.mode === "manual";

  let conn: WhatsappConnection = FALLBACK_CONN;
  try {
    conn = await getWhatsappConnection();
  } catch (e) {
    console.error("[whatsapp] connection read failed:", e);
  }

  // Full dashboard ONLY when there are real conversations (or explicit manual mode).
  if (conn.state !== "connected_active" && !forceManual) {
    return <WhatsappConnectionGate connection={conn} />;
  }

  let cc: WhatsappCommandCenter = EMPTY;
  try {
    cc = await getWhatsappCommandCenter();
  } catch (e) {
    console.error("[whatsapp] load failed:", e);
  }
  return <WhatsappView cc={cc} />;
}
