"use client";
// ============================================================================
// ZONO — Marketing Plan WORKBOARD (client). "ZONO כבר עשתה את העבודה" — a visual,
// image-led weekly board the user reviews, edits, and approves ONCE. Facebook items
// show the SHARED live preview (parity with what publishes); buyer/follow-up items
// show real audiences. Editing only touches the DRAFT; "אשר והפעל תוכנית" runs a
// fresh validation, shows exactly what will change/block, then executes through the
// canonical engines. After activation each item reflects REAL execution state and
// failed items can be retried — no fake "בוצע".
// ============================================================================
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { FacebookPreview } from "@/components/facebook-groups/FacebookPreview";
import {
  updatePlanDraftAction, validatePlanAction, approveAndActivatePlanAction, retryPlanAction, cancelPlanAction,
} from "@/lib/marketing-autopilot/plan-actions";
import { ITEM_STATUS_LABEL, PLAN_STATUS_LABEL, type MarketingPlanSnapshot, type PlanItem, type PlanStatus } from "@/lib/marketing-autopilot/plan-core";

interface GroupOption { id: string; name: string; city: string | null }
interface CreativeOption { id: string; label: string; imageUrl: string | null; approved: boolean }
interface Identity { name: string; avatarUrl: string | null }

const FREQS: { v: string; label: string }[] = [
  { v: "one_time", label: "חד-פעמי" }, { v: "three_weekly", label: "3 בשבוע" }, { v: "daily", label: "יומי" }, { v: "full_month", label: "חודש מלא" },
];
const dateHe = (iso: string) => { try { return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "long" }); } catch { return iso; } };

function StatusChip({ status }: { status: string }) {
  const tone = status === "completed" || status === "scheduled" ? "bg-success-soft text-success"
    : status === "failed" || status === "blocked" ? "bg-danger-soft text-danger"
    : status === "executing" ? "bg-brand-soft text-brand"
    : status === "skipped" ? "bg-surface text-muted" : "bg-warning-soft text-warning";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{ITEM_STATUS_LABEL[status as keyof typeof ITEM_STATUS_LABEL] ?? status}</span>;
}

export function PlanWorkboardClient({ planId, propertyId, status: initialStatus, snapshot: initialSnapshot, groups, creatives, identity }: {
  planId: string; propertyId: string; status: PlanStatus; snapshot: MarketingPlanSnapshot; groups: GroupOption[]; creatives: CreativeOption[]; identity: Identity;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [snapshot] = useState(initialSnapshot);
  const status = initialStatus;
  const editable = status === "draft";
  const [confirm, setConfirm] = useState<{ blockers: string[]; notices: string[]; canApprove: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const summary = snapshot.summary;
  const items = snapshot.items;

  const refresh = () => start(() => router.refresh());

  async function edit(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null); setBusy(true);
    const r = await fn(); setBusy(false);
    if (!r.ok) { setErr(r.error ?? "הפעולה נכשלה"); return; }
    refresh();
  }

  async function openConfirm() {
    setErr(null); setBusy(true);
    const v = await validatePlanAction(planId); setBusy(false);
    if (!v.ok) { setErr(v.error ?? "האימות נכשל"); return; }
    setConfirm({ blockers: v.blockers, notices: v.notices, canApprove: v.canApprove });
  }
  async function doApprove() {
    setBusy(true); setErr(null);
    const r = await approveAndActivatePlanAction(planId); setBusy(false); setConfirm(null);
    if (!r.ok && r.blockers?.length) { setConfirm({ blockers: r.blockers, notices: r.notices ?? [], canApprove: false }); return; }
    if (!r.ok) { setErr(r.error ?? "ההפעלה נכשלה"); return; }
    refresh();
  }
  async function doRetry() { setBusy(true); const r = await retryPlanAction(planId); setBusy(false); if (!r.ok) setErr(r.error ?? "הניסיון נכשל"); else refresh(); }
  async function doCancel() { setBusy(true); const r = await cancelPlanAction(planId); setBusy(false); if (!r.ok) setErr(r.error ?? "הביטול נכשל"); else router.push(`/properties/${propertyId}`); }

  const activated = status !== "draft" && status !== "approved";
  const failedCount = items.filter((i) => (i.execution?.status ?? i.status) === "failed").length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pb-28 sm:p-6">
      <Link href={`/properties/${propertyId}`} className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold">
        <Icon name="ChevronRight" size={16} /> חזרה לנכס
      </Link>

      {/* HEADER */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border">
        <div className="flex flex-col sm:flex-row">
          {snapshot.propertyImageUrl && (
            <div className="relative h-44 w-full shrink-0 sm:h-auto sm:w-64"><Image src={snapshot.propertyImageUrl} alt="" fill className="object-cover" sizes="256px" /></div>
          )}
          <div className="flex flex-1 flex-col gap-2 p-5">
            <p className="text-brand text-xs font-extrabold">ZONO הכינה את תוכנית השיווק לשבוע</p>
            <h1 className="text-ink text-2xl font-black">{snapshot.propertyTitle ?? "נכס"}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-surface text-ink rounded-full px-3 py-1 text-xs font-bold">{snapshot.stateLabel}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "failed" ? "bg-danger-soft text-danger" : activated ? "bg-success-soft text-success" : "bg-brand-soft text-brand"}`}>{PLAN_STATUS_LABEL[status]}</span>
              {failedCount > 0 && <span className="bg-danger-soft text-danger rounded-full px-3 py-1 text-xs font-bold">{failedCount} דורשות טיפול</span>}
            </div>
          </div>
        </div>
        {/* SUMMARY */}
        <div className="border-line grid grid-cols-2 gap-px border-t sm:grid-cols-5">
          <Metric n={summary.publications} label="פרסומים" />
          <Metric n={summary.groups} label="קבוצות" />
          <Metric n={summary.buyers} label="לקוחות מתאימים" />
          <Metric n={summary.followups} label="פעולות המשך" />
          <Metric n={summary.creatives} label="קריאייטיבים" />
        </div>
      </div>

      {err && <div className="bg-danger-soft text-danger rounded-2xl px-4 py-3 text-sm font-bold">{err}</div>}

      {/* TIMELINE */}
      <div className="flex flex-col gap-3">
        <h2 className="text-ink text-lg font-black">השבוע</h2>
        {items.length === 0 && <div className="bg-card border-line rounded-[20px] border p-6 text-center"><div className="text-3xl">✓</div><p className="text-ink mt-2 font-bold">אין פעולות שיווק פתוחות לשבוע.</p></div>}
        {items.map((it) => (
          <ItemCard key={it.itemId} it={it} planId={planId} propertyId={propertyId} editable={editable} activated={activated}
            groups={groups} creatives={creatives} identity={identity} busy={busy || pending}
            onEdit={edit} onRetry={doRetry} />
        ))}
      </div>

      {/* APPROVE FOOTER (sticky) */}
      {status === "draft" && (
        <div className="border-line bg-card/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-3 sm:px-6">
            <button onClick={doCancel} disabled={busy} className="text-muted hover:text-danger text-sm font-bold disabled:opacity-50">ביטול התוכנית</button>
            <button onClick={openConfirm} disabled={busy} className="bg-brand rounded-xl px-6 py-3 text-sm font-extrabold text-white disabled:opacity-50">{busy ? "בודק…" : "אשר והפעל תוכנית"}</button>
          </div>
        </div>
      )}
      {(status === "partially_completed" || status === "failed") && (
        <div className="border-line bg-card/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-3 sm:px-6">
            <p className="text-muted text-sm font-bold">{failedCount} פעולות דורשות טיפול</p>
            <button onClick={doRetry} disabled={busy} className="bg-brand rounded-xl px-6 py-3 text-sm font-extrabold text-white disabled:opacity-50">{busy ? "מנסה…" : "נסה שוב את מה שנכשל"}</button>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirm && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setConfirm(null)}>
          <div className="bg-card w-full max-w-lg rounded-t-[24px] p-6 sm:rounded-[24px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-ink text-lg font-black">אישור והפעלת התוכנית</h3>
            <p className="text-muted mt-2 text-sm">לאחר האישור ZONO תתזמן את הפעולות שבתוכנית. שום פרסום או הודעה מעבר למה שמופיע כאן לא יישלח.</p>
            {confirm.notices.length > 0 && (
              <div className="bg-warning-soft mt-4 rounded-2xl p-3">
                <p className="text-warning text-xs font-extrabold">התאמות אוטומטיות</p>
                <ul className="mt-1 flex flex-col gap-1">{confirm.notices.map((n, i) => <li key={i} className="text-ink text-xs">• {n}</li>)}</ul>
              </div>
            )}
            {confirm.blockers.length > 0 && (
              <div className="bg-danger-soft mt-3 rounded-2xl p-3">
                <p className="text-danger text-xs font-extrabold">חסמים שיש לטפל בהם לפני האישור</p>
                <ul className="mt-1 flex flex-col gap-1">{confirm.blockers.map((b, i) => <li key={i} className="text-ink text-xs">• {b}</li>)}</ul>
              </div>
            )}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button onClick={() => setConfirm(null)} className="text-muted text-sm font-bold">חזרה</button>
              <button onClick={doApprove} disabled={busy || !confirm.canApprove} className="bg-brand rounded-xl px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-40">{busy ? "מפעיל…" : "אשר והפעל"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ n, label }: { n: number; label: string }) {
  return <div className="bg-card flex flex-col items-center justify-center px-3 py-4"><span className="text-ink text-2xl font-black">{n}</span><span className="text-muted text-xs font-semibold">{label}</span></div>;
}

function ItemCard({ it, planId, propertyId, editable, activated, groups, creatives, identity, busy, onEdit, onRetry }: {
  it: PlanItem; planId: string; propertyId: string; editable: boolean; activated: boolean;
  groups: GroupOption[]; creatives: CreativeOption[]; identity: Identity; busy: boolean;
  onEdit: (fn: () => Promise<{ ok: boolean; error?: string }>) => void; onRetry: () => void;
}) {
  const [caption, setCaption] = useState(it.facebook?.caption ?? "");
  const [open, setOpen] = useState(false);
  const isFb = it.type === "facebook_publish" || it.type === "group_expansion";
  const execStatus = it.execution?.status ?? it.status;
  const selectedGroupIds = useMemo(() => new Set(it.facebook?.groupIds ?? []), [it.facebook?.groupIds]);

  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-brand text-xs font-bold">{it.when ?? "השבוע"}</span>
            <p className="text-ink text-base font-extrabold">{it.title}</p>
            <StatusChip status={execStatus} />
          </div>
          <p className="text-muted mt-1 text-sm">{it.why}</p>
          <p className="text-muted mt-0.5 text-xs">{it.who}</p>
        </div>
        {editable && it.type !== "creative_refresh" && (
          <button onClick={() => onEdit(() => updatePlanDraftAction(planId, { kind: "removeItem", itemId: it.itemId }))} disabled={busy} className="text-muted hover:text-danger text-xs font-bold disabled:opacity-50">הסרה</button>
        )}
      </div>

      {/* FACEBOOK item */}
      {isFb && it.facebook && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FacebookPreview identity={identity} text={editable ? caption : it.facebook.caption} imageUrls={(it.facebook.mediaList && it.facebook.mediaList.length > 0) ? it.facebook.mediaList.map((m) => m.url) : (it.facebook.media?.url ? [it.facebook.media.url] : [])} />
          <div className="flex flex-col gap-3">
            {editable ? (
              <>
                <label className="text-ink text-xs font-bold">טקסט הפוסט
                  <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} className="border-line bg-surface text-ink mt-1 w-full rounded-xl border p-3 text-sm" />
                  <button onClick={() => onEdit(() => updatePlanDraftAction(planId, { kind: "caption", itemId: it.itemId, caption }))} disabled={busy || caption === it.facebook!.caption} className="bg-brand-soft text-brand mt-1 rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-40">שמירת הטקסט</button>
                </label>
                <div>
                  <p className="text-ink text-xs font-bold">קבוצות ({selectedGroupIds.size})</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {groups.slice(0, 18).map((g) => {
                      const on = selectedGroupIds.has(g.id);
                      const next = on ? it.facebook!.groupIds.filter((x) => x !== g.id) : [...it.facebook!.groupIds, g.id];
                      return <button key={g.id} onClick={() => onEdit(() => updatePlanDraftAction(planId, { kind: "groups", itemId: it.itemId, groupIds: next }))} disabled={busy}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${on ? "bg-brand text-white" : "bg-surface text-muted"}`}>{g.name}</button>;
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="date" defaultValue={it.facebook.startDate} onChange={(e) => onEdit(() => updatePlanDraftAction(planId, { kind: "schedule", itemId: it.itemId, startDate: e.target.value }))} className="border-line bg-surface text-ink rounded-xl border px-3 py-1.5 text-sm" />
                  <select defaultValue={it.facebook.frequency} onChange={(e) => onEdit(() => updatePlanDraftAction(planId, { kind: "schedule", itemId: it.itemId, frequency: e.target.value }))} className="border-line bg-surface text-ink rounded-xl border px-3 py-1.5 text-sm">
                    {FREQS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <Link href={`/creative-studio/property/${propertyId}?source=facebook_campaign&returnTo=${encodeURIComponent(`/distribution/marketing-plan/${propertyId}`)}`} className="text-brand text-xs font-bold hover:underline">צור קריאייטיב חדש ←</Link>
                  {creatives.length > 0 && (
                    <button onClick={() => setOpen((v) => !v)} className="text-muted mr-3 text-xs font-bold">בחר קריאייטיב קיים</button>
                  )}
                  {open && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {creatives.map((c) => (
                        <button key={c.id} onClick={() => onEdit(() => updatePlanDraftAction(planId, { kind: "selectCreative", itemId: it.itemId, creativeOutputId: c.id }))} disabled={busy}
                          className={`border-line rounded-xl border px-2 py-1 text-xs font-bold ${it.facebook!.creativeOutputId === c.id ? "bg-brand text-white" : "bg-surface text-muted"}`}>{c.label}{c.approved ? " ✓" : ""}</button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-ink font-bold">קבוצות: <span className="text-muted font-normal">{it.facebook.groupNames.join(" · ") || "—"}</span></p>
                <p className="text-ink font-bold">מועד: <span className="text-muted font-normal">{dateHe(it.facebook.startDate)}</span></p>
                {it.execution?.postsCreated != null && <p className="text-success font-bold">{it.execution.postsCreated} פוסטים תוזמנו</p>}
                {it.execution?.error && <p className="text-danger text-xs">{it.execution.error}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BUYER item */}
      {it.type === "buyer_bundle" && it.buyer && (
        <div className="bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
          <div>
            <p className="text-ink text-2xl font-black">{it.buyer.estimatedRecipients}</p>
            <p className="text-muted text-xs font-semibold">לקוחות מתאימים · {it.buyer.channelSummary}</p>
          </div>
          {activated && it.execution?.recipientsSent != null && <span className="bg-success-soft text-success rounded-full px-3 py-1 text-xs font-bold">{it.execution.recipientsSent} נשלחו</span>}
          {activated && it.execution?.error && <span className="text-danger text-xs">{it.execution.error}</span>}
        </div>
      )}

      {/* FOLLOW-UP item */}
      {it.type === "interest_followup" && it.followup && (
        <div className="bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
          <div><p className="text-ink text-2xl font-black">{it.followup.count}</p><p className="text-muted text-xs font-semibold">מתעניינים שמחכים להמשך טיפול</p></div>
          {activated && it.execution?.taskId && <span className="bg-success-soft text-success rounded-full px-3 py-1 text-xs font-bold">משימה נוצרה</span>}
        </div>
      )}

      {/* CREATIVE item */}
      {it.type === "creative_refresh" && (
        <div className="bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
          <p className="text-muted text-sm">{it.creative?.publishReady === false ? "הקריאייטיב אינו מוכן לפרסום." : "מומלץ לרענן את הקריאייטיב."}</p>
          <Link href={`/creative-studio/property/${propertyId}?source=facebook_campaign&returnTo=${encodeURIComponent(`/distribution/marketing-plan/${propertyId}`)}`} className="bg-brand rounded-xl px-4 py-2 text-xs font-extrabold text-white">פתיחת Creative Studio</Link>
        </div>
      )}

      {/* per-item retry */}
      {activated && execStatus === "failed" && (
        <button onClick={onRetry} disabled={busy} className="border-line text-ink self-start rounded-xl border px-4 py-2 text-xs font-bold disabled:opacity-50">נסה שוב</button>
      )}
    </div>
  );
}
