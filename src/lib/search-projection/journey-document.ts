// ============================================================================
// 🧭 ZONO OS 2.0 — Batch 5.6B · Canonical Journey search-document builder (PURE).
//
// A journey has no title of its own — it is the canonical lifecycle spine that
// wraps a SUBJECT (property / buyer / seller / lead / deal). This builder turns
// a `journeys` row + its resolved SUBJECT row into the SAME canonical
// SearchDocument shape every other entity uses, so journeys become first-class,
// event-driven, canonical-first search results — distinct from (and
// complementary to) the subject's own result:
//   subject result : "נכס — הרצל 12"
//   journey result : "מסע הנכס — הרצל 12 · שיווק"
//
// Reuses: SearchDocument shape, normalize helpers, the per-subject title/route
// config (SEARCH_CONFIG), and the canonical Journey stage machines (stageLabel).
// It NEVER indexes private evidence, notes, AI memory, phones or raw payloads.
// Pure + deterministic + offline-testable — the server layer supplies the rows.
// ============================================================================
import { buildNormalizedText, buildKeywords } from "./normalize";
import { SEARCH_CONFIG, pick, pickAll, type SearchDocument } from "./document";
import { isJourneyType, stageLabel, type JourneyType } from "@/lib/journey-canonical";

type Row = Record<string, unknown>;

/** Journey-type → Hebrew TITLE prefix ("מסע ה…" — used in the result title). */
export const JOURNEY_TITLE_PREFIX: Record<JourneyType, string> = {
  property: "מסע הנכס",
  buyer: "מסע הקונה",
  seller: "מסע המוכר",
  lead: "מסע הליד",
  deal: "מסע העסקה",
};

/** Journey-type → Hebrew CATEGORY label ("מסע …" — used in the subtitle/haystack). */
export const JOURNEY_TYPE_LABEL: Record<JourneyType, string> = {
  property: "מסע נכס",
  buyer: "מסע קונה",
  seller: "מסע מוכר",
  lead: "מסע ליד",
  deal: "מסע עסקה",
};

/** Why a journey could not be indexed — recorded as a delivery diagnostic. */
export type JourneySkipReason =
  | "unsupported_type"   // journey_type is not one of the five canonical types
  | "missing_subject"    // no subject entity id on the journey row
  | "subject_not_found"  // subject row could not be resolved
  | "no_subject_title"   // subject has no safe title (never fabricate one)
  | "invalid_route";     // no real route to open → never index a dead result

export interface JourneyDocumentResult {
  doc: SearchDocument | null;
  skipReason?: JourneySkipReason;
}

function str(row: Row, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isValidRoute(route: string): boolean {
  return route.startsWith("/") && route.length > 1;
}

/**
 * Build the canonical search document for one journey, given its resolved
 * subject row (or null when the subject is missing). Returns `{ doc: null,
 * skipReason }` on any skip — the caller records the reason (never silent).
 */
export function buildJourneySearchDocument(
  journey: Row,
  subject: Row | null,
  orgId: string,
  eventId: string | null = null,
): JourneyDocumentResult {
  const journeyId = typeof journey.id === "string" ? journey.id : null;
  if (!orgId || !journeyId) return { doc: null, skipReason: "missing_subject" };

  // journey_type drives the machine; entity_type/entity_id name the subject.
  const journeyType = str(journey, "journey_type") ?? str(journey, "entity_type");
  if (!journeyType || !isJourneyType(journeyType)) return { doc: null, skipReason: "unsupported_type" };
  const jt = journeyType as JourneyType;

  const subjectType = str(journey, "entity_type") ?? jt;
  const subjectId = str(journey, "entity_id");
  if (!subjectId) return { doc: null, skipReason: "missing_subject" };
  if (!subject) return { doc: null, skipReason: "subject_not_found" };

  // Title comes from the REAL subject entity, via its existing title config.
  const subjectCfg = SEARCH_CONFIG[subjectType];
  if (!subjectCfg) return { doc: null, skipReason: "unsupported_type" };
  const subjectTitle = pick(subject, subjectCfg.title);
  if (!subjectTitle) return { doc: null, skipReason: "no_subject_title" };

  // Route: reuse the subject's real cockpit route (deal → /deals). Never a dead route.
  const route = subjectCfg.route(subjectId);
  if (!isValidRoute(route)) return { doc: null, skipReason: "invalid_route" };

  const currentStage = str(journey, "current_stage") ?? "";
  const stageLbl = currentStage ? stageLabel(jt, currentStage) : null;
  const status = str(journey, "status");
  const source = str(journey, "source");
  const stageEnteredAt = str(journey, "stage_entered_at");
  const meta = (journey.metadata && typeof journey.metadata === "object" ? journey.metadata : {}) as Row;
  const fallback = journey.fallback === true || meta.fallback === true;
  const blocked = meta.blocked === true || status === "blocked" || currentStage === "blocked";

  const title = `${JOURNEY_TITLE_PREFIX[jt]} — ${subjectTitle}`;
  const subtitleParts = [JOURNEY_TYPE_LABEL[jt], stageLbl].filter(Boolean) as string[];
  const subtitle = subtitleParts.length ? subtitleParts.join(" · ") : null;

  // Safe searchable haystack: subject title + subject subtitle tokens (city /
  // neighborhood / address context), journey category labels, stage key + Hebrew
  // stage label, journey type + status. NO phones, notes, evidence or payloads.
  const subjectSubtitleParts = pickAll(subject, subjectCfg.subtitle);
  const subjectSafeParts = pickAll(subject, subjectCfg.safeText);
  const safeParts = [
    subjectTitle,
    ...subjectSubtitleParts,
    ...subjectSafeParts,
    JOURNEY_TITLE_PREFIX[jt],
    JOURNEY_TYPE_LABEL[jt],
    currentStage,
    stageLbl,
    jt,
    status,
  ].filter(Boolean) as string[];

  const metadata: Record<string, unknown> = {
    journeyType: jt,
    subjectEntityType: subjectType,
    subjectEntityId: subjectId,
    currentStage: currentStage || null,
    canonicalStageLabel: stageLbl,
    status: status ?? null,
    source: source ?? null,
    fallback,
    blocked,
    stageEnteredAt: stageEnteredAt ?? null,
  };

  const doc: SearchDocument = {
    organization_id: orgId,
    entity_type: "journey",
    entity_id: journeyId,
    title,
    subtitle,
    normalized_text: buildNormalizedText(safeParts, []),
    keywords: buildKeywords(safeParts, []),
    route,
    owner_user_id: str(journey, "owner_user_id"),
    visibility: "internal",
    metadata,
    source_updated_at: str(journey, "updated_at") ?? stageEnteredAt ?? str(journey, "created_at"),
    event_id: eventId,
  };
  return { doc };
}
