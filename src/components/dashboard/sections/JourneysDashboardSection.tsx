import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
// Batch 5.6H — the CANONICAL Journey Command provider. This section previously
// read the legacy journey-intelligence command center, which surfaced the
// forbidden schema-default columns (conversion_score / health_score /
// risk_score / velocity_state / next_best_action / journey_predictions) as if
// they were measurements. It now renders the SAME evidence-gated projection
// Executive OS shows: canonical KPIs + the canonical Broker Intelligence queue.
import { getCanonicalJourneyCommand } from "@/lib/journey-center/command";

/** Canonical Journey summary on the home dashboard (server component). */
export async function JourneysDashboardSection() {
  let j;
  try { j = await getCanonicalJourneyCommand(); }
  catch (e) { console.error("[journeys] dashboard failed:", e); return null; }
  // Provider failure or a genuinely journey-less org → no section. A failed
  // provider must not render zeros that read as "all healthy".
  if (j.status === "unavailable") return null;
  if (j.audit.canonicalRecords === 0 && j.audit.fallbackRecords === 0) return null;

  const dwell = j.dwell.avgDaysInStage == null
    ? "שהייה בשלב: אין ראיה מספקת"
    : `שהייה ממוצעת: ${j.dwell.avgDaysInStage} ימים (${j.dwell.evidenceStatus === "verified" ? "ראיה מאומתת" : "ראיה חלקית"})`;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Route" size={16} /></span>
          <h2 className="text-ink text-lg font-black">מסעות — מבט קנוני</h2>
        </div>
        <Link href="/journeys" className="text-brand-strong text-sm font-bold hover:underline">למרכז המסעות ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card label="מסעות פעילים" value={j.counts.active} tone="text-brand-strong" />
        <Card label="תקועים (ראיה מאומתת)" value={j.counts.stalled} tone="text-danger" />
        <Card label="חסומים" value={j.counts.blocked} tone="text-danger" />
        <Card label="מסעות קנוניים" value={j.audit.canonicalRecords} tone="text-success" />
        <Card label="המלצות ברף הראיות" value={j.counts.eligibleRecommendations} tone="text-warning" />
      </div>
      <p className="text-muted text-[12px] font-bold">{dwell} · ראיה קנונית בלבד — ללא מדדי סכימה מומצאים.</p>
      {j.highestPriorityBlocked ? (
        <Link href={j.highestPriorityBlocked.href} className="bg-danger-soft text-danger flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="AlertTriangle" size={15} />{j.highestPriorityBlocked.title} — {j.highestPriorityBlocked.why}
        </Link>
      ) : (
        <p className="text-muted text-[12px]">{j.headline}</p>
      )}
    </section>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-3 shadow-sm">
      <span className="text-muted text-[12px] font-bold">{label}</span>
      <span className={`text-xl font-black ${tone}`}>{value}</span>
    </div>
  );
}
