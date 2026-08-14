"use client";
// ============================================================================
// ZONO Property Radar™ — global opportunity DIGEST hook (P9.1B).
// ----------------------------------------------------------------------------
// The old behaviour auto-advanced a full-screen modal per opportunity, re-fired
// on a 30s poll (because `shown` stayed eligible), never drained the "N waiting"
// count, and its `fixed inset-0` overlay intercepted page clicks. A fresh batch
// of many opportunities made the app unusable.
//
// This hook instead drives ONE non-blocking DIGEST banner:
//   • counts only genuinely-NEW (`unread`) high/urgent alerts (server-side),
//   • shows at most ONE banner ("ZONO found N opportunities in <city>"),
//   • on view/postpone it DRAINS the whole batch to `shown` (seen) on the SERVER,
//     so a refresh never replays already-seen opportunities,
//   • re-appears only when genuinely new alerts arrive (top id changes),
//   • never covers the viewport, so dashboard CTAs stay clickable.
// Individual opportunities are browsed intentionally in the Property Radar center.
// ============================================================================
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchUnreadPropertyAlertsAction,
  markAllPropertyAlertsSeenAction,
} from "@/lib/property-radar/alerts/actions";
import {
  DEFAULT_POPUP_SETTINGS,
  type PropertyRadarAlertDTO,
  type PropertyRadarAlertMetadata,
  type PropertyRadarPopupSettings,
} from "@/lib/property-radar/alerts/types";
import {
  INITIAL_DIGEST_STATE,
  deriveCity,
  digestReducer,
  isDigestVisible,
} from "./digest-logic";

const POLL_MS = 30_000;

function rowToDTO(row: Record<string, unknown>): PropertyRadarAlertDTO | null {
  if (!row || typeof row.id !== "string") return null;
  return {
    id: row.id,
    alertType: String(row.alert_type ?? "high_opportunity"),
    title: String(row.title ?? "הזדמנות חדשה"),
    message: (row.message as string | null) ?? null,
    priority: String(row.priority ?? "high"),
    status: String(row.status ?? "unread"),
    opportunityScore: (row.opportunity_score as number | null) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    linkedPropertyId: (row.linked_property_id as string | null) ?? null,
    propertySourceId: (row.property_source_id as string | null) ?? null,
    metadata: (row.metadata as PropertyRadarAlertMetadata) ?? {},
  };
}

export interface UsePropertyRadarAlerts {
  /** EXACT count of NEW (unseen) high/urgent opportunities. */
  count: number;
  /** City for the copy (most common among the preview), or null. */
  city: string | null;
  /** The single top opportunity to surface as a RICH card (one at a time). */
  topAlert: PropertyRadarAlertDTO | null;
  /** Whether the single opportunity surface should be visible right now. */
  digestVisible: boolean;
  isQuiet: boolean;
  isRealtimeConnected: boolean;
  settings: PropertyRadarPopupSettings;
  /** Drain the whole batch to `shown` (seen) on the server + hide the surface. */
  acknowledge: () => void;
}

export function usePropertyRadarAlerts(orgId: string | null): UsePropertyRadarAlerts {
  const [state, dispatch] = useReducer(digestReducer, INITIAL_DIGEST_STATE);
  const [preview, setPreview] = useState<PropertyRadarAlertDTO[]>([]);
  const [settings, setSettings] = useState<PropertyRadarPopupSettings>(DEFAULT_POPUP_SETTINGS);
  const [isRealtimeConnected, setRealtimeConnected] = useState(false);

  const isQuiet = settings.quietModeEnabled || !settings.popupAlertsEnabled;

  // Initial load + 30s reconcile poll (authoritative; realtime is a bonus).
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const load = () => {
      fetchUnreadPropertyAlertsAction().then((res) => {
        if (cancelled || !res.ok) return;
        setSettings(res.data.settings);
        setPreview(res.data.alerts);
        dispatch({ type: "fetch", count: res.data.count, topId: res.data.alerts[0]?.id ?? null });
      });
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [orgId]);

  // Realtime: a genuinely NEW insert bumps the count + surfaces the digest; other
  // transitions (dismissed/contacted/shown) are reconciled by the next poll.
  // Best-effort — polling covers any gap.
  useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`property_radar_alerts:${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "property_alerts", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const dto = rowToDTO(payload.new as Record<string, unknown>);
          if (!dto || dto.status !== "unread") return;
          if (dto.priority !== "high" && dto.priority !== "urgent") return;
          setPreview((prev) => (prev.some((a) => a.id === dto.id) ? prev : [dto, ...prev].slice(0, 30)));
          dispatch({ type: "insert", id: dto.id });
        },
      )
      .subscribe((status) => setRealtimeConnected(status === "SUBSCRIBED"));
    return () => {
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [orgId]);

  // Drain: mark every NEW alert seen on the SERVER, optimistically hide, and
  // remember this batch so a race before the write commits can't replay it. A
  // later, genuinely-new alert (different top id) re-shows the digest.
  const acknowledge = useCallback(() => {
    dispatch({ type: "acknowledge" });
    setPreview([]);
    void markAllPropertyAlertsSeenAction();
  }, []);

  const city = useMemo(() => deriveCity(preview), [preview]);
  const topAlert = preview[0] ?? null;

  return {
    count: state.count,
    city,
    topAlert,
    digestVisible: isDigestVisible(state, isQuiet),
    isQuiet,
    isRealtimeConnected,
    settings,
    acknowledge,
  };
}
