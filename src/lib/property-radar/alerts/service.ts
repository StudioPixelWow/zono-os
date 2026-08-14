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

/**
 * NEW (unseen) high/urgent alerts for the current org + an EXACT unseen count +
 * popup settings. P9.1B — the global surface is a DIGEST, so it only counts
 * genuinely-new (`unread`) alerts. `shown` = "seen" (the user acknowledged the
 * digest) and is deliberately excluded here so acknowledged opportunities never
 * re-trigger; they remain browsable in the Property Radar center. The preview
 * list is capped (city/copy derivation) while `count` is the true total, so a
 * 250-opportunity batch reports "250", not "30".
 */
export async function fetchUnreadPropertyAlerts(): Promise<FetchPropertyAlertsResult> {
  const { db, orgId } = await ctx();
  const [listRes, countRes] = await Promise.all([
    db
      .from(RADAR_TABLES.alerts as never)
      .select(
        "id, alert_type, title, message, priority, status, opportunity_score, created_at, linked_property_id, property_source_id, metadata",
      )
      .eq("org_id", orgId)
      .eq("status", "unread" as never)
      .in("priority", ["high", "urgent"] as never)
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from(RADAR_TABLES.alerts as never)
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "unread" as never)
      .in("priority", ["high", "urgent"] as never),
  ]);
  if (listRes.error) throw new Error(listRes.error.message);
  const alerts = ((listRes.data ?? []) as unknown as AlertRow[]).map(toDTO);
  const count = countRes.count ?? alerts.length;
  const settings = await readPopupSettings(db, orgId);
  return { alerts, count, settings };
}

/**
 * Drain the digest: flip every NEW (`unread`) high/urgent alert for this org to
 * `shown` (= seen) in ONE statement. Called when the user views or postpones the
 * digest, so a page refresh never replays already-seen opportunities. Only
 * `unread` rows are touched — `dismissed`/`contacted`/`read` are never resurrected
 * or overwritten. Org-scoped (RLS + explicit filter). Batch-size agnostic
 * (handles 1 or 250 in a single update). Returns the number of rows drained.
 */
export async function markAllPropertyAlertsSeen(): Promise<{ seen: number }> {
  const { db, orgId } = await ctx();
  const { data, error } = await db
    .from(RADAR_TABLES.alerts as never)
    .update({ status: "shown", shown_at: new Date().toISOString() } as never)
    .eq("org_id", orgId)
    .eq("status", "unread" as never)
    .in("priority", ["high", "urgent"] as never)
    .select("id");
  if (error) throw new Error(error.message);
  return { seen: (data as unknown as { id: string }[] | null)?.length ?? 0 };
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
