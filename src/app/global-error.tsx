"use client";

/**
 * Root error boundary — catches errors thrown in the root layout itself.
 * Renders its own <html>/<body> (it replaces the root layout), so styles are
 * inlined and self-contained. Branded ZONO fallback + retry, never the raw
 * Next.js crash page. Logs the error to the console for capture.
 */
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ZONO global-error]", error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, background: "#08051A", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#7C3AED,#4F46E5)", fontSize: 28, fontWeight: 900 }}>Z</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>משהו השתבש</h1>
          <p style={{ maxWidth: 420, opacity: 0.8, margin: 0, lineHeight: 1.6 }}>
            אירעה שגיאה בלתי צפויה. הצוות קיבל התראה. אפשר לנסות שוב או לרענן את העמוד.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, opacity: 0.5, fontFamily: "monospace" }}>קוד שגיאה: {error.digest}</p>
          )}
          <button
            onClick={() => reset()}
            style={{ marginTop: 8, background: "#fff", color: "#4F46E5", border: "none", borderRadius: 12, padding: "10px 22px", fontWeight: 800, cursor: "pointer" }}
          >
            נסה שוב
          </button>
        </div>
      </body>
    </html>
  );
}
