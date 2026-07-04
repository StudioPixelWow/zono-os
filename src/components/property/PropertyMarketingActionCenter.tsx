// ============================================================================
// 🎯 ZONO — Property Marketing Action Center (server component). 33.3.
// The actionable "what to do now" panel for a property's marketing: due-now
// assisted publishes, failed posts, pending lead approvals, and recommended next
// steps — each routing to an EXISTING flow. Read-only; nothing executes here.
// ============================================================================
import Link from "next/link";
import { getPropertyMarketingActionCenter, type ActionItem, type ActionStatus } from "@/lib/property-marketing-action-center";

const BADGE: Record<ActionStatus, { label: string; cls: string }> = {
  due_now: { label: "עכשיו", cls: "bg-danger-soft text-danger" },
  attention: { label: "לתשומת לב", cls: "bg-warning-soft text-warning" },
  pending_approval: { label: "לאישור", cls: "bg-warning-soft text-warning" },
  recommended: { label: "מומלץ", cls: "bg-brand-soft text-brand" },
  in_progress: { label: "בתהליך", cls: "bg-brand-soft text-brand" },
};

function Card({ a }: { a: ActionItem }) {
  const b = BADGE[a.status];
  return (
    <div className="bg-surface flex items-start justify-between gap-3 rounded-2xl p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${b.cls}`}>{b.label}</span>
          <span className="text-ink text-[14px] font-bold">{a.title}{a.count != null ? <span className="text-brand"> · {a.count}</span> : null}</span>
        </div>
        <p className="text-muted mt-1 text-[12px] leading-relaxed">{a.why}{a.requiresApproval ? " · באישורכם בלבד" : ""}</p>
      </div>
      <Link href={a.cta.href} className="bg-brand shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold text-white">{a.cta.label}</Link>
    </div>
  );
}

export async function PropertyMarketingActionCenter({ propertyId }: { propertyId: string }) {
  const ac = await getPropertyMarketingActionCenter(propertyId).catch(() => null);
  if (!ac) return null;

  return (
    <section dir="rtl" className="bg-card border-line rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ink flex items-center gap-2 text-lg font-black">🎯 מרכז פעולות שיווק</h2>
        {!ac.isEmpty && <span className="text-muted text-[12px] font-bold">{ac.stats.open} פעולות פתוחות</span>}
      </div>
      <p className="text-muted mb-3 text-[13px]">{ac.headline}</p>

      {ac.isEmpty ? (
        <div className="py-6 text-center">
          <p className="text-ink text-[14px] font-bold">הכל מעודכן ✓</p>
          <p className="text-muted mt-1 text-[12px]">אין פעולות שיווק שממתינות לנכס זה כרגע.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ac.dueNow.length > 0 && <div className="space-y-2">{ac.dueNow.map((a) => <Card key={a.id} a={a} />)}</div>}
          {ac.pending.length > 0 && <div className="space-y-2">{ac.pending.map((a) => <Card key={a.id} a={a} />)}</div>}
          {ac.recommended.length > 0 && (
            <div>
              <p className="text-muted mb-1 text-[11px] font-bold">מומלץ</p>
              <div className="space-y-2">{ac.recommended.map((a) => <Card key={a.id} a={a} />)}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
