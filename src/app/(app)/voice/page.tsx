// ============================================================================
// 🎙️ ZONO — Voice AI page (/voice). PHASE 53.0.
// Consent-gated: paste a voice-note / meeting transcript → structured memory +
// approval-gated suggestions. No recording here; nothing auto-updates the CRM.
// ============================================================================
import { getVoiceProviderInfo, listRecentVoiceMemories } from "@/lib/voice-ai/service";
import { VoiceView } from "./VoiceView";

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  const provider = getVoiceProviderInfo();
  const recent = await listRecentVoiceMemories(8).catch(() => []);
  return <VoiceView provider={provider} recent={recent} />;
}
