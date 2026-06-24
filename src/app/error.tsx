"use client";

/**
 * App-wide segment error boundary — catches render/runtime errors in any route
 * under the root layout. Branded ZONO fallback + retry; logs the error.
 * (Root-layout errors are handled by global-error.tsx.)
 */
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ZONO error]", error);
  }, [error]);

  return (
    <div dir="rtl" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="zono-gradient grid h-16 w-16 place-items-center rounded-2xl text-2xl font-black text-white">Z</span>
      <h1 className="text-ink text-2xl font-black">משהו השתבש</h1>
      <p className="text-muted max-w-md text-sm leading-relaxed">
        אירעה שגיאה בלתי צפויה בעמוד הזה. אפשר לנסות שוב — שאר המערכת ממשיכה לעבוד כרגיל.
      </p>
      {error.digest && (
        <p className="text-muted font-mono text-[11px] opacity-60">קוד שגיאה: {error.digest}</p>
      )}
      <button
        onClick={() => reset()}
        className="bg-brand mt-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-95"
      >
        נסה שוב
      </button>
    </div>
  );
}
