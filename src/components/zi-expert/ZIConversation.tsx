"use client";
// ZI Expert™ — the scrolling message thread (with streaming + empty state).
import { useEffect, useRef } from "react";
import { ZIMessage } from "./ZIMessage";
import { ZILoading } from "./ZILoading";
import { ZIEmptyState } from "./ZIEmptyState";
import { ZIAvatar } from "./ZIAvatar";
import type { ZiMessage } from "@/lib/zi-expert/types";

export function ZIConversation({ messages, streaming, thinking, moduleLabel, onRate, onRegenerate }: {
  messages: ZiMessage[];
  streaming: string | null;        // partial assistant text being revealed
  thinking: boolean;               // request in flight, before first chunk
  moduleLabel: string | null;
  onRate: (messageId: string, rating: "up" | "down") => void;
  onRegenerate: () => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, streaming, thinking]);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
      {messages.length === 0 && !thinking && !streaming && <ZIEmptyState moduleLabel={moduleLabel} />}

      {messages.map((m) => (
        <ZIMessage
          key={m.id}
          message={m}
          onRate={m.role === "assistant" ? (r) => onRate(m.id, r) : undefined}
          onRegenerate={m.id === lastAssistantId ? onRegenerate : undefined}
          canRegenerate={m.id === lastAssistantId}
        />
      ))}

      {/* live streaming bubble */}
      {streaming !== null && (
        <div className="flex items-start gap-2">
          <ZIAvatar size={30} state="thinking" showStatus={false} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-violet-400/15 bg-white/[0.04] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white/85">
            {streaming}
            <span className="zi-caret" />
          </div>
        </div>
      )}

      {thinking && streaming === null && (
        <div className="flex items-center gap-2 px-1">
          <ZIAvatar size={30} state="thinking" showStatus={false} className="shrink-0" />
          <ZILoading />
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
