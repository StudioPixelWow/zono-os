// ============================================================================
// 📘 C9 COMPAT — Evolution STATUS normalization (server-only, pure).
// ----------------------------------------------------------------------------
// Evolution speaks its own connection vocabulary ("open"/"connecting"/"close",
// plus QR presence). This is the ONLY translator into ZONO's canonical
// WaConnState. Consumers never see an Evolution status string. Pure + testable.
// ============================================================================
import type { WaConnState } from "../../types";

/** Map Evolution's connection-state string (+ whether a QR is present) into the
 *  canonical WaConnState. Unknown strings fail safe to "error", never "connected". */
export function normalizeState(raw: string | null | undefined, hasQr: boolean): WaConnState {
  const s = (raw ?? "").toLowerCase();
  if (s === "open" || s === "connected") return "connected";
  if (s === "connecting" || s === "syncing") return hasQr ? "waiting_qr" : "connecting";
  if (s === "close" || s === "closed" || s === "disconnected") return hasQr ? "waiting_qr" : "disconnected";
  if (hasQr) return "waiting_qr";
  if (s === "") return "connecting";
  return "error";
}

/** Map an Evolution webhook connection-update payload state into WaConnState. */
export function normalizeWebhookState(raw: string | null | undefined): WaConnState {
  const s = (raw ?? "").toLowerCase();
  if (s === "open" || s === "connected") return "connected";
  if (s === "connecting") return "connecting";
  if (s === "close" || s === "closed") return "disconnected";
  return "error";
}
