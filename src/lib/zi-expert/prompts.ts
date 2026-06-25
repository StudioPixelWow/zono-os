// ============================================================================
// ZI Expert™ — prompt building + safety (Phase 22, PURE / client-safe).
// Reuses the Phase 15 sanitizer (sanitizeContext / assertNoSecrets) — no
// duplicated safety layer. The system prompt pins ZI to its SUPPORT-EXPERT
// personality and forbids it from ever performing actions or changing data.
// ============================================================================
import { sanitizeContext, assertNoSecrets } from "@/lib/ai-copilot";
import type { AiMessage } from "@/lib/ai-copilot/types";
import { contextToPromptBlock } from "./context";
import { knowledgeForModule, knowledgeForRoute } from "./knowledge";
import { permissionScopeLine } from "./permissions";
import type { ZiContext, ZiMessage } from "./types";

// ── ZI personality (Senior Product Specialist — never a generic chatbot) ─────
export const ZI_SYSTEM_PROMPT =
  'אתה ZI — המומחה הרשמי למוצר ZONO, מערכת ההפעלה לסוכני נדל"ן בישראל. ' +
  "אתה מומחה מוצר בכיר: מקצועי, ידידותי, סבלני, ברור, בטוח ומעודד. " +
  "התפקיד שלך הוא אך ורק תמיכה: להבין הקשר, להסביר יכולות, לענות על שאלות, להדריך ולעזור לפתור בעיות. " +
  "אתה לעולם לא מבצע פעולות, לא יוצר/עורך/מוחק רשומות, לא מריץ תהליכים, לא מאשר פעולות ולא משנה נתונים — רק מסביר ומכוון. " +
  'אם משתמש מבקש לבצע פעולה, הסבר לו בנימוס כיצד לעשות זאת בעצמו בתוך המערכת. ' +
  "אל תאמר 'אני חושב', 'אולי' או 'אני לא בטוח'. הסבר על בסיס הידע הקיים של המערכת. " +
  "אם מידע מסוים אינו זמין לך — אמור בבירור מה אינך יכול לקבוע, במקום להמציא תשובה. " +
  "כתוב בעברית, בטון חם ומקצועי. השתמש ב-Markdown כשזה עוזר (כותרות, רשימות, טבלאות, קוד, קישורים פנימיים). " +
  "השתמש אך ורק בהקשר ובידע המובנה שניתנים לך, וכבד את הרשאות המשתמש.";

/** Knowledge snippet to ground the answer in real product behaviour. */
function knowledgeBlock(ctx: ZiContext): string {
  const k = ctx.moduleId ? knowledgeForModule(ctx.moduleId) : knowledgeForRoute(ctx.route);
  const terms = k.glossary.map((g) => `- ${g.term}: ${g.definition}`).join("\n");
  const details = k.details.map((d) => `- ${d}`).join("\n");
  return [
    `ידע על העמוד "${k.title}":`,
    k.summary,
    details && `נקודות מפתח:\n${details}`,
    terms && `מושגים:\n${terms}`,
  ].filter(Boolean).join("\n");
}

/**
 * Build the chat messages for an ask. Sanitizes context, grounds the answer in
 * product knowledge, applies the permission scope and includes recent history.
 */
export function buildZiMessages(ctx: ZiContext, question: string, history: ZiMessage[] = []): AiMessage[] {
  const safeCtx = sanitizeContext(ctx);
  const block = contextToPromptBlock(safeCtx as ZiContext);
  const know = knowledgeBlock(ctx);
  const scope = permissionScopeLine(ctx.roleKey);

  const messages: AiMessage[] = [{ role: "system", content: `${ZI_SYSTEM_PROMPT}\n\n${scope}` }];
  // Prime with context + knowledge as a system turn so it grounds every answer.
  messages.push({ role: "system", content: `הקשר נוכחי:\n${block}\n\n${know}` });

  // Recent conversation history (last 8 turns) for continuity.
  for (const m of history.slice(-8)) {
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }
  messages.push({ role: "user", content: question });

  // Safety belt — never let credential-like content reach the provider.
  for (const m of messages) assertNoSecrets(m.content);
  return messages;
}
