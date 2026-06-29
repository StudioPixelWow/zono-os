// ============================================================================
// 🛰️ Universal Context Engine™ — official service interface. Phase 27.2.
// ----------------------------------------------------------------------------
// THE entry point for every future AI capability. AI providers (OpenAI, Claude,
// Gemini, local) MUST obtain context here — never by reading repositories. No AI
// calls happen in this phase; this only returns the structured context package.
// ============================================================================
import "server-only";
import { buildContextPackage } from "./engine";
import type { ContextPackage, ContextRequest, ContextExplain } from "./types";

/** Resolve a full, permission-safe, size-budgeted context package. */
export async function getContext(req: ContextRequest): Promise<ContextPackage> {
  return buildContextPackage(req);
}

/** Convenience: just the explainability metadata for a request. */
export async function getContextExplain(req: ContextRequest): Promise<ContextExplain> {
  return (await buildContextPackage(req)).explain;
}
