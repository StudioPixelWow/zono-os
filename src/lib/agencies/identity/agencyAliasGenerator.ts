// ============================================================================
// ZONO — Agency alias generator (Phase 26.2, PURE). From a clean identity,
// produce the common spelling variants used across listings (HE + EN), so the
// dedupe index catches the same agency under different forms.
// ============================================================================
import { normalizeAgencyName } from "../normalize";
import type { AgencyIdentity } from "./agencyIdentityTypes";

// Brand spelling variants to seed aliases.
const BRAND_VARIANTS: Record<string, string[]> = {
  "RE/MAX": ["רימקס", "Remax", "RE MAX", "RE/MAX", "רי/מקס", "רי מקס"],
  "Keller Williams": ["KW", "Keller Williams", "קלר וויליאמס", "קיי דאבליו"],
  "Anglo Saxon": ["Anglo Saxon", "אנגלו סכסון", "Anglo-Saxon"],
  "Century 21": ["Century 21", "סנצ'ורי 21", "C21"],
  "Home Land": ["Home Land", "הום לנד", "Homeland"],
};

/** Generate de-duplicated aliases for an agency identity. */
export function generateAgencyAliases(identity: Pick<AgencyIdentity, "brand" | "location" | "cleanedName" | "displayName">): string[] {
  const out = new Set<string>();
  const add = (s: string | null | undefined) => { const v = (s ?? "").trim(); if (v) out.add(v); };

  add(identity.cleanedName);
  add(identity.displayName);

  const brand = identity.brand.brandName;
  const branch = identity.location.branch;
  const city = identity.location.city;

  if (brand) {
    const variants = BRAND_VARIANTS[brand] ?? [brand];
    for (const v of variants) {
      add(v);
      if (branch) add(`${v} ${branch}`);
      if (city) add(`${v} ${city}`);
      if (branch && city) add(`${v} ${branch} ${city}`);
    }
  }
  if (branch && city) add(`${branch} ${city}`);
  if (branch) add(`${branch} נדלן`);

  // De-dupe by normalized form, keep the readable original.
  const seen = new Set<string>();
  const result: string[] = [];
  for (const a of out) {
    const n = normalizeAgencyName(a);
    if (n && !seen.has(n)) { seen.add(n); result.push(a); }
  }
  return result;
}
