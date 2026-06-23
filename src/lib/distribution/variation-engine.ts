// ============================================================================
// ZONO Distribution AI Engine — pure, deterministic (client + server safe).
// Input: property + audience + location + type.
// Output: 20 COMPLETELY DIFFERENT Facebook post variations, each scored on
// Wow / Engagement / Lead, with the TOP 4 auto-selected. No LLM required — the
// copy is composed from the real property fields across distinct hooks, angles,
// headlines and CTAs, and scored by deterministic heuristics so results are
// stable per property yet varied across the catalogue.
// ============================================================================

export type AudienceKey = "families" | "investors" | "young" | "luxury" | "commercial" | "sellers";

export interface DistInput {
  title: string;
  audience: AudienceKey | string;
  city?: string | null;
  neighborhood?: string | null;
  propertyType?: string | null;
  price?: number | null;
  rooms?: number | null;
  sqm?: number | null;
  agentName?: string | null;
  agentPhone?: string | null;
}

export type AngleKey =
  | "family" | "investment" | "urgency" | "emotional"
  | "local" | "luxury" | "value" | "exclusivity";

export type HookKind =
  | "question" | "bold_claim" | "statistic" | "story"
  | "fomo" | "dream" | "direct" | "social_proof";

export interface DistVariation {
  id: string;
  index: number;
  angle: AngleKey;
  angleLabel: string;
  hookKind: HookKind;
  hook: string;
  headline: string;
  body: string;
  cta: string;
  hashtags: string[];
  tone: string;
  wowScore: number;        // creative / scroll-stopping power (0-100)
  engagementScore: number; // predicted likes / comments / shares (0-100)
  leadScore: number;       // predicted lead conversion (0-100)
  compositeScore: number;  // weighted blend used for ranking
  selected: boolean;
}

export interface DistResult {
  variations: DistVariation[];
  selected: DistVariation[]; // top 4
  count: number;
}

const ANGLE_LABEL: Record<AngleKey, string> = {
  family: "משפחתי", investment: "השקעה", urgency: "דחיפות", emotional: "רגשי",
  local: "מקומי", luxury: "יוקרה", value: "תמורה", exclusivity: "בלעדיות",
};

const ils = (n: number | null | undefined) => (n == null ? "" : `₪${Math.round(n).toLocaleString("he-IL")}`);

/** Audience → ordered angle priority (drives both ordering and lead weighting). */
function angleOrder(aud: string): AngleKey[] {
  switch (aud) {
    case "investors": return ["investment", "value", "urgency", "exclusivity", "local", "luxury", "emotional", "family"];
    case "families": return ["family", "emotional", "local", "value", "urgency", "exclusivity", "investment", "luxury"];
    case "young": return ["value", "urgency", "emotional", "local", "family", "exclusivity", "investment", "luxury"];
    case "luxury": return ["luxury", "exclusivity", "emotional", "local", "investment", "value", "family", "urgency"];
    case "commercial": return ["investment", "value", "exclusivity", "local", "urgency", "luxury", "emotional", "family"];
    case "sellers": return ["exclusivity", "urgency", "value", "local", "investment", "emotional", "family", "luxury"];
    default: return ["emotional", "family", "investment", "urgency", "local", "luxury", "value", "exclusivity"];
  }
}

const HOOKS: Record<AngleKey, { kind: HookKind; text: string }[]> = {
  family: [
    { kind: "dream", text: "דמיינו את הילדים גדלים כאן 🏡" },
    { kind: "question", text: "מחפשים בית שכל המשפחה תאהב?" },
    { kind: "story", text: "כאן מתחילים את הפרק הבא של החיים" },
  ],
  investment: [
    { kind: "statistic", text: "המספרים מדברים בעד עצמם 📊" },
    { kind: "bold_claim", text: "הזדמנות שמשקיע חכם לא מפספס" },
    { kind: "direct", text: "תשואה, מיקום, פוטנציאל — הכול כאן" },
  ],
  urgency: [
    { kind: "fomo", text: "חדש בשוק — וזה לא יישאר הרבה ⏳" },
    { kind: "fomo", text: "פורסם הרגע. הטלפון כבר מצלצל." },
    { kind: "bold_claim", text: "ההזדמנות פתוחה לזמן מוגבל בלבד" },
  ],
  emotional: [
    { kind: "dream", text: "תרגישו בבית מהרגע הראשון ✨" },
    { kind: "story", text: "יש בתים, ויש המקום שמרגיש נכון" },
    { kind: "question", text: "מתי בפעם האחרונה התאהבתם בבית?" },
  ],
  local: [
    { kind: "social_proof", text: "הפנינה החדשה של השכונה 📍" },
    { kind: "direct", text: "במיקום שכולם מחפשים" },
    { kind: "question", text: "תכירו את הבית הכי מדובר באזור" },
  ],
  luxury: [
    { kind: "bold_claim", text: "סטנדרט מגורים אחר לגמרי" },
    { kind: "dream", text: "יוקרה שמרגישים מהכניסה 🔑" },
    { kind: "social_proof", text: "נכס בוטיק לקהל שיודע לדרוש" },
  ],
  value: [
    { kind: "statistic", text: "התמורה הטובה ביותר לכסף 💰" },
    { kind: "direct", text: "מחיר שמדבר — ערך שנשאר" },
    { kind: "question", text: "כמה בית אפשר לקבל בתקציב הנכון?" },
  ],
  exclusivity: [
    { kind: "fomo", text: "בלעדי — לא תמצאו במקום אחר 🔒" },
    { kind: "social_proof", text: "מוצע לראשונה. לפני כולם." },
    { kind: "bold_claim", text: "נכס נדיר באזור מבוקש" },
  ],
};

const HEADLINES: Record<AngleKey, string[]> = {
  family: ["הבית שמשפחה שלמה תאהב", "כאן הילדים גדלים והחיים נרגעים", "מרחב מושלם למשפחה שגדלה"],
  investment: ["הזדמנות השקעה שלא חוזרת", "נכס עם פוטנציאל אמיתי", "השקעה חכמה במיקום מנצח"],
  urgency: ["חדש בשוק — קבעו סיור היום", "אחרון מסוגו באזור", "ההזדמנות שלא תחזור"],
  emotional: ["הבית שחיכיתם לו", "המקום שמרגיש כמו בית", "כאן מתחילים מחדש"],
  local: ["הנכס החם של השכונה", "במרכז הכול, רגע מהבית", "לב הקהילה — בית חדש בשוק"],
  luxury: ["יוקרה בכל פרט", "נכס פרימיום לקהל מבחין", "מגורי יוקרה במיקום מנצח"],
  value: ["הרבה בית, מחיר נכון", "התמורה שחיפשתם", "ערך אמיתי לכל שקל"],
  exclusivity: ["בלעדי לפרסום", "נכס נדיר — מוצע לראשונה", "הזדמנות חד פעמית באזור"],
};

const CTAS: { angle: AngleKey | "any"; text: string; leadWeight: number }[] = [
  { angle: "any", text: "שלחו הודעה לתיאום סיור 📲", leadWeight: 16 },
  { angle: "urgency", text: "תפסו את הסיור הראשון — הודעה עכשיו ⏳", leadWeight: 20 },
  { angle: "investment", text: "בקשו את ניתוח התשואה המלא 📊", leadWeight: 18 },
  { angle: "family", text: "דברו איתי על הבית הזה 🏡", leadWeight: 15 },
  { angle: "luxury", text: "לתיאום צפייה פרטית — פנייה אישית 🔑", leadWeight: 17 },
  { angle: "exclusivity", text: "פרטים מלאים בפנייה ישירה 🔒", leadWeight: 16 },
  { angle: "value", text: "רוצים לדעת מחיר? שלחו הודעה 💬", leadWeight: 15 },
  { angle: "any", text: "תייגו מי שמחפש 👇", leadWeight: 8 },
  { angle: "any", text: "התקשרו עכשיו לפרטים ☎️", leadWeight: 19 },
];

const TONES: Record<AngleKey, string> = {
  family: "חם ואישי", investment: "ענייני ומבוסס-נתונים", urgency: "אנרגטי ודחוף",
  emotional: "רגשי ומזמין", local: "קהילתי", luxury: "יוקרתי ומדויק",
  value: "ישיר ומשכנע", exclusivity: "אקסקלוסיבי",
};

function bodyFor(p: DistInput, angle: AngleKey): string {
  const loc = [p.neighborhood, p.city].filter(Boolean).join(", ");
  const specs = [p.rooms ? `${p.rooms} חד׳` : "", p.sqm ? `${p.sqm} מ״ר` : "", loc].filter(Boolean).join(" · ");
  const price = p.price ? ` במחיר ${ils(p.price)}` : "";
  switch (angle) {
    case "family": return `${p.title}${loc ? ` ב${loc}` : ""} — מרחב מושלם למשפחה. ${specs}${price}.`;
    case "investment": return `נכס עם פוטנציאל תשואה אמיתי. ${specs}${price}. מספרים שמדברים.`;
    case "urgency": return `הרגע עלה לשוק: ${p.title}. ${specs}${price}. הביקוש גבוה — אל תחכו.`;
    case "emotional": return `${p.title} — בית שמרגיש נכון מהרגע הראשון. ${specs}${price}.`;
    case "local": return `${p.title} — חדש בשוק${loc ? ` ב${loc}` : ""}. ${specs}${price}.`;
    case "luxury": return `${p.title} — נכס יוקרה${loc ? ` ב${loc}` : ""}. ${specs}${price}. גימור ברמה אחרת.`;
    case "value": return `${p.title} — הרבה בית בתקציב נכון. ${specs}${price}.`;
    case "exclusivity": return `${p.title} — מוצע לראשונה ובלעדי${loc ? ` ב${loc}` : ""}. ${specs}${price}.`;
  }
}

function hashtagsFor(p: DistInput, angle: AngleKey): string[] {
  const city = p.city ? `#${p.city.replace(/\s+/g, "")}` : "#נדלן";
  const extra: Record<AngleKey, string> = {
    family: "#בית_למשפחה", investment: "#השקעות_נדלן", urgency: "#חדש_בשוק", emotional: "#הבית_שלכם",
    local: "#שכונה", luxury: "#נדלן_יוקרה", value: "#מחיר_משתלם", exclusivity: "#בלעדי",
  };
  return [city, "#נדלן", "#דירה_למכירה", extra[angle]];
}

/** Tiny deterministic hash → 0..1 for stable per-variation jitter. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const HOOK_WOW: Record<HookKind, number> = {
  fomo: 16, bold_claim: 14, dream: 13, story: 12, statistic: 11, question: 10, social_proof: 10, direct: 8,
};
const HOOK_ENGAGE: Record<HookKind, number> = {
  question: 18, fomo: 15, story: 14, social_proof: 13, dream: 12, bold_claim: 10, statistic: 9, direct: 8,
};

/**
 * Generate `count` (default 20) distinct, scored Facebook post variations and
 * auto-select the top 4 by composite score.
 */
export function generateDistributionVariations(input: DistInput, count = 20): DistResult {
  const order = angleOrder(String(input.audience));
  const seedKey = `${input.title}|${input.audience}|${input.city ?? ""}`;
  const seen = new Set<string>();
  const out: DistVariation[] = [];
  const richness = (input.price ? 1 : 0) + (input.rooms ? 1 : 0) + (input.sqm ? 1 : 0) + (input.city ? 1 : 0);

  for (let i = 0; out.length < count && i < count * 3; i++) {
    const angle = order[i % order.length];
    const variant = Math.floor(i / order.length);
    const hooks = HOOKS[angle];
    const heads = HEADLINES[angle];
    const seed = hash01(`${seedKey}|${i}`);
    const hook = hooks[(variant + Math.floor(seed * hooks.length)) % hooks.length];
    const headline = heads[(variant + i) % heads.length];

    const dedupe = `${angle}|${hook.text}|${headline}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const ctaPool = CTAS.filter((c) => c.angle === angle || c.angle === "any");
    const cta = ctaPool[(variant + Math.floor(seed * ctaPool.length)) % ctaPool.length];
    const hashtags = hashtagsFor(input, angle);

    // ── Scores (deterministic, from real content + input signals) ─────────────
    const headlinePunch = Math.min(10, Math.max(0, 22 - Math.abs(headline.length - 18)));
    const wow = clamp(58 + HOOK_WOW[hook.kind] + headlinePunch * 0.6 + richness * 2 + seed * 12);

    const ctaIsDirect = /עכשיו|היום|התקשרו|הודעה/.test(cta.text);
    const engagement = clamp(54 + HOOK_ENGAGE[hook.kind] + hashtags.length * 2 + (ctaIsDirect ? 8 : 4) + seed * 14);

    const audienceFit =
      (String(input.audience) === "investors" && (angle === "investment" || angle === "value")) ? 14 :
      (String(input.audience) === "families" && (angle === "family" || angle === "emotional")) ? 14 :
      (String(input.audience) === "luxury" && (angle === "luxury" || angle === "exclusivity")) ? 14 : 6;
    const urgencyBoost = angle === "urgency" ? 8 : 0;
    const priceClarity = input.price ? 6 : 0;
    const lead = clamp(46 + cta.leadWeight + audienceFit + urgencyBoost + priceClarity + seed * 8);

    const composite = clamp(wow * 0.34 + engagement * 0.30 + lead * 0.36);

    out.push({
      id: `${i}`,
      index: out.length + 1,
      angle,
      angleLabel: ANGLE_LABEL[angle],
      hookKind: hook.kind,
      hook: hook.text,
      headline,
      body: bodyFor(input, angle),
      cta: cta.text,
      hashtags,
      tone: TONES[angle],
      wowScore: wow,
      engagementScore: engagement,
      leadScore: lead,
      compositeScore: composite,
      selected: false,
    });
  }

  // Rank by composite, auto-select the top 4.
  const ranked = [...out].sort((a, b) => b.compositeScore - a.compositeScore);
  const topIds = new Set(ranked.slice(0, 4).map((v) => v.id));
  for (const v of out) v.selected = topIds.has(v.id);
  const sorted = out
    .map((v) => ({ ...v }))
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((v, i) => ({ ...v, index: i + 1 }));

  return { variations: sorted, selected: sorted.filter((v) => v.selected), count: sorted.length };
}
