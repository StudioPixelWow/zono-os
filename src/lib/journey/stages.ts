/**
 * Property Journey — client-safe stage model (no server imports).
 *
 * The journey is the property lifecycle. Stage order drives the progress %,
 * each stage carries a required-actions checklist, and stall detection is a
 * pure function of the last-activity timestamp.
 */
import type { JourneyStage } from "@/lib/supabase/types";

/** Ordered stages — index drives progress %. */
export const JOURNEY_STAGES: JourneyStage[] = [
  "new",
  "information_collection",
  "marketing_preparation",
  "published",
  "active_marketing",
  "negotiation",
  "deal_signed",
  "closed",
];

export interface StageDef {
  key: JourneyStage;
  label: string;
  short: string;
  icon: string;
  description: string;
}

export const STAGE_DEFS: Record<JourneyStage, StageDef> = {
  new: {
    key: "new",
    label: "נכס חדש",
    short: "חדש",
    icon: "Sparkles",
    description: "הנכס נוצר במערכת. השלב הראשון לפני איסוף המידע.",
  },
  information_collection: {
    key: "information_collection",
    label: "איסוף מידע",
    short: "איסוף מידע",
    icon: "MapPin",
    description: "השלמת פרטי הנכס: מיקום, מחיר, חדרים, שטח ותמונות.",
  },
  marketing_preparation: {
    key: "marketing_preparation",
    label: "הכנה לשיווק",
    short: "הכנה לשיווק",
    icon: "Megaphone",
    description: "תיאור שיווקי, תמונה ראשית וגלריה מוכנים לפרסום.",
  },
  published: {
    key: "published",
    label: "פורסם",
    short: "פורסם",
    icon: "Send",
    description: "הנכס פורסם וזמין לצפייה.",
  },
  active_marketing: {
    key: "active_marketing",
    label: "שיווק פעיל",
    short: "שיווק פעיל",
    icon: "Flame",
    description: "קידום פעיל, פניות וצפיות מתקבלות.",
  },
  negotiation: {
    key: "negotiation",
    label: "משא ומתן",
    short: "משא ומתן",
    icon: "MessageCircle",
    description: "מתנהל משא ומתן מול קונה פוטנציאלי.",
  },
  deal_signed: {
    key: "deal_signed",
    label: "עסקה נחתמה",
    short: "עסקה נחתמה",
    icon: "UserCheck",
    description: "ההסכם נחתם. לקראת סגירה.",
  },
  closed: {
    key: "closed",
    label: "סגור",
    short: "סגור",
    icon: "Shield",
    description: "המסע הושלם — הנכס נמכר/הושכר או הוסר.",
  },
};

export const TERMINAL_STAGE: JourneyStage = "closed";

export function stageIndex(stage: JourneyStage): number {
  return Math.max(0, JOURNEY_STAGES.indexOf(stage));
}

/** Base progress from the stage's ordinal position (0..7 → 0..100). */
export function stageProgress(stage: JourneyStage): number {
  return Math.round((stageIndex(stage) / (JOURNEY_STAGES.length - 1)) * 100);
}

export function nextStage(stage: JourneyStage): JourneyStage | null {
  const i = stageIndex(stage);
  return i < JOURNEY_STAGES.length - 1 ? JOURNEY_STAGES[i + 1] : null;
}

export function prevStage(stage: JourneyStage): JourneyStage | null {
  const i = stageIndex(stage);
  return i > 0 ? JOURNEY_STAGES[i - 1] : null;
}

// ── Required actions (per-stage checklist) ───────────────────────────────────

export interface RequiredAction {
  key: string;
  label: string;
  done: boolean;
}

/** Everything the checklist needs, gathered by the caller from the property. */
export interface JourneyContext {
  price: number | null;
  city: string | null;
  address: string | null;
  rooms: number | null;
  sizeSqm: number | null;
  hasDescription: boolean;
  hasMarketing: boolean;
  hasPrimaryImage: boolean;
  hasCoords: boolean;
  mediaCount: number;
}

/** The checklist for completing a given stage. */
export function requiredActions(
  stage: JourneyStage,
  c: JourneyContext,
): RequiredAction[] {
  switch (stage) {
    case "new":
      return [
        { key: "city", label: "הוספת עיר/מיקום", done: !!c.city },
        { key: "price", label: "הזנת מחיר", done: !!c.price && c.price > 0 },
      ];
    case "information_collection":
      return [
        { key: "rooms", label: "מספר חדרים", done: c.rooms != null && c.rooms > 0 },
        { key: "size", label: "שטח במ״ר", done: c.sizeSqm != null && c.sizeSqm > 0 },
        { key: "address", label: "כתובת מדויקת", done: !!c.address },
        { key: "photo", label: "תמונה אחת לפחות", done: c.mediaCount >= 1 },
      ];
    case "marketing_preparation":
      return [
        {
          key: "desc",
          label: "תיאור שיווקי",
          done: c.hasMarketing || c.hasDescription,
        },
        { key: "primary", label: "תמונה ראשית", done: c.hasPrimaryImage },
        { key: "gallery", label: "3 תמונות לפחות", done: c.mediaCount >= 3 },
      ];
    case "published":
      return [
        { key: "coords", label: "מיקום על המפה", done: c.hasCoords },
        { key: "gallery5", label: "5 תמונות לפחות", done: c.mediaCount >= 5 },
      ];
    case "active_marketing":
      return [
        { key: "marketing", label: "תיאור שיווקי מלא", done: c.hasMarketing },
      ];
    default:
      return [];
  }
}

export function missingActions(
  stage: JourneyStage,
  c: JourneyContext,
): RequiredAction[] {
  return requiredActions(stage, c).filter((a) => !a.done);
}

/**
 * Completion % = progress through stages + the current stage's checklist ratio,
 * so a half-finished stage reads as partial progress (not a hard step).
 */
export function completionPercent(
  stage: JourneyStage,
  c: JourneyContext,
): number {
  if (stage === TERMINAL_STAGE) return 100;
  const total = JOURNEY_STAGES.length - 1;
  const actions = requiredActions(stage, c);
  const ratio = actions.length
    ? actions.filter((a) => a.done).length / actions.length
    : 1;
  return Math.round(((stageIndex(stage) + ratio) / total) * 100);
}

// ── Stall / overdue detection ────────────────────────────────────────────────

export const STALLED_DAYS = 14;

export function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86_400_000);
}

/** A non-terminal property with no activity for STALLED_DAYS is "stalled". */
export function isStalled(lastActivityAt: string | null, stage: JourneyStage): boolean {
  if (stage === TERMINAL_STAGE) return false;
  return daysSince(lastActivityAt) >= STALLED_DAYS;
}
