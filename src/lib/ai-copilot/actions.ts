"use server";
// ============================================================================
// ZONO — AI Copilot server actions (org-scoped). Each action: build sanitized
// context → build messages + deterministic fallback → cache-aware generate.
// AI augments only; deterministic engines remain the source of truth.
// ============================================================================
import { buildSellerContext, buildMorningContext, buildOfficeContext, runCopilot, copilotSessionContext } from "./context";
import { buildMessages, buildCacheKey, computeDataHash } from "./prompts";
import { buildSellerCallBrief, buildBuyerCallBrief, buildMeetingBrief, buildAfterCallSummary } from "./strategy";
import { buildMorningBrief, buildOfficeBrief } from "./summaries";
import { buildExplainOpportunity } from "./recommendations";
import { buildWhatsapp, buildEmail } from "./communication";
import type { AiResult, AiTone, EmailType, WhatsappMessageType } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } { return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." }; }
type Out = { content: string; source: AiResult["source"]; model: string | null };
const out = (r: AiResult): Out => ({ content: r.content, source: r.source, model: r.model });

async function seller(profileId: string) {
  const { db, orgId } = await copilotSessionContext();
  const { context } = await buildSellerContext(db, orgId, profileId);
  return { context, dataHash: computeDataHash(context) };
}

export async function prepareSellerCallAction(profileId: string): Promise<Result<Out>> {
  try {
    const { context, dataHash } = await seller(profileId);
    const { instruction, fallback } = buildSellerCallBrief(context);
    const res = await runCopilot({ kind: "seller_call_brief", entityId: profileId, dataHash, cacheKey: buildCacheKey("seller_call_brief", profileId, dataHash), messages: buildMessages("seller_call_brief", context, instruction), fallback });
    return { ok: true, data: out(res) };
  } catch (e) { return fail(e); }
}

export async function prepareBuyerCallAction(profileId: string): Promise<Result<Out>> {
  try {
    const { context, dataHash } = await seller(profileId);
    const { instruction, fallback } = buildBuyerCallBrief(context);
    const res = await runCopilot({ kind: "buyer_call_brief", entityId: profileId, dataHash, cacheKey: buildCacheKey("buyer_call_brief", profileId, dataHash), messages: buildMessages("buyer_call_brief", context, instruction), fallback });
    return { ok: true, data: out(res) };
  } catch (e) { return fail(e); }
}

export async function explainOpportunityAction(profileId: string): Promise<Result<Out>> {
  try {
    const { context, dataHash } = await seller(profileId);
    const { instruction, fallback } = buildExplainOpportunity(context);
    const res = await runCopilot({ kind: "explain_opportunity", entityId: profileId, dataHash, cacheKey: buildCacheKey("explain_opportunity", profileId, dataHash), messages: buildMessages("explain_opportunity", context, instruction), fallback });
    return { ok: true, data: out(res) };
  } catch (e) { return fail(e); }
}

export async function meetingBriefAction(profileId: string): Promise<Result<Out>> {
  try {
    const { context, dataHash } = await seller(profileId);
    const { instruction, fallback } = buildMeetingBrief(context);
    const res = await runCopilot({ kind: "meeting_brief", entityId: profileId, dataHash, cacheKey: buildCacheKey("meeting_brief", profileId, dataHash), messages: buildMessages("meeting_brief", context, instruction), fallback });
    return { ok: true, data: out(res) };
  } catch (e) { return fail(e); }
}

export async function generateWhatsappAction(profileId: string, type: WhatsappMessageType, tone: AiTone): Promise<Result<Out>> {
  try {
    const { context, dataHash } = await seller(profileId);
    const { instruction, fallback } = buildWhatsapp(type, tone, context);
    const res = await runCopilot({ kind: "whatsapp", entityId: profileId, dataHash, cacheKey: buildCacheKey("whatsapp", profileId, dataHash, `${type}:${tone}`), messages: buildMessages("whatsapp", context, instruction), fallback, temperature: 0.6 });
    return { ok: true, data: out(res) };
  } catch (e) { return fail(e); }
}

export async function generateEmailAction(profileId: string, emailType: EmailType): Promise<Result<Out>> {
  try {
    const { context, dataHash } = await seller(profileId);
    const { instruction, fallback } = buildEmail(emailType, context);
    const res = await runCopilot({ kind: "email", entityId: profileId, dataHash, cacheKey: buildCacheKey("email", profileId, dataHash, emailType), messages: buildMessages("email", context, instruction), fallback, temperature: 0.6 });
    return { ok: true, data: out(res) };
  } catch (e) { return fail(e); }
}

export async function summarizeNotesAction(profileId: string, notes: string): Promise<Result<Out>> {
  try {
    if (!notes.trim()) throw new Error("יש להזין הערות לסיכום.");
    const { context, dataHash } = await seller(profileId);
    const { instruction, fallback } = buildAfterCallSummary(notes, context);
    // Notes change every time → don't cache.
    const res = await runCopilot({ kind: "after_call_summary", entityId: profileId, dataHash: `${dataHash}:${computeDataHash(notes)}`, cacheKey: buildCacheKey("after_call_summary", profileId, computeDataHash(notes)), messages: buildMessages("after_call_summary", context, instruction), fallback }, { cache: false });
    return { ok: true, data: out(res) };
  } catch (e) { return fail(e); }
}

export async function morningBriefAction(): Promise<Result<Out>> {
  try {
    const context = await buildMorningContext();
    const dataHash = computeDataHash(context);
    const { instruction, fallback } = buildMorningBrief(context);
    const res = await runCopilot({ kind: "morning_brief", entityId: null, dataHash, cacheKey: buildCacheKey("morning_brief", null, dataHash), messages: buildMessages("morning_brief", context, instruction), fallback });
    return { ok: true, data: out(res) };
  } catch (e) { return fail(e); }
}

export async function officeBriefAction(): Promise<Result<Out>> {
  try {
    const context = await buildOfficeContext();
    const dataHash = computeDataHash(context);
    const { instruction, fallback } = buildOfficeBrief(context);
    const res = await runCopilot({ kind: "office_brief", entityId: null, dataHash, cacheKey: buildCacheKey("office_brief", null, dataHash), messages: buildMessages("office_brief", context, instruction), fallback });
    return { ok: true, data: out(res) };
  } catch (e) { return fail(e); }
}
