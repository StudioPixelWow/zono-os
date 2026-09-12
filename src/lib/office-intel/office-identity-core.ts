// ============================================================================
// ZONO — CANONICAL OFFICE IDENTITY · pure core (no DB, deterministic, tested).
// Turns a raw advertiser "agency name" (yad2 `agencyName`, etc.) into a canonical
// office identity, reusing the existing franchise resolver so brand variants
// (RE/MAX = רימקס = Re/max) collapse to one BRAND while different BRANCHES stay
// separate (Brand ≠ Branch). Never invents membership; name-only, so callers must
// pair it with real listing/source evidence before asserting an agent works there.
// ============================================================================
import { detectFranchise } from "@/lib/brokerage-data/franchise";
import { normalizeHebrewName } from "@/lib/broker/engine";

export interface OfficeIdentity {
  raw: string;
  displayName: string;
  normalizedName: string;   // fold of the full office name
  brandNetwork: string;     // "RE/MAX" … or "independent"
  normalizedBrand: string;  // "remax" … or "independent"
  branch: string | null;    // residual branch label when a brand matched
  key: string;              // canonical office key — brand|branch(or name)|city
  isBrandFranchise: boolean;
  usable: boolean;          // false for junk/empty/generic names
}

// Generic advertiser strings that are NOT an office (never make an office of these).
const JUNK = new Set(["", "פרטי", "private", "בעלים", "owner", "יזם", "קבלן", "ללא", "n/a", "unknown", "לא ידוע"]);

const fold = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFKC").replace(/[‎‏]/g, "").replace(/["'`׳״]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Canonicalize a raw agency/office name (optionally scoped by city). The key is
 * brand-aware: a matched brand + its branch (and city) identifies the office, so
 * two RE/MAX branches never merge, while spelling variants of the SAME branch do.
 * An independent office keys by its folded full name + city.
 */
export function canonicalOfficeIdentity(rawName: string | null | undefined, city?: string | null): OfficeIdentity {
  const raw = (rawName ?? "").trim();
  const foldedName = fold(raw);
  const usable = !!foldedName && !JUNK.has(foldedName) && foldedName.length >= 2;
  const fr = detectFranchise(raw);
  const cityKey = fold(city);
  const branchFold = fr.officeBranchName ? normalizeHebrewName(fr.officeBranchName) : "";
  // Key: a franchise office is brand + branch + city; an independent office is its
  // folded full name + city. City keeps two same-named offices in different cities apart.
  const key = fr.matched
    ? ["remax_brand", fr.normalizedBrand, branchFold || "main", cityKey].join("|")
    : ["indep", normalizeHebrewName(raw) || foldedName, cityKey].join("|");
  return {
    raw, displayName: raw, normalizedName: normalizeHebrewName(raw) || foldedName,
    brandNetwork: fr.brandNetwork, normalizedBrand: fr.normalizedBrand,
    branch: fr.officeBranchName, key, isBrandFranchise: fr.matched, usable,
  };
}

/** Two raw names denote the same canonical office (same key). */
export function sameOffice(a: string | null | undefined, b: string | null | undefined, cityA?: string | null, cityB?: string | null): boolean {
  const ia = canonicalOfficeIdentity(a, cityA), ib = canonicalOfficeIdentity(b, cityB);
  return ia.usable && ib.usable && ia.key === ib.key;
}
