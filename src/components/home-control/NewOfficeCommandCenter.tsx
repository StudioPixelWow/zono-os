"use client";
// ============================================================================
// ZONO — New-Office Command Center (P9.0B). The first-login WOW surface for a
// freshly activated office. Everything here is REAL: office identity, owner,
// city/locality, canonical activation journey (derived from live DB state),
// capability discovery (real routes + honest availability), and a city command
// center with honest discovery states (never fabricated market KPIs, never a
// blank/fake map). STRUCTURE = ZONO; IDENTITY = the office brand via scoped
// --office-* vars (yellow/black for Landsman), WCAG-safe. RTL throughout.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { CAPABILITIES, CAPABILITY_STATE_LABEL, type CapabilityState } from "@/lib/activation/capabilities";
import type { ActivationState, OfficeIdentity, OfficeTrial, CityDiscovery } from "@/lib/activation/activation";
import type { ZoneSnapshot } from "@/lib/activation/zone-snapshot";

export interface NewOfficeCommandCenterProps {
  identity: OfficeIdentity;
  activation: ActivationState;
  trial: OfficeTrial | null;
  /** P9.0D — real city-discovery status (honest counts; never fabricated). */
  discovery?: CityDiscovery;
  /** WOW zone intelligence — real brokers/offices, no-broker samples, derived insights. */
  zone?: ZoneSnapshot;
  /** Always-present --office-* CSS vars (ZONO purple defaults, office brand overrides). */
  themeVars: Record<string, string>;
  hasBrand: boolean;
}

const ILS = new Intl.NumberFormat("he-IL");
const priceShort = (p: number | null): string | null => {
  if (p == null || p <= 0) return null;
  if (p >= 1_000_000) return `₪${(p / 1_000_000).toFixed(p >= 10_000_000 ? 0 : 1)}M`;
  if (p >= 1000) return `₪${Math.round(p / 1000)}K`;
  return `₪${ILS.format(p)}`;
};

const STATE_BADGE: Record<CapabilityState, string> = {
  ready: "bg-[var(--office-badge)] text-[var(--office-badge-ink)]",
  connect: "bg-amber-50 text-amber-700",
  after_data: "bg-slate-100 text-slate-500",
  soon: "bg-slate-100 text-slate-400",
};

/** Reveal-on-mount wrapper — restrained premium motion (Phase 12). */
function Reveal({ i = 0, children, className }: { i?: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("zono-reveal", className)} style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
      {children}
    </div>
  );
}

export function NewOfficeCommandCenter({ identity, activation, trial, discovery, zone, themeVars, hasBrand }: NewOfficeCommandCenterProps) {
  const cityLine = useMemo(() => {
    const bits = [identity.city].filter(Boolean) as string[];
    if (identity.subdistrict && identity.subdistrict !== identity.city) bits.push(`נפת ${identity.subdistrict}`);
    return bits.join(" · ");
  }, [identity.city, identity.subdistrict]);

  const doneKeys = new Set(activation.milestones.filter((m) => m.done).map((m) => m.milestone.key));

  return (
    <div dir="rtl" data-office-brand={hasBrand ? "true" : undefined} style={themeVars as React.CSSProperties}
      className="mx-auto max-w-[1180px] px-4 pb-16 pt-4 sm:px-6">
      <style>{`
        @keyframes zonoReveal { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .zono-reveal { animation: zonoReveal .5s cubic-bezier(.22,.61,.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .zono-reveal { animation: none; } }
      `}</style>

      {/* ── ZONE SCAN → REVEAL (first-run WOW; plays once, real numbers only) ── */}
      <ZoneScanReveal
        orgId={identity.orgId}
        city={identity.city}
        insights={zone?.insights ?? []}
        stats={{
          discoveredListings: discovery?.discoveredListings ?? 0,
          noBrokerCount: discovery?.noBrokerCount ?? 0,
          neighborhoods: discovery?.neighborhoods ?? 0,
          mapPoints: discovery?.mapPoints ?? 0,
          brokersTotal: zone?.census?.brokersTotal ?? 0,
          verifiedOffices: zone?.census?.verifiedOffices ?? 0,
          scanRunning: discovery?.scanRunning ?? false,
        }}
      />

      {/* ── FIRST LOGIN HERO ─────────────────────────────────────────────── */}
      <Reveal i={0}>
        <section
          className="relative overflow-hidden rounded-[28px] px-6 py-7 text-white shadow-[0_20px_48px_rgba(76,29,149,0.22)] sm:px-9 sm:py-9"
          style={{ background: "linear-gradient(140deg,#140f2b 0%,#241653 55%,#3a2470 100%)" }}
        >
          {/* office-accent top hairline */}
          <div className="absolute inset-x-0 top-0 h-1" style={{ background: "var(--office-accent)" }} />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {identity.officeLogoUrl ? (
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/95 p-1.5 shadow-lg">
                  <Image src={identity.officeLogoUrl} alt={identity.officeName} width={56} height={56} className="h-full w-full rounded-xl object-contain" unoptimized />
                </span>
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black"
                  style={{ background: "var(--office-accent)", color: "var(--office-accent-ink)" }}>
                  {identity.officeName.trim().charAt(0) || "ז"}
                </span>
              )}
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-white/60">מערכת ההפעלה שלך הופעלה</p>
                <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">
                  {identity.ownerFirstName}, ברוך הבא לזון שלך.
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-white/75">
                  זונו כבר מכירה את הזירה שלך. עכשיו בוא נהפוך אותה למנוע העבודה של המשרד.
                </p>
              </div>
            </div>

            {/* activation ring */}
            <div className="flex items-center gap-4 sm:flex-col sm:items-end">
              <div className="relative h-[92px] w-[92px] shrink-0"
                style={{ background: `conic-gradient(var(--office-accent) ${activation.percent * 3.6}deg, rgba(255,255,255,0.16) 0deg)`, borderRadius: "9999px" }}>
                <div className="absolute inset-[7px] flex flex-col items-center justify-center rounded-full bg-[#1a1140]">
                  <span className="text-xl font-extrabold">{activation.percent}%</span>
                  <span className="text-[10px] text-white/60">הפעלה</span>
                </div>
              </div>
            </div>
          </div>

          {/* identity chips */}
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-semibold ring-1 ring-white/15">
              {identity.ownerAvatarUrl ? (
                <Image src={identity.ownerAvatarUrl} alt={identity.ownerName} width={22} height={22} className="h-[22px] w-[22px] rounded-full object-cover" unoptimized />
              ) : <Icon name="UserRound" className="h-4 w-4 text-white/70" />}
              {identity.ownerName || "בעל המשרד"}
            </span>
            {cityLine && (
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-semibold ring-1 ring-white/15">
                <Icon name="MapPin" className="h-4 w-4 text-white/70" />
                {cityLine}{identity.localityCode ? ` · ${identity.localityCode}` : ""}
              </span>
            )}
            {trial?.endsAt && (
              <span className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold"
                style={{ background: "var(--office-accent)", color: "var(--office-accent-ink)" }}>
                <Icon name="Sparkles" className="h-4 w-4" />
                {trial.daysLeft != null ? `${trial.daysLeft} ימי ניסיון` : "תקופת ניסיון"}
              </span>
            )}
          </div>
        </section>
      </Reveal>

      {/* ── MORNING BRIEF (seed mode) ────────────────────────────────────── */}
      <Reveal i={1} className="mt-4">
        <section className="rounded-3xl border border-line bg-card px-6 py-5 shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--office-badge)] text-[var(--office-badge-ink)]">
              <Icon name="Sunrise" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-ink">בוקר טוב {identity.ownerFirstName} — הנה הזון שלך להיום</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                כאן יופיע מדי יום מרכז הפיקוד שלך: מעקבים, משימות ופגישות, לידים שדורשים מענה, פעילות נכסים ועסקאות, והמלצות חכמות של ZONO — ברגע שהמשרד יתחיל לעבוד. נתחיל עכשיו בהפעלה.
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── OFFICE ACTIVATION JOURNEY ────────────────────────────────────── */}
      <Reveal i={2} className="mt-4">
        <section className="rounded-3xl border border-line bg-card p-6 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">בוא נהפוך את {identity.officeName} למשרד הכי חזק בזון שלו</h2>
              <p className="mt-0.5 text-sm text-muted">{activation.completedCount} מתוך {activation.total} שלבי הפעלה הושלמו</p>
            </div>
            <span className="rounded-full bg-[var(--office-badge)] px-3 py-1 text-sm font-bold text-[var(--office-badge-ink)]">{activation.percent}%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full transition-all" style={{ width: `${activation.percent}%`, background: "var(--office-accent)" }} />
          </div>

          <ol className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {activation.milestones.map((m) => (
              <li key={m.milestone.key}
                className={cn("flex items-center gap-3 rounded-2xl border p-3", m.done ? "border-emerald-100 bg-emerald-50/50" : "border-line bg-surface-soft")}>
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  m.done ? "bg-emerald-500 text-white" : "bg-white text-[var(--office-accent-strong)] ring-1 ring-line")}>
                  <Icon name={m.done ? "Check" : "Circle"} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{m.milestone.label}</span>
                  <span className="block truncate text-xs text-muted">{m.milestone.description}</span>
                </span>
                {!m.done && !m.milestone.auto && m.milestone.cta && (
                  <Link href={m.milestone.href}
                    className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold"
                    style={{ background: "var(--office-accent)", color: "var(--office-accent-ink)" }}>
                    {m.milestone.cta}
                  </Link>
                )}
                {m.done && <span className="shrink-0 text-xs font-semibold text-emerald-600">הושלם</span>}
              </li>
            ))}
          </ol>
        </section>
      </Reveal>

      {/* ── CAPABILITY DISCOVERY ─────────────────────────────────────────── */}
      <Reveal i={3} className="mt-4">
        <section className="rounded-3xl border border-line bg-card p-6 shadow-card">
          <h2 className="text-lg font-bold text-ink">מה ZONO כבר הכינה עבורך</h2>
          <p className="mt-0.5 text-sm text-muted">כל הכלים שמחכים לך במשרד — לחץ כדי להתחיל</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => {
              const isDone = c.related ? doneKeys.has(c.related) : false;
              return (
                <Link key={c.key} href={c.href}
                  className="group flex flex-col rounded-2xl border border-line bg-surface-soft p-4 transition hover:border-[var(--office-ring)] hover:shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--office-badge)] text-[var(--office-badge-ink)]">
                      <Icon name={c.icon} className="h-5 w-5" />
                    </span>
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", isDone ? "bg-emerald-100 text-emerald-700" : STATE_BADGE[c.state])}>
                      {isDone ? "פעיל ✓" : CAPABILITY_STATE_LABEL[c.state]}
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-ink">{c.label}</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{c.value}</p>
                  <span className="mt-3 flex items-center gap-1 text-xs font-semibold text-[var(--office-accent-strong)]">
                    התחל <Icon name="ArrowLeft" className="h-3.5 w-3.5 transition group-hover:-translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </Reveal>

      {/* ── CITY COMMAND CENTER — "הזון שלי" ─────────────────────────────── */}
      <Reveal i={4} className="mt-4">
        <section className="rounded-3xl border border-line bg-card p-6 shadow-card">
          <div className="flex items-center gap-2">
            <Icon name="Map" className="h-5 w-5 text-[var(--office-accent-strong)]" />
            <h2 className="text-lg font-bold text-ink">הזון שלי{identity.city ? ` — ${identity.city}` : ""}</h2>
          </div>
          <p className="mt-0.5 text-sm text-muted">מה ZONO כבר יודעת על הזירה שלך — והצעדים שיהפכו אותה למנוע עבודה</p>

          {/* real known facts */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-surface-soft p-4">
              <p className="text-xs text-muted">העיר שלך</p>
              <p className="mt-1 text-lg font-bold text-ink">{identity.city ?? "—"}</p>
              {identity.localityCode && <p className="text-xs text-muted">קוד יישוב {identity.localityCode}</p>}
            </div>
            <div className="rounded-2xl border border-line bg-surface-soft p-4">
              <p className="text-xs text-muted">נפה</p>
              <p className="mt-1 text-lg font-bold text-ink">{identity.subdistrict ?? "—"}</p>
              <p className="text-xs text-muted">אזור פעילות מזוהה</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface-soft p-4">
              <p className="text-xs text-muted">כיסוי פעיל</p>
              <p className="mt-1 text-lg font-bold text-ink">{doneKeys.has("operating_area") ? identity.city : "טרם הוגדר"}</p>
              <Link href="/settings/operating-areas" className="text-xs font-semibold text-[var(--office-accent-strong)]">נהל אזורי פעילות</Link>
            </div>
          </div>

          {/* ZONO AI — real, evidence-based insights derived from the counts above. */}
          {zone && zone.insights.length > 0 && (
            <div className="mt-3 rounded-2xl border border-[var(--office-ring)] bg-[var(--office-badge)]/30 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--office-accent)] text-[var(--office-accent-ink)]">
                  <Icon name="Sparkles" className="h-4 w-4" />
                </span>
                <p className="text-sm font-bold text-ink">ZONO AI כבר למדה את הזון שלך</p>
              </div>
              <ul className="mt-2.5 grid gap-2">
                {zone.insights.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-ink">
                    <Icon name="Check" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--office-accent-strong)]" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Brokers / offices ZONO already knows in the city (shared market data). */}
          {zone?.census && (
            <div className="mt-3 rounded-2xl border border-line bg-surface-soft p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon name="Users" className="h-4 w-4 text-[var(--office-accent-strong)]" />
                  <p className="text-sm font-bold text-ink">מי מוכר בזון שלך</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-muted ring-1 ring-line">{zone.census.knowledgeStateLabel}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-white p-3 text-center ring-1 ring-line">
                  <p className="text-xl font-extrabold text-ink">{zone.census.brokersTotal}</p>
                  <p className="text-[11px] text-muted">מתווכים פעילים</p>
                </div>
                <div className="rounded-xl bg-white p-3 text-center ring-1 ring-line">
                  <p className="text-xl font-extrabold text-ink">{zone.census.verifiedOffices}</p>
                  <p className="text-[11px] text-muted">משרדים מזוהים</p>
                </div>
                <div className="rounded-xl bg-white p-3 text-center ring-1 ring-line">
                  <p className="text-xl font-extrabold text-ink">{zone.census.listingsTotal}</p>
                  <p className="text-[11px] text-muted">מודעות בעיר</p>
                </div>
              </div>
              {zone.census.topOffices.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {zone.census.topOffices.map((o, i) => (
                    <span key={i} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-line">
                      {o.name}{o.brokerCount > 0 ? ` · ${o.brokerCount}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* "Opportunities we found" — REAL no-broker listings (a core WOW). Details
              only (price/rooms/area/neighborhood) here; full contact is in /external-listings. */}
          {zone && zone.privateOwners.length > 0 && (
            <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon name="Sparkles" className="h-4 w-4 text-emerald-600" />
                  <p className="text-sm font-bold text-ink">הזדמנויות שמצאנו — נכסים ללא מתווך</p>
                </div>
                <Link href="/external-listings" className="text-xs font-bold text-emerald-700">כל ההזדמנויות</Link>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {zone.privateOwners.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-white p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">
                        {p.propertyType || "נכס"}{p.rooms ? ` · ${p.rooms} חד׳` : ""}{p.sqm ? ` · ${p.sqm} מ״ר` : ""}
                      </p>
                      <p className="truncate text-xs text-muted">{p.neighborhood || identity.city || "האזור שלך"}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      {priceShort(p.price) && <p className="text-sm font-extrabold text-ink">{priceShort(p.price)}</p>}
                      <span className="text-[10px] font-bold text-emerald-700">ללא מתווך</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* P9.0D — real city-discovery status band (ZONO DISCOVERY, kept
              distinct from OFFICE DATA). All counts are real; 0 → honest scan state. */}
          {discovery && (
            <div className="mt-3 rounded-2xl border border-line bg-[var(--office-badge)]/40 p-4"
              style={{ background: "linear-gradient(140deg,#f6f4ff,#eef0ff)" }}>
              <div className="flex items-center gap-2">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[var(--office-accent-strong)] shadow-card",
                  (discovery.phase === "scanning" || discovery.phase === "not_started") && "zono-reveal")}>
                  <Icon name={discovery.phase === "ready" ? "Building2" : "Sparkles"} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  {discovery.phase === "ready" ? (
                    <>
                      <p className="text-sm font-bold text-ink">ZONO מצאה {discovery.discoveredListings} נכסים ב{identity.city ?? "אזור"} עבורך</p>
                      <p className="text-xs text-muted">
                        {discovery.noBrokerCount > 0 ? `${discovery.noBrokerCount} ללא תיווך · ` : ""}
                        {discovery.mapPoints > 0 ? `${discovery.mapPoints} על המפה · ` : ""}
                        אלה נכסים שאותרו ממקורות חיצוניים — לא הנכסים שלך.
                      </p>
                    </>
                  ) : discovery.phase === "scanning" ? (
                    <>
                      <p className="text-sm font-bold text-ink">ZONO כבר סורקת את {identity.city ?? "האזור"} שלך…</p>
                      <p className="text-xs text-muted">מאתרים נכסים חדשים, מזהים מודעות ללא תיווך ובונים את מפת האזור. התוצאות יופיעו כאן.</p>
                    </>
                  ) : discovery.phase === "no_results" ? (
                    <>
                      <p className="text-sm font-bold text-ink">סריקת {identity.city ?? "האזור"} הושלמה</p>
                      <p className="text-xs text-muted">אין כרגע מודעות חדשות ממקורות חיצוניים — נמשיך לנטר ולעדכן אותך אוטומטית.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-ink">ZONO מתחילה לעבוד על {identity.city ?? "האזור"} שלך</p>
                      <p className="text-xs text-muted">
                        {discovery.neighborhoods > 0 ? `${discovery.neighborhoods} שכונות זוהו · ` : ""}
                        הסריקה המקומית תרוץ אוטומטית ותתחיל למלא את הזירה בנתונים אמיתיים.
                      </p>
                    </>
                  )}
                </div>
                {discovery.phase === "ready" && (
                  <Link href="/external-listings" className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold"
                    style={{ background: "var(--office-accent)", color: "var(--office-accent-ink)" }}>
                    צפה בנכסים
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* honest map activate-state (no blank, no fake) */}
          <div className="mt-3 overflow-hidden rounded-2xl border border-line">
            <div className="relative flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center"
              style={{ background: "linear-gradient(140deg,#f6f4ff 0%,#eef0ff 100%)" }}>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[var(--office-accent-strong)] shadow-card">
                <Icon name="MapPin" className="h-7 w-7" />
              </span>
              <div>
                <p className="text-base font-bold text-ink">הוסף את הנכס הראשון ונתחיל למפות את הזירה</p>
                <p className="mt-1 text-sm text-muted">המפה החיה של {identity.city ?? "האזור"} תיפתח ברגע שיהיו נכסים או סריקת שוק פעילה — עם נתונים אמיתיים בלבד.</p>
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <Link href="/properties/new" className="rounded-xl px-4 py-2 text-sm font-bold" style={{ background: "var(--office-accent)", color: "var(--office-accent-ink)" }}>
                  הוסף נכס ראשון
                </Link>
                <Link href="/settings/operating-areas" className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
                  בחר שכונות לניטור
                </Link>
              </div>
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  );
}

// ============================================================================
// ZONE SCAN → REVEAL — the first-run "ZONO is building your zone" moment.
// Plays a short scan animation ONCE (localStorage-gated, respects reduced motion),
// then reveals the REAL zone numbers. The animated steps are action labels only —
// they never assert a number; the reveal shows the genuine counts (a metric with
// 0 is simply omitted), so nothing is fabricated. RTL, premium, on-brand.
// ============================================================================
const SCAN_STEPS: { icon: string; label: string }[] = [
  { icon: "Radar", label: "סורקים את הזון שלך" },
  { icon: "Map", label: "מזהים שכונות" },
  { icon: "Building2", label: "ממפים נכסים באזור" },
  { icon: "Sparkles", label: "מאתרים נכסים ללא מתווך" },
  { icon: "Users", label: "ממפים מתווכים פעילים באזור" },
  { icon: "TrendingUp", label: "מנתחים את השוק המקומי" },
  { icon: "Check", label: "בונים את תמונת המצב שלך" },
];

interface ZoneStats {
  discoveredListings: number; noBrokerCount: number; neighborhoods: number;
  mapPoints: number; brokersTotal: number; verifiedOffices: number; scanRunning: boolean;
}

function ZoneScanReveal({ orgId, city, insights, stats }: {
  orgId: string; city: string | null; insights: string[]; stats: ZoneStats;
}) {
  const [revealed, setRevealed] = useState(false);
  const [step, setStep] = useState(0);
  const storeKey = `zono_zone_revealed_v1_${orgId}`;

  useEffect(() => {
    let seen = false;
    try { seen = !!window.localStorage.getItem(storeKey); } catch { /* private mode */ }
    const reduce = typeof window !== "undefined" && !!window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduce) { setStep(SCAN_STEPS.length); setRevealed(true); return; }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1; setStep(i);
      if (i >= SCAN_STEPS.length) {
        window.clearInterval(id);
        window.setTimeout(() => {
          setRevealed(true);
          try { window.localStorage.setItem(storeKey, "1"); } catch { /* ignore */ }
        }, 480);
      }
    }, 560);
    return () => window.clearInterval(id);
  }, [storeKey]);

  const tiles = [
    { v: stats.discoveredListings, label: "נכסים באזור", icon: "Building2" },
    { v: stats.noBrokerCount, label: "ללא מתווך", icon: "Sparkles" },
    { v: stats.brokersTotal, label: "מתווכים פעילים", icon: "Users" },
    { v: stats.verifiedOffices, label: "משרדים מזוהים", icon: "Landmark" },
    { v: stats.neighborhoods, label: "שכונות שמופו", icon: "Map" },
    { v: stats.mapPoints, label: "על המפה", icon: "MapPin" },
  ].filter((t) => t.v > 0);

  return (
    <section dir="rtl"
      className="relative mb-4 overflow-hidden rounded-[28px] px-6 py-7 text-white shadow-[0_20px_48px_rgba(76,29,149,0.22)] sm:px-9 sm:py-9"
      style={{ background: "linear-gradient(140deg,#140f2b 0%,#241653 55%,#3a2470 100%)" }}>
      <style>{`
        @keyframes zsPulse { 0%,100%{transform:scale(1);opacity:.55} 50%{transform:scale(1.35);opacity:0} }
        @keyframes zsPop { from{opacity:0;transform:translateY(8px) scale(.96)} to{opacity:1;transform:none} }
        @keyframes zsCount { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        .zs-radar::before{content:"";position:absolute;inset:0;border-radius:9999px;background:var(--office-accent);animation:zsPulse 1.8s ease-out infinite}
        .zs-pop{animation:zsPop .5s cubic-bezier(.22,.61,.36,1) both}
        .zs-tile{animation:zsCount .5s ease both}
        @media (prefers-reduced-motion: reduce){.zs-radar::before{animation:none}.zs-pop,.zs-tile{animation:none}}
      `}</style>
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: "var(--office-accent)" }} />

      {!revealed ? (
        // ── SCANNING ──────────────────────────────────────────────────────
        <div>
          <div className="flex items-center gap-4">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center">
              <span className="zs-radar absolute inset-0 rounded-full opacity-40" />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
                <Icon name="Radar" className="h-7 w-7 text-white" />
              </span>
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-white/60">ZONO בונה את הזון שלך</p>
              <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">
                מכירים את {city ?? "האזור"} שלך…
              </h1>
            </div>
          </div>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {SCAN_STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li key={i}
                  className={cn("flex items-center gap-3 rounded-2xl px-3.5 py-2.5 ring-1 transition",
                    done ? "bg-white/10 ring-white/15" : active ? "bg-white/[.06] ring-white/10" : "opacity-40 ring-transparent")}>
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    done ? "bg-emerald-400 text-[#10231a]" : "bg-white/10 text-white/70")}>
                    <Icon name={done ? "Check" : s.icon} className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold text-white/90">{s.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        // ── REVEAL ────────────────────────────────────────────────────────
        <div className="zs-pop">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: "var(--office-accent)", color: "var(--office-accent-ink)" }}>
              <Icon name="Sparkles" className="h-7 w-7" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-white/60">הזון שלך מוכן</p>
              <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">
                {city ?? "האזור שלך"} — ZONO כבר עובדת בשבילך
              </h1>
            </div>
          </div>

          {tiles.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {tiles.map((t, i) => (
                <div key={t.label} className="zs-tile rounded-2xl bg-white/10 px-3 py-4 text-center ring-1 ring-white/15"
                  style={{ animationDelay: `${i * 70}ms` }}>
                  <p className="text-2xl font-extrabold leading-none">{ILS.format(t.v)}</p>
                  <p className="mt-1.5 text-[11px] font-semibold text-white/70">{t.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/75">
              {stats.scanRunning
                ? `הסריקה של ${city ?? "האזור"} רצה ברגע זה ברקע — הנתונים האמיתיים יופיעו כאן וברחבי המערכת אוטומטית.`
                : `מתחילים לבנות את מודיעין השוק של ${city ?? "האזור"} — נמשיך לנטר ולעדכן אותך אוטומטית.`}
            </p>
          )}

          {insights.length > 0 && (
            <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-white/85">
              <span className="mt-0.5 shrink-0" style={{ color: "var(--office-accent)" }}>
                <Icon name="Sparkles" className="h-4 w-4" />
              </span>
              <span>{insights[0]}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
