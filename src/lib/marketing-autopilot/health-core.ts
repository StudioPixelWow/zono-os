// ============================================================================
// ZONO — Marketing Autopilot: PURE health + recommendation + weekly-plan core
// (no IO, no clock, no LLM). Given the REAL marketing signals for ONE property,
// derive its marketing state, the human-readable reasons (each backed by a real
// number the server supplied), the SINGLE primary recommended action (P0/P1/P2
// ladder), and a prepared weekly plan skeleton. An LLM NEVER decides priority or
// invents a metric — the server passes only real counts; this file decides.
// ============================================================================

export type MarketingState =
  | "not_started"        // never marketed
  | "active"             // has a live campaign / future post
  | "healthy"            // marketed + producing activity
  | "needs_content"      // missing photo / approved creative
  | "needs_distribution" // no future marketing scheduled
  | "needs_refresh"      // stale creative / long since last post
  | "needs_followup"     // matches unsent / interest without viewing
  | "strong_interest"    // multiple interested buyers
  | "needs_strategy"     // viewings but no progress
  | "blocked";           // failed publication / unavailable / disconnected

export type MarketingActionType =
  | "fix_publication" | "prepare_creative" | "start_marketing" | "schedule_marketing"
  | "send_matches" | "interest_followup" | "refresh_creative" | "expand_groups"
  | "discuss_strategy" | "collect_feedback" | "prepare_week" | "none";

export type ActionPriority = "P0" | "P1" | "P2" | "none";

const MARKETABLE = new Set(["active", "published", "ready", "under_offer", "in_contract"]);
const UNAVAILABLE = new Set(["sold", "rented", "withdrawn", "archived"]);

// Deterministic thresholds (single source of truth).
export const STALE_CREATIVE_REUSE = 4;    // same creative reused N publications → refresh
export const STALE_DAYS = 9;              // last publication older than N days → refresh
export const STRONG_INTEREST_COUNT = 3;
export const ACTIVE_MEANINGFUL_DAYS = 14;

export interface MarketingSignals {
  propertyStatus: string;
  daysListed: number;
  hasActiveCampaign: boolean;
  publications: number;
  failedPublications: number;
  hasFuturePublication: boolean;
  lastPublishedDaysAgo: number;   // Infinity if never
  activeGroups: number;
  usedGroups: number;             // active groups this property published to
  unusedGroups: number;           // active groups never used for this property
  hasPrimaryImage: boolean;
  approvedCreativeExists: boolean;
  selectedCreativeReady: boolean | null; // readiness of an approved creative (null = none selected)
  creativeReuseCount: number;     // recent publications reusing the same creative
  strongMatches: number;
  strongUnsent: number;           // strong matches not yet recommended
  interested: number;
  interestedNoViewing: number;    // interested buyers without a viewing
  viewingsCompleted: number;
  viewingsNoProgress: boolean;    // completed viewings, no deal/offer
  hasOpenDeal: boolean;
  facebookConnected: boolean;
  canPromote: boolean;            // manager (may auto-promote creative)
  sellerMarketingHealth: string;  // seller-lifecycle health (coherence)
}

export function isMarketable(status: string): boolean { return MARKETABLE.has(status); }
export function isUnavailable(status: string): boolean { return UNAVAILABLE.has(status); }

export interface MarketingRecommendation {
  priority: ActionPriority;
  actionType: MarketingActionType;
  title: string;
  reason: string;
  canPrepareAutomatically: boolean;   // ZONO can assemble a draft without the human first
  requiresApproval: boolean;          // executing needs an explicit human approval
}

/** The SINGLE primary recommended marketing action — first match down a deterministic ladder. */
export function deriveMarketingRecommendation(s: MarketingSignals): MarketingRecommendation {
  if (isUnavailable(s.propertyStatus)) return { priority: "none", actionType: "none", title: "הנכס אינו זמין לשיווק", reason: "הנכס נמכר/הוסר — אין פעולת שיווק.", canPrepareAutomatically: false, requiresApproval: false };

  // ── P0 — blocking, must act now ────────────────────────────────────────────
  if (s.failedPublications > 0) return { priority: "P0", actionType: "fix_publication", title: "טיפול בפרסום שנכשל", reason: s.failedPublications === 1 ? "פרסום אחד נכשל וממתין לטיפול." : `${s.failedPublications} פרסומים נכשלו וממתינים לטיפול.`, canPrepareAutomatically: false, requiresApproval: true };
  if (s.selectedCreativeReady === false) return { priority: "P0", actionType: "prepare_creative", title: "הכשרת הקריאייטיב לפרסום", reason: "הקריאייטיב הנבחר עדיין לא מוכן לפרסום בפייסבוק.", canPrepareAutomatically: s.canPromote, requiresApproval: true };

  // ── P1 — important ─────────────────────────────────────────────────────────
  if (s.publications === 0 && !s.hasActiveCampaign) return { priority: "P1", actionType: "start_marketing", title: "התחלת שיווק", reason: "הנכס עדיין לא פורסם.", canPrepareAutomatically: s.hasPrimaryImage || s.approvedCreativeExists, requiresApproval: true };
  if (!s.hasFuturePublication && !s.hasActiveCampaign) return { priority: "P1", actionType: "schedule_marketing", title: "תזמון פרסום", reason: "אין פרסום מתוכנן ל-7 הימים הקרובים.", canPrepareAutomatically: true, requiresApproval: true };
  if (s.strongUnsent > 0) return { priority: "P1", actionType: "send_matches", title: "שליחת הנכס למתעניינים", reason: `יש ${s.strongUnsent} התאמות חזקות שעדיין לא קיבלו את הנכס.`, canPrepareAutomatically: true, requiresApproval: true };
  if (s.interestedNoViewing > 0) return { priority: "P1", actionType: "interest_followup", title: "טיפול בהתעניינות", reason: `${s.interestedNoViewing} לקוחות סימנו עניין אך עדיין לא נקבע ביקור.`, canPrepareAutomatically: true, requiresApproval: false };
  if (!s.hasPrimaryImage || !s.approvedCreativeExists) return { priority: "P1", actionType: "prepare_creative", title: "הכנת קריאייטיב", reason: !s.hasPrimaryImage ? "אין תמונה ראשית לנכס." : "אין קריאייטיב מאושר לנכס.", canPrepareAutomatically: false, requiresApproval: true };
  if (s.creativeReuseCount >= STALE_CREATIVE_REUSE || s.lastPublishedDaysAgo >= STALE_DAYS) return { priority: "P1", actionType: "refresh_creative", title: "רענון הקריאייטיב", reason: s.creativeReuseCount >= STALE_CREATIVE_REUSE ? `אותו קריאייטיב נמצא בשימוש כבר ${s.creativeReuseCount} פרסומים.` : `הפוסט האחרון פורסם לפני ${s.lastPublishedDaysAgo} ימים.`, canPrepareAutomatically: false, requiresApproval: true };
  if (s.viewingsNoProgress) return { priority: "P1", actionType: "discuss_strategy", title: "עדכון אסטרטגיית שיווק", reason: "יש ביקורים אך אין התקדמות לעסקה.", canPrepareAutomatically: false, requiresApproval: false };

  // ── P2 — worth doing ───────────────────────────────────────────────────────
  if (s.unusedGroups > 0) return { priority: "P2", actionType: "expand_groups", title: "הרחבה לקבוצות נוספות", reason: `יש ${s.unusedGroups} קבוצות פעילות שבהן הנכס עדיין לא פורסם.`, canPrepareAutomatically: true, requiresApproval: true };
  return { priority: "P2", actionType: "prepare_week", title: "הכנת שיווק לשבוע הבא", reason: "השיווק במסלול תקין — אפשר להכין את פעולות השבוע הבא.", canPrepareAutomatically: true, requiresApproval: true };
}

/** Coarse marketing state label (for chips/portfolio), aligned to the recommendation. */
export function deriveMarketingState(s: MarketingSignals): MarketingState {
  if (isUnavailable(s.propertyStatus)) return "blocked";
  if (s.failedPublications > 0) return "blocked";
  if (s.selectedCreativeReady === false) return "blocked";
  if (s.publications === 0 && !s.hasActiveCampaign) return "not_started";
  if (!s.hasPrimaryImage || !s.approvedCreativeExists) return "needs_content";
  if (!s.hasFuturePublication && !s.hasActiveCampaign) return "needs_distribution";
  if (s.strongUnsent > 0 || s.interestedNoViewing > 0) return "needs_followup";
  if (s.creativeReuseCount >= STALE_CREATIVE_REUSE || s.lastPublishedDaysAgo >= STALE_DAYS) return "needs_refresh";
  if (s.viewingsNoProgress) return "needs_strategy";
  if (s.interested >= STRONG_INTEREST_COUNT) return "strong_interest";
  if (s.hasActiveCampaign || s.hasFuturePublication) return s.publications > 0 ? "healthy" : "active";
  return "active";
}

/** Every reason corresponds to a REAL number the server supplied. */
export function deriveMarketingReasons(s: MarketingSignals): string[] {
  const r: string[] = [];
  if (isUnavailable(s.propertyStatus)) { r.push("הנכס אינו זמין לשיווק."); return r; }
  if (s.failedPublications > 0) r.push(s.failedPublications === 1 ? "יש פרסום שנכשל." : `יש ${s.failedPublications} פרסומים שנכשלו.`);
  if (s.publications === 0 && !s.hasActiveCampaign) r.push("הנכס עדיין לא פורסם.");
  if (!s.hasFuturePublication && !s.hasActiveCampaign && s.publications > 0) r.push("אין פרסום מתוכנן ל-7 הימים הקרובים.");
  if (s.lastPublishedDaysAgo !== Infinity && s.lastPublishedDaysAgo >= STALE_DAYS) r.push(`הפוסט האחרון פורסם לפני ${s.lastPublishedDaysAgo} ימים.`);
  if (s.creativeReuseCount >= STALE_CREATIVE_REUSE) r.push(`אותו קריאייטיב נמצא בשימוש כבר ${s.creativeReuseCount} פרסומים.`);
  if (s.strongUnsent > 0) r.push(`יש ${s.strongUnsent} התאמות חזקות שעדיין לא קיבלו את הנכס.`);
  if (s.interestedNoViewing > 0) r.push(`${s.interestedNoViewing} לקוחות סימנו עניין אך עדיין לא נקבע ביקור.`);
  if (s.unusedGroups > 0) r.push(`${s.unusedGroups} קבוצות פעילות שבהן הנכס עדיין לא פורסם.`);
  if (s.viewingsNoProgress) r.push("יש ביקורים אך אין התקדמות.");
  if (!s.hasPrimaryImage) r.push("אין תמונה ראשית לנכס.");
  return r;
}

/** 0..100 urgency (portfolio sort). Higher = more urgent. */
export function marketingUrgency(rec: MarketingRecommendation): number {
  return rec.priority === "P0" ? 90 : rec.priority === "P1" ? 60 : rec.priority === "none" ? 0 : 30;
}

/** Build a DISTRIBUTION-focused signal set from the cheap org-wide coverage row
 *  (for the bounded portfolio path). Signals coverage cannot know are defaulted to
 *  a neutral-good value so the light path only surfaces distribution issues; the
 *  rich per-property path adds matching/creative/groups. */
export function signalsFromCoverage(c: {
  propertyStatus: string; status: string; activeCampaignCount: number; attentionCount: number;
  publishedBefore: boolean; hasFuture: boolean; lastPublishedDaysAgo: number;
}): MarketingSignals {
  return {
    propertyStatus: c.propertyStatus,
    daysListed: 0,
    hasActiveCampaign: c.activeCampaignCount > 0,
    publications: c.publishedBefore ? 1 : 0,
    failedPublications: Math.max(0, c.attentionCount),
    hasFuturePublication: c.hasFuture,
    lastPublishedDaysAgo: c.lastPublishedDaysAgo,
    activeGroups: 0, usedGroups: 0, unusedGroups: 0,
    hasPrimaryImage: true, approvedCreativeExists: true, selectedCreativeReady: null, creativeReuseCount: 0,
    strongMatches: 0, strongUnsent: 0, interested: 0, interestedNoViewing: 0, viewingsCompleted: 0,
    viewingsNoProgress: false, hasOpenDeal: false, facebookConnected: true, canPromote: false, sellerMarketingHealth: "healthy",
  };
}

export const MARKETING_STATE_LABEL: Record<MarketingState, string> = {
  not_started: "לא פורסם", active: "בשיווק", healthy: "שיווק תקין", needs_content: "נדרש קריאייטיב",
  needs_distribution: "אין פרסום עתידי", needs_refresh: "נדרש רענון", needs_followup: "נדרש טיפול",
  strong_interest: "עניין חזק", needs_strategy: "נדרשת אסטרטגיה", blocked: "חסום",
};

// ── Weekly plan skeleton (prepared, never auto-executed) ─────────────────────
export type PlanItemStatus = "suggested" | "ready" | "needs_content" | "needs_approval" | "blocked";
export interface WeeklyPlanItem {
  type: "facebook_publish" | "buyer_bundle" | "creative_refresh" | "interest_followup" | "group_expansion";
  title: string;
  reason: string;
  channel: string;
  audience: string;
  status: PlanItemStatus;
  requiresApproval: boolean;
  executionRoute: string;   // deep-link into the EXISTING engine
}

/** Build the prepared weekly plan from the same real signals. Every item routes into
 *  an EXISTING engine; nothing is auto-executed. */
export function buildWeeklyPlan(propertyId: string, s: MarketingSignals): WeeklyPlanItem[] {
  const plan: WeeklyPlanItem[] = [];
  const wizard = `/distribution/campaign-wizard?property=${propertyId}`;
  const studio = `/creative-studio/property/${propertyId}?source=marketing_autopilot`;
  const property = `/properties/${propertyId}`;
  if (isUnavailable(s.propertyStatus)) return plan;

  const contentReady = s.hasPrimaryImage || (s.approvedCreativeExists && s.selectedCreativeReady !== false);

  if (s.publications === 0 && !s.hasActiveCampaign) {
    plan.push({ type: "facebook_publish", title: "פרסום ראשון בפייסבוק", reason: "הנכס עדיין לא פורסם.", channel: "Facebook Groups", audience: `${Math.min(3, Math.max(1, s.activeGroups))} קבוצות רלוונטיות`, status: contentReady ? "ready" : "needs_content", requiresApproval: true, executionRoute: wizard });
  } else if (!s.hasFuturePublication && !s.hasActiveCampaign) {
    plan.push({ type: "facebook_publish", title: "פרסום נוסף בפייסבוק", reason: "אין פרסום מתוכנן לשבוע הקרוב.", channel: "Facebook Groups", audience: s.unusedGroups > 0 ? `${Math.min(3, s.unusedGroups)} קבוצות חדשות` : "קבוצות רלוונטיות", status: contentReady ? "ready" : "needs_content", requiresApproval: true, executionRoute: wizard });
  }
  if (s.unusedGroups > 0 && (s.publications > 0 || s.hasActiveCampaign)) {
    plan.push({ type: "group_expansion", title: "הרחבה לקבוצות חדשות", reason: `${s.unusedGroups} קבוצות פעילות שבהן הנכס לא פורסם.`, channel: "Facebook Groups", audience: `${Math.min(4, s.unusedGroups)} קבוצות`, status: contentReady ? "ready" : "needs_content", requiresApproval: true, executionRoute: wizard });
  }
  if (s.creativeReuseCount >= STALE_CREATIVE_REUSE || s.lastPublishedDaysAgo >= STALE_DAYS || !s.approvedCreativeExists) {
    plan.push({ type: "creative_refresh", title: "רענון קריאייטיב", reason: !s.approvedCreativeExists ? "אין קריאייטיב מאושר." : "הקריאייטיב הנוכחי חוזר על עצמו.", channel: "Creative Studio", audience: "—", status: "needs_content", requiresApproval: false, executionRoute: studio });
  }
  if (s.strongUnsent > 0) {
    plan.push({ type: "buyer_bundle", title: "שליחת הנכס למתעניינים", reason: `${s.strongUnsent} התאמות חזקות שלא קיבלו את הנכס.`, channel: "WhatsApp / Email", audience: `${s.strongUnsent} לקוחות מתאימים`, status: "needs_approval", requiresApproval: true, executionRoute: property });
  }
  if (s.interestedNoViewing > 0) {
    plan.push({ type: "interest_followup", title: "טיפול בהתעניינות", reason: `${s.interestedNoViewing} מתעניינים ללא ביקור.`, channel: "Follow-up", audience: `${s.interestedNoViewing} מתעניינים`, status: "suggested", requiresApproval: false, executionRoute: property });
  }
  return plan;
}
