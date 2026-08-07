// ============================================================================
// ZONO — Property Contact CTA: pure resolution core (client-safe, no I/O).
// ----------------------------------------------------------------------------
// Decides WHO the "contact the property" CTA reaches (owner vs broker), from the
// CANONICAL representation model only — never by parsing free-text descriptions.
// Also builds the exact Hebrew WhatsApp outreach text (owner / broker variants),
// the wa.me + tel: links (Israeli-normalized), and the honest disabled state when
// no valid phone exists. Reuses the shared, dependency-free phone/link helpers.
//
// Canonical inputs used (all already on the properties row via select("*"), plus
// the linked external_listings contact fields):
//   - ownership_scope, source_type, exclusivity_scope        (properties, text)
//   - is_exclusive / is_agent_exclusive / is_office_exclusive (properties, bool)
//   - external_listings.has_agent / .contact_type            (the "who to contact
//     on a non-CRM listing" canonical fields)
// There is NO single enum field that says "represented by an external broker" or
// "external-broker exclusivity"; the rule below composes the closest canonical
// fields. See the report for the exact mapping + the missing-field note.
// ============================================================================
import { normalizePhoneForWhatsapp, buildWhatsappUrl } from "@/lib/property-radar/utils";

export type Representation = "private_owner" | "broker" | "broker_exclusive";
export type ContactType = "owner" | "broker";
export type ContactAction = "whatsapp" | "call";

/** Canonical fields that decide representation. */
export interface RepresentationInputs {
  ownershipScope: string | null;
  sourceType: string | null;
  exclusivityScope: string | null;
  isExclusive: boolean;
  isAgentExclusive: boolean;
  isOfficeExclusive: boolean;
  externalHasAgent: boolean | null;
  externalContactType: string | null;
}

// Canonical vocabularies. Matched case-insensitively against the free-text
// canonical columns. Kept small + explicit so classification is auditable.
const BROKER_CONTACT_TYPES = new Set(["broker", "agency", "office", "realtor"]);
const BROKER_OWNERSHIP = new Set(["broker", "agency", "office", "external_broker", "external"]);

/**
 * Classify the representation strictly from canonical fields.
 *   private_owner   — a private seller / no other broker in the picture
 *   broker          — represented by another broker (cooperation)
 *   broker_exclusive— another broker holds it exclusively (must go to that broker)
 */
export function classifyRepresentation(i: RepresentationInputs): Representation {
  const brokerBySource =
    i.externalHasAgent === true ||
    (i.externalContactType != null && BROKER_CONTACT_TYPES.has(i.externalContactType.trim().toLowerCase())) ||
    (i.ownershipScope != null && BROKER_OWNERSHIP.has(i.ownershipScope.trim().toLowerCase()));
  if (!brokerBySource) return "private_owner";

  // Exclusivity that belongs to US (agent/office) is NOT another broker's
  // exclusivity — only an exclusivity that is not ours makes it broker-exclusive.
  const ourExclusivity =
    i.isAgentExclusive || i.isOfficeExclusive ||
    (i.exclusivityScope != null && /agent_exclusive|office_exclusive/i.test(i.exclusivityScope));
  const scoped = (i.exclusivityScope ?? "").trim().toLowerCase();
  const hasExclusivity = i.isExclusive || (scoped !== "" && scoped !== "none");
  return hasExclusivity && !ourExclusivity ? "broker_exclusive" : "broker";
}

// ── Hebrew outreach templates (short, professional, non-aggressive) ──────────
function fallbackAgent(name: string): string {
  return name.trim() || "סוכן/ת מ-ZONO";
}
function fallbackLabel(label: string): string {
  return label.trim() || "הנכס";
}

/** Owner variant: identifies the agent, explicitly asks to coordinate a viewing. */
export function buildOwnerWhatsappText(agentName: string, propertyLabel: string): string {
  const a = fallbackAgent(agentName);
  const p = fallbackLabel(propertyLabel);
  return [
    `שלום, כאן ${a}, סוכן נדל״ן.`,
    `ראיתי את הנכס שלך ב-${p} ואשמח לתאם סיור בנכס ולבדוק אפשרות להתקדם.`,
    `אם נוח לך, אשמח לתאם מועד שמתאים לך.`,
    `תודה,`,
    a,
  ].join("\n");
}

/** Broker variant: proposes cooperation + coordinating a visit. */
export function buildBrokerWhatsappText(agentName: string, propertyLabel: string): string {
  const a = fallbackAgent(agentName);
  const p = fallbackLabel(propertyLabel);
  return [
    `שלום, כאן ${a}, סוכן נדל״ן.`,
    `ראיתי את הנכס ב-${p} ורציתי לבדוק אפשרות לשיתוף פעולה ולתאם ביקור בנכס.`,
    `אשמח לעדכון לגבי זמינות הנכס ותנאי שיתוף הפעולה.`,
    `תודה,`,
    a,
  ].join("\n");
}

export interface ResolveContactInput extends RepresentationInputs {
  ownerPhone: string | null;
  ownerName: string | null;
  brokerPhone: string | null;
  brokerName: string | null;
  agentName: string;     // the logged-in ZONO agent's display name
  propertyLabel: string; // address or title, for the message body
}

export interface ResolvedPropertyContact {
  representation: Representation;
  contactType: ContactType;
  contactName: string | null;
  displayPhone: string | null; // normalized international digits, or null
  whatsappUrl: string | null;
  telUrl: string | null;
  disabled: boolean;           // true → no valid phone; CTA shows honest empty state
  badgeLabel: string;          // "בעל נכס פרטי" | "נכס עם מתווך" | "נכס בבלעדיות מתווך"
  whatsappLabel: string;
  callLabel: string;
  emptyLabel: string;          // "אין מספר טלפון זמין"
  message: string | null;      // null when disabled
}

const BADGE: Record<Representation, string> = {
  private_owner: "בעל נכס פרטי",
  broker: "נכס עם מתווך",
  broker_exclusive: "נכס בבלעדיות מתווך",
};

/**
 * Resolve the complete CTA view-model. Broker-represented (incl. exclusive) ALWAYS
 * routes to the broker — never the owner. No fake numbers: a missing/invalid phone
 * yields disabled=true + the honest empty label.
 */
export function resolvePropertyContact(input: ResolveContactInput): ResolvedPropertyContact {
  const representation = classifyRepresentation(input);
  const isBroker = representation === "broker" || representation === "broker_exclusive";
  const contactType: ContactType = isBroker ? "broker" : "owner";

  const rawPhone = isBroker ? input.brokerPhone : input.ownerPhone;
  const contactName = isBroker ? input.brokerName : input.ownerName;
  const message = isBroker
    ? buildBrokerWhatsappText(input.agentName, input.propertyLabel)
    : buildOwnerWhatsappText(input.agentName, input.propertyLabel);

  const normalized = normalizePhoneForWhatsapp(rawPhone);
  const disabled = !normalized;
  const whatsappUrl = normalized ? buildWhatsappUrl(rawPhone, message) : null;
  const telUrl = normalized ? `tel:+${normalized}` : null;

  return {
    representation,
    contactType,
    contactName,
    displayPhone: normalized,
    whatsappUrl,
    telUrl,
    disabled,
    badgeLabel: BADGE[representation],
    whatsappLabel: isBroker ? "שלח WhatsApp למתווך" : "שלח WhatsApp לבעל הנכס",
    callLabel: isBroker ? "חייג למתווך" : "חייג לבעל הנכס",
    emptyLabel: "אין מספר טלפון זמין",
    message: disabled ? null : message,
  };
}
