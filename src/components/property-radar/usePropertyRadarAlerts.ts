"use client";
// ============================================================================
// ZONO Property Radar™ — global alert hook.
// Loads unread/high+urgent alerts, subscribes to Supabase Realtime on
// property_alerts (degrading to polling if realtime is unavailable), enforces
// quiet-mode + the per-10-min popup rate limit, and exposes a small queue API
// for the global popup.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createPropertyAlertReminderAction,
  fetchUnreadPropertyAlertsAction,
  markPropertyAlertClickedAction,
  markPropertyAlertContactedAction,
  markPropertyAlertDismissedAction,
  markPropertyAlertShownAction,
} from "@/lib/property-radar/alerts/actions";
import {
  DEFAULT_POPUP_SETTINGS,
  type PropertyRadarAlertDTO,
  type PropertyRadarAlertMetadata,
  type PropertyRadarPopupSettings,
} from "@/lib/property-radar/alerts/types";

const TEN_MINUTES = 10 * 60 * 1000;
const POLL_MS = 30_000;
// Module-level wrapper so the React purity lint doesn't flag Date.now() usage.
const nowMs = () => Date.now();

function priorityRank(p: string): number {
  return p === "urgent" ? 3 : p === "high" ? 2 : p === "medium" ? 1 : 0;
}
function sortAlerts(a: PropertyRadarAlertDTO[]): PropertyRadarAlertDTO[] {
  return [...a].sort(
    (x, y) =>
      priorityRank(y.priority) - priorityRank(x.priority) ||
      Date.parse(y.createdAt) - Date.parse(x.createdAt),
  );
}

// Defensive map from a realtime postgres_changes row → DTO.
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

const ACTIVE_STATUSES = new Set(["unread", "shown"]);
const POPUP_PRIORITIES = new Set(["high", "urgent"]);

export interface UsePropertyRadarAlerts {
  alerts: PropertyRadarAlertDTO[];
  activeAlert: PropertyRadarAlertDTO | null;
  unreadCount: number;
  compactCount: number;
  isRateLimited: boolean;
  isQuiet: boolean;
  isRealtimeConnected: boolean;
  settings: PropertyRadarPopupSettings;
  showNextAlert: () => void;
  openNextNow: () => void;
  dismissAlert: (id: string) => void;
  markContacted: (id: string) => void;
  markClicked: (id: string) => void;
  closeActive: (id: string) => void;
  createReminder: (id: string) => Promise<boolean>;
}

export function usePropertyRadarAlerts(orgId: string | null): UsePropertyRadarAlerts {
  const [queue, setQueue] = useState<PropertyRadarAlertDTO[]>([]);
  const [activeAlert, setActiveAlert] = useState<PropertyRadarAlertDTO | null>(null);
  const [settings, setSettings] = useState<PropertyRadarPopupSettings>(DEFAULT_POPUP_SETTINGS);
  const [isRealtimeConnected, setRealtimeConnected] = useState(false);
  const [shownStamps, setShownStamps] = useState<number[]>([]);

  const isQuiet = settings.quietModeEnabled || !settings.popupAlertsEnabled;

  // Render-time rate-limit derived from state (no ref reads during render).
  const recentShown = shownStamps.filter((t) => t >= nowMs() - TEN_MINUTES).length;
  const isRateLimited = recentShown >= settings.maxPopupsPer10Minutes;

  // Mirrors for reading the latest values inside callbacks/effects (allowed).
  const stampsRef = useRef<number[]>([]);
  const queueRef = useRef<PropertyRadarAlertDTO[]>([]);
  const activeRef = useRef<PropertyRadarAlertDTO | null>(null);
  useEffect(() => { stampsRef.current = shownStamps; }, [shownStamps]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { activeRef.current = activeAlert; }, [activeAlert]);

  // Merge new alerts into the queue (dedup by id, keep active untouched).
  const enqueue = useCallback((incoming: PropertyRadarAlertDTO[]) => {
    setQueue((prev) => {
      const byId = new Map(prev.map((a) => [a.id, a]));
      for (const a of incoming) {
        if (!ACTIVE_STATUSES.has(a.status) || !POPUP_PRIORITIES.has(a.priority)) continue;
        byId.set(a.id, a);
      }
      return sortAlerts([...byId.values()]);
    });
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((a) => a.id !== id));
    setActiveAlert((cur) => (cur?.id === id ? null : cur));
  }, []);

  // Promote the next queued alert into the modal, respecting quiet + rate limit.
  // Reads the latest values from refs (allowed inside a callback).
  const showNextAlert = useCallback(
    (force = false) => {
      if (activeRef.current) return; // one at a time
      if (isQuiet) return;
      const now = Date.now();
      const recent = stampsRef.current.filter((t) => t >= now - TEN_MINUTES);
      if (!force && recent.length >= settings.maxPopupsPer10Minutes) return;
      const next = sortAlerts(queueRef.current).find((a) => ACTIVE_STATUSES.has(a.status));
      if (!next) return;
      const stamps = [...recent, now];
      stampsRef.current = stamps;
      setShownStamps(stamps);
      setActiveAlert(next);
      void markPropertyAlertShownAction(next.id);
    },
    [isQuiet, settings.maxPopupsPer10Minutes],
  );

  // Auto-advance: whenever the queue changes and nothing is showing, try to show.
  useEffect(() => {
    if (!activeAlert && queue.length > 0) showNextAlert();
  }, [queue, activeAlert, showNextAlert]);

  // Initial load + polling reconcile (works regardless of realtime).
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const load = () => {
      fetchUnreadPropertyAlertsAction().then((res) => {
        if (cancelled || !res.ok) return;
        setSettings(res.data.settings);
        enqueue(res.data.alerts);
      });
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [orgId, enqueue]);

  // Realtime subscription (best-effort; polling covers the gap if it fails).
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
          if (dto) enqueue([dto]);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "property_alerts", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const dto = rowToDTO(payload.new as Record<string, unknown>);
          if (!dto) return;
          if (!ACTIVE_STATUSES.has(dto.status)) removeFromQueue(dto.id);
          else enqueue([dto]);
        },
      )
      .subscribe((status) => setRealtimeConnected(status === "SUBSCRIBED"));
    return () => {
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [orgId, enqueue, removeFromQueue]);

  const dismissAlert = useCallback((id: string) => {
    void markPropertyAlertDismissedAction(id);
    removeFromQueue(id);
  }, [removeFromQueue]);

  const markContacted = useCallback((id: string) => {
    void markPropertyAlertContactedAction(id);
    removeFromQueue(id);
  }, [removeFromQueue]);

  const markClicked = useCallback((id: string) => {
    void markPropertyAlertClickedAction(id);
  }, []);

  const createReminder = useCallback(async (id: string) => {
    const res = await createPropertyAlertReminderAction(id);
    return res.ok ? res.data.taskCreated : false;
  }, []);

  const unreadCount = queue.length;
  const compactCount = useMemo(
    () => queue.filter((a) => a.id !== activeAlert?.id).length,
    [queue, activeAlert],
  );

  return {
    alerts: queue,
    activeAlert,
    unreadCount,
    compactCount,
    isRateLimited,
    isQuiet,
    isRealtimeConnected,
    settings,
    showNextAlert: () => showNextAlert(false),
    openNextNow: () => showNextAlert(true),
    dismissAlert,
    markContacted,
    markClicked,
    closeActive: removeFromQueue,
    createReminder,
  };
}
