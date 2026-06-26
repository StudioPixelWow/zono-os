"use client";
// ZI Expert™ — the chat window: header, optional history panel, message thread,
// page-aware suggestions and the composer.
import { useState } from "react";
import Link from "next/link";
import { Search, Pin, Trash2, ArrowUpRight, Send, BookOpen, ThumbsUp, ThumbsDown, HelpCircle, Wrench } from "lucide-react";
import { ZIHeader } from "./ZIHeader";
import { ZIConversation } from "./ZIConversation";
import { ZISuggestions } from "./ZISuggestions";
import { groupConversationsByRecency, searchConversations } from "@/lib/zi-expert/conversation";
import type { ZiConversation, ZiMessage, ZiSuggestion } from "@/lib/zi-expert/types";
import type { FeedbackRating } from "@/lib/zi-expert/knowledge-types";
import type { ZiAnswerMeta } from "./ZIWidget";

export interface ZIChatWindowProps {
  messages: ZiMessage[];
  streaming: string | null;
  thinking: boolean;
  moduleLabel: string | null;
  suggestions: ZiSuggestion[];
  input: string;
  setInput: (v: string) => void;
  onSubmit: (text: string) => void;
  onRate: (messageId: string, rating: "up" | "down") => void;
  onRegenerate: () => void;
  conversations: ZiConversation[];
  historyOpen: boolean;
  onToggleHistory: () => void;
  onNewChat: () => void;
  onClose: () => void;
  onOpenConversation: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  answerMeta: ZiAnswerMeta | null;
  onFeedback: (rating: FeedbackRating) => void;
  onDiagnose: () => void;
}

export function ZIChatWindow(p: ZIChatWindowProps) {
  const [query, setQuery] = useState("");
  const busy = p.thinking || p.streaming !== null;

  const submit = () => {
    const t = p.input.trim();
    if (!t || busy) return;
    p.onSubmit(t);
  };

  return (
    <div className="zi-window flex h-full flex-col" dir="rtl">
      <ZIHeader historyOpen={p.historyOpen} onToggleHistory={p.onToggleHistory} onNewChat={p.onNewChat} onClose={p.onClose} />

      {p.historyOpen ? (
        <HistoryPanel
          conversations={searchConversations(p.conversations, query)}
          query={query}
          setQuery={setQuery}
          onOpen={p.onOpenConversation}
          onPin={p.onPin}
          onDelete={p.onDelete}
        />
      ) : (
        <>
          <ZIConversation
            messages={p.messages}
            streaming={p.streaming}
            thinking={p.thinking}
            moduleLabel={p.moduleLabel}
            onRate={p.onRate}
            onRegenerate={p.onRegenerate}
          />

          {/* Sources + helpful + follow-ups for the latest answer. */}
          {p.answerMeta && (p.answerMeta.sources.length > 0 || p.answerMeta.followups.length > 0) && (
            <div className="border-t border-white/10 bg-white/[0.02] px-3.5 py-2.5">
              {p.answerMeta.sources.length > 0 && (
                <div className="mb-2">
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-white/40"><BookOpen size={11} /> מקורות תשובה</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.answerMeta.sources.map((s) => (
                      s.route
                        ? <Link key={s.id} href={s.route} onClick={p.onClose} className="rounded-lg border border-violet-400/25 bg-white/[0.04] px-2 py-1 text-[11px] font-bold text-violet-100 transition hover:bg-violet-500/15">{s.title}</Link>
                        : <span key={s.id} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-bold text-white/70">{s.title}</span>
                    ))}
                  </div>
                </div>
              )}
              {p.answerMeta.followups.length > 0 && (
                <div className="mb-2">
                  <p className="mb-1 text-[11px] font-bold text-white/40">שאלות המשך</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.answerMeta.followups.map((q, i) => (
                      <button key={i} type="button" disabled={busy} onClick={() => p.onSubmit(q)} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/75 transition hover:bg-white/[0.08] disabled:opacity-40">{q}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-white/40">האם זה עזר?</span>
                {p.answerMeta.rated ? (
                  <span className="text-[11px] font-bold text-emerald-300">תודה על המשוב ✓</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => p.onFeedback("helpful")} title="עזר" className="rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-emerald-300"><ThumbsUp size={13} /></button>
                    <button type="button" onClick={() => p.onFeedback("not_helpful")} title="לא עזר" className="rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-rose-300"><ThumbsDown size={13} /></button>
                    <button type="button" onClick={() => p.onFeedback("missing_info")} title="חסר מידע" className="rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-amber-300"><HelpCircle size={13} /></button>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-white/10 bg-white/[0.02] px-3.5 py-3">
            {/* Diagnostics quick-action — always available. ZI inspects + explains only. */}
            <button
              type="button"
              onClick={p.onDiagnose}
              disabled={busy}
              className="mb-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[12px] font-bold text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-40"
            >
              <Wrench size={13} /> בדוק למה זה לא עובד
            </button>
            {p.messages.length === 0 && (
              <div className="mb-2.5">
                <p className="mb-1.5 text-[11px] font-bold text-white/40">שאלות מהירות לעמוד הזה</p>
                <ZISuggestions suggestions={p.suggestions} onPick={p.onSubmit} disabled={busy} />
              </div>
            )}
            <form
              onSubmit={(e) => { e.preventDefault(); submit(); }}
              className="flex items-end gap-2 rounded-2xl border border-violet-400/25 bg-white/[0.05] px-3 py-2 focus-within:border-violet-400/50"
            >
              <textarea
                value={p.input}
                onChange={(e) => p.setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="שאל/י את ZI כל דבר…"
                rows={1}
                className="max-h-28 flex-1 resize-none bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
              />
              <button
                type="submit"
                disabled={busy || !p.input.trim()}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <Send size={15} />
              </button>
            </form>
            <p className="mt-1.5 text-center text-[10px] text-white/30">ZI מסביר ומדריך בלבד — הוא לא מבצע פעולות ולא משנה נתונים.</p>
          </div>
        </>
      )}
    </div>
  );
}

function HistoryPanel({ conversations, query, setQuery, onOpen, onPin, onDelete }: {
  conversations: ZiConversation[];
  query: string;
  setQuery: (v: string) => void;
  onOpen: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const groups = groupConversationsByRecency(conversations);
  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש בהיסטוריה…"
          className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.05] pr-9 pl-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-violet-400/40"
        />
      </div>

      {conversations.length === 0 ? (
        <p className="px-2 py-8 text-center text-xs text-white/40">אין עדיין שיחות שמורות.</p>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="mb-3">
            <p className="px-1 py-1 text-[11px] font-bold text-white/35">{g.label}</p>
            {g.items.map((c) => (
              <div key={c.id} className="group flex items-center gap-1 rounded-xl px-2 py-2 transition hover:bg-white/[0.05]">
                <button type="button" onClick={() => onOpen(c.id)} className="flex min-w-0 flex-1 items-center gap-2 text-right">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/85">{c.title}</span>
                  <ArrowUpRight size={13} className="shrink-0 text-white/25" />
                </button>
                <button type="button" onClick={() => onPin(c.id, !c.pinned)} title={c.pinned ? "בטל נעיצה" : "נעץ"} className={`rounded-md p-1 transition hover:bg-white/10 ${c.pinned ? "text-amber-300" : "text-white/40 opacity-0 group-hover:opacity-100"}`}><Pin size={13} /></button>
                <button type="button" onClick={() => onDelete(c.id)} title="מחק" className="rounded-md p-1 text-white/40 opacity-0 transition hover:bg-white/10 hover:text-rose-300 group-hover:opacity-100"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
