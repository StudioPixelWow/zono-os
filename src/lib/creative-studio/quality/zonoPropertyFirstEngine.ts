// ============================================================================
// ZONO Property First Engine (pure) — before creating a property creative, find
// the strongest marketing angle so we never produce a generic "new apartment"
// ad when a stronger selling point exists. Deterministic, client-safe.
// ============================================================================

export interface PropertyFirstInput {
  requestType?: string; // property_ad_post | sold_post | testimonial_post | ...
  propertyType?: string | null; // penthouse | garden_apartment | ...
  city?: string | null;
  neighborhood?: string | null;
  price?: number | null;
  rooms?: number | null;
  sizeSqm?: number | null;
  floor?: number | null;
  balcony?: boolean | null;
  parking?: boolean | null;
  storage?: boolean | null;
  elevator?: boolean | null;
  renovated?: boolean | null;
  hasPropertyImage?: boolean;
  importantText?: string | null;
}

export interface PropertyFirstResult {
  propertyPrimaryAngle: string;
  propertySecondaryAngles: string[];
  visualAnchor: string;
  marketingAngle: string;
  recommendedHeadlineDirection: string;
  recommendedCtaDirection: string;
  propertyStrengthScore: number;
}

type Angle = { key: string; label: string; weight: number; headline: string; cta: string; anchor: string };

/** Score-and-rank candidate angles from the facts the agent actually provided. */
export function detectPropertyAngle(i: PropertyFirstInput): PropertyFirstResult {
  const angles: Angle[] = [];
  const txt = (i.importantText ?? "").toLowerCase();
  const type = (i.propertyType ?? "").toLowerCase();
  const rt = (i.requestType ?? "").toLowerCase();

  // Non-property creative types carry their own dominant angle.
  if (rt.includes("sold")) {
    return result("הצלחת מכירה מקומית", ["מכירה מהירה", "בלעדיות", "הוכחה חברתית"], "תמונת הנכס שנמכר עם תג 'נמכר'", "הוכחה מקומית — תוצאות אמיתיות באזור", "כותרת חגיגית של הצלחה ('נמכר!')", "השאר/י פרטים — נמכור גם את הנכס שלך", 92);
  }
  if (rt.includes("testimonial")) {
    return result("אמון ושירות", ["מערכת יחסים", "תוצאה", "מקצועיות"], "תמונת סוכן + ציטוט לקוח", "אמון אישי ושירות שמביא תוצאות", "ציטוט לקוח אותנטי בגוף ראשון", "רוצים חוויית שירות כזו? דברו איתי", 90);
  }

  // Property-ad angles — weighted by the strongest real fact.
  if (type.includes("penthouse")) angles.push({ key: "penthouse", label: "פנטהאוז יוקרתי", weight: 95, headline: "פרטיות, מרחב ותצוגה — פנטהאוז במיקום מנצח", cta: "לתיאום סיור פרטי", anchor: "מרפסת/גג ותצוגה רחבה כגיבור" });
  if (type.includes("garden")) angles.push({ key: "garden", label: "דירת גן משפחתית", weight: 90, headline: "גינה פרטית ואורח חיים משפחתי", cta: "בואו לראות את הגינה", anchor: "הגינה/חוץ כגיבור הוויזואלי" });
  if (type.includes("luxury") || (i.price ?? 0) >= 4_000_000) angles.push({ key: "luxury", label: "נכס יוקרה", weight: 88, headline: "סטנדרט גימור גבוה ומיקום יוקרתי", cta: "לפרטים אקסקלוסיביים", anchor: "פרטי גימור ואדריכלות" });
  if ((i.rooms ?? 0) >= 5) angles.push({ key: "family", label: "דירה משפחתית מרווחת", weight: 82, headline: `${i.rooms} חדרים מרווחים ${i.neighborhood ? "ב" + i.neighborhood : ""}`.trim(), cta: "מתאים למשפחה? דברו איתי", anchor: "סלון/מרחב פתוח כגיבור" });
  if (i.balcony) angles.push({ key: "balcony", label: "מרפסת ואוויר", weight: 70, headline: "מרפסת פתוחה ואוויר — איכות חיים יומיומית", cta: "לתיאום ביקור", anchor: "המרפסת כגיבור" });
  if ((i.price ?? Infinity) <= 1_800_000) angles.push({ key: "entry", label: "הזדמנות כניסה", weight: 78, headline: "הזדמנות כניסה במחיר נגיש ובמיקום מבוקש", cta: "לפני שזה נחטף — צרו קשר", anchor: "מספר מחיר בולט + מיקום" });
  if (i.parking && i.elevator && i.storage) angles.push({ key: "complete", label: "נכס שלם ומאובזר", weight: 72, headline: "חניה, מעלית ומחסן — נכס שלם בלי פשרות", cta: "לפרטים מלאים", anchor: "צ'יפים של מאפיינים על תמונת הנכס" });
  if (txt.includes("השקע") || txt.includes("תשוא")) angles.push({ key: "investor", label: "נכס להשקעה", weight: 80, headline: "פוטנציאל תשואה ומיקום מבוקש להשקעה", cta: "לקבלת נתוני תשואה", anchor: "דגש על מספרים ומיקום" });

  // Always-available baseline so the engine never returns empty.
  angles.push({ key: "location", label: "מיקום ואיכות חיים", weight: 60, headline: `${i.rooms ? i.rooms + " חדרים " : "נכס "}${i.neighborhood ? "ב" + i.neighborhood : i.city ? "ב" + i.city : ""}`.trim() || "נכס חדש למכירה", cta: "לפרטים נוספים — צרו קשר", anchor: "תמונת הנכס כגיבור" });

  angles.sort((a, b) => b.weight - a.weight);
  const primary = angles[0];
  const secondary = angles.slice(1, 4).map((a) => a.label);
  // Strength rises with how many strong facts back the primary angle.
  const factCount = [i.rooms, i.sizeSqm, i.floor, i.balcony, i.parking, i.storage, i.elevator, i.price].filter(Boolean).length;
  const strength = Math.min(100, primary.weight - (i.hasPropertyImage ? 0 : 6) + Math.min(10, factCount));

  return result(primary.label, secondary, primary.anchor, primary.label, primary.headline, primary.cta, strength);

  function result(primaryLabel: string, sec: string[], anchor: string, marketing: string, headline: string, cta: string, score: number): PropertyFirstResult {
    return {
      propertyPrimaryAngle: primaryLabel, propertySecondaryAngles: sec, visualAnchor: anchor,
      marketingAngle: marketing, recommendedHeadlineDirection: headline, recommendedCtaDirection: cta,
      propertyStrengthScore: Math.round(score),
    };
  }
}
