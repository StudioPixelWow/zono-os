// ============================================================================
// ZONO — Agency Identity Resolver service (Phase 26.1, SERVER-ONLY).
// Loads the org's known agencies + aliases, resolves raw text against them, and
// persists a resolution candidate with confidence + evidence. Auto-CREATION of
// brand-new agencies is added in Phase 26.2 (the auto-builder); here we resolve
// to existing agencies or leave a candidate for review.
// ============================================================================
import "server-only";
import { AgencyService } from "../service";
import { listOrgAliases, findAgencyIdByAlias } from "./aliasRepository";
import { createCandidate } from "./candidateRepository";
import { resolveAgencyText } from "./resolver";
import { toKnownAgency, type KnownAgency, type ResolutionInput, type ResolutionResult } from "./types";

export interface ResolveOutcome {
  result: ResolutionResult;
  candidateId: string;
  matchedAgencyId: string | null;
}

/**
 * Resolve raw agency text: fast alias hit → else rank known agencies → persist a
 * candidate. Returns the ranked result + the stored candidate id. Never creates
 * a new agency (that is Phase 26.2). Never throws on a logging hiccup.
 */
export async function resolveAndStore(input: ResolutionInput): Promise<ResolveOutcome> {
  const raw = input.rawText?.trim() ?? "";
  if (!raw) throw new Error("empty_raw_text");

  // Fast path: exact alias match.
  const aliasMatch = await findAgencyIdByAlias(raw).catch(() => null);

  const [agencies, aliasMap] = await Promise.all([
    AgencyService.list(500),
    listOrgAliases().catch(() => new Map<string, string[]>()),
  ]);
  const known: KnownAgency[] = agencies.map((a) => toKnownAgency(a, aliasMap.get(a.id) ?? []));

  const result = resolveAgencyText(raw, known);

  // Alias hit overrides ranking confidence.
  const matchedAgencyId = aliasMatch ?? (result.bestMatch?.agencyId ?? null);
  const status = aliasMatch ? "accepted" : result.status;

  const candidate = await createCandidate({
    rawText: raw, normalizedName: result.normalizedName, source: input.source ?? null, sourceRef: input.sourceRef ?? null,
    status, confidence: result.bestMatch?.confidence ?? (aliasMatch ? 1 : null), matchedAgencyId,
    evidence: {
      candidates: result.candidates.slice(0, 5).map((c) => ({ agencyId: c.agencyId, confidence: c.confidence, reasons: c.reasons })),
      aliasMatch: Boolean(aliasMatch),
    },
  });

  return { result, candidateId: candidate.id, matchedAgencyId };
}
