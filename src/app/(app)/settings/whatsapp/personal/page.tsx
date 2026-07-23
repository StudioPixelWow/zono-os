// ============================================================================
// 💬 ZONO OS — Batch 6.6A · PERSONAL WhatsApp (Beta) — /settings/whatsapp/personal.
// Server composition of the Personal QR transport (Beta). Separate route so the
// frozen Batch 6.6 Message Center is untouched. Loads the provider-neutral health
// snapshot + disclosure/transport state and hands them to the client view. No
// Evolution detail crosses to the browser.
// ============================================================================
import { getPersonalHealth } from "@/lib/whatsapp/provider/personal/health";
import { getTransportPreference } from "@/lib/whatsapp/provider/personal/transport";
import { hasAcknowledged, DISCLOSURE_VERSION } from "@/lib/whatsapp/provider/personal/disclosure";
import { resolveSessionCtx } from "@/lib/whatsapp/provider/session";
import { PersonalWhatsappView } from "./PersonalWhatsappView";

export const dynamic = "force-dynamic";

export default async function PersonalWhatsappSettingsPage() {
  const ctx = await resolveSessionCtx();
  const [health, acknowledged, transport] = ctx
    ? await Promise.all([getPersonalHealth(), hasAcknowledged(ctx), getTransportPreference(ctx)])
    : [null, false, "business" as const];

  return (
    <PersonalWhatsappView
      health={health}
      acknowledged={acknowledged}
      transport={transport}
      disclosureVersion={DISCLOSURE_VERSION}
    />
  );
}
