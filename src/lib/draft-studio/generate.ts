// ============================================================================
// ✉️ Draft Studio — draft generation + explainability + versioning (pure). 30.3.
// Parts 2 + 6 + 8. Builds a primary draft plus short / long / alternative-wording
// / different-tone versions, each with WHY / evidence / goal / expected outcome /
// confidence. Approval-gated (requiresApproval always true) — the studio never sends.
// ============================================================================
import { composeBody, subjectLine } from "./compose";
import {
  DRAFT_STUDIO_VERSION, PURPOSE_HE, TONE_HE, ENTITY_HE,
  type CommContext, type DraftRequest, type Draft, type DraftBundle, type DraftExplain, type Tone, type Purpose, type Channel, type Language,
} from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// Part 6 — explainability.
function buildExplain(ctx: CommContext, purpose: Purpose, channel: Channel): DraftExplain {
  const goalMap: Record<Purpose, string> = {
    first_contact: "לפתוח קשר ולהעביר לשלב הבא", follow_up: "לחדש מגע ולקדם החלטה", reminder: "לוודא שהנושא לא נופל", negotiation: "לצמצם פערים ולהתקדם לסגירה",
    thank_you: "לחזק אמון ויחסים", document_request: "לאסוף חומרים להמשך", appointment_confirmation: "לנעול מועד פגישה", listing_update: "לעדכן ולשמור מעורבות",
    price_discussion: "ליישר ציפיות מחיר לפי השוק", meeting_summary: "לתעד ולהניע צעדים הבאים", general: "לקדם את הקשר",
  };
  const why = ctx.reason
    ? ctx.reason
    : `${ENTITY_HE[ctx.entityKind]} בשלב "${ctx.journeyStage ?? "לא ידוע"}"${ctx.strategy ? ` · אסטרטגיה: ${ctx.strategy}` : ""} — ${PURPOSE_HE[purpose]} דרך ${channel === "call" ? "שיחה" : channel}.`;
  const evidence = [
    ...ctx.facts.slice(0, 3),
    ctx.trust != null ? `אמון ${ctx.trust}` : "",
    ctx.truthScore != null ? `ציון אמת ${ctx.truthScore}` : "",
    ctx.lastActivity ? `פעילות אחרונה: ${ctx.lastActivity}` : "",
    ctx.recommendation ? `המלצת סוכן: ${ctx.recommendation}` : "",
  ].filter(Boolean);
  const base = 45 + (ctx.trust ?? 40) * 0.25 + (ctx.truthScore ?? 40) * 0.2 + Math.min(20, ctx.facts.length * 5);
  return {
    why, evidence: evidence.length ? evidence : ["הקשר בסיסי בלבד — מומלץ להעשיר לפני שליחה"],
    goal: goalMap[purpose], expectedOutcome: `תגובה/התקדמות ל${PURPOSE_HE[purpose]}`,
    confidence: clamp(base),
  };
}

let SEQ = 0;
function makeDraft(ctx: CommContext, req: DraftRequest, over: Partial<DraftRequest> = {}): Draft {
  const channel: Channel = over.channel ?? req.channel;
  const purpose: Purpose = over.purpose ?? req.purpose;
  const tone: Tone = over.tone ?? req.tone;
  const language: Language = over.language ?? req.language;
  const body = composeBody(ctx, channel, purpose, tone, language);
  const subject = channel === "email" ? subjectLine(ctx, purpose, language) : null;
  return {
    id: `draft:${ctx.entityId}:${channel}:${purpose}:${tone}:${++SEQ}`,
    channel, purpose, tone, language, subject, body,
    explain: buildExplain(ctx, purpose, channel), requiresApproval: true,
  };
}

// A tone that meaningfully contrasts the requested one (for the "different tone" version).
function contrastTone(t: Tone): Tone {
  const map: Partial<Record<Tone, Tone>> = {
    professional: "friendly", friendly: "professional", luxury: "friendly", urgent: "empathetic",
    negotiation: "empathetic", empathetic: "professional", formal: "friendly", short: "long", long: "short",
  };
  return map[t] ?? "professional";
}

export function buildDraftBundle(ctx: CommContext, req: DraftRequest): DraftBundle {
  const primary = makeDraft(ctx, req);
  const short = makeDraft(ctx, req, { tone: "short" });
  const long = makeDraft(ctx, req, { tone: "long" });
  // Alternative wording: same tone/channel, a different purpose framing when generic,
  // otherwise the same purpose re-rendered (composition varies by CTA/greeting seed).
  const altPurpose: Purpose = req.purpose === "follow_up" ? "reminder" : req.purpose === "reminder" ? "follow_up" : req.purpose;
  const alternative = makeDraft(ctx, req, { purpose: altPurpose, tone: req.tone === "friendly" ? "professional" : "friendly" });
  const altTone = makeDraft(ctx, req, { tone: contrastTone(req.tone) });

  const notes: string[] = ["הטיוטות ממתינות לאישור — שום דבר לא נשלח אוטומטית."];
  if (!ctx.facts.length && ctx.trust == null) notes.push("הקשר דל — מומלץ להעשיר את פרטי הישות לפני שליחה.");

  return {
    version: DRAFT_STUDIO_VERSION, generatedAt: new Date().toISOString(),
    entityKind: ctx.entityKind, entityId: ctx.entityId, entityName: ctx.name,
    request: { channel: req.channel, purpose: req.purpose, tone: req.tone, language: req.language },
    primary, versions: { short, long, alternative, altTone }, notes,
  };
}

export { TONE_HE, PURPOSE_HE };
