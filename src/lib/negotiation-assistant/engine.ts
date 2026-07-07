// ============================================================================
// 🤝 ZONO — AI Negotiation Assistant — engine (pure & deterministic). PHASE 59.0.
// Objection + legal detection, offer comparison, price strategy, seller/buyer
// leverage, talking points, DRAFT-ONLY message suggestions, meeting prep and
// risk/confidence. Enforces the hard rules: legal → handoff, no fabricated
// valuation, hedged (never binding) language, nothing auto-sent.
// ============================================================================
import {
  NEGOTIATION_VERSION, OBJECTION_HE, STANCE_HE, RULES_NOTE,
  type NegotiationInput, type NegotiationPlan, type Objection, type ObjectionKind,
  type RankedOffer, type PriceStrategy, type Stance, type DraftSuggestion, type LegalHandoff, type RiskLevel,
} from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ── Objection detection ───────────────────────────────────────────────────────
const OBJ_KW: Record<ObjectionKind, string[]> = {
  price_too_high: ["יקר", "מחיר גבוה", "מעל התקציב", "too expensive", "over budget", "מחיר לא ריאלי"],
  needs_time: ["צריך לחשוב", "לא בטוח", "זמן", "נחזור", "מתלבט", "need time", "think about"],
  competing_offer: ["הצעה אחרת", "מתחרה", "נכס אחר", "competing", "another offer", "בודקים עוד"],
  financing: ["משכנתא", "מימון", "אישור עקרוני", "בנק", "financing", "mortgage", "loan"],
  condition: ["שיפוץ", "מצב", "רטיבות", "ליקוי", "renovation", "condition", "repairs"],
  location: ["רחוק", "מיקום", "רעש", "location", "far", "noisy"],
  other: [],
};
export function detectObjections(notes: string[]): Objection[] {
  const text = notes.join(" \n ").toLowerCase();
  const out: Objection[] = [];
  (Object.keys(OBJ_KW) as ObjectionKind[]).forEach((k) => {
    if (k === "other") return;
    const hit = OBJ_KW[k].find((kw) => text.includes(kw.toLowerCase()));
    if (hit) out.push({ kind: k, label: OBJECTION_HE[k], evidence: hit, rebuttal: rebuttalFor(k) });
  });
  return out;
}
function rebuttalFor(k: ObjectionKind): string {
  const map: Record<ObjectionKind, string> = {
    price_too_high: "מקד בערך ובהשוואת שוק (ללא התחייבות מחיר); בדוק גמישות במימון/מועד מסירה.",
    needs_time: "הצע צעד קטן הבא (סיור נוסף/פרטים), שמור על מומנטום עם מועד מעקב מוסכם.",
    competing_offer: "הדגש יתרונות ייחודיים ומוכנות לסגירה; אל תבטיח מחיר מתחרים.",
    financing: "הפנה לבדיקת אישור עקרוני; אל תיתן הבטחות פיננסיות — זה תלוי בבנק ובלקוח.",
    condition: "הצג מידע עובדתי על מצב הנכס; הצע בדיקה מקצועית במקום התחייבות.",
    location: "מקד ביתרונות האזור ובנתוני שוק; התאם ציפיות בכנות.",
    other: "הקשב, שקף את החשש וברר את הצורך האמיתי.",
  };
  return map[k];
}

// ── Legal handoff (NO legal advice) ───────────────────────────────────────────
const LEGAL_KW = ["חוזה", "סעיף", "משפט", "עורך דין", "עו\"ד", "תביעה", "מיסוי", "מס שבח", "היטל", "צוואה", "ירושה", "עיקול", "legal", "lawyer", "contract clause", "lawsuit", "tax"];
export function detectLegal(notes: string[]): LegalHandoff {
  const evidence = LEGAL_KW.filter((k) => notes.join(" ").toLowerCase().includes(k.toLowerCase()));
  return {
    triggered: evidence.length > 0,
    message: evidence.length ? "זוהתה שאלה משפטית/מיסויית. זונו אינו מספק ייעוץ משפטי — הפנה את הלקוח לעורך דין/יועץ מס מוסמך." : "",
    evidence,
  };
}

// ── Offer comparison ──────────────────────────────────────────────────────────
export function compareOffers(offers: NegotiationInput["offers"], asking: number | null, estimated: number | null): RankedOffer[] {
  const ranked = offers.map((o) => {
    const gapToAskingPct = asking && o.amount != null ? Math.round(((o.amount - asking) / asking) * 100) : null;
    const gapToValuationPct = estimated && o.amount != null ? Math.round(((o.amount - estimated) / estimated) * 100) : null;
    const certainty = clamp((o.preapproved ? 55 : o.hasFinancing ? 30 : 15) + Math.max(0, 30 - o.contingencies.length * 10) + 15);
    const priceScore = gapToAskingPct == null ? 40 : clamp(70 + gapToAskingPct * 1.5);
    const strength = clamp(priceScore * 0.6 + certainty * 0.4);
    return { id: o.id, buyerName: o.buyerName, amount: o.amount, gapToAskingPct, gapToValuationPct, certainty, strength, rank: 0,
      note: `${o.preapproved ? "אישור עקרוני" : o.hasFinancing ? "מימון מוצהר" : "ללא אישור מימון"}${o.contingencies.length ? ` · ${o.contingencies.length} תנאים` : ""}` };
  }).sort((a, b) => b.strength - a.strength);
  return ranked.map((r, i) => ({ ...r, rank: i + 1 }));
}

// ── Price strategy (NO fabricated valuation) ──────────────────────────────────
export function priceStrategy(input: NegotiationInput, ranked: RankedOffer[]): PriceStrategy {
  const estimated = input.valuation?.estimated ?? null;
  const usesValuation = estimated != null;
  const flex = input.sellerSignals.flexibility ?? 50;
  const best = ranked[0] ?? null;
  const gap = best?.gapToAskingPct ?? null;

  let stance: Stance;
  if (ranked.length >= 2) stance = "gather";
  else if (best == null) stance = "gather";
  else if (gap != null && gap >= -3) stance = "accept";
  else if (flex <= 35) stance = "hold";
  else stance = "counter";

  // Counter range is RELATIVE to asking (never invents an absolute valuation).
  const counterRange = stance === "counter"
    ? { minPct: flex >= 60 ? -8 : -5, maxPct: -2 }
    : stance === "hold" ? { minPct: -3, maxPct: 0 } : null;

  // Confidence rises with valuation availability + data; capped lower without valuation.
  let confidence = clamp((usesValuation ? 70 : 45) + (ranked.length ? 10 : 0) + (input.sellerSignals.flexibility != null ? 8 : 0));
  if (!usesValuation) confidence = Math.min(confidence, 55);

  const rationale = stance === "accept" ? "ההצעה קרובה למחיר המבוקש ובטוחה — שקול קבלה בכפוף לתנאים."
    : stance === "gather" ? "יש מספר הצעות/עניין — כדאי לאסוף ולהשוות לפני החלטה."
    : stance === "hold" ? "המוכר לא גמיש והביקוש תומך — החזק מחיר עם פתיחות לתנאים."
    : "יש פער מחיר וגמישות — הצע הצעה נגדית ממוקדת.";

  return {
    stance, stanceHe: STANCE_HE[stance], counterRange, rationale, confidence, usesValuation,
    note: usesValuation ? "האסטרטגיה נשענת על הערכת שווי קיימת (טווח)." : "אין הערכת שווי — האסטרטגיה יחסית למחיר המבוקש ולאותות שוק בלבד; אין להמציא מחיר. שקול הזמנת הערכת שווי.",
  };
}

// ── Talking points + drafts (hedged, draft-only) ──────────────────────────────
function talkingPoints(input: NegotiationInput, strategy: PriceStrategy, objections: Objection[]): string[] {
  const tp: string[] = [];
  tp.push("פתח בהקשבה: ברר את הצורך והמניע האמיתי של הצד השני.");
  if (strategy.stance === "counter") tp.push(`הצע הצעה נגדית בטווח ${strategy.counterRange?.minPct}% עד ${strategy.counterRange?.maxPct}% מהמחיר המבוקש — הצג נימוק ערך, לא לחץ.`);
  if (strategy.stance === "hold") tp.push("הצג נתוני שוק תומכים והצע גמישות בתנאים (מועד מסירה/מימון) במקום במחיר.");
  if (strategy.stance === "gather") tp.push("הודע בשקיפות שיש עניין נוסף, בקש הצעה מיטבית עד מועד מוגדר — ללא הבטחות מחיר.");
  for (const o of objections.slice(0, 3)) tp.push(`מענה ל״${o.label}״: ${o.rebuttal}`);
  tp.push("סכם בצעד הבא ברור ומועד מעקב מוסכם.");
  return tp;
}
function draftSuggestions(input: NegotiationInput, strategy: PriceStrategy): DraftSuggestion[] {
  const name = input.offers[0]?.buyerName ?? "הלקוח";
  const disclaimer = "טיוטה בלבד — נדרשת עריכה ואישור לפני שליחה. ללא התחייבות מחיר/מימון.";
  const wa = strategy.stance === "accept"
    ? `היי ${name}, תודה על ההצעה. אני בוחן אותה מול המוכר ואחזור אליך עם עדכון בהקדם. נשמח לקדם בכפוף לתיאום התנאים.`
    : `היי ${name}, תודה על ההתעניינות. יש כאן פער שנשמח לגשר עליו — אשמח לתאם שיחה קצרה כדי לבחון אפשרויות (מחיר/מועד/תנאים). מתי נוח לך?`;
  const email = `שלום ${name},\n\nתודה על ההצעה והעניין בנכס. אנו בוחנים אותה בכובד ראש. נשמח לתאם שיחה כדי לבחון יחד את התנאים ולהתקדם. כל הפרטים כפופים לאישור הצדדים.\n\nבברכה,`;
  return [
    { channel: "whatsapp", purpose: "מעקב מו״מ", body: wa, requiresApproval: true, autoSend: false, disclaimer },
    { channel: "email", purpose: "סיכום והמשך", body: email, requiresApproval: true, autoSend: false, disclaimer },
  ];
}
function meetingPrep(input: NegotiationInput, ranked: RankedOffer[], objections: Objection[]): string[] {
  const mp: string[] = [];
  mp.push(`נכס: ${input.property.title}${input.property.askingPrice ? ` · מבוקש ${input.property.askingPrice.toLocaleString("he-IL")} ₪` : ""}.`);
  if (ranked.length) mp.push(`הצעה מובילה: ${ranked[0].buyerName}${ranked[0].amount ? ` (${ranked[0].amount.toLocaleString("he-IL")} ₪)` : ""} · חוזק ${ranked[0].strength}.`);
  if (objections.length) mp.push(`התנגדויות לצפות: ${objections.map((o) => o.label).join(", ")}.`);
  mp.push("הכן 3 נקודות ערך + טווח תמרון בתנאים (לא רק במחיר).");
  mp.push("סכם יעד לפגישה וצעד הבא מדיד.");
  return mp;
}

// ── Assemble ──────────────────────────────────────────────────────────────────
export function assembleNegotiationPlan(input: NegotiationInput): NegotiationPlan {
  const legalHandoff = detectLegal(input.notes);
  const objections = detectObjections(input.notes);
  const ranked = compareOffers(input.offers, input.property.askingPrice, input.valuation?.estimated ?? null);
  const strategy = priceStrategy(input, ranked);

  const flex = input.sellerSignals.flexibility;
  const urg = input.buyerSignals.urgency;
  const missingData: string[] = [];
  if (!input.valuation || input.valuation.estimated == null) missingData.push("אין הערכת שווי — כדאי להזמין (לא הומצא מחיר).");
  if (flex == null) missingData.push("גמישות המוכר לא ידועה.");
  if (urg == null) missingData.push("דחיפות הקונה לא ידועה.");
  if (!input.offers.length) missingData.push("אין הצעות מתועדות.");

  const risk: RiskLevel = missingData.length >= 3 ? "high" : missingData.length >= 1 ? "medium" : "low";
  const hasData = !!input.property.askingPrice || input.offers.length > 0 || input.notes.length > 0;

  const notes = [RULES_NOTE];
  if (legalHandoff.triggered) notes.unshift(legalHandoff.message);

  return {
    version: NEGOTIATION_VERSION, generatedAt: null,
    property: { id: input.property.id, title: input.property.title, askingPrice: input.property.askingPrice },
    objections, offers: ranked, strategy,
    sellerFlexibility: { score: flex, label: flex == null ? "לא ידוע" : flex >= 60 ? "גמיש" : flex <= 35 ? "נוקשה" : "בינוני", note: flex == null ? "נתון חסר." : "" },
    buyerUrgency: { score: urg, label: urg == null ? "לא ידוע" : urg >= 65 ? "גבוהה" : urg <= 35 ? "נמוכה" : "בינונית", note: urg == null ? "נתון חסר." : "" },
    // Legal-adjacent guidance is suppressed when a legal question is detected — handoff instead.
    talkingPoints: legalHandoff.triggered ? ["הפנה את השאלה המשפטית/מיסויית לעורך דין/יועץ מס מוסמך לפני המשך מו״מ."] : talkingPoints(input, strategy, objections),
    drafts: draftSuggestions(input, strategy),
    meetingPrep: meetingPrep(input, ranked, objections),
    risk: { level: risk, confidence: strategy.confidence, missingData, note: risk === "high" ? "נתונים חסרים — הביטחון מוגבל." : "" },
    legalHandoff,
    hasData,
    notes,
  };
}
