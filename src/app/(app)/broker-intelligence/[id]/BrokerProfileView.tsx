"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { SmartPropertyGrid } from "@/components/listings/SmartListings";
import { enrichBrokerAction, markBrokerCompetitorAction, uploadBrokerLogoAction, verifyBrokerAction } from "@/lib/broker/actions";
import type { BrokerDetail } from "@/lib/broker/service";
import { Metric, MetricGrid } from "@/components/intelligence/terminal";
import { WhyButton } from "@/components/explainability/WhyButton";
import { OfficeLink, NeighborhoodLink } from "@/components/intelligence/EntityLinks";

const SOCIALS: { key: keyof BrokerDetail["profile"]; label: string }[] = [
  { key: "website", label: "אתר" }, { key: "google_business_url", label: "Google" },
  { key: "facebook_url", label: "Facebook" }, { key: "instagram_url", label: "Instagram" }, { key: "linkedin_url", label: "LinkedIn" },
];

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
  const [msg, setMsg] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [pending, start] = useTransition();
  const v = VERIFY[p.verification_status] ?? VERIFY.unverified;
  const hasEvidence = detail.sources.length > 0;
  const socialLinks = SOCIALS.map((s) => ({ ...s, url: p[s.key] as string | null })).filter((s) => s.url);
  const candidateSources = detail.sources.filter((s) => s.source_type === "enrichment:candidate");
  // Recent listings grouped by lifecycle (existing status only — no recompute).
  const activeListings = detail.externalListings.filter((l) => (l.status ?? "active") === "active");
  const exitedListings = detail.externalListings.filter((l) => (l.status ?? "active") !== "active");

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => { setError(null); setMsg(null); start(async () => { const r = await fn(); if (r?.error) setError(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } }); };
  const verify = () => run(() => verifyBrokerAction(p.id));
  const enrich = () => run(() => enrichBrokerAction(p.id));
  const uploadLogo = () => { if (!logoUrl.trim()) return; run(() => uploadBrokerLogoAction(p.id, logoUrl.trim())); setLogoUrl(""); };
  const toggleCompetitor = () => run(() => markBrokerCompetitorAction(p.id, !detail.isCompetitor));

  return (
    <div className="flex flex-col gap-5">
      <Link href="/broker-intelligence" className="text-muted hover:text-brand flex items-center gap-1 text-sm font-bold"><Icon name="ArrowLeft" size={15} /> חזרה למודיעין מתווכים</Link>

      <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {p.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.logo_url} alt="" className="border-line h-14 w-14 rounded-xl border object-contain" />
            ) : (
              <span className="bg-brand-soft text-brand-strong grid h-14 w-14 place-items-center rounded-xl text-xl font-black">{p.display_name.trim().charAt(0) || "?"}</span>
            )}
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="bg-brand-soft text-brand-strong rounded-lg px-2 py-0.5 text-xs font-bold">{TYPE_LABEL[p.broker_type] ?? p.broker_type}</span>
                <span className={cn("rounded-lg px-2 py-0.5 text-[11px] font-bold", v.c)}>{v.t}</span>
                {detail.isCompetitor && <span className="bg-danger-soft text-danger rounded-lg px-2 py-0.5 text-[11px] font-bold">מתחרה</span>}
                <span className="text-muted text-[11px]">ביטחון {p.confidence_score}</span>
              </div>
              <h1 className="text-ink text-2xl font-black">{p.display_name}</h1>
              <p className="text-muted mt-1 text-sm">{[p.agency_name, p.primary_city].filter(Boolean).join(" · ") || "—"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={enrich} disabled={pending} leadingIcon={<Icon name="Search" size={15} />}>העשר מקורות</Button>
            <Button size="sm" variant={detail.isCompetitor ? "ghost" : "secondary"} onClick={toggleCompetitor} disabled={pending}>{detail.isCompetitor ? "בטל סימון מתחרה" : "סמן כמתחרה"}</Button>
            {p.verification_status !== "human_verified" && (
              <Button size="sm" onClick={verify} disabled={pending} leadingIcon={<Icon name="Shield" size={15} />} title={hasEvidence ? "" : "אימות ללא מקור-ראיה יקבל ביטחון נמוך יותר"}>אמת מתווך</Button>
            )}
          </div>
        </div>
        {error && <p className="bg-danger-soft text-danger mt-3 rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
        {msg && <p className="bg-success-soft text-success mt-3 rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="טלפון" value={p.phone ?? "—"} />
          <Field label="אימייל" value={p.email ?? "—"} />
          <Field label="אזור" value={p.region ?? "—"} />
          <Field label="רישיון" value={p.license_number ?? "—"} />
        </div>
        {socialLinks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {socialLinks.map((s) => <a key={s.key} href={s.url!} target="_blank" rel="noopener noreferrer" className="bg-surface text-brand-strong hover:bg-brand-soft rounded-full px-2.5 py-1 text-[11px] font-bold transition">{s.label} ↗</a>)}
          </div>
        )}
        {p.ai_summary && <div className="bg-surface mt-3 rounded-xl p-3"><p className="text-ink text-xs font-bold">סיכום (מוכן ל-AI)</p><p className="text-muted mt-1 text-[11px]">{p.ai_summary}</p></div>}
      </div>

      {/* Intelligence Summary — existing metrics only, explainable. */}
      <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]" dir="rtl">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-ink text-sm font-extrabold">תקציר מודיעין</h3>
          <WhyButton reasons={[`ביטחון נתונים ${p.confidence_score}`, `${detail.sources.length} מקורות ראיה`, `סטטוס אימות: ${v.t}`]} source="Broker Intelligence Engine" />
        </div>
        <MetricGrid>
          <Metric label="ביטחון נתונים" value={String(p.confidence_score)} accent />
          <Metric label="מודעות מקושרות" value={String(detail.externalListings.length)} />
          <Metric label="אזורי שירות" value={String(detail.serviceAreas.length)} />
          <Metric label="מקורות ראיה" value={String(detail.sources.length)} />
          <Metric label="סטטוס אימות" value={v.t} />
          <Metric label="סוג" value={TYPE_LABEL[p.broker_type] ?? p.broker_type} />
        </MetricGrid>
        {p.agency_name && <p className="text-muted mt-3 text-xs">משרד: <OfficeLink name={p.agency_name} /></p>}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="כינויים ומזהים" icon="Tag">
          {detail.aliases.length === 0 ? <p className="text-muted text-sm">אין כינויים</p> : (
            <ul className="flex flex-col gap-1 text-xs">{detail.aliases.map((a) => <li key={a.id} className="text-muted"><span className="text-ink font-semibold">{a.value}</span> · {a.alias_type}</li>)}</ul>
          )}
        </Section>
        <Section title="אזורי שירות" icon="MapPin">
          {detail.serviceAreas.length === 0 ? <p className="text-muted text-sm">לא הוגדרו אזורים</p> : (
            <div className="flex flex-wrap gap-1.5">{detail.serviceAreas.map((s) => <span key={s.id} className="bg-surface rounded-full px-2.5 py-1 text-[11px] font-bold"><NeighborhoodLink city={s.city_name} neighborhood={s.city_name} /></span>)}</div>
          )}
        </Section>
        <Section title="מקורות / ראיות" icon="Shield">
          {detail.sources.length === 0 ? <p className="text-muted text-sm">אין מקורות מתועדים — האימות יקבל ביטחון נמוך יותר.</p> : (
            <ul className="flex flex-col gap-1 text-xs">{detail.sources.map((s) => <li key={s.id} className="text-muted"><span className="text-ink font-semibold">{s.source_type}</span>{s.url ? ` · ${s.url}` : ""}</li>)}</ul>
          )}
        </Section>
        <Section title="מיתוג ולוגו" icon="Tag">
          <div className="flex flex-wrap gap-2">
            {detail.logoAssets.length === 0 ? <p className="text-muted text-sm">אין לוגואים שמורים. אפשר להעלות ידנית או לזהות אוטומטית (בקרוב).</p> : detail.logoAssets.map((a) => (
              a.original_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.id} src={a.original_url} alt="" title={`${a.source ?? ""} · ${a.status}`} className="border-line h-12 w-12 rounded-lg border object-contain" />
              ) : <span key={a.id} className="bg-surface text-muted grid h-12 w-12 place-items-center rounded-lg text-[10px]">{a.status}</span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input className="bg-surface border-line text-ink focus:border-brand-light h-9 min-w-[200px] flex-1 rounded-xl border px-3 text-sm outline-none" placeholder="כתובת URL של לוגו" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
            <Button size="sm" variant="secondary" onClick={uploadLogo} disabled={pending || !logoUrl.trim()}>העלה לוגו</Button>
          </div>
          {candidateSources.length > 0 && (
            <div className="mt-3">
              <p className="text-muted mb-1 text-[11px] font-bold">קישורי חיפוש ציבוריים לבדיקה (העשרה):</p>
              <ul className="flex flex-col gap-0.5 text-[11px]">{candidateSources.slice(0, 4).map((s) => <li key={s.id}><a href={s.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-brand-strong hover:underline">{s.url}</a></li>)}</ul>
            </div>
          )}
        </Section>
      </div>

      <div dir="rtl" className="flex flex-col gap-5">
        <h3 className="text-ink text-sm font-extrabold">מודעות אחרונות ({detail.externalListings.length})</h3>
        {detail.externalListings.length === 0 ? (
          <p className="text-muted bg-card border-line rounded-[22px] border p-5 text-sm">אין מודעות מקושרות</p>
        ) : (
          <>
            {activeListings.length > 0 && (
              <div>
                <p className="text-ink mb-2 text-xs font-extrabold">פעילות בשוק ({activeListings.length})</p>
                <SmartPropertyGrid listings={activeListings} matches={{}} />
              </div>
            )}
            {exitedListings.length > 0 && (
              <div>
                <p className="text-muted mb-2 text-xs font-extrabold">יצאו מהשוק / לא פעילות ({exitedListings.length})</p>
                <SmartPropertyGrid listings={exitedListings} matches={{}} />
              </div>
            )}
          </>
        )}
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
