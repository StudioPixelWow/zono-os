"use client";
// ============================================================================
// ZONO — Claim My Listings · inbox (client) — P10A.
// Fast review of the caller's real claim candidates: each card leads with a
// confidence signal + the actual evidence ("why ZONO thinks this is yours"),
// then a single dominant action — "שלי" (claim) — plus reject / snooze. A weak
// (LOW / office-only / phone-contradiction) candidate must be explicitly
// confirmed before it can be claimed; the UI never hides that uncertainty.
// Uses the shared action-surface design system. RTL-first, accessible.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { StatusBadge, KpiCard, EmptyStateVisual } from "@/components/ui/action-surfaces";
import {
  fetchClaimCandidatesAction, claimListingAction, rejectListingAction, snoozeListingAction,
  type ClaimCandidateDTO,
} from "@/app/(app)/claim/actions";

const CONF_LABEL: Record<string, string> = { high: "התאמה גבוהה", medium: "התאמה בינונית", low: "לבדיקה" };
const CONF_BADGE: Record<string, string> = { high: "ready", medium: "partial", low: "warning" };

export function ClaimInbox() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ClaimCandidateDTO[]>([]);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchClaimCandidatesAction().then((r) => { if (alive) { setReady(r.ready); setRows(r.candidates); } });
    return () => { alive = false; };
  }, []);

  function refresh() {
    fetchClaimCandidatesAction().then((r) => { setReady(r.ready); setRows(r.candidates); });
    router.refresh();
  }

  function claim(row: ClaimCandidateDTO) {
    const confirmWeak = row.needsConfirmation;
    if (confirmWeak && !window.confirm(`הראיות לנכס זה חלשות (${CONF_LABEL[row.confidence]}). ${row.phoneNote}. לסמן בכל זאת כ"שלי"?`)) return;
    setBusyId(row.id);
    startTransition(async () => {
      const res = await claimListingAction(row.id, confirmWeak);
      setBusyId(null);
      setNote(res.ok ? `סומן כשלך ✓ ${res.mediaImported ? `(${res.mediaImported} תמונות יובאו)` : ""}` : `לא בוצע: ${res.reason}`);
      if (res.ok) refresh();
    });
  }
  function reject(row: ClaimCandidateDTO) {
    setBusyId(row.id);
    startTransition(async () => { await rejectListingAction(row.id); setBusyId(null); refresh(); });
  }
  function snooze(row: ClaimCandidateDTO) {
    setBusyId(row.id);
    startTransition(async () => { await snoozeListingAction(row.id, "tomorrow"); setBusyId(null); refresh(); });
  }

  if (ready === null) return <div className="text-muted p-8 text-center text-sm">טוען מועמדים…</div>;
  if (!ready) {
    return <EmptyStateVisual name="Search" title="עדיין אין זהות מקור מאומתת" hint="ברגע שנזהה את הזהות שלך במקורות החיצוניים, נאסוף כאן את הנכסים שכנראה שלך — לאישור בלחיצה." />;
  }

  const counts = { high: rows.filter((r) => r.confidence === "high").length, medium: rows.filter((r) => r.confidence === "medium").length, low: rows.filter((r) => r.confidence === "low").length };

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2.5">
        <KpiCard label="התאמה גבוהה" value={counts.high} icon="CheckCircle" accent="success" />
        <KpiCard label="התאמה בינונית" value={counts.medium} icon="Circle" accent="warn" />
        <KpiCard label="לבדיקה" value={counts.low} icon="Search" accent="neutral" />
      </div>

      {note && <div className="bg-brand-soft text-ink rounded-xl px-3 py-2 text-sm font-semibold">{note}</div>}

      {rows.length === 0 ? (
        <EmptyStateVisual name="CheckCircle" title="הכול טופל" hint="אין כרגע נכסים חדשים שממתינים לאישור. נעדכן ברגע שיזוהה נכס חדש שכנראה שלך." accent="success" />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <article key={row.id} className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-[var(--shadow-card)] sm:flex-row">
              <div className="bg-surface relative h-28 w-full overflow-hidden rounded-xl sm:w-40">
                {row.primaryImage
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={row.primaryImage} alt={row.title ?? "נכס"} className="h-full w-full object-cover" />
                  : <div className="text-muted grid h-full place-items-center"><Icon name="Image" size={26} /></div>}
                {row.imageCount > 1 && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{row.imageCount} תמונות</span>}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StatusBadge status={CONF_BADGE[row.confidence]} label={CONF_LABEL[row.confidence]} />
                  {row.source && <span className="text-muted text-[11px]">מקור: {row.source}</span>}
                  {row.alreadyPromoted && <span className="text-success text-[11px] font-bold">כבר קיים ב-CRM</span>}
                </div>
                <h3 className="text-ink mt-1 truncate text-[15px] font-black">{row.title ?? "מודעה חיצונית"}</h3>
                <p className="text-muted text-xs">
                  {[row.neighborhood, row.city].filter(Boolean).join(", ")}
                  {row.rooms ? ` · ${row.rooms} חד׳` : ""}{row.sqm ? ` · ${row.sqm} מ״ר` : ""}
                  {row.price ? ` · ${row.price.toLocaleString("he-IL")} ₪` : ""}
                </p>

                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {row.reasons.slice(0, 4).map((r, i) => (
                    <li key={i} className="bg-success-soft text-success inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold">
                      <Icon name="Check" size={11} /> {r}
                    </li>
                  ))}
                  {row.cautions.map((c, i) => (
                    <li key={`c${i}`} className="bg-surface text-muted inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold">
                      <Icon name="AlertTriangle" size={11} /> {c}
                    </li>
                  ))}
                </ul>

                <div className="border-line mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                  <button
                    type="button" disabled={pending && busyId === row.id} onClick={() => claim(row)}
                    className="bg-[var(--brand,#6d28d9)] inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-black text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    <Icon name="Check" size={14} strokeWidth={2.4} /> {row.needsConfirmation ? "שלי (דורש אישור)" : "שלי"}
                  </button>
                  <button type="button" disabled={pending && busyId === row.id} onClick={() => snooze(row)} className="text-muted hover:text-ink bg-surface inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-50">
                    <Icon name="Clock" size={12} /> דחה למחר
                  </button>
                  <button type="button" disabled={pending && busyId === row.id} onClick={() => reject(row)} className="text-danger bg-danger-soft inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold hover:opacity-80 disabled:opacity-50">
                    <Icon name="X" size={12} /> לא שלי
                  </button>
                  {row.listingUrl && <a href={row.listingUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-ink inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold"><Icon name="ExternalLink" size={12} /> למודעה</a>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
