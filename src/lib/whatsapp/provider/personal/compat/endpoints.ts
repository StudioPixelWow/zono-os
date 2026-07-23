// ============================================================================
// 📘 C9 COMPAT — Evolution ENDPOINT PATHS (server-only).
// ----------------------------------------------------------------------------
// Every Evolution path lives here and NOWHERE else. If a future Evolution
// release renames a route, only this file changes. Paths are version-aware via
// the config's targetVersion so a v3 fork of the paths can be added without
// touching the adapter. Values are relative to the configured base URL.
// ============================================================================
import "server-only";

/** Version-aware endpoint set. Keyed by Evolution major version. */
type EndpointSet = {
  createInstance: () => string;
  connect: (instance: string) => string;      // fetch/generate QR + start pairing
  connectionState: (instance: string) => string;
  logout: (instance: string) => string;       // graceful disconnect (keeps instance)
  deleteInstance: (instance: string) => string;
  sendText: (instance: string) => string;
  sendMedia: (instance: string) => string;
  sendPresence: (instance: string) => string; // typing/presence
  setWebhook: (instance: string) => string;
};

const V2: EndpointSet = {
  createInstance: () => `/instance/create`,
  connect: (i) => `/instance/connect/${encodeURIComponent(i)}`,
  connectionState: (i) => `/instance/connectionState/${encodeURIComponent(i)}`,
  logout: (i) => `/instance/logout/${encodeURIComponent(i)}`,
  deleteInstance: (i) => `/instance/delete/${encodeURIComponent(i)}`,
  sendText: (i) => `/message/sendText/${encodeURIComponent(i)}`,
  sendMedia: (i) => `/message/sendMedia/${encodeURIComponent(i)}`,
  sendPresence: (i) => `/chat/sendPresence/${encodeURIComponent(i)}`,
  setWebhook: (i) => `/webhook/set/${encodeURIComponent(i)}`,
};

/** Resolve the endpoint set for a target version (fallback: latest known). */
export function endpointsFor(targetVersion: string): EndpointSet {
  // Only v2 is published today; the map is the seam for future versions.
  switch (targetVersion.split(".")[0]) {
    case "2":
    default:
      return V2;
  }
}
