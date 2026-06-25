// ============================================================================
// ZONO — AI Copilot public surface (pure layers only; context/actions are
// server-only and imported directly where needed). AI augments; it never
// replaces the deterministic engines.
// ============================================================================
export * from "./types";
export {
  sanitizeContext, assertNoSecrets, buildMessages, buildCacheKey, computeDataHash, ZONO_SYSTEM_PROMPT,
} from "./prompts";
export { selectAiProvider, aiEnabled, generateWithProvider } from "./engine";
export { buildWhatsapp, buildEmail, WHATSAPP_LABEL, EMAIL_LABEL } from "./communication";
export { buildSellerCallBrief, buildBuyerCallBrief, buildMeetingBrief, buildAfterCallSummary } from "./strategy";
export { buildMorningBrief, buildOfficeBrief, buildEntitySummary } from "./summaries";
export { nextBestAction, buildExplainOpportunity } from "./recommendations";
