// ============================================================================
// 🎙️ ZONO — Voice AI — transcript → structured memory (pure). PHASE 53.0.
// Deterministic extraction (no LLM): summary, key points, detected entities
// (phones / amounts / dates / places / contacts), intents, sentiment, and
// APPROVAL-GATED suggestions. Amounts are quoted, never treated as commitments;
// a disclaimer is attached. Nothing here executes or updates the CRM.
// ============================================================================
import {
  CONSENT_LABEL, NO_PROMISE_DISCLAIMER,
  type VoiceMemory, type VoiceSource, type DetectedEntities, type VoiceIntent,
  type Sentiment, type VoiceSuggestion, type SuggestionKind,
} from "./types";
import { transcriptHash } from "./provider";

const uniq = (a: string[]) => [...new Set(a.map((s) => s.trim()).filter(Boolean))];

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 1);
}

function detectEntities(text: string): DetectedEntities {
  const phones = uniq((text.match(/(?:\+?972[-\s]?|0)\d{1,2}[-\s]?\d{3}[-\s]?\d{4}/g) ?? []));
  const amounts = uniq((text.match(/(?:₪\s?\d[\d,\.]{2,}|\d[\d,\.]{2,}\s?(?:₪|ש"ח|שקל|שקלים|מיליון|אלף|k|K|nis|NIS))/g) ?? []));
  const dateWords = ["מחר", "מחרתיים", "היום", "יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבוע הבא", "בשעה"];
  const dates = uniq([
    ...(text.match(/\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?/g) ?? []),
    ...(text.match(/\b\d{1,2}:\d{2}\b/g) ?? []),
    ...dateWords.filter((w) => text.includes(w)),
  ]);
  const places = uniq([
    ...(text.match(/רחוב\s+[^\s,.;:]+/g) ?? []),
    ...(text.match(/שכונת\s+[^\s,.;:]+/g) ?? []),
    ...(text.match(/\b\d\s?חדרים\b/g) ?? []),
  ]);
  const contacts = uniq([
    ...((text.match(/(?:עם|את|פגשתי את|דיברתי עם)\s+([א-ת]{2,}(?:\s[א-ת]{2,})?)/g) ?? []).map((m) => m.replace(/^(עם|את|פגשתי את|דיברתי עם)\s+/, ""))),
  ]).slice(0, 6);
  return { phones, amounts, dates, places, contacts };
}

const INTENT_KW: Record<VoiceIntent, string[]> = {
  price_question: ["מחיר", "כמה עולה", "עלות", "מחירון", "תקציב", "מימון", "משכנתא", "price", "cost"],
  schedule_viewing: ["סיור", "לראות", "ביקור", "פגישה", "להיפגש", "מתי אפשר", "viewing", "meeting"],
  objection: ["יקר", "לא בטוח", "מתלבט", "בעיה", "חושש", "לא מתאים", "concern"],
  negotiation: ["הצעה", "להוריד", "מחיר נמוך", "משא ומתן", "לסגור על", "negotiat"],
  interested: ["מעוניין", "מעניין", "אהבתי", "רוצה", "interested", "love"],
  not_relevant: ["לא רלוונטי", "לא מעוניין", "לא רלוונטית", "לא צריך"],
  general: [],
};

function detectIntents(text: string): VoiceIntent[] {
  const t = text.toLowerCase();
  const found: VoiceIntent[] = [];
  (Object.keys(INTENT_KW) as VoiceIntent[]).forEach((k) => {
    if (k === "general") return;
    if (INTENT_KW[k].some((kw) => t.includes(kw.toLowerCase()))) found.push(k);
  });
  return found.length ? found : ["general"];
}

function detectSentiment(text: string): Sentiment {
  const t = text.toLowerCase();
  const pos = ["מעוניין", "אהבתי", "מצוין", "רוצה", "נהדר", "מושלם", "interested", "great"].filter((w) => t.includes(w)).length;
  const neg = ["יקר", "בעיה", "לא מתאים", "מתלבט", "חושש", "מאוכזב", "לא מעוניין", "concern", "expensive"].filter((w) => t.includes(w)).length;
  return pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
}

function summarize(sents: string[]): { summary: string; keyPoints: string[] } {
  const KEY = ["מחיר", "תקציב", "סיור", "פגישה", "מעוניין", "טלפון", "מתי", "הצעה", "משכנתא", "חדרים", "רחוב"];
  const keyPoints = sents.filter((s) => KEY.some((k) => s.includes(k))).slice(0, 6);
  const summary = sents.slice(0, 2).join(" ") || sents[0] || "";
  return { summary, keyPoints };
}

let sid = 0;
function sug(kind: SuggestionKind, label: string, detail: string, opts: { inline?: boolean; href?: string | null; evidence?: string[] } = {}): VoiceSuggestion {
  sid++;
  return { id: `sug-${sid}`, kind, label, detail, requiresApproval: true, canApplyInline: !!opts.inline, targetHref: opts.href ?? null, evidence: opts.evidence ?? [] };
}

/** Extract structured memory from a transcript. Pure & deterministic. */
export function extractVoiceMemory(transcript: string, source: VoiceSource = "manual_transcript"): VoiceMemory {
  sid = 0;
  const text = (transcript ?? "").trim();
  const wordCount = text ? text.split(/\s+/).length : 0;
  const hash = transcriptHash(text);

  if (!text) {
    return {
      hasContent: false, source, consentRequired: true, consentLabel: CONSENT_LABEL,
      summary: "", keyPoints: [], entities: { phones: [], amounts: [], dates: [], places: [], contacts: [] },
      intents: [], sentiment: "neutral", suggestions: [], disclaimers: [], wordCount: 0, transcriptHash: hash,
    };
  }

  const sents = sentences(text);
  const entities = detectEntities(text);
  const intents = detectIntents(text);
  const sentiment = detectSentiment(text);
  const { summary, keyPoints } = summarize(sents);

  // Approval-gated suggestions (nothing auto-applies).
  const suggestions: VoiceSuggestion[] = [];
  suggestions.push(sug("crm_note", "שמור סיכום כהערת CRM", "תיעוד השיחה כהערה מקושרת ללקוח/נכס (לאחר אישור).", { inline: true, evidence: [summary].filter(Boolean) }));

  if (intents.includes("schedule_viewing")) suggestions.push(sug("task", "קבע פגישה / סיור", "נמצאה בקשה לפגישה או סיור — קבע ביומן (דורש אישור).", { href: "/calendar", evidence: entities.dates }));
  if (intents.includes("price_question")) {
    suggestions.push(sug("follow_up", "שלח פרטי מחיר/מימון", "נשאלה שאלת מחיר — הכן מענה עם פרטי הנכס (ללא התחייבות פיננסית).", { href: "/communication", evidence: entities.amounts }));
    suggestions.push(sug("draft", "הכן טיוטת מענה", "טיוטת הודעה עם מידע רלוונטי — לעריכה ואישור לפני שליחה.", { href: "/communication" }));
  }
  if (intents.includes("objection") || intents.includes("negotiation")) suggestions.push(sug("mission", "טיפול בהתנגדות/מו״מ", "זוהתה התנגדות או מו״מ — פתח משימת פעולה לטיפול.", { href: "/today" }));
  if (entities.phones.length) suggestions.push(sug("crm_note", "עדכן/צור ליד מהטלפון שהוזכר", `זוהה מספר טלפון בשיחה (${entities.phones[0]}) — קשר לליד קיים או צור חדש.`, { inline: true, evidence: entities.phones }));
  if (intents.includes("interested")) suggestions.push(sug("follow_up", "מעקב עם לקוח מתעניין", "הלקוח הביע עניין — קבע מעקב יזום.", { href: "/today" }));

  const disclaimers: string[] = [];
  if (entities.amounts.length) disclaimers.push(NO_PROMISE_DISCLAIMER);

  return {
    hasContent: true, source, consentRequired: true, consentLabel: CONSENT_LABEL,
    summary, keyPoints, entities, intents, sentiment, suggestions, disclaimers, wordCount, transcriptHash: hash,
  };
}
