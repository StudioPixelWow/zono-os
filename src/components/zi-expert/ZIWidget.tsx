"use client";
// ============================================================================
// ZI Expert™ — global widget (Phase 22). Floating launcher (bottom-right) +
// animated chat window, mounted on every authenticated page. Owns all state and
// talks to the org-scoped server actions. ZI is read-only: explain / guide /
// answer only. Streaming is simulated client-side from the returned answer so
// the UI never blocks while the model responds.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ZIAvatar } from "./ZIAvatar";
import { ZIChatWindow } from "./ZIChatWindow";
import { useZiContext } from "@/hooks/useZiContext";
import { chunkForStream, inferIssueTypeFromText } from "@/lib/zi-expert";
import type { IssueType } from "@/lib/zi-expert/diagnostic-types";
import {
  askZiAction, deleteConversationAction, loadConversationAction, loadConversationsAction,
  pinConversationAction, rateMessageAction, submitKnowledgeFeedbackAction, runDiagnosticsAction,
  markLearningAction,
} from "@/lib/zi-expert/actions";
import { walkthroughBySlug, tutorialBySlug, walkthroughAsSteps } from "@/lib/zi-expert/learning";
import type { LearningKind } from "@/lib/zi-expert/learning/types";
import type { ZiConversation, ZiMessage } from "@/lib/zi-expert/types";
import type { FeedbackRating } from "@/lib/zi-expert/knowledge-types";

/** Sources + follow-ups + feedback context for the most recent answer. */
export interface ZiAnswerMeta {
  question: string;
  answer: string;
  route: string | null;
  moduleId: string | null;
  sources: { id: string; slug: string; title: string; category: string; route: string | null }[];
  followups: string[];
  rated: FeedbackRating | null;
}

let tempCounter = 0;
const tempId = () => `temp-${Date.now()}-${tempCounter++}`;

export function ZIWidget() {
  const { client, moduleLabel, suggestions } = useZiContext();

  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [conversations, setConversations] = useState<ZiConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ZiMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [answerMeta, setAnswerMeta] = useState<ZiAnswerMeta | null>(null);
  const loadedOnce = useRef(false);
  const streamTimer = useRef<number | null>(null);

  const refreshConversations = useCallback(async () => {
    const res = await loadConversationsAction(false);
    if (res.ok) setConversations(res.data);
  }, []);

  // Load history the first time the widget is opened (event-driven, not in an effect).
  const openWidget = useCallback(() => {
    setOpen(true);
    if (!loadedOnce.current) { loadedOnce.current = true; void refreshConversations(); }
  }, [refreshConversations]);

  // Escape closes the window.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Cleanup any running stream timer on unmount.
  useEffect(() => () => { if (streamTimer.current) window.clearInterval(streamTimer.current); }, []);

  /** Reveal the answer progressively, then commit the final message. */
  const revealAnswer = useCallback((finalMsg: ZiMessage) => {
    const chunks = chunkForStream(finalMsg.content, 3);
    let acc = "";
    let i = 0;
    setStreaming("");
    if (streamTimer.current) window.clearInterval(streamTimer.current);
    streamTimer.current = window.setInterval(() => {
      if (i >= chunks.length) {
        if (streamTimer.current) window.clearInterval(streamTimer.current);
        streamTimer.current = null;
        setStreaming(null);
        setMessages((prev) => [...prev, finalMsg]);
        return;
      }
      acc += chunks[i];
      i++;
      setStreaming(acc);
    }, 22);
  }, []);

  // Forward ref so `ask` can hand off diagnostic-intent questions to the
  // diagnostics runner (declared later) without a use-before-define cycle.
  const diagnoseRef = useRef<(issueType?: IssueType, userText?: string) => void>(() => {});

  const ask = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || thinking || streaming !== null) return;
    // Free-text "why isn't X working?" → route to the diagnostics engine.
    const dxIssue = inferIssueTypeFromText(q);
    if (dxIssue) { setInput(""); diagnoseRef.current(dxIssue, q); return; }
    setInput("");
    setHistoryOpen(false);
    const optimistic: ZiMessage = {
      id: tempId(), conversationId: conversationId ?? "pending", role: "user", content: q,
      source: null, route: client.route, moduleId: null, rating: null, createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setThinking(true);
    setAnswerMeta(null);

    const res = await askZiAction({ question: q, conversationId, client });
    setThinking(false);

    if (!res.ok) {
      setMessages((prev) => [
        ...prev,
        { id: tempId(), conversationId: conversationId ?? "pending", role: "assistant", content: "מצטער, לא הצלחתי להשיב כרגע. נסה/י שוב בעוד רגע.", source: "fallback", route: client.route, moduleId: null, rating: null, createdAt: new Date().toISOString() },
      ]);
      return;
    }

    // Swap the optimistic user message for the persisted one.
    setConversationId(res.data.conversationId);
    setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? res.data.question : m)));
    revealAnswer(res.data.answer);
    setAnswerMeta({
      question: q, answer: res.data.answer.content, route: client.route, moduleId: res.data.answer.moduleId,
      sources: res.data.sources ?? [], followups: res.data.followups ?? [], rated: null,
    });
    void refreshConversations();
  }, [thinking, streaming, conversationId, client, revealAnswer, refreshConversations]);

  /** "בדוק למה זה לא עובד" — run ZI Diagnostics for the current page (support-only).
   *  `issueType` is passed when routed from a free-text question; otherwise the
   *  server infers it from the current route. */
  const runDiagnostics = useCallback(async (issueType?: IssueType, userText?: string) => {
    if (thinking || streaming !== null) return;
    setHistoryOpen(false);
    setAnswerMeta(null);
    const userMsg: ZiMessage = {
      id: tempId(), conversationId: conversationId ?? "pending", role: "user", content: userText ?? "בדוק למה זה לא עובד 🔧",
      source: null, route: client.route, moduleId: null, rating: null, createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setThinking(true);

    const browser = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const res = await runDiagnosticsAction({ currentRoute: client.route, module: moduleLabel ?? null, issueType, browser });
    setThinking(false);

    if (!res.ok) {
      setMessages((prev) => [
        ...prev,
        { id: tempId(), conversationId: conversationId ?? "pending", role: "assistant", content: "לא הצלחתי להריץ אבחון כרגע. נסה/י שוב בעוד רגע.", source: "fallback", route: client.route, moduleId: null, rating: null, createdAt: new Date().toISOString() },
      ]);
      return;
    }

    const r = res.data;
    const screens = r.relatedScreens.length
      ? `\n\n🔗 מסכים קשורים: ${r.relatedScreens.map((s) => s.label).join(" · ")}`
      : "";
    const ticket = r.status === "critical"
      ? `\n\nמזהה פנייה לתמיכה: ${r.supportPayload.correlationId}`
      : "";
    revealAnswer({
      id: tempId(), conversationId: conversationId ?? "pending", role: "assistant",
      content: `${r.explanation}${screens}${ticket}`, source: "fallback",
      route: client.route, moduleId: null, rating: null, createdAt: new Date().toISOString(),
    });
  }, [thinking, streaming, conversationId, client, moduleLabel, revealAnswer]);

  // Keep the forward ref pointed at the latest runDiagnostics.
  useEffect(() => { diagnoseRef.current = (it, ut) => { void runDiagnostics(it, ut); }; }, [runDiagnostics]);

  /** Open a learning lesson — renders it as steps in the chat + records progress.
   *  Support-only: ZI teaches the steps, the user performs them. */
  const openLesson = useCallback((kind: LearningKind, slug: string, title: string) => {
    setLearnOpen(false);
    let content: string | null = null;
    if (kind === "walkthrough") { const w = walkthroughBySlug(slug); content = w ? walkthroughAsSteps(w) : null; }
    else if (kind === "tutorial") {
      const t = tutorialBySlug(slug);
      if (t) content = [`**${t.title}** · ⏱️ ${t.estimatedMinutes} דק׳`, t.summary, "", ...t.steps.map((s, i) => `**${i + 1}. ${s.title}**\n${s.body}`)].join("\n");
    }
    if (!content) content = `הנה ההסבר על „${title}". שאל/י אותי כל שאלה.`;
    const msg: ZiMessage = {
      id: tempId(), conversationId: conversationId ?? "pending", role: "assistant", content,
      source: "fallback", route: client.route, moduleId: null, rating: null, createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, { id: tempId(), conversationId: conversationId ?? "pending", role: "user", content: `למד אותי: ${title}`, source: null, route: client.route, moduleId: null, rating: null, createdAt: new Date().toISOString() }]);
    revealAnswer(msg);
    void markLearningAction({ kind, slug, status: "completed" });
  }, [conversationId, client, revealAnswer]);

  const openConversation = useCallback(async (id: string) => {
    const res = await loadConversationAction(id, { limit: 100, offset: 0 });
    if (res.ok) {
      setConversationId(id);
      setMessages(res.data.messages);
      setHistoryOpen(false);
      setAnswerMeta(null);
    }
  }, []);

  const newChat = useCallback(() => {
    if (streamTimer.current) { window.clearInterval(streamTimer.current); streamTimer.current = null; }
    setConversationId(null);
    setMessages([]);
    setStreaming(null);
    setThinking(false);
    setHistoryOpen(false);
    setLearnOpen(false);
    setAnswerMeta(null);
  }, []);

  /** Record "האם זה עזר?" feedback for the most recent answer. */
  const sendFeedback = useCallback(async (rating: FeedbackRating) => {
    if (!answerMeta) return;
    setAnswerMeta((m) => (m ? { ...m, rated: rating } : m));
    await submitKnowledgeFeedbackAction({
      question: answerMeta.question, answer: answerMeta.answer,
      articleIds: answerMeta.sources.map((s) => s.id),
      route: answerMeta.route, moduleId: answerMeta.moduleId, rating,
    });
  }, [answerMeta]);

  const rate = useCallback(async (messageId: string, rating: "up" | "down") => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, rating: m.rating === rating ? null : rating } : m)));
    if (!messageId.startsWith("temp-")) await rateMessageAction(messageId, rating);
  }, []);

  const regenerate = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    void ask(lastUser.content);
  }, [messages, ask]);

  const pin = useCallback(async (id: string, pinned: boolean) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned } : c)));
    await pinConversationAction(id, pinned);
    void refreshConversations();
  }, [refreshConversations]);

  const remove = useCallback(async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) newChat();
    await deleteConversationAction(id);
  }, [conversationId, newChat]);

  return (
    <>
      {/* Launcher */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="zi-launcher"
            type="button"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            onClick={openWidget}
            aria-label="פתח את ZI — המומחה שלך ל-ZONO"
            className="zi-launcher fixed bottom-5 right-5 z-[150]"
          >
            <ZIAvatar size={155} state="idle" bare />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat window */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="zi-window"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-5 right-5 z-[150] flex h-[min(620px,calc(100vh-2.5rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl"
          >
            <ZIChatWindow
              messages={messages}
              streaming={streaming}
              thinking={thinking}
              moduleLabel={moduleLabel}
              suggestions={suggestions}
              input={input}
              setInput={setInput}
              onSubmit={ask}
              onRate={rate}
              onRegenerate={regenerate}
              conversations={conversations}
              historyOpen={historyOpen}
              onToggleHistory={() => setHistoryOpen((v) => !v)}
              onNewChat={newChat}
              onClose={() => setOpen(false)}
              onOpenConversation={openConversation}
              onPin={pin}
              onDelete={remove}
              answerMeta={streaming === null ? answerMeta : null}
              onFeedback={sendFeedback}
              onDiagnose={runDiagnostics}
              learnOpen={learnOpen}
              onToggleLearn={() => { setLearnOpen((v) => !v); setHistoryOpen(false); }}
              learnModule={null}
              onOpenLesson={openLesson}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
