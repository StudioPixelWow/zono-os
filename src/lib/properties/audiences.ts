/**
 * Structured target-audience catalog for properties (client-safe, no server
 * imports). Replaces the old free-text "קהל יעד" field. Selected keys are
 * stored on properties.marketing_audiences (jsonb) and consumed by the AI
 * Marketing Kit, distribution, recommendations, WhatsApp campaigns, the public
 * listing and the client portal.
 */
import type { PropertyInput } from "./types";

export interface AudienceOption {
  key: string;
  label: string;
  /** Grouping for the selector UI. */
  group: "buyers" | "investors" | "segments" | "commercial" | "lifecycle";
}

export const TARGET_AUDIENCES: AudienceOption[] = [
  { key: "young_families", label: "משפחות צעירות", group: "buyers" },
  { key: "upgraders", label: "משפרי דיור", group: "buyers" },
  { key: "young_couples", label: "זוגות צעירים", group: "buyers" },
  { key: "first_home", label: "דירה ראשונה", group: "buyers" },
  { key: "downsizers", label: "מצמצמי דיור", group: "buyers" },
  { key: "families_with_kids", label: "משפחות עם ילדים", group: "buyers" },
  { key: "investors", label: "משקיעים", group: "investors" },
  { key: "long_term_investors", label: "משקיעים לטווח ארוך", group: "investors" },
  { key: "yield_investors", label: "משקיעים לתשואה", group: "investors" },
  { key: "luxury", label: "יוקרה", group: "segments" },
  { key: "penthouses", label: "פנטהאוזים", group: "segments" },
  { key: "garden_apartments", label: "דירות גן", group: "segments" },
  { key: "religious_traditional", label: "קהל דתי/מסורתי", group: "segments" },
  { key: "commercial", label: "מסחרי", group: "commercial" },
  { key: "offices", label: "משרדים", group: "commercial" },
  { key: "new_projects", label: "פרויקטים חדשים", group: "lifecycle" },
  { key: "presale", label: "פריסייל", group: "lifecycle" },
  { key: "immediate_buyers", label: "קונים מיידיים", group: "lifecycle" },
  { key: "potential_sellers", label: "מוכרים פוטנציאליים", group: "lifecycle" },
];

export const AUDIENCE_GROUP_LABELS: Record<AudienceOption["group"], string> = {
  buyers: "קונים למגורים",
  investors: "משקיעים",
  segments: "סגמנטים",
  commercial: "מסחרי ומשרדים",
  lifecycle: "מצב מכירה",
};

const BY_KEY = new Map(TARGET_AUDIENCES.map((a) => [a.key, a]));

export function audienceLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function audienceLabels(keys: string[]): string[] {
  return keys.map(audienceLabel);
}

/**
 * Deterministic audience recommendation from the property data only. Never
 * invents facts — it reasons from rooms/size/price/type/features the user
 * actually entered.
 */
export function recommendAudiences(form: Partial<PropertyInput>): string[] {
  const out = new Set<string>();
  const rooms = form.rooms ?? null;
  const size = form.sizeSqm ?? null;
  const price = form.price ?? null;
  const features = form.features ?? [];
  const type = form.type;

  // Lifecycle / commercial by property type.
  if (type === "commercial") {
    out.add("commercial");
    out.add("offices");
    out.add("investors");
  } else if (type === "office") {
    out.add("offices");
    out.add("commercial");
  }

  // Room-count signals.
  if (rooms != null) {
    if (rooms <= 2) {
      out.add("young_couples");
      out.add("first_home");
      out.add("yield_investors");
    } else if (rooms <= 3.5) {
      out.add("young_families");
      out.add("upgraders");
    } else {
      out.add("families_with_kids");
      out.add("upgraders");
    }
  }

  // Size signal — large built area suits families / luxury.
  if (size != null && size >= 140) out.add("families_with_kids");

  // Feature-driven segments (only on stored features).
  if (features.includes("master_unit")) out.add("upgraders");
  if (form.balconyCount && form.balconyCount > 0) out.add("young_families");

  // Listing-tag / luxury signals.
  if (form.listingTag === "premium") out.add("luxury");
  if (type === "penthouse") {
    out.add("penthouses");
    out.add("luxury");
  }
  if (type === "garden_apartment") out.add("garden_apartments");

  // Price tier — high asking price leans luxury & long-term investors.
  if (price != null && price >= 4_000_000) {
    out.add("luxury");
    out.add("long_term_investors");
  }

  // New construction / project lifecycle.
  if (form.listingTag === "new") out.add("new_projects");

  // Always-reasonable default if nothing matched.
  if (out.size === 0) {
    out.add("young_families");
    out.add("upgraders");
    out.add("investors");
  }
  return [...out];
}
