"use client";
// ============================================================================
// 📣 ZONO — Daily FB Groups Publishing — modal (RTL, premium). PHASE 49.0.
// The daily checklist popup: today's due Facebook-group posts grouped by property.
// The broker copies the text, opens the group, publishes BY HAND on Facebook, then
// marks published / skips / reschedules here. NOTHING publishes automatically — the
// component never contacts Facebook; it only reads the plan and records outcomes.
// ============================================================================
import { useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { markPostPublishedAction } from "@/lib/distribution/manual-publish-actions";
import {
  getDailyGroupsPublishingPlanAction, rescheduleGroupPostAction, skipGroupPostAction,
} from "@/lib/daily-groups-publishing/actions";
import type { DailyGroupsPublishingPlan, PublishPostCard, PropertyPublishingGroup } from "@/lib/daily-groups-publishing/types";

function tomorrowAt(hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function DailyGroupsPublishingModal({ initial, onClose }: { initial: DailyGroupsPublishingPlan; onClose: () => void }) {
  const [plan, setPlan] = useState(initial);
  const [folder, setFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [publishFor, setPublishFor] = useState<string | null>(null);
  const [publishUrl, setPublishUrl] = useState("");

  const refresh = () =>
    start(async () => {
      const r = await getDailyGroupsPublishingPlanAction();
      if (r.error) setError(r.error);
      else if (r.plan) setPlan(r.plan);
    });

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r?.error) { setError(r.error); return; }
      const p = await getDailyGroupsPublishingPlanAction();
      if (p.plan) setPlan(p.plan);
    });
  };

  const copy = async (card: PublishPostCard) => {
    try { await navigator.clipboard.writeText(card.text); setCopiedId(card.postId); }
    catch { setError("העתקה נכשלה — העתק ידנית מהתצוגה"); }
  };

  const publish = (postId: string) => {
    const url = publishUrl.trim();
    run(() => markPostPublishedAction({ postId, externalPostUrl: url || undefined }));
    setPublishFor(null); setPublishUrl("");
  };

  // Folder filter applied across all properties.
  const properties = useMemo(() => {
    if (!folder) return plan.properties;
    return plan.properties
      .map((p) => ({ ...p, cards: p.cards.filter((c) => ((c.category && c.category.trim()) || "כללי") === folder) }))
      .filter((p) => p.cards.length > 0);
  }, [plan.properties, folder]);

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" dir="rtl" role="dialog" aria-modal="true">
      <div className="bg-card border-line flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[26px] border shadow-[var(--shadow-card)] sm:rounded-[26px]">
        {/* Header */}
        <div className="bg-brand-soft flex items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-brand text-xs font-bold">ZONO · פרסום מסייע · אין פרסום אוטומטי</p>
            <h2 className="text-ink mt-1 text-xl font-black">שולחן פרסום קבוצות פייסבוק — היום</h2>
            <p className="text-muted mt-1 text-[13px] leading-relaxed">{plan.note}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink shrink-0 rounded-full p-1" aria-label="סגור"><Icon name="X" size={20} /></button>
        </div>

        {/* Summary + folders */}
        <div className="border-line flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <Chip icon="Megaphone" label={`${plan.totalPosts} פוסטים`} tone="text-brand-strong" />
          <Chip icon="Home" label={`${plan.totalProperties} נכסים`} />
          {plan.overdueCount > 0 && <Chip icon="Clock" label={`${plan.overdueCount} באיחור`} tone="text-warning" />}
          <div className="flex-1" />
          {plan.folders.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => setFolder(null)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold transition", folder === null ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink")}>הכל</button>
              {plan.folders.map((f) => (
                <button key={f.name} onClick={() => setFolder(f.name)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold transition", folder === f.name ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink")}>{f.name} · {f.count}</button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="bg-danger-soft text-danger mx-5 mt-3 rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {properties.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <span className="bg-success-soft text-success grid h-14 w-14 place-items-center rounded-2xl"><Icon name="CheckCircle" size={26} /></span>
              <p className="text-ink text-lg font-extrabold">אין פרסומים ממתינים להיום ✓</p>
              <p className="text-muted max-w-sm text-sm">כשקמפיין קבוצות יתזמן פוסטים להיום, הם יופיעו כאן מקובצים לפי נכס.</p>
            </div>
          ) : (
            properties.map((prop) => <PropertyBlock key={prop.propertyId} prop={prop} onCopy={copy} copiedId={copiedId} pending={pending}
              publishFor={publishFor} setPublishFor={(id) => { setPublishFor(id); setPublishUrl(""); }}
              publishUrl={publishUrl} setPublishUrl={setPublishUrl} onPublish={publish}
              onSkip={(postId) => run(() => skipGroupPostAction({ postId }))}
              onReschedule={(postId) => run(() => rescheduleGroupPostAction({ postId, scheduledAt: tomorrowAt() }))} />)
          )}
        </div>

        {/* Footer */}
        <div className="border-line flex items-center justify-between gap-3 border-t px-5 py-3">
          <a href="/distribution/campaign-wizard" className="text-brand-strong text-xs font-bold hover:underline">אשף קמפיין קבוצות ↗</a>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={refresh} disabled={pending} leadingIcon={<Icon name="RefreshCw" size={14} />}>רענן</Button>
            <Button size="sm" onClick={onClose}>סיימתי להיום</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertyBlock({
  prop, onCopy, copiedId, pending, publishFor, setPublishFor, publishUrl, setPublishUrl, onPublish, onSkip, onReschedule,
}: {
  prop: PropertyPublishingGroup; onCopy: (c: PublishPostCard) => void; copiedId: string | null; pending: boolean;
  publishFor: string | null; setPublishFor: (id: string | null) => void; publishUrl: string; setPublishUrl: (v: string) => void;
  onPublish: (postId: string) => void; onSkip: (postId: string) => void; onReschedule: (postId: string) => void;
}) {
  return (
    <div className="bg-surface border-line rounded-[20px] border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {prop.imageUrl
            ? <span className="border-line h-11 w-11 shrink-0 rounded-xl border bg-cover bg-center" style={{ backgroundImage: `url(${prop.imageUrl})` }} aria-hidden />
            : <span className="bg-brand-soft text-brand grid h-11 w-11 shrink-0 place-items-center rounded-xl"><Icon name="Home" size={18} /></span>}
          <div className="min-w-0">
            <p className="text-ink truncate text-sm font-extrabold">{prop.title}</p>
            <p className="text-muted text-[11px]">{prop.city ?? "—"} · {prop.cards.length} קבוצות לפרסום{prop.overdueCount > 0 ? ` · ${prop.overdueCount} באיחור` : ""}</p>
          </div>
        </div>
      </div>

      {prop.overflow > 0 && (
        <p className="bg-warning-soft text-warning mb-3 rounded-xl px-3 py-2 text-[12px] font-semibold">
          מוצגות {prop.cards.length} מתוך {prop.totalGroups} קבוצות. עוד {prop.overflow} קבוצות ממתינות — השלם אותן במרכז ההפצה (אף קבוצה לא בוטלה).
        </p>
      )}

      <div className="flex flex-col gap-3">
        {prop.cards.map((card) => (
          <div key={card.postId} className="bg-card border-line rounded-2xl border p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-ink truncate text-sm font-bold">{card.groupName ?? "קבוצה"}</p>
                <p className="text-muted text-[11px]">
                  {card.membersCount > 0 ? `${card.membersCount.toLocaleString()} חברים` : "פייסבוק"}
                  {card.category ? ` · ${card.category}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {card.overdue && <span className="bg-warning-soft text-warning rounded-full px-2 py-0.5 text-[10px] font-bold">באיחור</span>}
                {card.requiresMembership && <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">דורש חברות</span>}
              </div>
            </div>

            <div className="bg-surface max-h-32 overflow-y-auto rounded-xl p-2.5">
              <p className="text-muted whitespace-pre-line text-[12.5px] leading-relaxed">{card.text}</p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => onCopy(card)} leadingIcon={<Icon name="Copy" size={13} />}>
                {copiedId === card.postId ? "הועתק ✓" : "העתק טקסט"}
              </Button>
              {card.groupUrl
                ? <a href={card.groupUrl} target="_blank" rel="noopener noreferrer" className="bg-surface text-ink hover:border-brand-light border-line inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[13px] font-bold transition">פתח קבוצה ↗</a>
                : <span className="text-muted text-[11px]">אין קישור לקבוצה</span>}
              {card.imageUrl && <a href={card.imageUrl} target="_blank" rel="noopener noreferrer" className="bg-surface text-ink hover:border-brand-light border-line inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[13px] font-bold transition">תמונה ↗</a>}
              <div className="flex-1" />
              <button className="text-success text-xs font-bold disabled:opacity-50" disabled={pending} onClick={() => setPublishFor(publishFor === card.postId ? null : card.postId)}>סמן כפורסם</button>
              <button className="text-warning text-xs font-bold disabled:opacity-50" disabled={pending} onClick={() => onReschedule(card.postId)}>דחה למחר</button>
              <button className="text-danger text-xs font-bold disabled:opacity-50" disabled={pending} onClick={() => onSkip(card.postId)}>דלג</button>
            </div>

            {publishFor === card.postId && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className="bg-surface border-line text-ink focus:border-brand-light h-8 min-w-[200px] flex-1 rounded-lg border px-2.5 text-[13px] outline-none" placeholder="הדבק קישור לפוסט בפייסבוק (אופציונלי)" value={publishUrl} onChange={(e) => setPublishUrl(e.target.value)} />
                <Button size="sm" disabled={pending} onClick={() => onPublish(card.postId)}>אישור פרסום ידני</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ icon, label, tone = "text-muted" }: { icon: string; label: string; tone?: string }) {
  return (
    <span className={cn("bg-surface inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold", tone)}>
      <Icon name={icon} size={13} />{label}
    </span>
  );
}
