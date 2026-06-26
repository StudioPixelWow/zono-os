// ============================================================================
// ZI Expert™ Knowledge Engine — RAG prompting (Phase 23, PURE / client-safe).
// ZI answers ONLY from retrieved knowledge + current context + user permissions.
// Never invents features. If nothing is found → the honest fallback line, then
// suggests a relevant page / support ticket / future diagnostics. Reuses the
// Phase 15 sanitizer — no duplicated safety layer.
// ============================================================================
import { sanitizeContext, assertNoSecrets } from "@/lib/ai-copilot";
import type { AiMessage } from "@/lib/ai-copilot/types";
import { ZI_SYSTEM_PROMPT } from "./prompts";
import { contextToPromptBlock } from "./context";
import { permissionScopeLine } from "./permissions";
import type { ZiContext, ZiMessage } from "./types";
import type { KnowledgeSearchHit, KnowledgeSourceRef } from "./knowledge-types";

export const RAG_FALLBACK = "לא מצאתי תשובה ודאית במאגר הידע של ZONO.";

/** RAG guardrail appended to the system prompt. */
const RAG_RULES =
  "ענה אך ורק על בסיס מאגר הידע שיצורף (Retrieved Knowledge), ההקשר הנוכחי והרשאות המשתמש. " +
  "אל תמציא יכולות, מסכים או הגדרות שאינם מופיעים בידע שניתן לך. " +
  `אם אין במאגר תשובה ודאית — כתוב במדויק: "${RAG_FALLBACK}" ואז הצע: (1) עמוד רלוונטי לבדיקה, ` +
  "(2) פתיחת פנייה לתמיכה, (3) שימוש בכלי האבחון בעתיד. אל תנחש.";

function knowledgeBlock(hits: KnowledgeSearchHit[]): string {
  if (hits.length === 0) return "מאגר הידע: לא נמצאו מאמרים תואמים.";
  return [
    "מאגר הידע שאוחזר (Retrieved Knowledge):",
    ...hits.map((h, i) => `--- מאמר ${i + 1}: ${h.article.title} (${h.article.category}) ---\n${h.article.summary}\n${h.article.content}`),
  ].join("\n\n");
}

/** Build the RAG chat messages. Sanitizes context + asserts no secrets. */
export function buildRagMessages(ctx: ZiContext, question: string, hits: KnowledgeSearchHit[], history: ZiMessage[] = []): AiMessage[] {
  const safeCtx = sanitizeContext(ctx);
  const block = contextToPromptBlock(safeCtx as ZiContext);
  const scope = permissionScopeLine(ctx.roleKey);

  const messages: AiMessage[] = [
    { role: "system", content: `${ZI_SYSTEM_PROMPT}\n\n${RAG_RULES}\n\n${scope}` },
    { role: "system", content: `הקשר נוכחי:\n${block}\n\n${knowledgeBlock(hits)}` },
  ];
  for (const m of history.slice(-6)) messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  messages.push({ role: "user", content: question });

  for (const m of messages) assertNoSecrets(m.content);
  return messages;
}

/**
 * Deterministic RAG answer used as the fallback (no AI provider) — grounded in
 * the retrieved articles only. If nothing was retrieved, the honest fallback.
 */
export function deterministicRagAnswer(ctx: ZiContext, hits: KnowledgeSearchHit[]): string {
  if (hits.length === 0) {
    const page = ctx.moduleLabel ? `עמוד נוכחי: **${ctx.moduleLabel}**.` : "";
    return [
      RAG_FALLBACK,
      "",
      "מה אפשר לעשות:",
      page && `- לבדוק את ה${page}`,
      "- לפתוח פנייה לתמיכה דרך מסך העזרה.",
      "- כלי אבחון מתקדמים יתווספו בפאזה הבאה.",
    ].filter(Boolean).join("\n");
  }
  const top = hits[0].article;
  const lines: string[] = [`**${top.title}**`, top.summary];
  // include the top article's "what it does" + key terms succinctly
  const body = top.content.split("\n").filter((l) => l.trim() && !l.startsWith("##")).slice(0, 6);
  if (body.length) { lines.push(""); lines.push(...body); }
  if (hits.length > 1) {
    lines.push("");
    lines.push("מקורות נוספים: " + hits.slice(1, 3).map((h) => h.article.title).join(" · "));
  }
  return lines.join("\n");
}

/** Source references for the UI ("מקורות תשובה"). */
export function ragSources(hits: KnowledgeSearchHit[]): KnowledgeSourceRef[] {
  return hits.map((h) => ({
    id: h.article.id,
    slug: h.article.slug,
    title: h.article.title,
    category: h.article.category,
    route: h.article.routes[0] ?? null,
  }));
}

/** Page-aware follow-up question suggestions derived from retrieved articles. */
export function ragFollowups(hits: KnowledgeSearchHit[]): string[] {
  const out: string[] = [];
  for (const h of hits.slice(0, 3)) {
    // pull "common question" lines from the article body
    const qs = h.article.content
      .split("\n")
      .filter((l) => l.startsWith("- **") && l.includes("** —"))
      .map((l) => l.replace(/^- \*\*/, "").split("** —")[0].trim())
      .filter((q) => q.endsWith("?"));
    if (qs[0]) out.push(qs[0]);
  }
  return [...new Set(out)].slice(0, 3);
}
