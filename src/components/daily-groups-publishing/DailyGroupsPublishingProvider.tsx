"use client";
// ============================================================================
// 📣 ZONO — Daily FB Groups Publishing — provider (first-login trigger). PHASE 49.0.
// Mounted once in the app shell. On the FIRST app view of the day it loads today's
// assisted publishing plan and, if there is work, opens the checklist popup. It is
// dismissible and shown once per day (localStorage). It can also be re-opened on
// demand via the global `zono:open-daily-publishing` event (used by trigger buttons).
// Read-only trigger — it never publishes anything.
// ============================================================================
import { useEffect, useState } from "react";
import { getDailyGroupsPublishingPlanAction } from "@/lib/daily-groups-publishing/actions";
import type { DailyGroupsPublishingPlan } from "@/lib/daily-groups-publishing/types";
import { DailyGroupsPublishingModal } from "./DailyGroupsPublishingModal";

const seenKey = () => `zono-fb-daily-publish-${new Date().toISOString().slice(0, 10)}`;

export function DailyGroupsPublishingProvider() {
  const [plan, setPlan] = useState<DailyGroupsPublishingPlan | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // `force` = user asked to open it explicitly (via the trigger event); otherwise
    // only auto-open when there is pending work. setState runs inside the async
    // callback (never synchronously in the effect body).
    const apply = (force: boolean) => {
      getDailyGroupsPublishingPlanAction()
        .then((r) => {
          if (cancelled || !r.plan) return;
          setPlan(r.plan);
          if (force || r.plan.hasWork) setOpen(true);
        })
        .catch(() => { /* non-blocking popup */ });
    };

    let seen = false;
    try { seen = typeof window !== "undefined" && !!window.localStorage.getItem(seenKey()); } catch { /* ignore */ }
    if (!seen) apply(false);

    const handler = () => apply(true);
    window.addEventListener("zono:open-daily-publishing", handler);
    return () => { cancelled = true; window.removeEventListener("zono:open-daily-publishing", handler); };
  }, []);

  const close = () => {
    setOpen(false);
    try { window.localStorage.setItem(seenKey(), "1"); } catch { /* ignore */ }
  };

  if (!open || !plan) return null;
  return <DailyGroupsPublishingModal initial={plan} onClose={close} />;
}
