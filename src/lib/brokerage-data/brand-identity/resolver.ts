// ============================================================================
// 🏷️ Brand & Branch resolver + identity matching (pure). 26.4.19.
// ----------------------------------------------------------------------------
// Resolves brand/branch from an office name (reusing the existing franchise
// detector) and decides office IDENTITY only from STRONG public signals. Brand
// or similar name is NEVER identity. Deterministic. No DB, no AI.
// ============================================================================
import { detectFranchise } from "../franchise";
import { normalizePhoneNumber } from "../normalize";
import type { BrandResolution, OfficeIdentity } from "./types";

/** Brand / branch / display name for an office name (Part 1). */
export function resolveBrandBranch(officeName: string): BrandResolution {
  const name = (officeName ?? "").trim();
  const fr = detectFranchise(name);
  if (fr.matched) {
    const branch = fr.officeBranchName && fr.officeBranchName.length >= 2 ? fr.officeBranchName : null;
    return { brand: fr.brandNetwork, normalizedBrand: fr.normalizedBrand, branch, displayName: name };
  }
  return { brand: null, normalizedBrand: "independent", branch: null, displayName: name };
}

const domainOf = (url: string | null): string | null => {
  if (!url) return null;
  const m = url.toLowerCase().match(/^https?:\/\/([^/]+)/);
  const d = (m ? m[1] : url.toLowerCase()).replace(/^www\./, "").split("/")[0];
  return d || null;
};
function normAddress(a: string | null): string | null {
  const t = (a ?? "").toLowerCase().replace(/["'`׳״]/g, "").replace(/[-־–—_,]/g, " ").replace(/\s+/g, " ").trim();
  return t.length >= 4 ? t : null;
}

/** The strong identity signals of an office (never brand/name). */
export function identityOf(o: { phone: string | null; website: string | null; address: string | null; latitude: number | null; longitude: number | null }): OfficeIdentity {
  const coords = o.latitude != null && o.longitude != null ? `${o.latitude.toFixed(5)},${o.longitude.toFixed(5)}` : null;
  return { phone: normalizePhoneNumber(o.phone ?? "") || null, domain: domainOf(o.website), address: normAddress(o.address), coords };
}

/** Two offices are possible duplicates ONLY on strong shared identity (Part 2/4). */
export function sharedIdentitySignals(a: OfficeIdentity, b: OfficeIdentity): string[] {
  const out: string[] = [];
  if (a.phone && b.phone && a.phone === b.phone) out.push("אותו טלפון");
  if (a.domain && b.domain && a.domain === b.domain) out.push("אותו אתר/דומיין");
  if (a.address && b.address && a.address === b.address) out.push("אותה כתובת");
  if (a.coords && b.coords && a.coords === b.coords) out.push("אותן קואורדינטות");
  return out;
}

export function explainBrand(res: BrandResolution): string {
  return res.brand ? `מותג זוהה: ${res.brand}${res.branch ? ` · סניף: ${res.branch}` : ""} (התאמת דפוס זכיינות)` : "משרד עצמאי — לא זוהה מותג";
}
export function explainSeparate(res: BrandResolution): string {
  return res.brand
    ? `סניף עצמאי של ${res.brand}${res.branch ? ` (${res.branch})` : ""} — סניפים של אותו מותג הם משרדים נפרדים`
    : "משרד עצמאי נפרד";
}
export function explainNotMerged(sharedWithAny: boolean): string {
  return sharedWithAny
    ? "לא מוזג אוטומטית — נמצאו מזהים משותפים; מסומן לבדיקה ידנית בלבד"
    : "לא מוזג — אותו מותג/שם דומה אינם ראיה לזהות; אין טלפון/אתר/כתובת/קואורדינטות משותפים";
}
