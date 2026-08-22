// ============================================================================
// ZONO — Deal-stage hover preview: PURE core (dependency-free, client-safe,
// unit-tested). The single source of truth for which stages the home-dashboard
// "העסקאות שלי" hover preview accepts, their Hebrew presentation, the bounded
// item cap, and small pure helpers. Server selector + client both import this —
// no duplicated stage/label logic, and a client-supplied stage is validated here
// before any DB access (never trusted blindly).
// ============================================================================

/** Max deals shown in a single stage preview (bounded — never dump the stage). */
export const PREVIEW_MAX = 4;

/** Valid NON-TERMINAL projection stage keys (deal_profiles.deal_stage) the home
 *  pipeline can surface. Terminal states (closed/lost) are never previewed. */
export const PREVIEW_STAGE_KEYS = [
  "new_opportunity", "contacted", "meeting_scheduled", "property_visit",
  "negotiation", "offer_sent", "offer_received", "agreement_draft",
  "legal_review", "signed",
] as const;
export type PreviewStageKey = (typeof PREVIEW_STAGE_KEYS)[number];

/** Type-guard — a client-supplied stage is only honored when it is one of the
 *  known non-terminal projection stages. */
export function isPreviewStageKey(s: unknown): s is PreviewStageKey {
  return typeof s === "string" && (PREVIEW_STAGE_KEYS as readonly string[]).includes(s);
}

/** Canonical Hebrew label per stage (mirrors DEAL_STAGE_LABEL for these keys).
 *  Presentation boundary — a raw enum never reaches the UI. */
export const STAGE_LABEL_HE: Record<PreviewStageKey, string> = {
  new_opportunity: "הזדמנות חדשה",
  contacted: "יצירת קשר",
  meeting_scheduled: "פגישה נקבעה",
  property_visit: "ביקור בנכס",
  negotiation: "משא ומתן",
  offer_sent: "הצעה נשלחה",
  offer_received: "הצעה התקבלה",
  agreement_draft: "טיוטת הסכם",
  legal_review: "בדיקה משפטית",
  signed: "נחתם",
};

/** Hebrew label for a stage; unknown/internal keys collapse to a safe Hebrew
 *  word — a raw snake_case enum is NEVER surfaced. */
export function stageLabelHe(s: string): string {
  return isPreviewStageKey(s) ? STAGE_LABEL_HE[s] : "שלב";
}

export interface DealPreviewItem {
  id: string;
  propertyTitle: string;
  area: string | null;
  price: number | null;
  image: string | null;
  agentName: string | null;
  agentPhoto: string | null;
  daysInStage: number | null;
  detail: string | null;
}
export interface DealStagePreview {
  stage: string;
  stageLabel: string;
  total: number;
  items: DealPreviewItem[];
}

/** Bound any list to the preview cap (pure). */
export function boundPreviewItems<T>(items: readonly T[]): T[] {
  return items.slice(0, PREVIEW_MAX);
}

/** Whole days since an ISO timestamp (null when missing/invalid). Never negative. */
export function daysSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

/** Compact "time in stage" phrase from a day count (Hebrew; null when unknown). */
export function daysInStageLabel(days: number | null): string | null {
  if (days == null) return null;
  if (days <= 0) return "נכנס היום";
  if (days === 1) return "יום בשלב";
  return `${days} ימים בשלב`;
}
