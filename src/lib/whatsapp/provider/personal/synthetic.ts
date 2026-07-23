// ============================================================================
// 🩺 ZONO — Personal WhatsApp (Beta) SYNTHETIC MONITOR (SRE, 6.6A.2, server-only).
// ----------------------------------------------------------------------------
// Read-only infrastructure-readiness probe. Runs WITHOUT any customer session
// and NEVER creates or touches a real WhatsApp session — it only validates that
// the plumbing is ready:
//   registry resolution · adapter availability · authentication path ·
//   webhook endpoint config · metrics endpoint config · worker health (root
//   ping) · kill-switch status (informational).
// Emits dedicated synthetic metrics; alerts live in the Prometheus rules.
// Operations-only: no architecture/provider/business change.
// ============================================================================
import "server-only";
import { getWhatsAppProviderKind, getWhatsAppProvider } from "../registry";
import { personalTransportConfigured, personalWorkerHealth } from "./index";
import { personalWebhookToken, personalWebhookUrl } from "./webhook-url";
import { isPersonalWhatsappEnabled } from "../personal-flag";
import { recordSynthetic } from "./observability";

export interface SyntheticCheck { name: string; ok: boolean; critical: boolean; detail: string }
export interface SyntheticResult { ok: boolean; durationMs: number; killSwitchEnabled: boolean; checks: SyntheticCheck[] }

/** Run the synthetic readiness sweep. Pure infra validation — creates nothing. */
export async function runSynthetic(): Promise<SyntheticResult> {
  const start = Date.now();
  const checks: SyntheticCheck[] = [];
  const add = (name: string, ok: boolean, critical: boolean, detail: string) => checks.push({ name, ok, critical, detail });

  // 1. Provider registry resolves to the bridge kind (pure — no side effects).
  let regOk = false;
  try { regOk = getWhatsAppProviderKind() === "bridge"; } catch { regOk = false; }
  add("registry_resolution", regOk, true, regOk ? "bridge" : "not_bridge");

  // 2. Adapter available (the resolved provider is the personal adapter).
  let adapterOk = false;
  try { adapterOk = getWhatsAppProvider().kind === "bridge"; } catch { adapterOk = false; }
  add("adapter_availability", adapterOk, true, adapterOk ? "personal_adapter" : "unavailable");

  // 3. Authentication path ready (worker credentials configured + webhook bearer).
  const authOk = personalTransportConfigured() && !!personalWebhookToken();
  add("authentication_path", authOk, true, authOk ? "configured" : "missing_credentials");

  // 4. Webhook endpoint reachability (self URL + inbound token present).
  const webhookOk = !!personalWebhookUrl() && !!personalWebhookToken();
  add("webhook_endpoint", webhookOk, true, webhookOk ? "configured" : "missing_url_or_token");

  // 5. Metrics endpoint scrape auth present.
  const metricsOk = !!(process.env.METRICS_TOKEN?.trim() || process.env.PERSONAL_WEBHOOK_TOKEN?.trim());
  add("metrics_endpoint", metricsOk, true, metricsOk ? "configured" : "missing_token");

  // 6. Worker health — READ-ONLY root ping. No instance, no session.
  const wh = await personalWorkerHealth();
  add("worker_health", wh.ok, true, wh.ok ? `latency_ms=${wh.latencyMs}` : "unreachable_or_unconfigured");

  // 7. Kill-switch status — informational, never a failure.
  const killOn = isPersonalWhatsappEnabled();
  add("kill_switch", true, false, killOn ? "enabled" : "disabled");

  const ok = checks.filter((c) => c.critical).every((c) => c.ok);
  const durationMs = Date.now() - start;
  recordSynthetic(
    { ok, durationSec: durationMs / 1000, checks: checks.map((c) => ({ name: c.name, ok: c.ok })), killSwitchEnabled: killOn },
    Math.floor(Date.now() / 1000),
  );
  return { ok, durationMs, killSwitchEnabled: killOn, checks };
}
