"use client";
// ZI Expert™ — page-aware starter questions.
import { Sparkles } from "lucide-react";
import type { ZiSuggestion } from "@/lib/zi-expert/types";

export function ZISuggestions({ suggestions, onPick, disabled }: {
  suggestions: ZiSuggestion[];
  onPick: (question: string) => void;
  disabled?: boolean;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {suggestions.map((s) => (
        <button
          key={s.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s.question)}
          className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-violet-100 transition hover:border-violet-400/50 hover:bg-violet-500/15 disabled:opacity-40"
        >
          <Sparkles size={12} className="text-violet-300" />
          {s.label}
        </button>
      ))}
    </div>
  );
}
