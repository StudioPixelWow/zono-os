/**
 * Dev-only "demo" badge. Renders ONLY outside production so that any
 * intentionally illustrative/mock UI (e.g. the decorative hero map) is clearly
 * marked during development and never presents fake data as real in production.
 */
export function DemoBadge({ label = "דמו", className = "" }: { label?: string; className?: string }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <span
      className={`bg-warning-soft text-warning pointer-events-none z-10 rounded-full px-2 py-0.5 text-[10px] font-bold ${className}`}
      title="תוכן הדגמה — אינו נתון אמיתי"
    >
      {label}
    </span>
  );
}
