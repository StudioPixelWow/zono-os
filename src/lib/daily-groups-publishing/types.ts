// ============================================================================
// 📣 ZONO — Daily Facebook Groups Publishing Assistant — types (pure). PHASE 49.0.
// A COMPLIANT, ASSISTED daily checklist: ZONO prepares today's due Facebook-group
// posts (grouped by property); the broker copies the text, opens the group and
// publishes BY HAND, then records the result. Nothing here (or anywhere in this
// module) auto-posts, scrapes, or automates a browser. It only reads + composes.
// ============================================================================

/** Max distinct groups shown per property in the daily popup. Overflow is never
 *  silently discarded — it is surfaced as a count so the broker can open the full
 *  distribution center for the rest. */
export const MAX_GROUPS_PER_PROPERTY = 15;

/** Post statuses that are actionable in the daily assistant (not yet done). */
export const ACTIONABLE_STATUSES = ["scheduled", "queued", "draft"] as const;

/** One prepared, copy-ready post targeting a single Facebook group. */
export interface PublishPostCard {
  postId: string;
  groupId: string | null;
  groupName: string | null;
  groupUrl: string | null;
  category: string | null;   // group folder/category (e.g. city / luxury / rentals)
  city: string | null;       // group city
  membersCount: number;
  requiresMembership: boolean;
  title: string | null;
  text: string;              // copy-ready body (title + text + hashtags already prepared)
  hashtags: string[];
  cta: string | null;
  imageUrl: string | null;
  scheduledAt: string | null;
  status: string;
  externalPostUrl: string | null;
  overdue: boolean;          // scheduled before today and still not published
}

/** All of today's due group-posts for a single property. */
export interface PropertyPublishingGroup {
  propertyId: string;
  title: string;
  city: string | null;
  imageUrl: string | null;
  cards: PublishPostCard[];  // capped at MAX_GROUPS_PER_PROPERTY
  totalGroups: number;       // distinct groups due today BEFORE the cap
  overflow: number;          // totalGroups - shown (surfaced, never dropped)
  overdueCount: number;
}

/** A smart folder chip (derived from the groups' categories present today). */
export interface PublishFolder { name: string; count: number }

/** The full daily publishing plan handed to the popup. */
export interface DailyGroupsPublishingPlan {
  date: string;                        // YYYY-MM-DD
  properties: PropertyPublishingGroup[];
  folders: PublishFolder[];
  totalPosts: number;
  totalProperties: number;
  overdueCount: number;
  hasWork: boolean;
  note: string;                        // the "nothing posts automatically" assurance
}

/** Raw merged input row (post + property + group metadata) fed to the assembler. */
export interface PublishInputRow {
  postId: string;
  propertyId: string | null;
  propertyTitle: string | null;
  propertyCity: string | null;
  propertyImage: string | null;
  groupId: string | null;
  groupName: string | null;
  groupUrl: string | null;
  category: string | null;
  city: string | null;
  membersCount: number;
  requiresMembership: boolean;
  title: string | null;
  text: string;
  hashtags: string[];
  cta: string | null;
  imageUrl: string | null;
  scheduledAt: string | null;
  status: string;
  externalPostUrl: string | null;
}

export const ASSISTANT_NOTE =
  "זונו הכין את הפרסום עבורך. העתק, פתח את הקבוצה, פרסם ידנית וסמן שבוצע. שום דבר לא מתפרסם, נשלח או מבוצע אוטומטית — הפרסום בפייסבוק נעשה על ידך בלבד, בכפוף לחוקי הקבוצות ולמדיניות פייסבוק.";
