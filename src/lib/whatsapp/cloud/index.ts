// 💬 ZONO — WhatsApp Cloud API connector barrel. PHASE 48.0.
// Connects the EXISTING WhatsApp OS to the real Meta Cloud API. No new table,
// no new inbox, no new agent; nothing auto-sends.
export * from "./core";
export * from "./hardening";
export { runSelfCheck } from "./qa";
export {
  cloudConfig, verifyWebhook, verifySignature, processWebhook, recipientForConversation,
  sendText, sendTemplate, sendMedia, sendDocument, sendLocation, syncTemplates,
  type ProcessResult, type SendResult, type StoredMedia, type TemplateSyncResult,
} from "./service";
