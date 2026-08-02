"use client";
// ============================================================================
// 📱 ZONO — PWA provider. PHASE 57.0. Mounted once in the app shell.
// Registers the service worker (offline read cache), tracks connectivity, flushes
// the approved offline write queue on reconnect, and shows an offline banner +
// an "add to home screen" hint. No app rebuild — this is an infra wrapper.
// ============================================================================
import { useEffect, useState } from "react";
import { flushOfflineQueue, getQueueStats } from "./offlineQueue";
import { bannerState, nextOnlineState } from "./connectivity";

export function PwaProvider() {
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [pending, setPending] = useState(() => { try { return typeof window !== "undefined" ? getQueueStats().pending : 0; } catch { return 0; } });

  useEffect(() => {
    // Register the service worker (progressive enhancement; ignore if unsupported).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* SW optional */ });
    }

    const refresh = () => { try { setPending(getQueueStats().pending); } catch { /* ignore */ } };
    // Re-sync to the browser's authoritative reading. Runs on mount and whenever
    // the tab regains visibility/focus — this is the recovery path that prevents
    // a stale/missed native transition from latching the offline banner.
    const resync = (event: "mount" | "visible" | "focus") => {
      setOnline((prev) => nextOnlineState(prev, event, navigator.onLine));
      if (navigator.onLine) void flushOfflineQueue(true).then(refresh);
    };
    const goOnline = () => { setOnline((prev) => nextOnlineState(prev, "online", true)); void flushOfflineQueue(true).then(refresh); };
    const goOffline = () => setOnline((prev) => nextOnlineState(prev, "offline", false));
    const onVisible = () => { if (document.visibilityState === "visible") resync("visible"); };
    const onFocus = () => resync("focus");

    resync("mount"); // immediate re-sync in case the initial state was stale or an event fired pre-mount

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("zono:offline-queue-changed", refresh);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("zono:offline-queue-changed", refresh);
    };
  }, []);

  const banner = bannerState(online, pending);
  if (!banner) return null;
  return (
    <div dir="rtl" className="fixed inset-x-0 bottom-0 z-[115] flex justify-center pb-[env(safe-area-inset-bottom)]">
      <div className={`mb-3 rounded-full px-4 py-2 text-[12px] font-bold shadow-lg ${banner.tone === "sync" ? "bg-brand-soft text-brand" : "bg-warning-soft text-warning"}`}>
        {banner.text}
      </div>
    </div>
  );
}
