"use client";
// ZI Expert™ — empty state shown before the first question in a conversation.
import { ZIAvatar } from "./ZIAvatar";

export function ZIEmptyState({ moduleLabel }: { moduleLabel: string | null }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <ZIAvatar size={72} state="idle" showStatus={false} />
      <div>
        <p className="text-base font-black text-white">שלום, אני ZI</p>
        <p className="mt-1 text-sm text-white/60">
          המומחה שלך ל-ZONO. אני כאן כדי להסביר, להדריך ולענות על כל שאלה
          {moduleLabel ? <> — כולל מה שמוצג כעת ב<span className="font-bold text-violet-200">{moduleLabel}</span></> : null}.
        </p>
      </div>
      <p className="text-xs text-white/40">בחר/י שאלה מהירה למטה או כתוב/י לי כל דבר.</p>
    </div>
  );
}
