// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — Integration Center (/settings/integrations).
//
// Server composition for the Google integration card (Part 8): connected
// account, granted scopes, last sync, health, and reconnect/disconnect entry
// points. Reads the current user's connection (browser-safe projection ONLY —
// no token fields) plus per-calendar sync health. Never exposes secrets.
// ============================================================================
import { getGoogleOAuthConfig } from "@/lib/google/oauth";
import { getMyConnection, toPublic } from "@/lib/google/tokens";
import { getSyncHealth } from "@/lib/google/sync";
import { IntegrationsView } from "./IntegrationsView";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const conn = await getMyConnection();
  const cfg = getGoogleOAuthConfig();
  const publicConn = toPublic(conn);
  const sync = conn ? await getSyncHealth(conn).catch(() => []) : [];

  const notice = sp.google_connected ? "connected" : (typeof sp.google_error === "string" ? `error:${sp.google_error}` : null);

  return (
    <IntegrationsView
      google={publicConn}
      config={{ configured: cfg.configured, enabled: cfg.enabled, ready: cfg.ready, missing: cfg.missing }}
      sync={sync}
      notice={notice}
    />
  );
}
