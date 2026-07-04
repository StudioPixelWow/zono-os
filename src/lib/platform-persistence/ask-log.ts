// ============================================================================
// 💬 ZONO Ask ZONO Log — conversation persistence (server-only). 34.2.
// Durable log of Ask ZONO exchanges for audit, follow-up continuity, learning
// and analytics. Org-scoped, never exposed on public routes. Writes run under
// service_role. Degrades gracefully if the 34.2 migration is absent; never
// throws (logging must never break an answer).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { normConfidence } from "./core";

const CONV = "zono_ask_conversations";
const MSG = "zono_ask_messages";

export interface AskExchange {
  orgId: string;
  userId?: string | null;
  sessionId: string;
  question: string;
  answer: string;
  intent?: string | null;
  sourceEngines?: Json;
  evidence?: Json;
  confidence?: number | null;
  limitations?: string | null;
}

/** Ensure a conversation row exists for (org, session); returns its id or null. */
async function ensureConversation(db: ReturnType<typeof createServiceRoleClient>, orgId: string, sessionId: string, userId: string | null, title: string | null): Promise<string | null> {
  try {
    const found = await db.from(CONV).select("id").eq("org_id", orgId).eq("session_id", sessionId).limit(1).maybeSingle();
    if (found.data?.id) {
      await db.from(CONV).update({ updated_at: new Date().toISOString() }).eq("id", found.data.id);
      return found.data.id;
    }
    const ins = await db.from(CONV).insert({ org_id: orgId, session_id: sessionId, user_id: userId, title }).select("id").maybeSingle();
    return ins.data?.id ?? null;
  } catch { return null; }
}

/** Log one question/answer exchange. Returns true on success. */
export async function logAskExchange(x: AskExchange): Promise<boolean> {
  if (!x.orgId || !x.sessionId) return false;
  const db = createServiceRoleClient();
  try {
    const title = x.question.slice(0, 80);
    const conversationId = await ensureConversation(db, x.orgId, x.sessionId, x.userId ?? null, title);
    const { error } = await db.from(MSG).insert({
      org_id: x.orgId, conversation_id: conversationId, session_id: x.sessionId, user_id: x.userId ?? null,
      question: x.question, answer: x.answer, intent: x.intent ?? null,
      source_engines: x.sourceEngines ?? [], evidence: x.evidence ?? [],
      confidence: normConfidence(x.confidence), limitations: x.limitations ?? null,
    });
    return !error;
  } catch { return false; }
}

export interface AskMessage { question: string | null; answer: string | null; intent: string | null; createdAt: string }

/** Read a session's messages oldest-first for follow-up continuity. */
export async function getAskConversation(orgId: string, sessionId: string, limit = 50): Promise<AskMessage[]> {
  if (!orgId || !sessionId) return [];
  const db = createServiceRoleClient();
  try {
    const { data, error } = await db.from(MSG).select("question,answer,intent,created_at")
      .eq("org_id", orgId).eq("session_id", sessionId).order("created_at", { ascending: true }).limit(limit);
    if (error || !data) return [];
    return data.map((d) => ({ question: d.question, answer: d.answer, intent: d.intent, createdAt: d.created_at }));
  } catch { return []; }
}
