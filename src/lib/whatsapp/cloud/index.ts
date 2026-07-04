// 💬 ZONO — WhatsApp Cloud API connector barrel. PHASE 48.0.
// Connects the EXISTING WhatsApp OS to the real Meta Cloud API. No new table,
// no new inbox, no new agent; nothing auto-sends.
export * from "./core";
export { runSelfCheck } from "./qa";
export {
  cloudConfig, verifyWebhook, verifySignature, processWebhook, sendText, recipientForConversation,
  type ProcessResult, type SendResult,
} from "./service";
