// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS PLATFORM OS — SELF TEST (Part 10).
//
// Runnable gate: `npx tsx src/lib/whatsapp/business/qa.ts`. Behavioral tests of
// the pure logic (template variables, health mapping, HMAC signature roundtrip,
// payload builders) + source-level guards locking the security and architecture
// invariants: fail-closed webhook, exactly-once receipts, encrypted tokens, no
// new conversation/message model (reuses the canonical Communication OS model),
// notification provider layer (WhatsApp real, others skip honestly), delivery
// idempotency, cross-org isolation, interactive/media completeness. Exits non-zero
// on any failure.
// ============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countTemplateVariables, validateTemplateVariables } from "./template-vars";
import { healthForStatus } from "./health";
import { computeSignature, parseSignatureHeader, timingSafeEqualHex, buildTextPayload, buildTemplatePayload } from "../cloud/core";

const ROOT = process.cwd();
const BIZ = join(ROOT, "src/lib/whatsapp/business");
const NOTIFY = join(ROOT, "src/lib/notify");
const API = join(ROOT, "src/app/api/whatsapp");
const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.error("  ✗ " + name); } };

const oauth = read(join(BIZ, "oauth.ts"));
const tokens = read(join(BIZ, "tokens.ts"));
const messages = read(join(BIZ, "messages.ts"));
const webhooks = read(join(BIZ, "webhooks.ts"));
const account = read(join(BIZ, "account.ts"));
const actions = read(join(BIZ, "actions.ts"));
const cbRoute = read(join(API, "oauth/callback/route.ts"));
const startRoute = read(join(API, "oauth/route.ts"));
const webhookRoute = read(join(API, "webhook/route.ts"));
const disconnect = read(join(API, "disconnect/route.ts"));
const notifyTypes = read(join(NOTIFY, "types.ts"));
const notifyProviders = read(join(NOTIFY, "providers.ts"));
const notifyDeliver = read(join(NOTIFY, "deliver.ts"));
const mig = read(join(ROOT, "supabase/migrations/20261101120000_whatsapp_business.sql"));
const guard = read(join(ROOT, "scripts/check-journey-boundaries.mjs"));

console.log("\nWhatsApp Business Platform OS (6.6) — SELF TEST\n");

// ── Behavioral ────────────────────────────────────────────────────────────
check("1.1 template variable count is distinct-placeholder aware", countTemplateVariables("Hi {{1}}, code {{2}} (again {{1}})") === 2 && countTemplateVariables("no vars") === 0);
check("1.2 template variable validation: count + non-empty",
  validateTemplateVariables(2, ["a", "b"]).ok && !validateTemplateVariables(2, ["a"]).ok && !validateTemplateVariables(1, [""]).ok);
check("1.3 health mapping (connected→healthy, expired→needs_reconnect, pending_number)",
  healthForStatus("connected") === "healthy" && healthForStatus("expired") === "needs_reconnect" && healthForStatus("pending_number") === "pending_number" && healthForStatus("disconnected") === "not_connected");
check("1.4 HMAC signature roundtrip verifies and rejects tampering", (() => {
  const secret = "app-secret", body = '{"x":1}';
  const good = computeSignature(secret, body);
  const parsed = parseSignatureHeader(`sha256=${good}`);
  const bad = computeSignature(secret, '{"x":2}');
  return parsed === good && timingSafeEqualHex(parsed!, good) && !timingSafeEqualHex(parsed!, bad);
})());
check("1.5 buildTextPayload maps 05x→972x and sets type=text", (() => {
  const p = buildTextPayload({ to: "0501234567", body: "hi" }) as { to: string; type: string };
  return p.to === "972501234567" && p.type === "text";
})());
check("1.6 buildTemplatePayload carries name + language + components", (() => {
  const p = buildTemplatePayload("0501234567", "welcome", "he", [{ type: "body" }]) as { type: string; template: { name: string; language: { code: string }; components: unknown[] } };
  return p.type === "template" && p.template.name === "welcome" && p.template.language.code === "he" && p.template.components.length === 1;
})());

// ── Part 3 · webhook hardening ───────────────────────────────────────────────
check("2.1 webhook signature verification FAILS CLOSED (no secret → false)",
  /if \(!secret\) return false/.test(strip(webhooks)) && webhooks.includes("computeSignature"));
check("2.2 exactly-once: unique (phone_number_id, event_id) receipt ledger",
  mig.includes("uq_whatsapp_webhook_receipt unique (phone_number_id, event_id)") && webhooks.includes("recordReceiptOnce"));
check("2.3 webhook route verifies strict + 401 + all-duplicate short-circuit",
  webhookRoute.includes("verifySignatureStrict") && webhookRoute.includes("status: 401") && webhookRoute.includes("recordReceiptOnce") && webhookRoute.includes("duplicate: true"));

// ── Part 1/8 · tokens + security ──────────────────────────────────────────────
check("2.4 tokens ENCRYPTED before storage (encryptSecret on write)", tokens.includes("encryptSecret(input.accessToken)"));
check("2.5 browser projection (toPublic) exposes NO token field",
  !/accessToken|_encrypted/.test(strip(tokens).split("export function toPublic")[1] ?? ""));
check("2.6 whole business lib is server-only (import 'server-only' or 'use server')",
  [oauth, tokens, messages, webhooks, account].every((f) => f.includes('import "server-only"')) && actions.includes('"use server"'));
check("2.7 no token ever console-logged in the business lib",
  ![oauth, tokens, messages, webhooks].some((f) => /console\.(log|error|warn)\([^)]*[Tt]oken/.test(f)));
check("2.8 the connect audit records wabaId + counts only — never a token",
  cbRoute.includes("metadata: { wabaId, numbers: numbers.length }") && !/metadata:[^}]*access_token/.test(cbRoute));
check("2.9 callback binds state to the CURRENT session user (no cross-user)",
  cbRoute.includes("payload.userId !== sc.user.id") && cbRoute.includes("payload.orgId !== sc.profile.org_id"));
check("2.10 start route redirects to Meta ONLY when configured AND enabled", startRoute.includes("cfg.ready"));

// ── Part 4/5 · reuse canonical model (no duplication) ────────────────────────
check("2.11 outbound reuses the EXISTING whatsapp_conversations / whatsapp_messages tables",
  messages.includes("whatsapp_conversations") && messages.includes("whatsapp_messages") && messages.includes("contact_phone_hash"));
check("2.12 NO new conversation/message table is created in the migration",
  !/create table[^;]*\b(conversations|messages)\b/i.test(mig.replace(/webhook_receipts|notification_deliveries/g, "")));
check("2.13 no new Conversation/Message model type is defined in the business layer",
  !read(join(BIZ, "types.ts")).includes("interface Conversation") && !messages.includes("interface Message"));

// ── Part 2 · messaging completeness ──────────────────────────────────────────
check("2.14 media kinds image/document/video/audio supported",
  /WaMediaKind = "image" \| "document" \| "video" \| "audio"/.test(read(join(BIZ, "types.ts"))) && messages.includes("sendMedia"));
check("2.15 interactive buttons + list + contacts + location senders present",
  messages.includes("sendButtons") && messages.includes("sendList") && messages.includes("sendContacts") && messages.includes("sendLocation"));
check("2.16 delivered/read/failed statuses are mapped (reuses cloud mapStatus)",
  read(join(ROOT, "src/lib/whatsapp/cloud/core.ts")).includes('case "delivered": return "delivered"'));

// ── Part 6 · notification provider layer ─────────────────────────────────────
check("2.17 notification channels declared: whatsapp + email + push + sms",
  /NOTIFICATION_CHANNELS[\s\S]*whatsapp[\s\S]*email[\s\S]*push[\s\S]*sms/.test(notifyTypes));
check("2.18 WhatsApp provider is REAL (sends), future channels skip honestly (no mocks)",
  notifyProviders.includes("sendTemplate") && notifyProviders.includes("sendText") && notifyProviders.includes("not_configured") && !/mock|fake|stub-send/i.test(strip(notifyProviders)));
check("2.19 delivery is idempotent (unique dedup_key + claim-first insert)",
  mig.includes("uq_notification_delivery unique (org_id, dedup_key)") && notifyDeliver.includes("duplicate_delivery"));

// ── Part 8 · cross-org isolation + audit ─────────────────────────────────────
check("2.20 notification_deliveries cross-org isolated (RLS via current_org_id)",
  /policy notification_deliveries_select[\s\S]*current_org_id\(\)/.test(mig));
check("2.21 connect + disconnect are audited",
  cbRoute.includes('action: "whatsapp.connected"') && disconnect.includes('action: "whatsapp.disconnected"'));
check("2.22 disconnect is manager-gated (fail-closed has_min_role)",
  disconnect.includes('has_min_role') && disconnect.includes('status: 403'));

// ── Architecture ─────────────────────────────────────────────────────────────
check("2.23 least-privilege WhatsApp scopes requested",
  oauth.includes("whatsapp_business_messaging") && oauth.includes("whatsapp_business_management"));
check("2.24 boundary guard registers the two new Tier-A composition dirs",
  guard.includes('"src/lib/whatsapp/business"') && guard.includes('"src/lib/notify"'));

console.log(`\nWhatsApp Business Platform OS (6.6) SELF TEST: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
