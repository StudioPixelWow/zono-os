// ============================================================================
// Evidence Search Engine™ — QA self-checks (PURE, deterministic). Validates the
// invariants the spec requires without a test runner: normalization, match-level
// classification, nearby-city gating and failure-mode honesty. Call evidenceQA()
// to get a pass/fail list (used by QA and debug surfaces).
// ============================================================================
import { normalizeCity, normalizeStreet } from "./normalizers";
import { classifyFailure } from "./explain";

export interface QaCheck { name: string; pass: boolean; detail: string }

export function evidenceQA(): { allPass: boolean; checks: QaCheck[] } {
  const checks: QaCheck[] = [];
  const eq = (name: string, a: unknown, b: unknown) => checks.push({ name, pass: a === b, detail: `${JSON.stringify(a)} === ${JSON.stringify(b)}` });

  // Hebrew city normalization
  eq("city קרית==קריית", normalizeCity("קרית ביאליק"), normalizeCity("קריית ביאליק"));
  eq("city hyphen/maqaf", normalizeCity("תל אביב-יפו"), normalizeCity("תל אביב יפו"));
  eq("city finals", normalizeCity("ראשון לציון"), normalizeCity("ראשון לציון "));
  // Street normalization (abbreviations + leading type word)
  eq("street שד׳==שדרות", normalizeStreet("שד׳ רוטשילד"), normalizeStreet("שדרות רוטשילד"));
  eq("street drop type word", normalizeStreet("רחוב הרצל"), normalizeStreet("הרצל"));

  // Failure-mode honesty
  checks.push({ name: "usable→no failure", pass: classifyFailure({ hasCity: true, cityResolved: true, hasCoordinates: true, totalRows: 5, pricedRows: 5, sizedRows: 5, usableRows: 3, sameCityRows: 5, normalizedCityRows: 5, radiusRows: 2, mpsUsableButUnwired: false, anySourceError: false }) === null, detail: "usable>0 → null" });
  checks.push({ name: "no rows→DATA_GAP", pass: classifyFailure({ hasCity: true, cityResolved: true, hasCoordinates: false, totalRows: 0, pricedRows: 0, sizedRows: 0, usableRows: 0, sameCityRows: 0, normalizedCityRows: 0, radiusRows: 0, mpsUsableButUnwired: false, anySourceError: false }) === "DATA_GAP", detail: "0 rows → DATA_GAP" });
  checks.push({ name: "rows no price→NO_PRICED_PROPERTIES", pass: classifyFailure({ hasCity: true, cityResolved: true, hasCoordinates: true, totalRows: 8, pricedRows: 0, sizedRows: 4, usableRows: 0, sameCityRows: 8, normalizedCityRows: 8, radiusRows: 0, mpsUsableButUnwired: false, anySourceError: false }) === "NO_PRICED_PROPERTIES", detail: "priced=0 → NO_PRICED_PROPERTIES" });
  checks.push({ name: "mps unwired→MARKET_PROPERTY_SOURCES_NOT_WIRED", pass: classifyFailure({ hasCity: true, cityResolved: true, hasCoordinates: false, totalRows: 6, pricedRows: 6, sizedRows: 6, usableRows: 0, sameCityRows: 6, normalizedCityRows: 6, radiusRows: 0, mpsUsableButUnwired: true, anySourceError: false }) === "MARKET_PROPERTY_SOURCES_NOT_WIRED", detail: "mps usable but unwired" });
  checks.push({ name: "no city→CITY_NOT_RESOLVED", pass: classifyFailure({ hasCity: false, cityResolved: false, hasCoordinates: false, totalRows: 0, pricedRows: 0, sizedRows: 0, usableRows: 0, sameCityRows: 0, normalizedCityRows: 0, radiusRows: 0, mpsUsableButUnwired: false, anySourceError: false }) === "CITY_NOT_RESOLVED", detail: "no city" });

  return { allPass: checks.every((c) => c.pass), checks };
}
