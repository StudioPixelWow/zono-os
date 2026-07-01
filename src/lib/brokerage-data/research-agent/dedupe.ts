// ============================================================================
// 🧹 Research Agent — deduplication (pure). Phase 26.4.13.
// ----------------------------------------------------------------------------
// Collapses Hebrew/English + brand + punctuation + branch + spelling variants
// (RE/MAX ≡ רימקס ≡ רי/מקס; Anglo-Saxon ≡ אנגלו סכסון) to ONE canonical
// candidate, keeping every surface form as an alias. No duplicate candidates.
// ============================================================================
import { detectFranchise } from "../franchise";
import { normalizeHebrewName } from "../normalize";

/** Canonical dedupe key: franchise brand (if any) + normalized office name. */
export function canonicalKey(rawName: string, cityLabel: string): { key: string; officeName: string; normalizedName: string; normalizedBrand: string; brandNetwork: string | null; branch: string | null } | null {
  const name = (rawName ?? "").trim();
  if (name.length < 2) return null;
  const fr = detectFranchise(name);
  const officeName = fr.matched ? `${fr.brandNetwork} ${cityLabel}` : name;
  const normalizedName = normalizeHebrewName(officeName);
  if (!normalizedName) return null;
  return {
    key: `${fr.normalizedBrand}|${normalizedName}`,
    officeName, normalizedName, normalizedBrand: fr.normalizedBrand,
    brandNetwork: fr.matched ? fr.brandNetwork : null,
    branch: fr.officeBranchName ?? null,
  };
}

export interface MergedName {
  key: string; officeName: string; normalizedName: string; normalizedBrand: string;
  brandNetwork: string | null; branch: string | null; aliases: string[];
}

/** Merge a list of raw names into canonical candidates with aliases. */
export function mergeNames(names: { raw: string }[], cityLabel: string): MergedName[] {
  const byKey = new Map<string, MergedName>();
  for (const n of names) {
    const c = canonicalKey(n.raw, cityLabel);
    if (!c) continue;
    const existing = byKey.get(c.key);
    if (existing) { if (!existing.aliases.includes(n.raw.trim())) existing.aliases.push(n.raw.trim()); }
    else byKey.set(c.key, { key: c.key, officeName: c.officeName, normalizedName: c.normalizedName, normalizedBrand: c.normalizedBrand, brandNetwork: c.brandNetwork, branch: c.branch, aliases: [n.raw.trim()] });
  }
  return [...byKey.values()];
}
