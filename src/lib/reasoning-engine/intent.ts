// ============================================================================
// 🎯 Intent Classification (pure). Phase 27.3 · Part 1.
// ----------------------------------------------------------------------------
// Deterministic, bilingual (he/en) keyword classifier. NO AI, NO DB. Returns the
// intent family + a confidence + surfaced entities + routing flags. Conservative:
// when nothing matches, returns UNKNOWN (never guesses a ZONO entity).
// ============================================================================
import type { IntentFamily, IntentResult } from "./types";

interface FamilyDef { family: IntentFamily; patterns: RegExp[] }

// Order matters: more specific families first (VALUATION before PROPERTY, etc.).
const FAMILIES: FamilyDef[] = [
  { family: "VALUATION", patterns: [/valuation|apprais|estimate.*(price|value)|avm/i, /הערכת?\s*שווי|שמאות|שווי\s*נכס|מחיר\s*נכס/] },
  { family: "MARKET", patterns: [/market|trend|competition|territory|dominance|neighborhood\s*market/i, /שוק|מגמ|תחרות|טריטור|שכונה.*שוק|דומיננטי/] },
  { family: "OFFICE", patterns: [/office|agency|brokerage|franchise|re\/?max|anglo/i, /משרד|סוכנות|זכיינ|רשת\s*תיווך/] },
  { family: "BROKER", patterns: [/broker|agent|realtor/i, /מתווכ|מתווך|סוכן\s*נדל|נציג/] },
  { family: "SELLER", patterns: [/seller|listing\s*owner|vendor/i, /מוכר|בעל\s*נכס|מפרסם/] },
  { family: "BUYER", patterns: [/buyer|lead|prospect/i, /קונה|רוכש|ליד|מתעניין/] },
  { family: "PROPERTY", patterns: [/propert|listing|apartment|house|flat/i, /נכס|דירה|בית|מודעה|נדל/] },
  { family: "VALUATION", patterns: [] },
  { family: "TASK", patterns: [/\btask\b|todo|follow[\s-]?up|reminder|mission/i, /משימ|מטל|תזכור|מעקב/] },
  { family: "CALENDAR", patterns: [/calendar|schedule|meeting|appointment|availab/i, /יומן|פגיש|תור|זמינ|לוח\s*זמנ/] },
  { family: "COMMUNICATION", patterns: [/message|email|whatsapp|reply|draft|send/i, /הודע|מייל|וואטסאפ|תשוב|טיוט|לשלוח/] },
  { family: "CRM", patterns: [/pipeline|deal|crm|stage|conversion|funnel/i, /צינור|עסק|פייפליין|שלב|המרה|משפך/] },
  { family: "SEARCH", patterns: [/search|find|look\s*up|show\s*me|list\s*all/i, /חפש|מצא|הראה\s*לי|תראה|רשימת/] },
  { family: "SYSTEM", patterns: [/system|setting|configur|permission|account|integration/i, /מערכת|הגדר|הרשא|חשבון|אינטגרצ/] },
];

// General-knowledge tells: math, definitions, world facts unrelated to ZONO data.
const GENERAL = [
  /\bwhat\s+is\b(?!.*\b(my|our|this)\b)/i, /\bdefine\b|\bhow\s+do(es)?\b|\bwho\s+(is|was)\b|\bcapital\s+of\b/i,
  /מהי?\s|מה\s+זה|הסבר\s+(לי\s+)?מה|כמה\s+זה|בירת\s/, /\b\d+\s*[\+\-\*\/x]\s*\d+\b/,
];

const CITY_HINT = /קריי?ת\s+\S+|תל\s*אביב|חיפה|ירושלים|רעננה|הרצליה|נתני|[A-Z][a-z]+\s+City/;
const ID_HINT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

function extractEntities(q: string): string[] {
  const out = new Set<string>();
  const id = q.match(ID_HINT); if (id) out.add(id[0]);
  const city = q.match(CITY_HINT); if (city) out.add(city[0].trim());
  return [...out];
}

/** Classify a user question into an intent family with routing flags. */
export function classifyIntent(question: string): IntentResult {
  const q = (question ?? "").trim();
  const entities = extractEntities(q);
  if (!q) return { intent: "UNKNOWN", confidence: 0, entities, requiresReasoning: false, requiresSystemData: false, requiresLLM: false };

  // Score each ZONO family by how many of its patterns hit.
  let best: IntentFamily = "UNKNOWN";
  let bestHits = 0;
  for (const f of FAMILIES) {
    const hits = f.patterns.reduce((n, re) => n + (re.test(q) ? 1 : 0), 0);
    if (hits > bestHits) { bestHits = hits; best = f.family; }
  }

  const generalHit = GENERAL.some((re) => re.test(q));
  // A clear general-knowledge question with no ZONO family signal → GENERAL.
  if (bestHits === 0 && generalHit) {
    return { intent: "GENERAL", confidence: 70, entities, requiresReasoning: false, requiresSystemData: false, requiresLLM: true };
  }
  if (bestHits === 0) {
    return { intent: "UNKNOWN", confidence: 25, entities, requiresReasoning: false, requiresSystemData: false, requiresLLM: true };
  }

  const isZono = best !== "GENERAL" && best !== "UNKNOWN";
  const confidence = Math.min(95, 55 + bestHits * 15 + (entities.length ? 10 : 0));
  return {
    intent: best,
    confidence,
    entities,
    requiresReasoning: isZono,
    requiresSystemData: isZono,
    requiresLLM: true,
  };
}
