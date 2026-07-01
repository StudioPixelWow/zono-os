// ============================================================================
// 🔤 Normalizers (pure). VAL-QA-10 — reuse the Evidence Search Engine's
// Hebrew-aware city/street/neighborhood folds so discovery matches identically.
// ============================================================================
export {
  normalizeCity, normalizeStreet, normalizeNeighborhood, normalizeHouseNumber,
  firstStr, firstNum, strOf, numOf,
} from "@/lib/evidence-search/normalizers";

/** A coarse address key for dedupe (city+street+house, normalized). */
import { normalizeCity, normalizeStreet } from "@/lib/evidence-search/normalizers";
export function addressKey(city: string | null, street: string | null): string {
  const c = normalizeCity(city);
  const s = normalizeStreet(street);
  return `${c}|${s}`;
}
