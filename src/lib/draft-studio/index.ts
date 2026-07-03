// ============================================================================
// ✉️ ZONO — Communication Intelligence™ & AI Draft Studio — barrel. 30.3.
// Entity-agnostic communication engine over the existing engines (read-only).
// No engine modified; no business logic duplicated; every draft is approval-gated
// and NEVER sent automatically. Evidence-only.
// ============================================================================
export { buildDraftBundle } from "./generate";
export { composeBody, subjectLine } from "./compose";
export { runSelfCheck } from "./qa";
export { generateDraft } from "./service";
export * from "./types";
