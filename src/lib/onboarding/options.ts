/** Static option lists for the onboarding wizard (shared client + server). */
import type { ListingKind, PropertyType } from "@/lib/supabase/types";

export const ROLE_OPTIONS: { key: string; label: string; hint: string }[] = [
  { key: "owner", label: "בעלים", hint: "גישה מלאה לארגון" },
  { key: "manager", label: "מנהל/ת", hint: "ניהול צוות ונכסים" },
  { key: "agent", label: "סוכן/ת", hint: "עבודה שוטפת מול לקוחות" },
  { key: "admin", label: "מנהל/ת מערכת", hint: "ניהול משתמשים והגדרות" },
];

export const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: "apartment", label: "דירה" },
  { value: "garden_apartment", label: "דירת גן" },
  { value: "penthouse", label: "פנטהאוז" },
  { value: "duplex", label: "דופלקס" },
  { value: "private_house", label: "בית פרטי" },
  { value: "cottage", label: "קוטג׳" },
  { value: "studio", label: "סטודיו" },
  { value: "commercial", label: "מסחרי" },
  { value: "office", label: "משרד" },
  { value: "land", label: "מגרש" },
];

export const DEAL_TYPE_OPTIONS: { value: ListingKind; label: string }[] = [
  { value: "sale", label: "מכירה" },
  { value: "rent", label: "השכרה" },
];

// City / locality lists are NOT hardcoded — they come from
// public.israel_localities via @/lib/localities/search (Hebrew autocomplete).
