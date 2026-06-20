"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { ListingHoverPreview } from "@/components/listings/ListingHoverPreview";
import { verifyBrokerAction } from "@/lib/broker/actions";
import type { BrokerDetail } from "@/lib/broker/service";

const TYPE_LABEL: Record<string, string> = { agency: "משרד תיווך", office: "משרד", independent_broker: "מתווך עצמאי", team: "צוות", unknown: "לא ידוע" };
const VERIFY: Record<string, { t: string; c: string }> = {
  human_verified: { t: "מאומת אנושית", c: "bg-success-soft text-success" },
  auto: { t: "אוטומטי", c: "bg-brand-soft text-brand-strong" },
  unverified: { t: "לא מאומת", c: "bg-surface text-muted" },
  rejected: { t: "נדחה", c: "bg-danger-soft text-danger" },
};

export function BrokerProfileView({ detail }: { detail: BrokerDetail }) {
  const router = useRouter();
  const p = detail.profile;
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const v = VERIFY[p.verification_status] ?? VERIFY.unverified;
  const hasEvidence = detail.sources.length > 0;

  const verify = () => { setError(null); start(async () => { const r = await verifyBrokerAction(p.id); if (r?.error) setError(r.error); else router.refresh(); }); };

  return (
    <div className="flex flex-col gap-5">
      <Link href="/broker-intelligence" className="text-muted hover:text-brand flex items-center gap-1 text-sm font-bold"><Icon name="ArrowLeft" size={15} /> חזרה למודיעין מתווכים</Link>

      <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="bg-brand-soft text-brand-strong rounded-lg px-2 py-0.5 text-xs font-bold">{TYPE_LABEL[p.broker_type] ?? p.broker_type}</span>
              <span className={cn("rounded-lg px-2 py-0.5 text-[11px] font-bold", v.c)}>{v.t}</span>
              <span className="text-muted text-[11px]">ביטחון {p.confidence_score}</span>
            </div>
            <h1 className="text-ink text-2xl font-black">{p.display_name}</h1>
            <p className="text-muted mt-1 text-sm">{[p.agency_name, p.primary_city].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          {p.verification_status !== "human_verified" && (
            <Button size="sm" onClick={verify} disabled={pending} leadingIcon={<Icon name="Shield" size={15} />} title={hasEvidence ? "" : "אימות ללא מקור-ראיה יקבל ביטחון נמוך יותר"}>אמת מתווך</Button>
          )}
        </div>
        {error && <p className="bg-danger-soft text-danger mt-3 rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="טלפון" value={p.phone ?? "—"} />
          <Field label="אימייל" value={p.email ?? "—"} />
          <Field label="אתר" value={p.website ?? "—"} />
          <Field label="רישיון" value={p.license_number ?? "—"} />
        </div>
        {p.ai_summary && <div className="bg-surface mt-3 rounded-xl p-3"><p className="text-ink text-xs font-bold">סיכום (מוכן ל-AI)</p><p className="text-muted mt-1 text-[11px]">{p.ai_summary}</p></div>}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="כינויים ומזהים" icon="Tag">
          {detail.aliases.length === 0 ? <p className="text-muted text-sm">אין כינויים</p> : (
            <ul className="flex flex-col gap-1 text-xs">{detail.aliases.map((a) => <li key={a.id} className="text-muted"><span className="text-ink font-semibold">{a.value}</span> · {a.alias_type}</li>)}</ul>
          )}
        </Section>
        <Section title="אזורי שירות" icon="MapPin">
          {detail.serviceAreas.length === 0 ? <p className="text-muted text-sm">לא הוגדרו אזורים</p> : (
            <div className="flex flex-wrap gap-1.5">{detail.serviceAreas.map((s) => <span key={s.id} className="bg-surface text-ink rounded-full px-2.5 py-1 text-[11px] font-bold">{s.city_name}</span>)}</div>
          )}
        </Section>
        <Section title="מקורות / ראיות" icon="Shield">
          {detail.sources.length === 0 ? <p className="text-muted text-sm">אין מקורות מתועדים — האימות יקבל ביטחון נמוך יותר.</p> : (
            <ul className="flex flex-col gap-1 text-xs">{detail.sources.map((s) => <li key={s.id} className="text-muted"><span className="text-ink font-semibold">{s.source_type}</span>{s.url ? ` · ${s.url}` : ""}</li>)}</ul>
          )}
        </Section>
        <Section title="מודעות חיצוניות מקושרות" icon="Building2">
          {detail.externalListings.length === 0 ? <p className="text-muted text-sm">אין מודעות מקושרות</p> : (
            <ul className="flex flex-col gap-1.5 text-sm">{detail.externalListings.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <ListingHoverPreview listingId={l.id} className="min-w-0 flex-1">
                  <Link href={`/external-listings/${l.id}`} className="text-ink hover:text-brand block truncate font-semibold">{l.title ?? "מודעה"}{l.city ? ` · ${l.city}` : ""}</Link>
                </ListingHoverPreview>
                <span className="text-muted text-[11px]">{l.price ? formatShekels(l.price) : "—"} · {l.confidence}%</span>
              </li>
            ))}</ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name={icon} size={16} /></span><h3 className="text-ink text-sm font-extrabold">{title}</h3></div>
      {children}
    </div>
  );
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="bg-surface rounded-xl p-2.5"><p className="text-muted text-[11px] font-bold">{label}</p><p className="text-ink truncate text-sm font-bold">{value}</p></div>;
}
