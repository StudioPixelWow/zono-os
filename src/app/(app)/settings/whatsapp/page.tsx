// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS — Message Center (/settings/whatsapp).
// Server composition of the WhatsApp Business connection overview (Part 7).
// ============================================================================
import { getWhatsappOverview } from "@/lib/whatsapp/business/account";
import { WhatsappView } from "./WhatsappView";

export const dynamic = "force-dynamic";

export default async function WhatsappSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const overview = await getWhatsappOverview();
  const notice = sp.wa_connected ? "connected" : (typeof sp.wa_error === "string" ? `error:${sp.wa_error}` : null);
  return <WhatsappView overview={overview} notice={notice} />;
}
