// ============================================================================
// ZONO — Canonical LOCALITY identity (PURE, dependency-free, client-safe).
// ----------------------------------------------------------------------------
// ONE reusable engine that resolves the many ways an Israeli locality is written
// — Hebrew male/haser drift (קריית⇄קרית), final letters, gershayim/quotes,
// hyphens/whitespace, niqqud, AND Hebrew⇄English transliteration
// ("קריית ביאליק" ⇄ "Kiryat Bialik") — to ONE canonical key.
//
// WHY: live evidence proved a real coverage failure — an org's sold transactions
// were stored as "קריית ביאליק" while its 1,708 asking listings were stored as
// English "Kiryat Bialik", so asking evidence never matched the subject. This
// module is the single source of locality equality for the valuation evidence
// path (providers + discovery). It is NOT used for territory isolation, which
// deliberately keeps scripts distinct.
//
// It never invents a match: unknown names fall back to their own folded key, so
// two genuinely different places never unify.
// ============================================================================

const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

/** Fold a Hebrew locality to a comparison form: strip quotes/niqqud, unify
 *  hyphens/whitespace, fold final letters, and collapse male/haser drift
 *  (doubled yod/vav → single; קריית → קרית). Lowercased so Latin passes through. */
export function foldLocality(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFKC")
    .replace(/[֑-ׇ]/g, "")        // strip niqqud / cantillation
    .replace(/[׳״"'`’]/g, "")               // gershayim + quotes/apostrophes
    .replace(/[-־–—_/]+/g, " ")             // hyphens / maqaf / slash → space
    .replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c)
    .replace(/קריי/g, "קרי")                // Qiryat male → haser
    .replace(/י{2,}/g, "י")                 // doubled yod → single (male/haser)
    .replace(/ו{2,}/g, "ו")                 // doubled vav → single
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ── Canonical alias table ────────────────────────────────────────────────────
// canonicalId (a stable Hebrew name) → every real-world variant we resolve to it,
// Hebrew spellings + English transliterations. Extend as new localities appear;
// unlisted localities still work via foldLocality (they just canonicalize to
// their own folded Hebrew/Latin form). Focused on the Haifa/Krayot core seen in
// live data, plus the major metros.
const LOCALITY_ALIASES: Record<string, string[]> = {
  "קרית ביאליק": ["קרית ביאליק", "קריית ביאליק", "Kiryat Bialik", "Qiryat Bialik", "Kiryat Byalik"],
  "קרית מוצקין": ["קרית מוצקין", "קריית מוצקין", "Kiryat Motzkin", "Qiryat Motzkin"],
  "קרית ים": ["קרית ים", "קריית ים", "Kiryat Yam", "Qiryat Yam"],
  "קרית אתא": ["קרית אתא", "קריית אתא", "Kiryat Ata", "Kiryat Atta", "Qiryat Ata"],
  "קרית טבעון": ["קרית טבעון", "קריית טבעון", "Kiryat Tivon", "Kiryat Tiv'on", "Kiryat Tiv'on"],
  "קרית חיים": ["קרית חיים", "קריית חיים", "Kiryat Haim", "Kiryat Chaim"],
  "קרית מלאכי": ["קרית מלאכי", "קריית מלאכי", "Kiryat Malakhi", "Kiryat Malachi"],
  "קרית גת": ["קרית גת", "קריית גת", "Kiryat Gat"],
  "חיפה": ["חיפה", "Haifa", "Hefa"],
  "נשר": ["נשר", "Nesher"],
  "טירת כרמל": ["טירת כרמל", "Tirat Carmel", "Tirat HaCarmel", "Tirat Ha Carmel", "Tirat Karmel"],
  "עכו": ["עכו", "Akko", "Acre", "Acco"],
  "נהריה": ["נהריה", "נהרייה", "Nahariya", "Nahariyya"],
  "כרמיאל": ["כרמיאל", "Karmiel", "Carmiel"],
  "תל אביב יפו": ["תל אביב", "תל אביב יפו", "תל אביב - יפו", "Tel Aviv", "Tel Aviv-Yafo", "Tel Aviv Yafo", "Tel-Aviv"],
  "ירושלים": ["ירושלים", "Jerusalem", "Yerushalayim"],
  "באר שבע": ["באר שבע", "Beer Sheva", "Be'er Sheva", "Beersheba", "Beer-Sheva"],
  "ראשון לציון": ["ראשון לציון", "Rishon LeZion", "Rishon Lezion", "Rishon Le Zion"],
  "פתח תקווה": ["פתח תקווה", "פתח תקוה", "Petah Tikva", "Petach Tikva", "Petah Tiqwa"],
  "הרצליה": ["הרצליה", "הרצלייה", "Herzliya", "Herzeliya"],
  "רמת גן": ["רמת גן", "Ramat Gan"],
  "רעננה": ["רעננה", "Raanana", "Ra'anana"],
  "כפר סבא": ["כפר סבא", "Kfar Saba", "Kfar Sava"],
  "אשדוד": ["אשדוד", "Ashdod"],
  "אשקלון": ["אשקלון", "Ashkelon", "Ashqelon"],
  "נתניה": ["נתניה", "Netanya", "Nathanya"],
  "חדרה": ["חדרה", "Hadera", "Khadera"],
  "מודיעין": ["מודיעין", "מודיעין מכבים רעות", "Modiin", "Modi'in", "Modiin Maccabim Reut"],
  "בת ים": ["בת ים", "Bat Yam"],
  "חולון": ["חולון", "Holon"],
  "רחובות": ["רחובות", "Rehovot", "Rechovot"],
  "אילת": ["אילת", "Eilat", "Elat"],
  "עפולה": ["עפולה", "Afula"],
  "טבריה": ["טבריה", "Tiberias", "Tveria"],
  "נצרת": ["נצרת", "Nazareth", "Natzrat"],
  "יקנעם": ["יקנעם", "יקנעם עילית", "Yokneam", "Yokne'am"],
};

// Reverse index: folded(variant) → canonicalId. Built once.
const VARIANT_TO_CANONICAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [canonical, variants] of Object.entries(LOCALITY_ALIASES)) {
    m.set(foldLocality(canonical), canonical);
    for (const v of variants) m.set(foldLocality(v), canonical);
  }
  return m;
})();

/**
 * Canonical identity of a locality. Known localities (any Hebrew/English variant)
 * resolve to one stable Hebrew id; unknown localities resolve to their own folded
 * form (so distinct places stay distinct — never a fabricated match). "" for empty.
 */
export function canonicalLocality(name: string | null | undefined): string {
  const folded = foldLocality(name);
  if (!folded) return "";
  return VARIANT_TO_CANONICAL.get(folded) ?? folded;
}

/** True when two locality names denote the same canonical locality. */
export function sameLocality(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalLocality(a), cb = canonicalLocality(b);
  return ca !== "" && ca === cb;
}

/**
 * Canonical neighborhood key — Hebrew fold only (no cross-script table; strips a
 * leading "שכונת"). Loose equality is left to callers (both-way contains) because
 * neighborhood naming is far noisier than locality naming.
 */
export function canonicalNeighborhood(name: string | null | undefined): string {
  return foldLocality((name ?? "").replace(/^שכונת\s+/, ""));
}

/** Whether a locality name is written in Latin script (English transliteration). */
export function isLatinLocality(name: string | null | undefined): boolean {
  const s = (name ?? "").trim();
  return !!s && /[A-Za-z]/.test(s) && !/[֐-׿]/.test(s);
}
