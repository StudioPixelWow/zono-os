// ============================================================================
// 📱 ZONO — Mobile OS — PWA manifest, GPS handoff, capabilities, push mock (pure).
// PHASE 57.0. No I/O. The manifest is consumed by app/manifest.ts; the GPS helper
// hands a field route off to the device's maps app (deep link only); the push
// helper is MOCK-SAFE (no keys, never subscribes) until real push is configured.
// ============================================================================
import type { RouteStop, MobileCapability, PushMock } from "./types";

/** PWA manifest object (installability). Shaped for Next MetadataRoute.Manifest. */
export function buildManifest(opts: { name?: string; themeColor?: string; bgColor?: string } = {}) {
  return {
    name: opts.name ?? "ZONO — נדל״ן חכם",
    short_name: "ZONO",
    description: "פלטפורמת ה-AI לתיווך נדל״ן — שדה, לקוחות, שיווק והחלטות במקום אחד.",
    id: "/",
    start_url: "/today",
    scope: "/",
    display: "standalone" as const,
    orientation: "portrait" as const,
    lang: "he",
    dir: "rtl" as const,
    background_color: opts.bgColor ?? "#0b0b12",
    theme_color: opts.themeColor ?? "#0b0b12",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" as const },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" as const },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" as const },
    ],
    shortcuts: [
      { name: "מוקד היום", short_name: "היום", url: "/today" },
      { name: "מסלול שדה", short_name: "שדה", url: "/field" },
      { name: "זיכרון קולי", short_name: "קול", url: "/voice" },
    ],
  };
}

/** Recommended mobile viewport (consumed by app metadata). */
export const MOBILE_VIEWPORT = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover" as const, themeColor: "#0b0b12" };

const enc = encodeURIComponent;
/** Build a GPS route deep link for the device maps app (route handoff — no tracking). */
export function buildRouteUrl(stops: RouteStop[], provider: "google" | "waze" = "google"): string | null {
  const points = stops
    .map((s) => (s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : s.address ? s.address.trim() : null))
    .filter((x): x is string => !!x);
  if (!points.length) return null;
  if (provider === "waze") {
    const last = points[points.length - 1];
    return `https://waze.com/ul?q=${enc(last)}&navigate=yes`;
  }
  if (points.length === 1) return `https://www.google.com/maps/dir/?api=1&destination=${enc(points[0])}&travelmode=driving`;
  const destination = points[points.length - 1];
  const waypoints = points.slice(0, -1).join("|");
  return `https://www.google.com/maps/dir/?api=1&destination=${enc(destination)}&waypoints=${enc(waypoints)}&travelmode=driving`;
}

/** Field capabilities and which EXISTING flow each hands off to (no rebuild). */
export const CAPABILITIES: MobileCapability[] = [
  { key: "install", label: "התקנה למסך הבית (PWA)", requires: "manifest + service worker", reuse: "app/manifest.ts + /sw.js" },
  { key: "offline_read", label: "צפייה לא-מקוונת", requires: "service worker cache", reuse: "/sw.js network-first" },
  { key: "offline_write", label: "תור פעולות מאושרות לא-מקוון", requires: "localStorage queue", reuse: "mobile-os/queue" },
  { key: "camera", label: "העלאת תמונות מהמצלמה", requires: "input capture", reuse: "lib/documents/upload + properties/media" },
  { key: "voice", label: "הקלטת הודעה קולית", requires: "consent + transcript", reuse: "Voice AI (53.0) — /voice" },
  { key: "gps", label: "ניווט למסלול השדה", requires: "maps deep link", reuse: "buildRouteUrl → device maps" },
  { key: "push", label: "התראות דחיפה", requires: "VAPID keys (לא מוגדר)", reuse: "mock-safe עד להגדרה" },
  { key: "checklist", label: "סנכרון צ׳קליסט שדה", requires: "field-ops", reuse: "Field Ops — /field" },
];

/** Mock-safe push state — never subscribes without configured keys. */
export function pushMock(env: Record<string, string | undefined> = {}): PushMock {
  const key = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
  return {
    supported: true,
    subscribed: false,
    endpointMock: key ? null : "mock://push/not-configured",
    note: key ? "דחיפה מוגדרת — נדרש אישור המשתמש להרשמה." : "דחיפה במצב הדגמה — הגדר NEXT_PUBLIC_VAPID_PUBLIC_KEY להפעלה אמיתית.",
  };
}
