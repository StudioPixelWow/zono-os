"use client";
// ============================================================================
// 📱 ZONO — PWA provider. PHASE 57.0. Mounted once in the app shell.
// Registers the service worker (offline read cache), tracks connectivity, flushes
// the approved offline write queue on reconnect, and shows an offline banner +
// an "add to home screen" hint. No app rebuild — this is an infra wrapper.
// ============================================================================
import { useEffect, useState } from "react";
import { flushOfflineQueue, getQueueStats } from "./offlineQueue";

export function PwaProvider() {
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [pending, setPending] = useState(() => { try { return typeof window !== "undefined" ? getQueueStats().pending : 0; } catch { return 0; } });

  useEffect(() => {
    // Register the service worker (progressive enhancement; ignore if unsupported).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* SW optional */ });
    }

    const refresh = () => { try { setPending(getQueueStats().pending); } catch { /* ignore */ } };
    const goOnline = () => { setOnline(true); void flushOfflineQueue(true).then(refresh); };
    const goOffline = () => setOnline(false);
    // Reconcile against navigator.onLine — the source of truth. The online/offline
    // EVENTS are unreliable on mobile (a spurious "offline" can fire, or the paired
    // "online" can be missed while the tab is backgrounded/loading), which otherwise
    // leaves the "no connection" banner stuck on while the device is actually online.
    // Re-sync on mount, on focus/visibility, and on a slow interval so it self-heals.
    const reconcile = () => {
      const on = typeof navigator !== "undefined" ? navigator.onLine : true;
      setOnline(on);
      if (on) { try { if (getQueueStats().pending > 0) void flushOfflineQueue(true).then(refresh); } catch { /* ignore */ } }
    };

    reconcile();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("zono:offline-queue-changed", refresh);
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("focus", reconcile);
    const reconcileTimer = window.setInterval(reconcile, 15000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("zono:offline-queue-changed", refresh);
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("focus", reconcile);
      window.clearInterval(reconcileTimer);
    };
  }, []);

  if (online && pending === 0) return null;
  return (
    <div dir="rtl" className="fixed inset-x-0 bottom-0 z-[115] flex justify-center pb-[env(safe-area-inset-bottom)]">
      <div className={`mb-3 rounded-full px-4 py-2 text-[12px] font-bold shadow-lg ${online ? "bg-brand-soft text-brand" : "bg-warning-soft text-warning"}`}>
        {online
          ? `מסנכרן ${pending} פעולות מאושרות…`
          : `אין חיבור — ${pending > 0 ? `${pending} פעולות מאושרות ממתינות לסנכרון` : "צפייה במצב לא-מקוון"}`}
      </div>
    </div>
  );
}
