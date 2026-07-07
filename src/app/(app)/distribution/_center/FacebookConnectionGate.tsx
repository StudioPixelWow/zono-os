"use client";
// ============================================================================
// ZONO — Facebook Connection Gate (premium). Shown in the Distribution Center
// whenever there is no live Meta API connection (always, in this phase — Meta
// App Review / OAuth is not wired). Reads the REAL connection state via the
// existing provider-connections action; never assumes/fakes "connected".
//
// 100% presentation. No new services, no new tables, no auto-posting. It routes
// the agent to the EXISTING connection settings and explains the 5-step path,
// while making clear the manual/assisted fallback stays available (Meta policy).
// ============================================================================
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getDistributionConnectionsAction } from "@/lib/distribution/provider-connections-actions";

// Return here after connecting so the agent lands back on the campaign builder.
const RETURN_TO = "/distribution?section=builder";
const CONNECT_HREF = `/settings/distribution-connections?return=${encodeURIComponent(RETURN_TO)}`;

const STEPS: { n: number; label: string; hint: string; icon: string }[] = [
  { n: 1, label: "חבר פייסבוק", hint: "התחברות רשמית דרך Meta / תוסף כרום", icon: "Send" },
  { n: 2, label: "בנה ספריית קבוצות", hint: "זהה עמודים/נכסים זמינים או הוסף קבוצות ידנית", icon: "Users" },
  { n: 3, label: "בחר קבוצות לקמפיין", hint: "עד 15 קבוצות לכל נכס ביום", icon: "Megaphone" },
  { n: 4, label: "צור וריאציות", hint: "וריאציות תוכן AI מותאמות לכל קהל", icon: "Sparkles" },
  { n: 5, label: "פרסם ידנית ומעקב", hint: "פרסום מאושר לפי מגבלות Meta + מעקב לידים", icon: "ShieldCheck" },
];

export function FacebookConnectionGate({
  onBuildLibrary,
  onOpenAssistant,
}: {
  onBuildLibrary?: () => void;
  onOpenAssistant?: () => void;
}) {
  // Default to the gate (FB is not API-connected in this phase); hide only when a
  // real "connected" API state is found.
  const [connected, setConnected] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    getDistributionConnectionsAction()
      .then((rows) => {
        if (!alive) return;
        const fb = rows.find((r) => r.provider === "facebook");
        setConnected(fb?.status === "connected" && fb?.connectionMode === "api");
      })
      .catch(() => { /* keep gate visible on error */ })
      .finally(() => { if (alive) setChecked(true); });
    return () => { alive = false; };
  }, []);

  if (connected) return null;
  // Avoid a flash before the first read resolves.
  if (!checked) return null;

  return (
    <section dir="rtl" className="zono-glass relative overflow-hidden rounded-[28px] p-6 sm:p-8">
      <div className="bg-brand-soft/60 pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full blur-2xl" />
      <div className="relative flex flex-col gap-6">
        {/* Header + primary CTA */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="zono-gradient grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white shadow-[var(--shadow-soft)]">
              <Icon name="Megaphone" size={26} />
            </span>
            <div className="min-w-0">
              <h2 className="text-ink text-2xl font-black sm:text-[26px]">חבר את פייסבוק כדי להתחיל</h2>
              <p className="text-muted mt-1.5 max-w-2xl text-sm leading-relaxed">
                ZONO תשתמש בחיבור כדי להכין פרסומים, לזהות עמודים/נכסים זמינים ולנהל מעקב.
                פרסום בקבוצות נשאר ידני/מאושר לפי מגבלות Meta.
              </p>
            </div>
          </div>
          <Link href={CONNECT_HREF}
            className="btn-zono-primary zono-focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-black text-white">
            <Icon name="Send" size={17} /> חבר את פייסבוק
          </Link>
        </div>

        {/* 5-step path */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <div key={s.n} className="border-line bg-card/60 relative flex flex-col gap-2 rounded-2xl border p-4">
              <div className="flex items-center gap-2">
                <span className="zono-ai-gradient grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[13px] font-black text-white">{s.n}</span>
                <span className="text-brand-strong"><Icon name={s.icon} size={16} /></span>
              </div>
              <p className="text-ink text-sm font-extrabold leading-tight">{s.label}</p>
              <p className="text-muted text-[11px] leading-snug">{s.hint}</p>
              {i < STEPS.length - 1 && (
                <span className="text-muted/40 absolute -left-2 top-1/2 hidden -translate-y-1/2 lg:block">←</span>
              )}
            </div>
          ))}
        </div>

        {/* Secondary actions — the manual fallback is always available */}
        <div className="flex flex-wrap items-center gap-2">
          {onBuildLibrary && (
            <button type="button" onClick={onBuildLibrary}
              className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-bold transition">
              <Icon name="Users" size={15} /> בנה ספריית קבוצות ידנית
            </button>
          )}
          {onOpenAssistant && (
            <button type="button" onClick={onOpenAssistant}
              className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-bold transition">
              <Icon name="ShieldCheck" size={15} /> פתח מסייע פרסום ידני
            </button>
          )}
          <p className="text-muted text-[11px]">
            אנחנו לא עוקפים את Meta ולא מבצעים scraping. פרסום לקבוצות נשאר בשליטתך ובאישורך.
          </p>
        </div>
      </div>
    </section>
  );
}
