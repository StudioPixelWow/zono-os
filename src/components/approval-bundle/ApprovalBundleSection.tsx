"use client";
// ============================================================================
// 🎁 ZONO — Autonomous Office™ · Approval Bundle section (reusable). PHASE 44.0.
// Shows the prepared action bundle for an entity. Per-action or whole-bundle
// approval; reject; Ask ("why / what happens if I approve"). Approving creates
// ONLY approval-gated artifacts — nothing sends, publishes or books.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { getEntityBundlesAction, approveBundleAction, rejectBundleAction, askBundleWhyAction, askBundleWhatIfAction } from "@/lib/approval-bundle/actions";
import type { ApprovalBundle, BundleAction, BundleEntityType, ActionType } from "@/lib/approval-bundle/types";

const ACTION_ICON: Record<ActionType, string> = {
  mission: "Sparkles", workflow: "GitBranch", whatsapp_draft: "MessageCircle", email_draft: "Mail",
  calendar_booking: "Calendar", facebook_action: "Megaphone", marketing_action: "Megaphone",
  landing_suggestion: "Globe", notification: "Bell",
};
const STATUS_TONE: Record<string, string> = {
  proposed: "bg-surface text-muted", approved: "bg-success-soft text-success",
  rejected: "bg-danger-soft text-danger", exists: "bg-line/70 text-muted",
};
const STATUS_HE: Record<string, string> = { proposed: "מוצע", approved: "אושר", rejected: "נדחה", exists: "כבר קיים" };

export function ApprovalBundleSection({ entityType, entityId }: { entityType: BundleEntityType; entityId: string }) {
  const [bundles, setBundles] = useState<ApprovalBundle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [ask, setAsk] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  useEffect(() => { let alive = true; getEntityBundlesAction({ entityType, entityId }).then((r) => { if (alive) { setBundles(r.bundles); setLoaded(true); } }).catch(() => setLoaded(true)); return () => { alive = false; }; }, [entityType, entityId]);

  const approve = (b: ApprovalBundle, which: ActionType | "all") => start(async () => {
    const r = await approveBundleAction({ bundleId: b.bundleId, which });
    setNotes((p) => ({ ...p, [b.bundleId]: r.created.map((c) => `${c.ok ? "✓" : "✗"} ${c.note}`) }));
    setBundles((p) => p.map((x) => (x.bundleId === b.bundleId ? r.bundle : x)));
  });
  const reject = (b: ApprovalBundle) => start(async () => { await rejectBundleAction({ bundleId: b.bundleId }); setBundles((p) => p.map((x) => (x.bundleId === b.bundleId ? { ...x, status: "rejected" } : x))); });
  const askWhy = (b: ApprovalBundle) => start(async () => { const r = await askBundleWhyAction({ bundleId: b.bundleId }); setAsk((p) => ({ ...p, [b.bundleId]: r.answer })); });
  const askWhatIf = (b: ApprovalBundle) => start(async () => { const r = await askBundleWhatIfAction({ bundleId: b.bundleId }); setAsk((p) => ({ ...p, [b.bundleId]: r.answer })); });

  if (loaded && bundles.length === 0) return null;

  return (
    <div dir="rtl" className="flex flex-col gap-3">
      {!loaded ? <div className="bg-card border-line rounded-[18px] border p-4 text-[12px] text-muted">טוען המלצות…</div> : bundles.map((b) => (
        <div key={b.bundleId} className={`bg-card border-line rounded-[18px] border p-4 ${b.status === "rejected" ? "opacity-60" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="zono-gradient rounded-full px-2 py-0.5 text-[11px] font-bold text-white">🎁 באנדל אישור</span>
                <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[10px] font-bold">עדיפות {b.priority}</span>
                {b.risk >= 60 && <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[10px] font-bold">סיכון {b.risk}</span>}
              </div>
              <h3 className="text-ink text-[15px] font-black">{b.title}</h3>
              <p className="text-muted mt-0.5 text-[12px]">{b.summary}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[b.status] ?? "bg-surface text-muted"}`}>{b.status === "approved" ? "אושר" : b.status === "rejected" ? "נדחה" : b.status === "partially_approved" ? "אושר חלקית" : "ממתין"}</span>
          </div>

          <div className="mt-3 space-y-1.5">
            {b.actions.map((a, i) => <ActionRow key={i} a={a} disabled={pending || b.status === "rejected"} onApprove={() => approve(b, a.type)} />)}
          </div>

          {notes[b.bundleId] && <div className="bg-surface mt-2 rounded-xl p-2">{notes[b.bundleId].map((n, i) => <p key={i} className="text-muted text-[11px]">{n}</p>)}</div>}
          {ask[b.bundleId] && <p className="bg-brand-soft/30 text-ink mt-2 rounded-xl p-2 text-[12px]">{ask[b.bundleId]}</p>}

          {b.status !== "rejected" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => approve(b, "all")} disabled={pending} className="zono-gradient rounded-xl px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">אשר הכל</button>
              <button onClick={() => reject(b)} disabled={pending} className="bg-danger-soft text-danger rounded-xl px-3 py-1.5 text-xs font-bold disabled:opacity-50">דחה</button>
              <button onClick={() => askWhy(b)} disabled={pending} className="bg-surface text-ink rounded-xl px-3 py-1.5 text-xs font-bold disabled:opacity-50">למה?</button>
              <button onClick={() => askWhatIf(b)} disabled={pending} className="bg-surface text-ink rounded-xl px-3 py-1.5 text-xs font-bold disabled:opacity-50">מה אם אאשר?</button>
            </div>
          )}
          <p className="text-muted mt-2 text-[10px]">אישור יוצר טיוטות/משימות לאישור בלבד — שום הודעה לא נשלחת, שום קמפיין לא מתפרסם ושום פגישה לא נקבעת אוטומטית.</p>
        </div>
      ))}
    </div>
  );
}

function ActionRow({ a, disabled, onApprove }: { a: BundleAction; disabled: boolean; onApprove: () => void }) {
  return (
    <div className="bg-surface flex items-center gap-2 rounded-xl p-2">
      <span className="bg-card text-brand-strong grid h-7 w-7 shrink-0 place-items-center rounded-lg"><Icon name={ACTION_ICON[a.type] ?? "Sparkles"} size={13} /></span>
      <div className="min-w-0 flex-1"><p className="text-ink truncate text-[12px] font-bold">{a.label}</p><p className="text-muted truncate text-[10px]">{a.reason}</p></div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[a.status]}`}>{STATUS_HE[a.status]}</span>
      {a.status === "proposed" && <button onClick={onApprove} disabled={disabled} className="bg-brand-soft text-brand-strong shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold disabled:opacity-50">אשר</button>}
    </div>
  );
}
