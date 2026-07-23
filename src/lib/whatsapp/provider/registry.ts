// ============================================================================
// 📘 ZONO — WhatsApp provider REGISTRY (server-only). THE swap point.
// ----------------------------------------------------------------------------
// Every consumer resolves the active provider here. Swapping the temporary QR /
// WhatsApp-Web bridge for the official Cloud API later is a change in THIS file
// only — no UI / Inbox / AI / CRM / Timeline changes.
//   WHATSAPP_PROVIDER = "bridge" (default when WHATSAPP_BRIDGE_URL is set) | "none"
// ============================================================================
import "server-only";
import { bridgeProvider, bridgeConfig } from "./bridge-provider";
import { personalTransportProvider, personalTransportConfigured } from "./personal";
import type { WaProviderKind, WhatsAppProvider } from "./types";

/** Which provider is active for this deployment. */
export function getWhatsAppProviderKind(): WaProviderKind {
  const forced = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (forced === "bridge") return "bridge";
  if (forced === "none") return "none";
  if (forced === "cloud") return "cloud";
  // Default: bridge when a personal-transport backend (or generic bridge URL) is
  // configured, else none.
  return personalTransportConfigured() || bridgeConfig() ? "bridge" : "none";
}

/** The active provider instance. */
export function getWhatsAppProvider(): WhatsAppProvider {
  const kind = getWhatsAppProviderKind();
  switch (kind) {
    case "bridge":
      // The Personal transport adapter is the concrete "bridge" implementation.
      // Swapping the backend is a change to ./personal only (C3).
      return personalTransportProvider;
    // "cloud" is served by the existing Cloud-API gate, not this QR interface.
    // "none" falls back to the generic bridge shape but reports `unavailable`.
    default:
      return bridgeProvider;
  }
}

/** True when the QR/WhatsApp-Web flow should drive the /whatsapp page. */
export function isQrProviderActive(): boolean {
  return getWhatsAppProviderKind() === "bridge";
}
