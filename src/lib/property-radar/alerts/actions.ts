"use server";
// ============================================================================
// ZONO Property Radar™ — alert server actions (org-scoped via RLS + session).
// Thin wrappers over the service; every call re-resolves the session, so no
// cross-org access is possible.
// ============================================================================
import {
  createPropertyAlertReminder,
  fetchUnreadPropertyAlerts,
  markPropertyAlertClicked,
  markPropertyAlertContacted,
  markPropertyAlertDismissed,
  markPropertyAlertShown,
} from "./service";
import type { FetchPropertyAlertsResult } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה. נסה שוב." };
}

export async function fetchUnreadPropertyAlertsAction(): Promise<Result<FetchPropertyAlertsResult>> {
  try {
    return { ok: true, data: await fetchUnreadPropertyAlerts() };
  } catch (e) {
    return fail(e);
  }
}

export async function markPropertyAlertShownAction(alertId: string): Promise<Result<null>> {
  try { await markPropertyAlertShown(alertId); return { ok: true, data: null }; } catch (e) { return fail(e); }
}
export async function markPropertyAlertClickedAction(alertId: string): Promise<Result<null>> {
  try { await markPropertyAlertClicked(alertId); return { ok: true, data: null }; } catch (e) { return fail(e); }
}
export async function markPropertyAlertDismissedAction(alertId: string): Promise<Result<null>> {
  try { await markPropertyAlertDismissed(alertId); return { ok: true, data: null }; } catch (e) { return fail(e); }
}
export async function markPropertyAlertContactedAction(alertId: string): Promise<Result<null>> {
  try { await markPropertyAlertContacted(alertId); return { ok: true, data: null }; } catch (e) { return fail(e); }
}
export async function createPropertyAlertReminderAction(
  alertId: string,
): Promise<Result<{ taskCreated: boolean }>> {
  try {
    return { ok: true, data: await createPropertyAlertReminder(alertId) };
  } catch (e) {
    return fail(e);
  }
}
