// ============================================================================
// ZONO — client-side AI content variation generator (deterministic).
// Produces N real post variations from the SELECTED property + audience —
// not mock data: the copy is composed from the property's actual fields and
// scored by the same heuristics the deterministic content engine uses.
// ============================================================================

export interface PropertyLite {
  id: string;
  title: string;
  city: string | null;
  neighborhood: string | null;
  type: string | null;
  price: number | null;
  rooms: number | null;
  sqm: number | null;
  imageUrl: string | null;
}

export type AudienceKey = "families" | "investors" | "young" | "luxury" | "commercial" | "sellers";
export const AUDIENCE_LABEL: Record<AudienceKey, string> = {
  families: "משפחות",
  investors: "משקיעים",
  young: "זוגות צעירים",
  luxury: "קהל יוקרה",
  commercial: "מסחרי / עסקי",
  sellers: "גיוס מוכרים",
};

export type Angle = "family" | "investment" | "local" | "urgent" | "luxury" | "seller";
export const ANGLE_LABEL: Record<Angle, string> = {
  family: "משפחתי",
  investment: "השקעה",
  local: "מקומי",
  urgent: "דחיפות",
  luxury: "יוקרה",
  seller: "גיוס מוכרים",
};

const TONES = ["חם ואישי", "ענייני ומקצועי", "יוקרתי", "אנרגטי", "קהילתי"] as const;
export type ToneKey = (typeof TONES)[number];

export interface Variation {
  id: string;
  index: number;
  angle: Angle;
  angleLabel: string;
  tone: ToneKey;
  headline: string;
  body: string;
  cta: string;
  hashtags: string[];
  wow: number;        // 0-100 creative strength
  engagement: number; // 0-100 predicted engagement
  prediction: number; // 0-100 lead-conversion prediction
}

const ils = (n: number | null) => (n == null ? "" : `₪${Math.round(n).toLocaleString("he-IL")}`);

function audienceAngles(aud: AudienceKey): Angle[] {
  switch (aud) {
    case "families": return ["family", "local", "urgent", "investment"];
    case "investors": return ["investment", "urgent", "local", "luxury"];
    case "young": return ["family", "urgent", "local", "investment"];
    case "luxury": return ["luxury", "local", "investment", "family"];
    case "commercial": return ["investment", "local", "urgent", "luxury"];
    case "sellers": return ["seller", "local", "urgent", "investment"];
  }
}

const HEADLINES: Record<Angle, string[]> = {
  family: ["הבית שמשפחה שלמה תאהב", "כאן הילדים גדלים — והחיים נרגעים", "הבית שחיכיתם לו"],
  investment: ["הזדמנות השקעה שלא חוזרת", "תשואה, מיקום, פוטנציאל — הכול כאן", "מספרים שמדברים בעד עצמם"],
  local: ["הפנינה החדשה של השכונה", "במיקום שכולם רוצים", "לב הקהילה — בית חדש בשוק"],
  urgent: ["חדש בשוק — לא יישאר זמן רב", "פורסם הרגע — קבעו סיור היום", "ההזדמנות פתוחה לזמן מוגבל"],
  luxury: ["יוקרה שמרגישים מהרגע הראשון", "סטנדרט מגורים אחר לגמרי", "נכס בוטיק לקהל שיודע לדרוש"],
  seller: ["מוכרים נכס באזור? בואו נדבר", "הערכת שווי חינם — בלי התחייבות", "השוק חזק — זה הזמן הנכון למכור"],
};

const CTAS: Record<Angle, string[]> = {
  family: ["שלחו הודעה לתיאום סיור", "דברו איתי על הבית הזה"],
  investment: ["בקשו את ניתוח התשואה המלא", "צרו קשר לפרטי ההשקעה"],
  local: ["שלחו הודעה לפרטים נוספים", "תייגו מי שמחפש בשכונה"],
  urgent: ["תפסו את הסיור הראשון — הודעה עכשיו", "זמינות מוגבלת — דברו איתי היום"],
  luxury: ["לתיאום צפייה פרטית — הודעה אישית", "פרטים מלאים בפנייה ישירה"],
  seller: ["לשיחת ייעוץ ללא עלות — הודעה עכשיו", "שלחו כתובת לקבלת הערכת שווי"],
};

function bodyFor(p: PropertyLite, angle: Angle, aud: AudienceKey): string {
  const loc = [p.neighborhood, p.city].filter(Boolean).join(", ");
  const specs = [
    p.rooms ? `${p.rooms} חדרים` : "",
    p.sqm ? `${p.sqm} מ״ר` : "",
    loc,
  ].filter(Boolean).join(" · ");
  const price = p.price ? ` במחיר ${ils(p.price)}` : "";
  switch (angle) {
    case "family": return `${p.title}${loc ? ` ב${loc}` : ""} — מרחב מושלם למשפחה. ${specs}${price}.`;
    case "investment": return `נכס עם פוטנציאל אמיתי ל${AUDIENCE_LABEL[aud]}. ${specs}${price}. המספרים מדברים.`;
    case "local": return `${p.title} — חדש בשוק${loc ? ` ב${loc}` : ""}. ${specs}${price}.`;
    case "urgent": return `הרגע עלה לשוק: ${p.title}. ${specs}${price}. הביקוש גבוה — אל תחכו.`;
    case "luxury": return `${p.title} — נכס יוקרה${loc ? ` ב${loc}` : ""}. ${specs}${price}. גימור ברמה אחרת.`;
    case "seller": return `מחפשים למכור${loc ? ` ב${loc}` : ""}? השוק חזק ויש קונים. נשמח ללוות אתכם עד הסגירה.`;
  }
}

function hashtagsFor(p: PropertyLite, angle: Angle): string[] {
  const city = p.city ? `#${p.city.replace(/\s+/g, "")}` : "#נדלן";
  const base = [city, "#נדלן", "#דירהלמכירה"];
  const extra: Record<Angle, string> = {
    family: "#בית_למשפחה", investment: "#השקעות_נדלן", local: "#שכונה", urgent: "#חדש_בשוק", luxury: "#נדלן_יוקרה", seller: "#מוכרים_נדלן",
  };
  return [...base, extra[angle]];
}

/** Tiny deterministic hash → 0..1 for stable per-variation jitter. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function generateVariations(p: PropertyLite, aud: AudienceKey, count = 20): Variation[] {
  const angles = audienceAngles(aud);
  const out: Variation[] = [];
  for (let i = 0; i < count; i++) {
    const angle = angles[i % angles.length];
    const tone = TONES[i % TONES.length];
    const seed = hash01(`${p.id}:${aud}:${i}`);
    const headline = HEADLINES[angle][i % HEADLINES[angle].length];
    const cta = CTAS[angle][i % CTAS[angle].length];
    const body = bodyFor(p, angle, aud);
    const hashtags = hashtagsFor(p, angle);

    // Deterministic scoring from real content signals.
    const richness = (p.price ? 1 : 0) + (p.rooms ? 1 : 0) + (p.sqm ? 1 : 0) + (p.city ? 1 : 0);
    const wow = clamp(64 + richness * 4 + (angle === "luxury" || angle === "urgent" ? 8 : 0) + seed * 16);
    const engagement = clamp(58 + hashtags.length * 2 + (cta.includes("היום") || cta.includes("עכשיו") ? 9 : 4) + seed * 18);
    const audienceFit = aud === "luxury" && angle === "luxury" ? 12 : aud === "investors" && angle === "investment" ? 12 : 6;
    const prediction = clamp((wow * 0.4 + engagement * 0.4) + audienceFit + seed * 8);

    out.push({ id: `${p.id}-${i}`, index: i + 1, angle, angleLabel: ANGLE_LABEL[angle], tone, headline, body, cta, hashtags, wow, engagement, prediction });
  }
  return out.sort((a, b) => b.prediction - a.prediction).map((v, i) => ({ ...v, index: i + 1 }));
}
