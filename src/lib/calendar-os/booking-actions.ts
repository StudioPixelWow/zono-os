"use server";
// ============================================================================
// 📅 ZONO — Calendar OS™ · availability + booking + connector actions. 43.2.
// proposeBooking + availability reads are READ. confirmBooking + save prefs are
// the EXPLICIT broker approvals (the only writes). No external sync, no auto-book.
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  getAvailabilityPrefs, saveAvailabilityPrefs, proposeBooking, confirmBooking, getConnectorHealth,
  type BookingProposal, type ConfirmBookingInput, type ConfirmBookingResult,
} from "./booking-service";
import type { AvailabilityPrefs } from "./availability";
import type { BookingKind } from "./booking";
import type { ConnectorHealth } from "./connectors";

export async function getAvailabilityPrefsAction(): Promise<{ prefs: AvailabilityPrefs }> {
  return { prefs: await getAvailabilityPrefs() };
}
export async function saveAvailabilityPrefsAction(prefs: AvailabilityPrefs): Promise<{ ok: boolean; error?: string }> {
  const r = await saveAvailabilityPrefs(prefs);
  if (r.ok) revalidatePath("/calendar");
  return r;
}
export async function proposeBookingAction(input: { kind: BookingKind; dateIso: string; brokerId?: string | null }): Promise<{ proposal: BookingProposal }> {
  return { proposal: await proposeBooking(input) };
}
/** APPROVAL-GATED — creates the internal meeting only on this explicit action. */
export async function confirmBookingAction(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
  const r = await confirmBooking(input);
  if (r.ok) { revalidatePath("/calendar"); }
  return r;
}
export async function getConnectorHealthAction(): Promise<{ connectors: ConnectorHealth[] }> {
  return { connectors: await getConnectorHealth() };
}
