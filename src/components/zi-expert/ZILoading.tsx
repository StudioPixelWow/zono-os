"use client";
// ZI Expert™ — thinking / typing indicator.
export function ZILoading({ label = "ZI חושב…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-white/60" role="status" aria-live="polite">
      <span className="flex items-center gap-1">
        <span className="zi-typing-dot" />
        <span className="zi-typing-dot" style={{ animationDelay: "0.18s" }} />
        <span className="zi-typing-dot" style={{ animationDelay: "0.36s" }} />
      </span>
      <span className="text-xs font-semibold">{label}</span>
    </div>
  );
}
