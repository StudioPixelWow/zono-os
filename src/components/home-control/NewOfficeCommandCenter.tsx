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
import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { CAPABILITIES, CAPABILITY_STATE_LABEL, type CapabilityState } from "@/lib/activation/capabilities";
import type { ActivationState, OfficeIdentity, OfficeTrial } from "@/lib/activation/activation";

export interface NewOfficeCommandCenterProps {
  identity: OfficeIdentity;
  activation: ActivationState;
  trial: OfficeTrial | null;
  /** Always-present --office-* CSS vars (ZONO purple defaults, office brand overrides). */
  themeVars: Record<string, string>;
  hasBrand: boolean;
}

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

export function NewOfficeCommandCenter({ identity, activation, trial, themeVars, hasBrand }: NewOfficeCommandCenterProps) {
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
