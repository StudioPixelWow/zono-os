"use client";
// ZI Expert™ — the chat window: header, optional history panel, message thread,
// page-aware suggestions and the composer.
import { useState } from "react";
import { Search, Pin, Trash2, ArrowUpRight, Send } from "lucide-react";
import { ZIHeader } from "./ZIHeader";
import { ZIConversation } from "./ZIConversation";
import { ZISuggestions } from "./ZISuggestions";
import { groupConversationsByRecency, searchConversations } from "@/lib/zi-expert/conversation";
import type { ZiConversation, ZiMessage, ZiSuggestion } from "@/lib/zi-expert/types";

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

          <div className="border-t border-white/10 bg-white/[0.02] px-3.5 py-3">
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
