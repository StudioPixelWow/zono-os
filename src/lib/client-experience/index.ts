// ============================================================================
// 🤝 ZONO — Client Experience 2.0 — barrel. PHASE 56.0.
// Unified, live client timeline + notification center for the EXISTING buyer/
// seller portals (no new portal). Isolation is inherited from the portals'
// authenticated getters and re-enforced by pure redaction. Nothing bypasses RLS.
// ============================================================================
export {
  CLIENT_EXPERIENCE_VERSION, KIND_HE, KIND_ICON, PRIVACY_NOTE,
  type ClientRole, type TimelineKind, type ClientTimelineItem, type ClientNotification,
  type ClientBlock, type ClientExperience, type ClientSourceBundle, type SourceItem,
} from "./types";
export { assembleClientExperience, redactItems, scopedAnswerGuard } from "./assemble";
export { getBuyerExperience, getSellerExperience } from "./service";
export { runSelfCheck } from "./qa";
