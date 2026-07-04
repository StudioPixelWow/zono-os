// ============================================================================
// 💬 ZONO — WhatsApp Cloud connector · pure self-check. PHASE 48.0.
// Covers: config validation, webhook verify token, incoming parser (text/media/
// voice/location/button/interactive), duplicate detection key, status mapping,
// signature verify (HMAC), outbound payload builders. Offline & deterministic.
// ============================================================================
import {
  resolveCloudConfig, parseWebhook, mapStatus, isTerminalStatus, idempotencyKey,
  hashPhone, normalizePhone, parseSignatureHeader, timingSafeEqualHex, computeSignature,
  buildTextPayload, buildTemplatePayload,
} from "./core";

export interface WCheck { name: string; pass: boolean }
export interface WSelfCheck { ok: boolean; total: number; passed: number; checks: WCheck[] }

const webhook = (extra: Record<string, unknown> = {}) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "waba1", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { phone_number_id: "PNID" },
    contacts: [{ wa_id: "972501234567", profile: { name: "יוסי" } }],
    ...extra,
  } }] }],
});

export function runSelfCheck(): WSelfCheck {
  const checks: WCheck[] = []; const add = (n: string, p: boolean) => checks.push({ name: n, pass: p });

  // Config
  const live = resolveCloudConfig({ WHATSAPP_PHONE_NUMBER_ID: "P", WHATSAPP_ACCESS_TOKEN: "T", WHATSAPP_VERIFY_TOKEN: "V", WHATSAPP_APP_SECRET: "S" });
  add("config: live when token+phone present", live.mode === "live" && live.missing.length === 0 && live.graphVersion === "v21.0");
  const mock = resolveCloudConfig({});
  add("config: mock (no external calls) when unconfigured + lists missing", mock.mode === "mock" && mock.missing.includes("WHATSAPP_ACCESS_TOKEN"));

  // Phone hash / normalize
  add("phone: normalize +972 → 05…", normalizePhone("+972 50-123-4567") === "0501234567");
  add("phone: hash deterministic + matches conversation column", hashPhone("+972501234567") === hashPhone("0501234567") && hashPhone("0501234567").length === 64);

  // Incoming text
  const text = parseWebhook(webhook({ messages: [{ id: "wamid.1", from: "972501234567", timestamp: "1700000000", type: "text", text: { body: "שלום" } }] }));
  add("incoming text: parsed + name + phoneNumberId", text.messages.length === 1 && text.messages[0].type === "text" && text.messages[0].text === "שלום" && text.messages[0].name === "יוסי" && text.phoneNumberId === "PNID");

  // Incoming media (image) + voice note (audio.voice)
  const media = parseWebhook(webhook({ messages: [{ id: "wamid.2", from: "972501234567", timestamp: "1700000001", type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "תמונה" } }] }));
  add("incoming media: mediaId + mime + caption", media.messages[0].type === "image" && media.messages[0].mediaId === "MEDIA1" && media.messages[0].mime === "image/jpeg" && media.messages[0].text === "תמונה");
  const voice = parseWebhook(webhook({ messages: [{ id: "wamid.3", from: "972501234567", timestamp: "1700000002", type: "audio", audio: { id: "AUD1", mime_type: "audio/ogg", voice: true } }] }));
  add("incoming voice note: isVoice true + mediaId", voice.messages[0].type === "audio" && voice.messages[0].isVoice === true && voice.messages[0].mediaId === "AUD1");

  // Location + button + interactive
  const loc = parseWebhook(webhook({ messages: [{ id: "wamid.4", from: "972501234567", timestamp: "1700000003", type: "location", location: { latitude: 32.08, longitude: 34.78, name: "ת\"א" } }] }));
  add("incoming location: lat/lng", loc.messages[0].type === "location" && loc.messages[0].location?.lat === 32.08);
  const inter = parseWebhook(webhook({ messages: [{ id: "wamid.5", from: "972501234567", timestamp: "1700000004", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "yes", title: "כן" } } }] }));
  add("incoming interactive: id+title", inter.messages[0].type === "interactive" && inter.messages[0].interactive?.id === "yes" && inter.messages[0].text === "כן");

  // Duplicate detection key
  add("idempotency: stable key per wa message id", idempotencyKey("wamid.1") === "wa:wamid.1" && idempotencyKey("wamid.1") === idempotencyKey("wamid.1"));

  // Status updates
  const statuses = parseWebhook(webhook({ statuses: [{ id: "wamid.1", status: "delivered", timestamp: "1700000005", recipient_id: "972501234567" }, { id: "wamid.2", status: "failed", timestamp: "1700000006", errors: [{ code: 131047, title: "re-engagement" }] }] }));
  add("status: delivered + failed(with error) parsed", statuses.statuses.length === 2 && statuses.statuses[0].status === "delivered" && statuses.statuses[1].status === "failed" && statuses.statuses[1].errorCode === 131047);
  add("status: mapping + terminal", mapStatus("read") === "read" && isTerminalStatus("failed") && isTerminalStatus("read") && !isTerminalStatus("sent"));

  // Signature verify (HMAC)
  const body = JSON.stringify({ hi: 1 }); const secret = "app_secret";
  const sig = computeSignature(secret, body);
  add("signature: valid header verifies", parseSignatureHeader(`sha256=${sig}`) === sig && timingSafeEqualHex(computeSignature(secret, body), sig));
  add("signature: tampered body fails", !timingSafeEqualHex(computeSignature(secret, body + "x"), sig) && parseSignatureHeader("bad") === null);

  // Outbound payload builders (mock-safe; client posts these)
  const tp = buildTextPayload({ to: "0501234567", body: "היי" });
  add("outbound text payload: 972 number + text body", tp.to === "972501234567" && (tp.text as { body: string }).body === "היי" && tp.type === "text");
  const tmpl = buildTemplatePayload("0501234567", "welcome", "he");
  add("outbound template payload: name+lang", (tmpl.template as { name: string }).name === "welcome" && tmpl.type === "template");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
