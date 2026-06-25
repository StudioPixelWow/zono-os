"use server";
// ============================================================================
// ZI Expert™ — server actions (Phase 22). Everything org-scoped + per-user via
// RLS. ZI is read-only: these actions only ask the assistant and manage the
// support conversation history. They NEVER mutate business data.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { getDashboardContext } from "@/lib/dashboard/context";
import { buildZIContext, type ServerContextParts } from "./context";
import { answerZi } from "./engine";
import { deriveTitle } from "./conversation";
import {
  appendMessageRow, createConversationRow, getMessageRows, listConversationRows,
  rateMessageRow, renameConversationRow, searchConversationRows, setArchivedRow,
  setPinnedRow, softDeleteConversationRow, touchConversation,
} from "./history";
import type {
  RoleKey, ZiAskRequest, ZiAskResult, ZiContext, ZiConversation,
  ZiConversationWithMessages, ZiMessage, ZiPagination,
} from "./types";

export type ZiResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ROLE_KEYS: RoleKey[] = ["viewer", "agent", "manager", "admin", "owner"];
function asRoleKey(k: string | null): RoleKey | null {
  return k && (ROLE_KEYS as string[]).includes(k) ? (k as RoleKey) : null;
}

/** Build the sanitized server context (org / role / operating area). */
async function serverParts(): Promise<ServerContextParts> {
  const [dash, session] = await Promise.all([getDashboardContext(), getSessionContext()]);
  const profile = session.profile;
  return {
    organizationName: dash.organization?.name ?? null,
    plan: dash.organization?.plan ?? null,
    roleKey: asRoleKey(dash.user?.roleKey ?? null),
    roleLabel: dash.user?.roleLabel ?? null,
    operatingCity: profile?.operating_city ?? profile?.primary_city ?? dash.primaryLocality ?? null,
    operatingNeighborhood: (profile?.operating_neighborhoods ?? [])[0] ?? null,
    featureFlags: [], // foundation: access-filtered flags wired in a later phase
  };
}

/** Resolve the full ZI context for a given client context (used by the widget). */
export async function getZiContextAction(client: ZiAskRequest["client"]): Promise<ZiResult<ZiContext>> {
  try {
    const ctx = buildZIContext(client, await serverParts());
    return { ok: true, data: ctx };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "context_failed" };
  }
}

/** Ask ZI a question. Creates a conversation if needed, persists both turns. */
export async function askZiAction(req: ZiAskRequest): Promise<ZiResult<ZiAskResult>> {
  try {
    const question = req.question.trim();
    if (!question) return { ok: false, error: "empty_question" };

    const ctx = buildZIContext(req.client, await serverParts());

    // Ensure a conversation exists.
    let conversationId = req.conversationId;
    let conversationTitle = "";
    let history: ZiMessage[] = [];
    if (!conversationId) {
      const created = await createConversationRow({ title: deriveTitle(question), route: ctx.route, moduleId: ctx.moduleId });
      conversationId = created.id;
      conversationTitle = created.title;
    } else {
      history = await getMessageRows(conversationId, { limit: 12, offset: 0 });
      conversationTitle = deriveTitle(history[0]?.content ?? question);
    }

    // Persist the user's question.
    const userMsg = await appendMessageRow({
      conversationId, role: "user", content: question, source: null, route: ctx.route, moduleId: ctx.moduleId,
    });

    // Generate the answer (AI with deterministic fallback).
    const answer = await answerZi(ctx, question, history);

    // Persist the assistant's answer.
    const assistantMsg = await appendMessageRow({
      conversationId, role: "assistant", content: answer.content, source: answer.source, route: ctx.route, moduleId: ctx.moduleId,
    });

    await touchConversation(conversationId, 2);

    return {
      ok: true,
      data: {
        conversationId, conversationTitle, question: userMsg, answer: assistantMsg,
        source: answer.source, model: answer.model,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ask_failed" };
  }
}

export async function loadConversationsAction(includeArchived = false): Promise<ZiResult<ZiConversation[]>> {
  try { return { ok: true, data: await listConversationRows(includeArchived) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "load_failed" }; }
}

export async function loadConversationAction(id: string, page: ZiPagination = { limit: 50, offset: 0 }): Promise<ZiResult<ZiConversationWithMessages>> {
  try {
    const [list, messages] = await Promise.all([listConversationRows(true), getMessageRows(id, page)]);
    const conv = list.find((c) => c.id === id);
    if (!conv) return { ok: false, error: "not_found" };
    return { ok: true, data: { ...conv, messages } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "load_failed" }; }
}

export async function createConversationAction(input: { title?: string; route?: string | null; moduleId?: string | null }): Promise<ZiResult<ZiConversation>> {
  try {
    const conv = await createConversationRow({
      title: input.title?.trim() || "שיחה חדשה", route: input.route ?? null, moduleId: input.moduleId ?? null,
    });
    return { ok: true, data: conv };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "create_failed" }; }
}

export async function renameConversationAction(id: string, title: string): Promise<ZiResult<true>> {
  try { await renameConversationRow(id, title); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "rename_failed" }; }
}

export async function deleteConversationAction(id: string): Promise<ZiResult<true>> {
  try { await softDeleteConversationRow(id); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "delete_failed" }; }
}

export async function pinConversationAction(id: string, pinned: boolean): Promise<ZiResult<true>> {
  try { await setPinnedRow(id, pinned); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "pin_failed" }; }
}

export async function archiveConversationAction(id: string, archived: boolean): Promise<ZiResult<true>> {
  try { await setArchivedRow(id, archived); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "archive_failed" }; }
}

export async function searchConversationsAction(query: string): Promise<ZiResult<ZiConversation[]>> {
  try { return { ok: true, data: await searchConversationRows(query) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "search_failed" }; }
}

export async function rateMessageAction(messageId: string, rating: "up" | "down" | null): Promise<ZiResult<true>> {
  try { await rateMessageRow(messageId, rating); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "rate_failed" }; }
}
