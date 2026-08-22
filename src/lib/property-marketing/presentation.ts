// ============================================================================
// ZONO — Property PUBLIC presentation resolver (pure, dependency-free).
// ----------------------------------------------------------------------------
// The ONE canonical boundary that turns raw property enums/keys into HEBREW,
// public-safe presentation. HEBREW_ONLY_PUBLIC_UI is a hard requirement: a known
// enum maps to its Hebrew label; a value that is already Hebrew passes through;
// an UNKNOWN internal/English token (snake_case / ASCII-only) is NEVER exposed
// publicly — it is omitted (features) or replaced by a safe Hebrew fallback
// (type/status). Pure & side-effect-free so it is unit-tested directly.
// ============================================================================

export interface ResolvedFeature { label: string; icon: string }

/** true when a string carries NO Hebrew letters ⇒ an internal/English token
 *  (e.g. "air_conditioning", "renovated", "Upgraded Kitchen"). */
export function isInternalToken(s: string): boolean {
  return !/[֐-׿]/.test(s);
}

/** Canonicalize a raw key: trim, lowercase, spaces/dashes → underscore. Handles
 *  both stored keys ("solar_heater") and free text ("solar heater"). */
function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

// ── Feature enum → Hebrew label + icon (mirrors PROPERTY_FEATURE_KEYS + the
//    boolean flags surfaced by the marketing payload, plus common import aliases). ──
const FEATURE_HE: Record<string, ResolvedFeature> = {
  // canonical PROPERTY_FEATURE_KEYS
  renovated: { label: "משופצת", icon: "renovated" },
  air_conditioning: { label: "מיזוג אוויר", icon: "ac" },
  bars: { label: "סורגים", icon: "bars" },
  pandor_doors: { label: "דלתות פנדור", icon: "door" },
  upgraded_kitchen: { label: "מטבח משודרג", icon: "kitchen" },
  master_unit: { label: "יחידת הורים", icon: "bed" },
  open_view: { label: "נוף פתוח", icon: "view" },
  front_facing: { label: "חזית", icon: "eye" },
  rear_facing: { label: "עורפית", icon: "building" },
  solar_heater: { label: "דוד שמש", icon: "sun" },
  // boolean-flag features + common aliases seen in imported/legacy data
  elevator: { label: "מעלית", icon: "elevator" },
  parking: { label: "חניה", icon: "car" },
  balcony: { label: "מרפסת", icon: "balcony" },
  storage: { label: "מחסן", icon: "box" },
  safe_room: { label: 'ממ"ד', icon: "shield" },
  mamad: { label: 'ממ"ד', icon: "shield" },
  shelter: { label: 'ממ"ד', icon: "shield" },
  accessible: { label: "נגישות", icon: "access" },
  accessibility: { label: "נגישות", icon: "access" },
  furnished: { label: "מרוהט", icon: "check" },
  air_condition: { label: "מיזוג אוויר", icon: "ac" },
  ac: { label: "מיזוג אוויר", icon: "ac" },
  central_ac: { label: "מיזוג מרכזי", icon: "ac" },
  sun_terrace: { label: "מרפסת שמש", icon: "balcony" },
  garden: { label: "גינה", icon: "view" },
  pool: { label: "בריכה", icon: "check" },
  new: { label: "חדש מקבלן", icon: "renovated" },
  quiet: { label: "שקט", icon: "check" },
};

/** Hebrew label → best-effort icon, so a wizard-stored Hebrew value still gets a
 *  meaningful icon instead of the generic fallback. Derived from FEATURE_HE. */
const ICON_BY_HE_LABEL: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const k of Object.keys(FEATURE_HE)) { const v = FEATURE_HE[k]; if (!(v.label in m)) m[v.label] = v.icon; }
  // a couple of common wizard label variants (label text differs from FEATURE_HE)
  m["מיזוג"] = "ac";
  return m;
})();

/** Resolve ONE raw feature value to Hebrew presentation, or null when it is an
 *  unknown internal/English token that must not leak into the public UI. */
export function resolvePropertyFeature(raw: unknown): ResolvedFeature | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  // 1) known enum key (also matches "solar heater" / "Upgraded Kitchen")
  const hit = FEATURE_HE[normKey(s)];
  if (hit) return hit;
  // 2) already Hebrew (wizard-stored label / hand-entered) → keep, map an icon
  if (!isInternalToken(s)) return { label: s, icon: ICON_BY_HE_LABEL[s] ?? "check" };
  // 3) unknown internal/English token → NEVER expose the raw value publicly
  return null;
}

/** Resolve a raw feature list → de-duped Hebrew features. Raw English/internal
 *  tokens are dropped, never rendered. Preserves input order. */
export function resolvePropertyFeatures(raw: unknown): ResolvedFeature[] {
  if (!Array.isArray(raw)) return [];
  const out: ResolvedFeature[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const res = resolvePropertyFeature(r);
    if (res && !seen.has(res.label)) { seen.add(res.label); out.push(res); }
  }
  return out;
}

// ── Property type enum → Hebrew (covers canonical + common spelling variants
//    seen across importers, e.g. flat / penthouseapp / gardenapartment). ──
const TYPE_HE: Record<string, string> = {
  apartment: "דירה",
  flat: "דירה",
  house: "בית פרטי",
  private_house: "בית פרטי",
  penthouse: "פנטהאוז",
  penthouseapp: "פנטהאוז",
  mini_penthouse: "מיני פנטהאוז",
  garden_apartment: "דירת גן",
  gardenapartment: "דירת גן",
  duplex: "דופלקס",
  triplex: "טריפלקס",
  cottage: "קוטג׳",
  dualcottage: "קוטג׳ דו-משפחתי",
  two_family: "קוטג׳ דו-משפחתי",
  semi_detached: "קוטג׳ דו-משפחתי",
  lot: "מגרש",
  land: "מגרש",
  plot: "מגרש",
  commercial: "נכס מסחרי",
  office: "משרד",
  store: "חנות",
  studio: "סטודיו",
  building: "בניין",
  warehouse: "מחסן / לוגיסטיקה",
  farm: "משק / נחלה",
};

/** Resolve a raw property type → Hebrew, null when unknown+internal. */
export function resolvePropertyType(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const hit = TYPE_HE[normKey(s)];
  if (hit) return hit;
  if (!isInternalToken(s)) return s; // already Hebrew
  return null; // unknown internal token → do not leak
}

/** Display-safe Hebrew type label — never leaks a raw enum (falls back to נכס). */
export function resolvePropertyTypeLabel(raw: unknown): string {
  return resolvePropertyType(raw) ?? "נכס";
}

// ── Status enum → Hebrew (public-safe). ──
const STATUS_HE: Record<string, string> = {
  active: "למכירה",
  published: "למכירה",
  under_offer: "בהצעה",
  reserved: "בהמתנה",
  sold: "נמכר",
  rented: "הושכר",
  draft: "בהכנה",
  archived: "לא פעיל",
};

/** Resolve a raw status → Hebrew, or null when unknown+internal (omit). */
export function resolvePropertyStatus(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const hit = STATUS_HE[normKey(s)];
  if (hit) return hit;
  if (!isInternalToken(s)) return s;
  return null;
}
