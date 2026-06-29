// ============================================================================
// ZONO — shared empty-state guidance (presentation only · RTL · client-safe).
// Shown when an intelligence surface has no data yet. Standardized message +
// two obvious next steps (sync external listings / refresh the engines). Pure
// layout — no data, no logic, no engine calls.
// ============================================================================
import Link from "next/link";

export function EmptyGuidance({
  title = "עדיין אין מספיק דאטה",
  className,
}: { title?: string; className?: string }) {
  return (
    <div dir="rtl" className={`border-line bg-card rounded-2xl border border-dashed p-6 text-center ${className ?? ""}`}>
      <span className="mb-2 block text-3xl" aria-hidden>🧭</span>
      <p className="text-ink text-sm font-black">{title}</p>
      <p className="text-muted mx-auto mt-1 max-w-md text-sm">
        עדיין אין מספיק דאטה. לחץ <span className="font-bold">רענן מערכת</span> או <span className="font-bold">סנכרן נכסים חיצוניים</span> כדי להתחיל לצבור מודיעין.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <Link href="/market-intelligence" className="bg-brand hover:bg-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold text-white transition">
          🔄 סנכרן נכסים חיצוניים
        </Link>
        <Link href="/admin/system-health" className="border-line bg-surface text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-bold transition">
          ⚙️ רענן מערכת
        </Link>
      </div>
    </div>
  );
}
