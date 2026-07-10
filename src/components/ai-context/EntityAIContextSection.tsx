// ============================================================================
// 🧩 ZONO OS 2.0 — Stage 4 · Batch 4.5A · Entity cockpit AI-context section.
// The ONE grounded-context surface every entity cockpit (Property / Buyer /
// Seller / Lead / Deal / Meeting / Document / Journey) drops in as a slot. It
// consumes the canonical shared assembler (groundEntityContext, internal_entity
// mode) — no screen-local context construction. Canonical truth stays primary;
// this panel is the AI-grounded second layer. Stale memory that conflicts with
// current truth is shown as "לא בשימוש כעת" with its provenance, never as fact.
// ============================================================================
import "server-only";
import { groundEntityContext, type CanonicalFact } from "@/lib/ai-context";

const PROV_HE: Record<string, string> = { explicit: "מפורש", derived: "מחושב", inferred: "משוער" };

export async function EntityAIContextSection({
  entityType, entityId, canonicalTruth = [], title = "הקשר ZONO — למה?",
}: {
  entityType: string;
  entityId: string;
  canonicalTruth?: CanonicalFact[];
  title?: string;
}) {
  const ctx = await groundEntityContext(entityType, entityId, { mode: "internal_entity", canonicalTruth }).catch(() => null);

  if (!ctx || (!ctx.hasSignal && !ctx.staleMemory.length && !ctx.diagnostics.failedLayers.length)) {
    return (
      <div className="bg-card border-line rounded-[16px] border p-4 text-sm text-muted">
        אין עדיין הקשר AI מספיק לישות זו. ZONO ילמד ממנה ככל שתצטבר פעילות.
      </div>
    );
  }

  const s = ctx.provenanceSummary;
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[16px] border p-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-muted text-xs">מצב · {ctx.mode}</span>
      </div>

      {ctx.truthLine && (
        <p className="text-sm">
          <span className="text-muted">אמת נוכחית: </span>{ctx.truthLine}
        </p>
      )}

      {ctx.contextText ? (
        <pre className="text-foreground/90 whitespace-pre-wrap break-words text-[13px] leading-relaxed">{ctx.contextText}</pre>
      ) : (
        <p className="text-muted text-sm">אין הקשר בטוח להצגה במצב זה.</p>
      )}

      {ctx.staleMemory.length > 0 && (
        <div className="border-line rounded-[12px] border border-dashed p-3">
          <p className="text-xs font-medium text-amber-600">זיכרון שלא בשימוש כעת (סותר את האמת הנוכחית):</p>
          <ul className="mt-1 flex flex-col gap-1">
            {ctx.staleMemory.map((m, i) => (
              <li key={i} className="text-muted text-xs">
                • {m.fact} <span className="opacity-70">({PROV_HE[m.provenance] ?? m.provenance} · {m.reason})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span>מקורות: {s.total}</span>
        <span>מפורש {s.explicit}</span>
        <span>מחושב {s.derived}</span>
        <span>משוער {s.inferred}</span>
        {ctx.diagnostics.failedLayers.length > 0 && (
          <span className="text-amber-600">שכבות חסרות: {ctx.diagnostics.failedLayers.join(", ")}</span>
        )}
        {Object.keys(ctx.diagnostics.truncated).length > 0 && (
          <span>נחתך: {Object.entries(ctx.diagnostics.truncated).map(([k, v]) => `${k}(${v})`).join(", ")}</span>
        )}
      </div>
    </div>
  );
}
