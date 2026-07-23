// ============================================================================
// 📘 ZONO — Personal transport HEALTH snapshot (server-only).
// ----------------------------------------------------------------------------
// A stable, provider-neutral health view for the Beta dashboard. It composes the
// stored session snapshot + kill-switch state + worker availability into fields
// the UI renders WITHOUT ever seeing an Evolution-native status string.
// ============================================================================
import "server-only";
import { resolveSessionCtx, readSessionSnapshot } from "../session";
import { isPersonalWhatsappEnabled } from "../personal-flag";
import { personalConfigured } from "./compat";
import type { WaConnState } from "../types";

export interface PersonalHealth {
  enabled: boolean;            // kill-switch state (C10)
  workerConfigured: boolean;   // is the transport backend configured
  state: WaConnState;          // canonical connection state
  displayName: string | null;
  phone: string | null;
  lastConnectedAt: string | null;
  error: string | null;
  repairRequired: boolean;     // true → user must re-scan a QR
}

/** Build the current agent's personal-transport health snapshot. */
export async function getPersonalHealth(): Promise<PersonalHealth | null> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return null;
  const snap = await readSessionSnapshot(ctx, "bridge");
  const repairRequired = snap.state === "disconnected" || snap.state === "qr_expired" || snap.state === "error";
  return {
    enabled: isPersonalWhatsappEnabled(),
    workerConfigured: personalConfigured(),
    state: snap.state,
    displayName: snap.displayName,
    phone: snap.phone,
    lastConnectedAt: snap.lastConnectedAt,
    error: snap.error,
    repairRequired,
  };
}
