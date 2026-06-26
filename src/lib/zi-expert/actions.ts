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
import { searchKnowledge } from "./knowledge-search";
import { buildRagMessages, deterministicRagAnswer, ragSources, ragFollowups } from "./knowledge-rag";
import { runZiCompletion } from "./providers";
import {
  loadKnowledgeArticles, loadKnowledgeArticlesAdmin, recordKnowledgeFeedback,
  listKnowledgeFeedback, listMissingAnswerQuestions, type KnowledgeFeedbackRow,
} from "./knowledge-repository";
import { syncZIKnowledgeBase, type KnowledgeSyncResult } from "./knowledge-sync";
import { runZIDiagnostics } from "./diagnostics";
import { collectDiagnosticSignals, persistDiagnosticRun, listDiagnosticRuns, type DiagnosticRunRow } from "./diagnostic-repository";
import type { DiagnosticInput, DiagnosticResult, IssueType } from "./diagnostic-types";
import type { FeedbackRating, KnowledgeArticle, KnowledgeSourceRef } from "./knowledge-types";
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

    // ── RAG: retrieve permission-filtered, page-aware knowledge, then answer
    // ONLY from it (with the deterministic, knowledge-grounded fallback). ──
    const articles = await loadKnowledgeArticles();
    const hits = searchKnowledge(articles, question, { roleKey: ctx.roleKey, moduleId: ctx.moduleId, route: ctx.route });
    let answer: { content: string; source: "ai" | "fallback" | "cache"; model: string | null };
    if (hits.length > 0) {
      const messages = buildRagMessages(ctx, question, hits, history);
      const res = await runZiCompletion(messages, deterministicRagAnswer(ctx, hits));
      answer = { content: res.content, source: res.source, model: res.model };
    } else {
      // Nothing retrieved → honest fallback (engine returns the no-answer line).
      const fb = await answerZi(ctx, question, history);
      answer = { content: deterministicRagAnswer(ctx, []), source: fb.source === "ai" ? "fallback" : fb.source, model: null };
    }
    const sources: KnowledgeSourceRef[] = ragSources(hits);
    const followups = ragFollowups(hits);

    // Persist the assistant's answer.
    const assistantMsg = await appendMessageRow({
      conversationId, role: "assistant", content: answer.content, source: answer.source, route: ctx.route, moduleId: ctx.moduleId,
    });

    await touchConversation(conversationId, 2);

    return {
      ok: true,
      data: {
        conversationId, conversationTitle, question: userMsg, answer: assistantMsg,
        source: answer.source, model: answer.model, sources, followups,
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

// ── Knowledge Engine actions (Phase 23) ──────────────────────────────────────

export interface ZiKnowledgeFeedbackInput {
  question: string;
  answer: string;
  articleIds: string[];
  route: string | null;
  moduleId: string | null;
  rating: FeedbackRating;
  comment?: string | null;
}

/** Record "האם זה עזר?" feedback on a ZI answer. */
export async function submitKnowledgeFeedbackAction(input: ZiKnowledgeFeedbackInput): Promise<ZiResult<true>> {
  try {
    const role = asRoleKey((await getDashboardContext()).user?.roleKey ?? null);
    await recordKnowledgeFeedback({
      question: input.question, answer: input.answer, articleIds: input.articleIds,
      route: input.route, moduleId: input.moduleId, role, rating: input.rating, comment: input.comment ?? null,
    });
    return { ok: true, data: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "feedback_failed" }; }
}

/** Seed/refresh the built-in knowledge base (idempotent). Admin-triggered. */
export async function syncKnowledgeAction(): Promise<ZiResult<KnowledgeSyncResult>> {
  try {
    const { profile, state } = await getSessionContext();
    if (state !== "ready" || !profile) return { ok: false, error: "unauthorized" };
    const res = await syncZIKnowledgeBase();
    return res.ok ? { ok: true, data: res } : { ok: false, error: res.error ?? "sync_failed" };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "sync_failed" }; }
}

export interface KnowledgeAdminData {
  articles: KnowledgeArticle[];
  categories: string[];
  modules: string[];
  feedback: KnowledgeFeedbackRow[];
  missingQuestions: string[];
  unpublished: number;
}

/** Everything the /admin/zi-knowledge page needs. */
export async function loadKnowledgeAdminAction(): Promise<ZiResult<KnowledgeAdminData>> {
  try {
    const articles = await loadKnowledgeArticlesAdmin();
    const [feedback, missingQuestions] = await Promise.all([
      listKnowledgeFeedback().catch(() => []),
      listMissingAnswerQuestions().catch(() => []),
    ]);
    return {
      ok: true,
      data: {
        articles,
        categories: [...new Set(articles.map((a) => a.category))].sort(),
        modules: [...new Set(articles.map((a) => a.module).filter((m): m is string => !!m))].sort(),
        feedback, missingQuestions,
        unpublished: articles.filter((a) => !a.published).length,
      },
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "load_failed" }; }
}

// ── Diagnostics Engine actions (Phase 24) ────────────────────────────────────

export interface RunDiagnosticsInput {
  currentRoute: string | null;
  module: string | null;
  issueType?: IssueType;
  entityId?: string | null;
  timeframe?: "today" | "week" | "all";
  browser?: string | null;
}

/**
 * Diagnose "why is this not working?" — collects a safe, org-scoped signal
 * snapshot, runs deterministic checks, and returns a Hebrew-explained result
 * with a REDACTED support payload. SUPPORT-ONLY: inspects + explains, no actions.
 */
export async function runDiagnosticsAction(input: RunDiagnosticsInput): Promise<ZiResult<DiagnosticResult>> {
  try {
    const { signals, orgId, userId, role } = await collectDiagnosticSignals();
    const dxInput: DiagnosticInput = {
      currentRoute: input.currentRoute,
      module: input.module,
      issueType: input.issueType,
      entityId: input.entityId ?? null,
      timeframe: input.timeframe,
    };
    const result = runZIDiagnostics(dxInput, signals, { orgId, userId, role }, input.browser ?? null);
    await persistDiagnosticRun(dxInput, result); // best-effort; never blocks
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "diagnostics_failed" };
  }
}

/** Recent diagnostic runs for the admin page (manager+ via RLS). */
export async function loadDiagnosticRunsAction(): Promise<ZiResult<DiagnosticRunRow[]>> {
  try { return { ok: true, data: await listDiagnosticRuns() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "load_failed" }; }
}

// ── ZI Interactive Learning actions (Phase 25) ───────────────────────────────
import {
  walkthroughsForRole, tutorialsForRole, faqForModule, GLOSSARY, LEARNING_PATHS,
  recommendLearning, searchLearning,
} from "./learning";
import type {
  Walkthrough, Tutorial, FaqItem, GlossaryTerm, LearningPath, LearningProgress,
  LearningRecommendation, LearningSearchHit, LearningKind,
} from "./learning/types";
import { loadProgress, upsertProgress } from "./learning-repository";

export interface LearningData {
  progress: LearningProgress[];
  recommendations: LearningRecommendation[];
  walkthroughs: Walkthrough[];
  tutorials: Tutorial[];
  faq: FaqItem[];
  glossary: GlossaryTerm[];
  paths: LearningPath[];
}

/** Everything the ZI "Learn" panel needs for the current user + page. */
export async function loadLearningAction(currentModule: string | null): Promise<ZiResult<LearningData>> {
  try {
    const role = asRoleKey((await getDashboardContext()).user?.roleKey ?? null);
    const progress = await loadProgress();
    return {
      ok: true,
      data: {
        progress,
        recommendations: recommendLearning({ role, progress, currentModule }),
        walkthroughs: walkthroughsForRole(role),
        tutorials: tutorialsForRole(role),
        faq: faqForModule(currentModule, role ?? "viewer"),
        glossary: GLOSSARY,
        paths: LEARNING_PATHS,
      },
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "learning_load_failed" }; }
}

/** Record viewing / progress / completion / favorite for a lesson (support-only). */
export async function markLearningAction(input: { kind: LearningKind; slug: string; status?: "viewed" | "in_progress" | "completed"; favorite?: boolean; lastStep?: number }): Promise<ZiResult<true>> {
  try { await upsertProgress(input); return { ok: true, data: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "learning_mark_failed" }; }
}

/** Search learning content (built-ins) + the knowledge base, unified. */
export async function searchLearningAction(query: string): Promise<ZiResult<LearningSearchHit[]>> {
  try {
    const role = asRoleKey((await getDashboardContext()).user?.roleKey ?? null);
    const builtin = searchLearning(query, role);
    const articles = await loadKnowledgeArticles();
    const kHits = searchKnowledge(articles, query, { roleKey: role, moduleId: null, route: null }, 6)
      .map((h): LearningSearchHit => ({ kind: "knowledge", slug: h.article.slug, title: h.article.title, snippet: h.article.summary, module: h.article.module, score: Math.round(h.score) }));
    const merged = [...builtin, ...kHits].sort((a, b) => b.score - a.score).slice(0, 14);
    return { ok: true, data: merged };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "learning_search_failed" }; }
}

export interface LearningAdminData {
  tutorials: number; walkthroughs: number; glossary: number; faq: number;
  mostRequested: string[];
}

/** Admin overview for /admin/zi-learning (managers+). Read-only counts + gaps. */
export async function loadLearningAdminAction(): Promise<ZiResult<LearningAdminData>> {
  try {
    const role = asRoleKey((await getDashboardContext()).user?.roleKey ?? null);
    const mostRequested = await listMissingAnswerQuestions(20).catch(() => []);
    return {
      ok: true,
      data: {
        tutorials: tutorialsForRole(role).length, walkthroughs: walkthroughsForRole(role).length,
        glossary: GLOSSARY.length, faq: faqForModule(null, role ?? "viewer").length, mostRequested,
      },
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "learning_admin_failed" }; }
}

/** Test the knowledge search from the admin page (returns titles + scores). */
export async function testKnowledgeSearchAction(query: string): Promise<ZiResult<{ title: string; category: string; score: number; reason: string }[]>> {
  try {
    const role = asRoleKey((await getDashboardContext()).user?.roleKey ?? null);
    const articles = await loadKnowledgeArticles();
    const hits = searchKnowledge(articles, query, { roleKey: role, moduleId: null, route: null }, 8);
    return { ok: true, data: hits.map((h) => ({ title: h.article.title, category: h.article.category, score: Math.round(h.score * 10) / 10, reason: h.reason })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "search_failed" }; }
}
