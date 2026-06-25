// ============================================================================
// ZONO Property Radar™ — alert read/write service (server-only).
// Org-scoped via the session + RLS (current_org_id()). Reads urgent/high unread
// alerts for the global popup, records lifecycle timestamps, and (best-effort)
// creates a follow-up task. No cross-org access — every query is RLS-bound and
// also explicitly filtered by org_id.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { RADAR_TABLES } from "../types";
import {
  DEFAULT_POPUP_SETTINGS,
  type FetchPropertyAlertsResult,
  type PropertyRadarAlertDTO,
  type PropertyRadarAlertMetadata,
  type PropertyRadarPopupSettings,
} from "./types";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  const db = await createClient();
  return { db, orgId: profile.org_id, userId: user.id };
}

interface AlertRow {
  id: string;
  alert_type: string;
  title: string;
  message: string | null;
  priority: string;
  status: string;
  opportunity_score: number | null;
  created_at: string;
  linked_property_id: string | null;
  property_source_id: string | null;
  metadata: PropertyRadarAlertMetadata | null;
}

function toDTO(r: AlertRow): PropertyRadarAlertDTO {
  return {
    id: r.id,
    alertType: r.alert_type,
    title: r.title,
    message: r.message,
    priority: r.priority,
    status: r.status,
    opportunityScore: r.opportunity_score,
    createdAt: r.created_at,
    linkedPropertyId: r.linked_property_id,
    propertySourceId: r.property_source_id,
    metadata: r.metadata ?? {},
  };
}

async function readPopupSettings(
  db: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
): Promise<PropertyRadarPopupSettings> {
  const { data } = await db
    .from(RADAR_TABLES.settings as never)
    .select("popup_alerts_enabled, quiet_mode_enabled, max_popups_per_10_minutes")
    .eq("org_id", orgId)
    .maybeSingle();
  const row = data as unknown as {
    popup_alerts_enabled: boolean | null;
    quiet_mode_enabled: boolean | null;
    max_popups_per_10_minutes: number | null;
  } | null;
  if (!row) return { ...DEFAULT_POPUP_SETTINGS };
  return {
    popupAlertsEnabled: row.popup_alerts_enabled ?? DEFAULT_POPUP_SETTINGS.popupAlertsEnabled,
    quietModeEnabled: row.quiet_mode_enabled ?? DEFAULT_POPUP_SETTINGS.quietModeEnabled,
    maxPopupsPer10Minutes:
      row.max_popups_per_10_minutes ?? DEFAULT_POPUP_SETTINGS.maxPopupsPer10Minutes,
  };
}

/** Unread/shown, high/urgent alerts for the current org + popup settings. */
export async function fetchUnreadPropertyAlerts(): Promise<FetchPropertyAlertsResult> {
  const { db, orgId } = await ctx();
  const { data, error } = await db
    .from(RADAR_TABLES.alerts as never)
    .select(
      "id, alert_type, title, message, priority, status, opportunity_score, created_at, linked_property_id, property_source_id, metadata",
    )
    .eq("org_id", orgId)
    .in("status", ["unread", "shown"] as never)
    .in("priority", ["high", "urgent"] as never)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  const alerts = ((data ?? []) as unknown as AlertRow[]).map(toDTO);
  const settings = await readPopupSettings(db, orgId);
  return { alerts, settings };
}

async function patchAlert(alertId: string, patch: Record<string, unknown>): Promise<void> {
  const { db, orgId } = await ctx();
  const { error } = await db
    .from(RADAR_TABLES.alerts as never)
    .update(patch as never)
    .eq("id", alertId)
    .eq("org_id", orgId); // belt-and-braces on top of RLS
  if (error) throw new Error(error.message);
}

export async function markPropertyAlertShown(alertId: string): Promise<void> {
  await patchAlert(alertId, { status: "shown", shown_at: new Date().toISOString() });
}
export async function markPropertyAlertClicked(alertId: string): Promise<void> {
  await patchAlert(alertId, { clicked_at: new Date().toISOString() });
}
export async function markPropertyAlertDismissed(alertId: string): Promise<void> {
  await patchAlert(alertId, { status: "dismissed", dismissed_at: new Date().toISOString() });
}
export async function markPropertyAlertContacted(alertId: string): Promise<void> {
  await patchAlert(alertId, { status: "contacted", contacted_at: new Date().toISOString() });
}

/**
 * Best-effort follow-up reminder. If the alert is linked to a real property we
 * create a +1h task; otherwise we no-op gracefully (UI must never break).
 */
export async function createPropertyAlertReminder(
  alertId: string,
): Promise<{ taskCreated: boolean }> {
  const { db, orgId } = await ctx();
  const { data } = await db
    .from(RADAR_TABLES.alerts as never)
    .select("linked_property_id")
    .eq("id", alertId)
    .eq("org_id", orgId)
    .maybeSingle();
  const propertyId = (data as unknown as { linked_property_id: string | null } | null)
    ?.linked_property_id;
  if (!propertyId) return { taskCreated: false };

  try {
    const { createPropertyTask } = await import("@/lib/tasks/repository");
    const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await createPropertyTask(propertyId, {
      title: "פולואפ לנכס פרטי חדש",
      dueAt,
      priority: "high",
    });
    return { taskCreated: true };
  } catch {
    return { taskCreated: false }; // never break the popup on reminder failure
  }
}
