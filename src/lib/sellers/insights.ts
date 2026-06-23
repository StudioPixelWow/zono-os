/**
 * Seller insights engine — deterministic, client + server safe (NO server-only
 * imports). Turns a raw SellerRow (+ optional intelligence-profile enrichment)
 * into the derived signals the Seller Intelligence command center needs:
 * urgency, next best action, trust score, churn risk, lifecycle flags and KPI
 * aggregation.
 *
 * Everything degrades gracefully: when a field is missing we fall back to a
 * neutral value and never throw. The seller digital twin
 * (seller_intelligence_profiles) sharpens the signals when present but is never
 * required — a brand-new seller with no twin still produces a sensible read.
 */
import type { BadgeTone } from "@/components/ui/Badge";
import type { SellerRow } from "@/lib/sellers/repository";

const DAY = 86_400_000;

export type NextActionKind =
  | "call"
  | "whatsapp"
  | "send_update"
  | "schedule_meeting"
  | "suggest_price"
  | "link_property"
  | "mark_handled";

export interface NextAction {
  kind: NextActionKind;
  label: string;
}

export type ChurnLevel = "stable" | "watch" | "risk" | "critical";

/**
 * Minimal slice of seller_intelligence_profiles needed by the engine. Passing
 * the full row (structurally compatible) is fine — extra fields are ignored.
 */
export interface SellerIntel {
  seller_trust_score?: number | null;
  seller_churn_risk_score?: number | null;
  seller_health_score?: number | null;
  seller_engagement_score?: number | null;
  days_since_last_contact?: number | null;
  last_contact_at?: string | null;
  current_status?: string | null;
  next_best_action?: string | null;
  trust_trend?: string | null;
  properties_count?: number | null;
  active_properties_count?: number | null;
  ai_opportunity_summary?: string | null;
}

/**
 * Intelligence-board membership sets (sellerIds), all optional. Derived on the
 * server from listSellerBoard() so the client can sharpen its deterministic
 * signals when the digital twin exists.
 */
export interface IntelSets {
  needingAttention?: Set<string>;
  highChurn?: Set<string>;
  lowTrust?: Set<string>;
  noContact?: Set<string>;
  upcomingCommitments?: Set<string>;
  trustChanges?: Set<string>;
}

export interface SellerInsight {
  seller: SellerRow;
  /** 0–100 composite — higher means "act sooner". */
  urgency: number;
  urgencyTone: BadgeTone;
  /** Short Hebrew explanation of WHY this seller is surfacing. */
  urgencyReason: string;
  nextAction: NextAction;
  /** 0–100, higher = more trusting relationship. */
  trustScore: number;
  trustTone: BadgeTone;
  /** 0–100, higher = more likely to walk away. */
  churnRisk: number;
  churnLevel: ChurnLevel;
  churnLabel: string;
  churnTone: BadgeTone;
  trustTrend: "up" | "down" | "flat";
  /** "פעיל" / "לא פעיל" — derived from connected active properties. */
  statusLabel: string;
  isActive: boolean;
  /** Human Hebrew label for the relationship stage. */
  stageLabel: string;
  /** "לפני יומיים" / "אתמול" / "טרם תועד קשר" … */
  lastActivityLabel: string;
  daysSinceContact: number | null;
  propertyCount: number;
  // Flags (used by KPIs + filters)
  isNew: boolean;
  needsTreatment: boolean;
  isHighChurn: boolean;
  isLowTrust: boolean;
  isTrustDrop: boolean;
  isNoContact: boolean;
  isNearOpportunity: boolean;
  hasProperties: boolean;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / DAY);
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / DAY);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Hebrew relative-time label, RTL-friendly. */
export function relativeLabel(iso: string | null | undefined): string {
  const d = daysSince(iso);
  if (d == null) return "טרם תועד קשר";
  if (d <= 0) return "היום";
  if (d === 1) return "אתמול";
  if (d < 7) return `לפני ${d} ימים`;
  if (d < 14) return "לפני שבוע";
  if (d < 30) return `לפני ${Math.floor(d / 7)} שבועות`;
  if (d < 60) return "לפני חודש";
  return `לפני ${Math.floor(d / 30)} חודשים`;
}

const CHURN_META: Record<ChurnLevel, { label: string; tone: BadgeTone }> = {
  stable: { label: "יציב", tone: "success" },
  watch: { label: "דורש תשומת לב", tone: "warning" },
  risk: { label: "בסיכון", tone: "warning" },
  critical: { label: "קריטי", tone: "danger" },
};

function churnLevelFor(n: number): ChurnLevel {
  if (n >= 75) return "critical";
  if (n >= 60) return "risk";
  if (n >= 35) return "watch";
  return "stable";
}

function scoreTone(n: number): BadgeTone {
  if (n >= 70) return "success";
  if (n >= 45) return "warning";
  return "danger";
}

/** Best-effort price for the seller (what they're trying to sell at). */
export function sellerPriceLine(s: SellerRow): string {
  const price = s.expected_price ?? s.desired_price ?? s.dream_price ?? null;
  if (price == null) return "ללא מחיר יעד";
  return `₪${Math.round(price).toLocaleString("he-IL")}`;
}

/** Short context line: type · city. RTL-safe. */
export function sellerContextLine(s: SellerRow): string {
  const parts: string[] = [];
  const typeLabel = s.seller_type ? SELLER_TYPE_LABELS[s.seller_type] : null;
  if (typeLabel) parts.push(typeLabel);
  if (s.city) parts.push(s.city);
  return parts.length ? parts.join(" · ") : "ללא פרטי רקע";
}

export const SELLER_TYPE_LABELS: Record<string, string> = {
  private_owner: "בעלים פרטי",
  investor: "משקיע",
  heir: "יורש",
  company: "חברה",
  power_of_attorney: "מיופה כוח",
  family_representative: "נציג משפחה",
  other: "אחר",
};

const STAGE_LABELS: Record<string, string> = {
  new_lead: "מוכר חדש",
  nurturing: "בתהליך טיפוח",
  active: "מוכר פעיל",
  listed: "נכס בשיווק",
  negotiating: "במשא ומתן",
  at_risk: "בסיכון נטישה",
  dormant: "לא פעיל",
};

/** Derive trust (0–100): profile wins, else infer from cooperation + agreement. */
function deriveTrust(s: SellerRow, intel?: SellerIntel): number {
  if (intel?.seller_trust_score != null) return clamp(intel.seller_trust_score);
  let base = s.cooperation_score || 55;
  if (s.has_signed_agreement) base += 12;
  if (s.allows_exclusive) base += 6;
  if (s.allows_marketing) base += 4;
  return clamp(base);
}

/** Derive churn risk (0–100): profile wins, else infer from contact + barriers. */
function deriveChurn(
  s: SellerRow,
  daysContact: number | null,
  intel?: SellerIntel,
): number {
  if (intel?.seller_churn_risk_score != null) return clamp(intel.seller_churn_risk_score);
  let risk = 18;
  if (!s.has_signed_agreement) risk += 20;
  if (!s.allows_marketing) risk += 10;
  if (!s.available_for_showings) risk += 8;
  if (s.urgency_level === "critical") risk += 10;
  if (daysContact == null) risk += 18;
  else if (daysContact >= 30) risk += 28;
  else if (daysContact >= 14) risk += 14;
  if (s.main_objection) risk += 6;
  return clamp(risk);
}

/** The single most important thing to do next for this seller. */
function pickNextAction(args: {
  needsTreatment: boolean;
  isNoContact: boolean;
  isNearOpportunity: boolean;
  isNew: boolean;
  hasProperties: boolean;
  pricingTension: boolean;
  hasPhone: boolean;
}): NextAction {
  const { needsTreatment, isNoContact, isNearOpportunity, isNew, hasProperties, pricingTension, hasPhone } = args;
  if (isNearOpportunity) return { kind: "send_update", label: "שלח דוח פעילות" };
  if (needsTreatment || isNoContact) {
    return hasPhone
      ? { kind: "call", label: "התקשר עכשיו" }
      : { kind: "whatsapp", label: "שלח הודעת מעקב" };
  }
  if (pricingTension) return { kind: "suggest_price", label: "עדכן אסטרטגיית מחיר" };
  if (!hasProperties) return { kind: "link_property", label: "שייך נכס למוכר" };
  if (isNew) return { kind: "schedule_meeting", label: "קבע פגישת היכרות" };
  return { kind: "send_update", label: "שלח עדכון שוק" };
}

/** Compute the full insight bundle for one seller. */
export function sellerInsight(
  seller: SellerRow,
  opts: { propertyCount?: number; intel?: SellerIntel; sets?: IntelSets } = {},
): SellerInsight {
  const { propertyCount: rawCount, intel, sets } = opts;
  const id = seller.id;

  const createdDays = daysSince(seller.created_at) ?? 999;
  const daysSinceContact =
    intel?.days_since_last_contact ??
    daysSince(intel?.last_contact_at) ??
    daysSince(seller.updated_at);

  const propertyCount = intel?.active_properties_count ?? intel?.properties_count ?? rawCount ?? 0;
  const hasProperties = propertyCount > 0;

  const trustScore = deriveTrust(seller, intel);
  const churnRisk = deriveChurn(seller, daysSinceContact, intel);
  const level = churnLevelFor(churnRisk);
  const churnMeta = CHURN_META[level];

  const trustTrend = (intel?.trust_trend === "up" || intel?.trust_trend === "down" ? intel.trust_trend : "flat") as
    | "up"
    | "down"
    | "flat";

  // ── Lifecycle flags ────────────────────────────────────────────────────────
  const isNew = createdDays <= 14;
  const isHighChurn = sets?.highChurn?.has(id) || churnRisk >= 60;
  const isLowTrust = sets?.lowTrust?.has(id) || trustScore < 45;
  const isTrustDrop = sets?.trustChanges?.has(id) || trustTrend === "down";
  const isNoContact =
    sets?.noContact?.has(id) || daysSinceContact == null || daysSinceContact >= 30;

  const opportunityWindow =
    daysUntil(seller.target_sale_date) != null && (daysUntil(seller.target_sale_date) as number) <= 60 ||
    daysUntil(seller.must_sell_by) != null && (daysUntil(seller.must_sell_by) as number) <= 60;
  const isNearOpportunity =
    Boolean(sets?.upcomingCommitments?.has(id)) ||
    Boolean(intel?.ai_opportunity_summary) ||
    seller.urgency_level === "critical" ||
    opportunityWindow;

  const pricingTension = Boolean(
    seller.minimum_price != null &&
      seller.expected_price != null &&
      seller.minimum_price >= seller.expected_price,
  );

  const needsTreatment =
    Boolean(sets?.needingAttention?.has(id)) ||
    isHighChurn ||
    isTrustDrop ||
    (isNoContact && hasProperties) ||
    seller.urgency_level === "high" ||
    seller.urgency_level === "critical";

  // ── Urgency composite (0–100) ──────────────────────────────────────────────
  let urgency = 0;
  if (needsTreatment) urgency += 28;
  if (isHighChurn) urgency += 24;
  if (level === "critical") urgency += 12;
  if (isNoContact) urgency += 18;
  if (isLowTrust) urgency += 12;
  if (isTrustDrop) urgency += 12;
  if (isNearOpportunity) urgency += 14;
  if (pricingTension) urgency += 8;
  if (isNew && daysSinceContact == null) urgency += 12;
  if (!hasProperties) urgency += 4;
  urgency = Math.min(100, urgency);

  // ── Dominant reason (single, human) ────────────────────────────────────────
  let urgencyReason: string;
  if (isHighChurn && isNoContact)
    urgencyReason = "סיכון נטישה גבוה ללא קשר תקופה ארוכה";
  else if (isHighChurn) urgencyReason = "סיכון נטישה גבוה — מומלץ לחזק את הקשר";
  else if (isTrustDrop) urgencyReason = "מגמת אמון יורדת — כדאי ליצור מגע אישי";
  else if (isNearOpportunity) urgencyReason = "חלון הזדמנות קרוב — דחוף קדימה";
  else if (isNoContact) urgencyReason = "לא תועד קשר לאחרונה — סיכון להתקררות";
  else if (isLowTrust) urgencyReason = "רמת אמון נמוכה — נדרש חיזוק יחסים";
  else if (pricingTension) urgencyReason = "פער בין מחיר מינימום לציפייה — לחדד אסטרטגיה";
  else if (!hasProperties) urgencyReason = "מוכר ללא נכס משויך — כדאי לשייך נכס";
  else if (isNew) urgencyReason = "מוכר חדש — כדאי ליצור קשר ראשוני";
  else urgencyReason = "המשך טיפול שוטף";

  const urgencyTone: BadgeTone =
    urgency >= 70 ? "danger" : urgency >= 40 ? "warning" : "brand";

  const nextAction = pickNextAction({
    needsTreatment,
    isNoContact,
    isNearOpportunity,
    isNew,
    hasProperties,
    pricingTension,
    hasPhone: Boolean(seller.phone),
  });

  // Status: active twin status wins, else derived from active properties.
  const isActive = hasProperties && level !== "critical";
  const statusLabel = isActive ? "פעיל" : "לא פעיל";

  const stageKey = intel?.current_status && STAGE_LABELS[intel.current_status] ? intel.current_status : null;
  const stageLabel = stageKey
    ? STAGE_LABELS[stageKey]
    : isNearOpportunity
      ? "במשא ומתן"
      : isHighChurn
        ? "בסיכון נטישה"
        : hasProperties
          ? "מוכר פעיל"
          : isNew
            ? "מוכר חדש"
            : "בתהליך טיפוח";

  return {
    seller,
    urgency,
    urgencyTone,
    urgencyReason,
    nextAction,
    trustScore,
    trustTone: scoreTone(trustScore),
    churnRisk,
    churnLevel: level,
    churnLabel: churnMeta.label,
    churnTone: churnMeta.tone,
    trustTrend,
    statusLabel,
    isActive,
    stageLabel,
    lastActivityLabel: relativeLabel(intel?.last_contact_at ?? seller.updated_at),
    daysSinceContact,
    propertyCount,
    isNew,
    needsTreatment,
    isHighChurn,
    isLowTrust,
    isTrustDrop,
    isNoContact,
    isNearOpportunity,
    hasProperties,
  };
}

export interface SellerKpis {
  total: number;
  newThisMonth: number;
  needsTreatment: number;
  highChurn: number;
  trustChanges: number;
  noContact: number;
  nearOpportunity: number;
}

/** Aggregate KPIs from a list of insights. */
export function computeKpis(insights: SellerInsight[]): SellerKpis {
  const monthAgo = Date.now() - 30 * DAY;
  let newThisMonth = 0;
  let needsTreatment = 0;
  let highChurn = 0;
  let trustChanges = 0;
  let noContact = 0;
  let nearOpportunity = 0;
  for (const i of insights) {
    if (new Date(i.seller.created_at).getTime() >= monthAgo) newThisMonth++;
    if (i.needsTreatment) needsTreatment++;
    if (i.isHighChurn) highChurn++;
    if (i.isTrustDrop || i.isLowTrust) trustChanges++;
    if (i.isNoContact) noContact++;
    if (i.isNearOpportunity) nearOpportunity++;
  }
  return {
    total: insights.length,
    newThisMonth,
    needsTreatment,
    highChurn,
    trustChanges,
    noContact,
    nearOpportunity,
  };
}
