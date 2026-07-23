// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS — pure health projection.
// Maps a connection status to a UI health label. Pure & deterministic.
// ============================================================================
import type { WaConnectionStatus, WaHealth } from "./types";

export function healthForStatus(status: WaConnectionStatus | null): WaHealth {
  switch (status) {
    case "connected": return "healthy";
    case "syncing": return "syncing";
    case "permission_missing": return "permission_missing";
    case "pending_number": return "pending_number";
    case "expired":
    case "revoked": return "needs_reconnect";
    default: return "not_connected";
  }
}
