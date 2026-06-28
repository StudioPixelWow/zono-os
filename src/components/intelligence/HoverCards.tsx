// ============================================================================
// ZONO — Broker & Office hover cards (presentation only · RTL · server-safe).
// ----------------------------------------------------------------------------
// Wherever a broker / office appears, wrap its name in these to get a premium
// quick-profile on hover + click-through to the full Intelligence Profile. Pure
// CSS hover (no JS, no fetch) — the caller passes the summary values it ALREADY
// has from existing BIE data, so nothing is computed or queried here.
// ============================================================================
import Link from "next/link";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusTone, val, pct01 } from "./terminal";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted font-bold">{label}</span>
      <span className="text-ink tabular-nums font-black">{value}</span>
    </div>
  );
}

export interface BrokerHoverSummary {
  office?: string | null;
  statusLabel?: string | null;
  statusTone?: StatusTone;
  zoneDominance?: number | null;  // 0..100
  marketShare?: number | null;    // 0..1
  winningDna?: number | null;     // 0..100
}

export function BrokerHoverCard({ id, name, summary, className }: { id?: string | null; name: string; summary?: BrokerHoverSummary; className?: string }) {
  const href = id ? `/broker-intelligence/${encodeURIComponent(id)}` : "/broker-intelligence";
  return (
    <span className="group relative inline-block">
      <Link href={href} prefetch={false} className={cn("text-brand-strong hover:text-brand font-bold underline-offset-2 hover:underline", className)} title={`פרופיל מודיעין מתווך — ${name}`}>
        {name}
      </Link>
      {summary && (
        <span className="border-line bg-card pointer-events-none absolute right-0 top-full z-30 mt-1 hidden w-64 rounded-2xl border p-3 text-right shadow-[var(--shadow-lift)] group-hover:block" dir="rtl">
          <span className="mb-2 flex items-center justify-between gap-2">
            <span className="text-ink block truncate text-sm font-black">{name}</span>
            {summary.statusLabel && <StatusBadge label={summary.statusLabel} tone={summary.statusTone ?? "neutral"} />}
          </span>
          <span className="flex flex-col gap-1">
            {summary.office && <Row label="משרד" value={summary.office} />}
            <Row label="שליטה אזורית" value={val(summary.zoneDominance)} />
            <Row label="נתח שוק" value={pct01(summary.marketShare)} />
            <Row label="Winning DNA" value={val(summary.winningDna)} />
          </span>
        </span>
      )}
    </span>
  );
}

export interface OfficeHoverSummary {
  marketShare?: number | null;    // 0..1
  zoneDominance?: number | null;  // 0..100
  topBroker?: string | null;
  momentum?: number | null;       // 0..100
}

export function OfficeHoverCard({ id, name, summary, className }: { id?: string | null; name: string; summary?: OfficeHoverSummary; className?: string }) {
  const href = id ? `/office-intelligence/${encodeURIComponent(id)}` : "/office-intelligence";
  return (
    <span className="group relative inline-block">
      <Link href={href} prefetch={false} className={cn("text-brand-strong hover:text-brand font-bold underline-offset-2 hover:underline", className)} title={`פרופיל מודיעין משרד — ${name}`}>
        {name}
      </Link>
      {summary && (
        <span className="border-line bg-card pointer-events-none absolute right-0 top-full z-30 mt-1 hidden w-60 rounded-2xl border p-3 text-right shadow-[var(--shadow-lift)] group-hover:block" dir="rtl">
          <span className="text-ink mb-2 block truncate text-sm font-black">{name}</span>
          <span className="flex flex-col gap-1">
            <Row label="נתח שוק" value={pct01(summary.marketShare)} />
            <Row label="שליטה אזורית" value={val(summary.zoneDominance)} />
            {summary.topBroker && <Row label="מתווך מוביל" value={summary.topBroker} />}
            <Row label="מומנטום" value={val(summary.momentum)} />
          </span>
        </span>
      )}
    </span>
  );
}
