/** Seller 360 form input (client-safe). */
export interface Seller360Input {
  // basic
  fullName: string;
  phone?: string | null;
  secondaryPhone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  sellerType?: string | null;
  // motivation
  motivationType?: string | null;
  motivationNotes?: string | null;
  urgencyLevel?: string | null;
  targetSaleDate?: string | null;
  mustSellBy?: string | null;
  // financial
  desiredPrice?: number | null;
  minimumPrice?: number | null;
  dreamPrice?: number | null;
  mortgageExists?: boolean;
  mortgageBalance?: number | null;
  financialNotes?: string | null;
  // decision / psychology
  decisionStyle?: string | null;
  mainObjection?: string | null;
  negotiationSensitivity?: string | null;
  priceSensitivityScore?: number;
  timeSensitivityScore?: number;
  trustSensitivityScore?: number;
  marketingOpennessScore?: number;
  negotiationFlexibilityScore?: number;
  cooperationScore?: number;
  // communication
  preferredContactMethod?: string | null;
  preferredContactTime?: string | null;
  communicationNotes?: string | null;
  // operational
  availableForShowings?: boolean;
  allowsMarketing?: boolean;
  allowsSignage?: boolean;
  allowsExclusive?: boolean;
  hasSignedAgreement?: boolean;
}

export const SELLER_TYPE_OPTIONS = [
  { value: "private_owner", label: "בעלים פרטי" },
  { value: "investor", label: "משקיע" },
  { value: "heir", label: "יורש" },
  { value: "company", label: "חברה" },
  { value: "power_of_attorney", label: "מיופה כוח" },
  { value: "family_representative", label: "נציג משפחה" },
  { value: "other", label: "אחר" },
];
export const MOTIVATION_OPTIONS = [
  { value: "upgrade_home", label: "שדרוג דיור" },
  { value: "downsize", label: "הקטנת דיור" },
  { value: "relocation", label: "מעבר אזור" },
  { value: "divorce", label: "גירושין" },
  { value: "inheritance", label: "ירושה" },
  { value: "investment_sale", label: "מימוש השקעה" },
  { value: "financial_pressure", label: "לחץ כלכלי" },
  { value: "purchase_already_made", label: "כבר רכש נכס אחר" },
  { value: "testing_market", label: "בודק שוק" },
  { value: "other", label: "אחר" },
];
export const URGENCY_OPTIONS = [
  { value: "low", label: "נמוכה" },
  { value: "medium", label: "בינונית" },
  { value: "high", label: "גבוהה" },
  { value: "critical", label: "קריטית" },
];
export const DECISION_STYLE_OPTIONS = [
  { value: "fast", label: "מהיר" },
  { value: "analytical", label: "אנליטי" },
  { value: "emotional", label: "רגשי" },
  { value: "price_sensitive", label: "רגיש למחיר" },
  { value: "family_consensus", label: "הסכמת משפחה" },
  { value: "lawyer_led", label: "מובל ע״י עו״ד" },
  { value: "hesitant", label: "מהסס" },
  { value: "unknown", label: "לא ידוע" },
];
export const CONTACT_METHOD_OPTIONS = [
  { value: "phone", label: "טלפון" },
  { value: "whatsapp", label: "וואטסאפ" },
  { value: "email", label: "אימייל" },
  { value: "meeting", label: "פגישה" },
  { value: "no_preference", label: "ללא העדפה" },
];
export const RELATIONSHIP_TYPE_OPTIONS = [
  { value: "owner", label: "בעלים" },
  { value: "co_owner", label: "בעלים שותף" },
  { value: "decision_maker", label: "מקבל החלטות" },
  { value: "representative", label: "נציג" },
  { value: "power_of_attorney", label: "מיופה כוח" },
  { value: "lawyer", label: "עורך דין" },
  { value: "family_member", label: "בן משפחה" },
  { value: "investor", label: "משקיע" },
  { value: "other", label: "אחר" },
];
