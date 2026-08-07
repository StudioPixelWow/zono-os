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
  // Start OPTIMISTICALLY online. navigator.onLine AND the online/offline events are
  // unreliable on mobile/PWA — they can report/emit "offline" while the device is
  // actually connected, which previously left the "no connection" banner stuck on
  // (even a reconcile against navigator.onLine did not clear it). We instead trust
  // an ACTIVE network probe, and only ever show "offline" once a probe truly fails.
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(() => { try { return typeof window !== "undefined" ? getQueueStats().pending : 0; } catch { return 0; } });

  useEffect(() => {
    // Register the service worker (progressive enhancement; ignore if unsupported).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* SW optional */ });
    }

    let alive = true;
    const refresh = () => { try { setPending(getQueueStats().pending); } catch { /* ignore */ } };

    // AUTHORITATIVE connectivity check: a same-origin, cache-busting request. ANY
    // HTTP response (even 404) means we reached the origin → we are online; only a
    // network-level failure/timeout can indicate offline. This does not depend on
    // navigator.onLine or the flaky online/offline events.
    const probe = async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        await fetch(`/favicon.ico?online-probe=${Date.now()}`, { method: "GET", cache: "no-store", signal: ctrl.signal });
        clearTimeout(timer);
        if (!alive) return;
        setOnline(true);
        try { if (getQueueStats().pending > 0) void flushOfflineQueue(true).then(refresh); } catch { /* ignore */ }
      } catch {
        // Reached only on a genuine network failure/timeout. Require navigator.onLine
        // to ALSO be false so a single blocked request never fakes an outage.
        if (!alive) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) setOnline(false);
      }
    };

    const goOnline = () => { setOnline(true); void flushOfflineQueue(true).then(refresh); };
    const goOffline = () => { void probe(); };                  // verify before ever showing "offline"
    const onVisible = () => { if (!document.hidden) void probe(); };
    const onFocus = () => { void probe(); };

    void probe();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("zono:offline-queue-changed", refresh);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    const probeTimer = window.setInterval(() => void probe(), 20000);
    return () => {
      alive = false;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("zono:offline-queue-changed", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(probeTimer);
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
