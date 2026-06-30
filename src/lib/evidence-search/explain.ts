// ============================================================================
// Evidence Search Engine™ — explainability (PURE). Classifies the honest failure
// mode and the recommended next step. Never returns a bare "no data".
// ============================================================================
import type { FailureMode, MatchLevel } from "./types";

export interface ClassifyArgs {
  hasCity: boolean;
  cityResolved: boolean;
  hasCoordinates: boolean;
  totalRows: number;
  pricedRows: number;
  sizedRows: number;
  usableRows: number;
  sameCityRows: number;
  normalizedCityRows: number;
  radiusRows: number;
  mpsUsableButUnwired: boolean;   // market_property_sources has usable rows the live pipeline ignores
  anySourceError: boolean;
}

/** Returns the single most informative failure mode, or null when evidence is usable. */
export function classifyFailure(a: ClassifyArgs): FailureMode | null {
  if (a.usableRows > 0) return null;                              // we have usable evidence
  if (!a.hasCity || !a.cityResolved) return "CITY_NOT_RESOLVED";
  if (a.anySourceError) return "SOURCE_NOT_CONNECTED";
  if (a.mpsUsableButUnwired) return "MARKET_PROPERTY_SOURCES_NOT_WIRED";
  if (a.totalRows === 0) return "DATA_GAP";
  // rows exist but none usable → why?
  if (a.pricedRows === 0) return "NO_PRICED_PROPERTIES";
  if (a.sizedRows === 0) return "NO_SQM";
  if (!a.hasCoordinates && a.sameCityRows === 0 && a.normalizedCityRows === 0) return "NO_GEOCODE";
  return "NO_COMPARABLES";
}

export function recommendedStep(mode: FailureMode | null): string {
  switch (mode) {
    case null: return "none";
    case "CITY_NOT_RESOLVED": return "complete_city_input";
    case "ADDRESS_NOT_NORMALIZED": return "complete_address_input";
    case "NO_GEOCODE": return "geocode_property";
    case "NO_PRICED_PROPERTIES":
    case "NO_SQM":
    case "NO_COMPARABLES": return "inspect_source_fields";
    case "MARKET_PROPERTY_SOURCES_NOT_WIRED": return "wire_market_property_sources";
    case "SOURCE_NOT_CONNECTED": return "inspect_provider";
    case "INSUFFICIENT_EVIDENCE": return "enable_nearby_cities_or_import";
    case "DATA_GAP": return "import_data";
    default: return "none";
  }
}

export const MATCH_LEVEL_HE: Record<MatchLevel, string> = {
  building: "אותו בניין", street: "אותו רחוב", neighborhood: "אותה שכונה",
  r300: "רדיוס 300מ׳", r700: "רדיוס 700מ׳", r1000: "רדיוס 1ק״מ", r2000: "רדיוס 2ק״מ",
  city: "אותה עיר", nearby_city: "עיר סמוכה (ראיה חלשה)",
};

export const FAILURE_MODE_HE: Record<FailureMode, string> = {
  NO_GEOCODE: "אין קואורדינטות — חיפוש רדיוס לא זמין",
  NO_COMPARABLES: "אין נכסים בני-השוואה",
  NO_PRICED_PROPERTIES: "קיימים נכסים אך ללא מחיר",
  NO_SQM: "קיימים נכסים אך ללא שטח",
  CITY_NOT_RESOLVED: "עיר לא זוהתה",
  ADDRESS_NOT_NORMALIZED: "כתובת לא נורמלה",
  SOURCE_NOT_CONNECTED: "מקור נתונים לא מחובר",
  MARKET_PROPERTY_SOURCES_NOT_WIRED: "market_property_sources לא מחובר להערכה",
  INSUFFICIENT_EVIDENCE: "ראיות לא מספיקות",
  DATA_GAP: "אין נתונים כלל לאזור",
};
