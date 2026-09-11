"use client";
// ============================================================================
// ZONO — First-Login WOW Modal. The dramatic full-screen takeover a brand-new
// office sees ONCE on first login: the ZI character greets the owner by name,
// runs a live "scanning your zone" sequence, then reveals — with counting-up
// numbers, a stylized hot-map, and real recruitment opportunities (no-broker
// listings) — everything ZONO already knows about the city they chose.
//
// TRUTH GUARANTEE: every number shown is a REAL count from the zone snapshot /
// city discovery already computed on the server. The scan labels and the hot-map
// dots are visual staging only — they never assert a value. A metric with 0 is
// omitted; when the zone is still empty the reveal shows an honest "scanning in
// the background" state instead of a fabricated figure.
//
// Plays ONCE (localStorage-gated per org), fully skippable, and collapses to a
// static reveal under prefers-reduced-motion. Portal → <body>, RTL, premium.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { ZICharacter } from "@/components/characters/ZICharacter";
import type { ZoneSnapshot } from "@/lib/activation/zone-snapshot";
import type { CityDiscovery } from "@/lib/activation/activation";

const ILS = new Intl.NumberFormat("he-IL");
const priceShort = (p: number | null): string | null => {
  if (p == null || p <= 0) return null;
  if (p >= 1_000_000) return `₪${(p / 1_000_000).toFixed(p >= 10_000_000 ? 0 : 1)}M`;
  if (p >= 1000) return `₪${Math.round(p / 1000)}K`;
  return `₪${ILS.format(p)}`;
};

type Phase = "greet" | "scan" | "reveal";

const SCAN_STEPS: { icon: string; label: string }[] = [
  { icon: "Radar", label: "סורק את הזון שלך" },
  { icon: "Map", label: "מזהה שכונות" },
  { icon: "Building2", label: "ממפה נכסים באזור" },
  { icon: "Sparkles", label: "מאתר נכסים ללא מתווך" },
  { icon: "Users", label: "ממפה מתווכים פעילים" },
  { icon: "TrendingUp", label: "מנתח את השוק המקומי" },
];

export interface FirstLoginWowModalProps {
  orgId: string;
  ownerFirstName: string;
  city: string | null;
  zone?: ZoneSnapshot | null;
  discovery?: CityDiscovery | null;
}

/** Deterministic pseudo-random in [0,1) from a numeric seed (stable per render). */
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Count-up: animates 0→target once `active`, or lands on target instantly when
 *  reduced motion is requested. */
function useCountUp(target: number, active: boolean, reduce: boolean): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduce || target <= 0) { setVal(target); return; }
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, reduce]);
  return val;
}

export function FirstLoginWowModal({ orgId, ownerFirstName, city, zone, discovery }: FirstLoginWowModalProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("greet");
  const [step, setStep] = useState(0);
  const reduceRef = useRef(false);
  const timers = useRef<number[]>([]);
  const storeKey = `zono_wow_intro_v1_${orgId}`;

  // Real, honest numbers (0 → omitted downstream).
  const stats = {
    discoveredListings: discovery?.discoveredListings ?? 0,
    noBrokerCount: discovery?.noBrokerCount ?? 0,
    neighborhoods: discovery?.neighborhoods ?? 0,
    mapPoints: discovery?.mapPoints ?? 0,
    brokersTotal: zone?.census?.brokersTotal ?? 0,
    verifiedOffices: zone?.census?.verifiedOffices ?? 0,
    listingsTotal: zone?.census?.listingsTotal ?? 0,
    scanRunning: discovery?.scanRunning ?? false,
  };
  const privateOwners = zone?.privateOwners ?? [];
  const insight = zone?.insights?.[0] ?? null;
  const hasAnyData =
    stats.discoveredListings > 0 || stats.noBrokerCount > 0 || stats.brokersTotal > 0 ||
    stats.verifiedOffices > 0 || stats.neighborhoods > 0 || stats.listingsTotal > 0 ||
    privateOwners.length > 0;

  // Mount + one-time gate + reduced-motion detection.
  useEffect(() => {
    setMounted(true);
    let seen = false;
    try { seen = !!window.localStorage.getItem(storeKey); } catch { /* private mode */ }
    if (seen) return;
    const reduce = !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduceRef.current = reduce;
    setOpen(true);
    try { document.body.style.overflow = "hidden"; } catch { /* ignore */ }
    // This dramatic modal IS the first-run scan experience, so suppress the inline
    // ZoneScanReveal's own animation (it shows its static revealed state instead) —
    // no double scan plays behind the takeover.
    try { window.localStorage.setItem(`zono_zone_revealed_v1_${orgId}`, "1"); } catch { /* ignore */ }

    if (reduce) {
      setPhase("reveal");
      setStep(SCAN_STEPS.length);
    } else {
      const push = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
      // greet → scan → (stepped) → reveal
      push(() => setPhase("scan"), 2200);
      SCAN_STEPS.forEach((_, i) => push(() => setStep(i + 1), 2600 + i * 520));
      push(() => setPhase("reveal"), 2600 + SCAN_STEPS.length * 520 + 350);
    }
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      try { document.body.style.overflow = ""; } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);

  const close = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    try { window.localStorage.setItem(storeKey, "1"); } catch { /* ignore */ }
    try { document.body.style.overflow = ""; } catch { /* ignore */ }
    setOpen(false);
  };

  const skip = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setStep(SCAN_STEPS.length);
    setPhase("reveal");
  };

  if (!mounted || !open) return null;

  const where = city ?? "האזור שלך";
  const reduce = reduceRef.current;

  // Hot-map dots scaled to the REAL density we found (never more than we have).
  const density = Math.max(stats.mapPoints, stats.noBrokerCount, stats.discoveredListings);
  const dotCount = Math.min(density, 26);
  const rnd = seeded((orgId ? orgId.length * 7919 : 101) + density * 31 + 17);
  const dots = Array.from({ length: dotCount }, (_, i) => ({
    x: 6 + rnd() * 88,
    y: 10 + rnd() * 80,
    hot: i % 4 === 0, // a quarter are "hot" (no-broker-style) accents
    delay: rnd() * 2,
  }));

  const revealTiles = [
    { v: stats.discoveredListings, label: "נכסים באזור", icon: "Building2", hot: false },
    { v: stats.noBrokerCount, label: "ללא מתווך — הזדמנות גיוס", icon: "Sparkles", hot: true },
    { v: stats.brokersTotal, label: "מתווכים פעילים", icon: "Users", hot: false },
    { v: stats.verifiedOffices, label: "משרדים מזוהים", icon: "Landmark", hot: false },
    { v: stats.neighborhoods, label: "שכונות שמופו", icon: "Map", hot: false },
    { v: stats.mapPoints, label: "כבר על המפה", icon: "MapPin", hot: false },
  ].filter((t) => t.v > 0);

  return createPortal(
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="ברוך הבא ל‑ZONO"
      className="zwow-overlay"
      onClick={(e) => { if (e.target === e.currentTarget && phase === "reveal") close(); }}
    >
      <style>{`
        .zwow-overlay{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;
          padding:16px;background:rgba(8,6,20,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
          animation:zwowFade .35s ease both;}
        .zwow-card{position:relative;width:100%;max-width:660px;max-height:calc(100dvh - 32px);overflow:auto;
          border-radius:30px;color:#fff;box-shadow:0 40px 120px rgba(76,29,149,.5),0 0 0 1px rgba(255,255,255,.06);
          background:radial-gradient(120% 90% at 12% 0%,#2b1a63 0%,#180f38 46%,#0f0a26 100%);
          animation:zwowPop .5s cubic-bezier(.22,.61,.36,1) both;}
        .zwow-accent{position:absolute;inset-inline:0;top:0;height:4px;background:var(--office-accent,#8b5cf6);border-top-left-radius:30px;border-top-right-radius:30px;}
        .zwow-pad{padding:30px 26px 26px;}
        .zwow-skip{position:absolute;top:14px;left:16px;z-index:2;display:flex;align-items:center;gap:6px;
          border-radius:9999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);
          padding:6px 12px;font-size:12px;font-weight:700;color:rgba(255,255,255,.8);cursor:pointer;}
        .zwow-skip:hover{background:rgba(255,255,255,.12);}
        .zwow-eyebrow{font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.55);}
        .zwow-h1{margin-top:6px;font-size:26px;line-height:1.15;font-weight:800;text-wrap:balance;}
        .zwow-sub{margin-top:8px;font-size:14.5px;line-height:1.6;color:rgba(255,255,255,.78);max-width:44ch;}
        .zwow-float{animation:zwowFloat 3.4s ease-in-out infinite;}
        .zwow-scan-wrap{position:relative;margin-top:20px;height:180px;border-radius:22px;overflow:hidden;
          background:linear-gradient(160deg,rgba(255,255,255,.05),rgba(255,255,255,.02));
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);}
        .zwow-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:34px 34px;}
        .zwow-sweep{position:absolute;inset:0;background:conic-gradient(from 0deg,transparent 0deg,var(--office-accent,#8b5cf6) 26deg,transparent 46deg);opacity:.55;animation:zwowSweep 2.2s linear infinite;transform-origin:50% 50%;}
        .zwow-dot{position:absolute;width:9px;height:9px;border-radius:9999px;transform:translate(-50%,-50%);
          background:rgba(255,255,255,.75);box-shadow:0 0 0 0 rgba(255,255,255,.5);animation:zwowPing 2.4s ease-out infinite;}
        .zwow-dot.hot{background:var(--office-accent,#8b5cf6);box-shadow:0 0 12px 2px var(--office-accent,#8b5cf6);}
        .zwow-steps{margin-top:18px;display:grid;gap:8px;}
        @media(min-width:520px){.zwow-steps{grid-template-columns:1fr 1fr;}}
        .zwow-step{display:flex;align-items:center;gap:10px;border-radius:16px;padding:9px 12px;font-size:13px;font-weight:600;
          background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);transition:opacity .3s;}
        .zwow-step .ic{display:flex;height:26px;width:26px;align-items:center;justify-content:center;border-radius:9999px;flex:none;}
        .zwow-tiles{margin-top:22px;display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
        @media(min-width:520px){.zwow-tiles{grid-template-columns:repeat(3,1fr);}}
        .zwow-tile{border-radius:18px;padding:14px 12px;text-align:center;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);}
        .zwow-tile.hot{background:linear-gradient(160deg,rgba(52,211,153,.22),rgba(16,185,129,.1));box-shadow:inset 0 0 0 1px rgba(52,211,153,.4);}
        .zwow-tile .num{font-size:28px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;}
        .zwow-tile .lab{margin-top:6px;font-size:11px;font-weight:600;color:rgba(255,255,255,.72);line-height:1.25;}
        .zwow-opps{margin-top:16px;border-radius:18px;padding:14px;background:linear-gradient(160deg,rgba(52,211,153,.16),rgba(16,185,129,.06));box-shadow:inset 0 0 0 1px rgba(52,211,153,.32);}
        .zwow-opp{display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:14px;padding:10px 12px;background:rgba(255,255,255,.06);}
        .zwow-insight{margin-top:16px;display:flex;gap:10px;align-items:flex-start;border-radius:16px;padding:12px 14px;font-size:13.5px;line-height:1.55;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);}
        .zwow-cta{margin-top:22px;display:flex;flex-wrap:wrap;gap:10px;}
        .zwow-cta .primary{flex:1;min-width:180px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;cursor:pointer;
          border-radius:16px;padding:14px 18px;font-size:15px;font-weight:800;background:var(--office-accent,#8b5cf6);color:var(--office-accent-ink,#fff);}
        .zwow-cta .ghost{display:flex;align-items:center;justify-content:center;border-radius:16px;padding:14px 18px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);}
        @keyframes zwowFade{from{opacity:0}to{opacity:1}}
        @keyframes zwowPop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes zwowFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes zwowSweep{to{transform:rotate(360deg)}}
        @keyframes zwowPing{0%{box-shadow:0 0 0 0 rgba(255,255,255,.4)}70%{box-shadow:0 0 0 14px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}
        .zwow-pop{animation:zwowPop .5s cubic-bezier(.22,.61,.36,1) both;}
        @media(prefers-reduced-motion:reduce){
          .zwow-overlay,.zwow-card,.zwow-pop{animation:none;}
          .zwow-float{animation:none;}.zwow-sweep,.zwow-dot{animation:none;}
        }
      `}</style>

      <div className="zwow-card">
        <span className="zwow-accent" />
        {phase !== "reveal" && (
          <button type="button" className="zwow-skip" onClick={skip}>
            דלג <Icon name="ChevronLeft" className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="zwow-pad">
          {phase === "greet" && (
            <div className="zwow-pop">
              <div className="flex items-center gap-4">
                <span className="zwow-float shrink-0">
                  <ZICharacter state="welcome" size="lg" animate={!reduce} priority />
                </span>
                <div>
                  <p className="zwow-eyebrow">מערכת ההפעלה שלך הופעלה</p>
                  <h1 className="zwow-h1">שלום {ownerFirstName || "וברוך הבא"}, אני ZI.</h1>
                  <p className="zwow-sub">הבינה של המשרד שלך. תן לי רגע — אני סורק את {where} ומראה לך מה כבר מצאתי בשבילך.</p>
                </div>
              </div>
            </div>
          )}

          {phase === "scan" && (
            <div>
              <div className="flex items-center gap-4">
                <span className="zwow-float shrink-0">
                  <ZICharacter state="scanning" size="md" animate={!reduce} />
                </span>
                <div>
                  <p className="zwow-eyebrow">ZONO סורקת עכשיו</p>
                  <h1 className="zwow-h1">מכיר את {where}…</h1>
                </div>
              </div>

              <div className="zwow-scan-wrap">
                <div className="zwow-grid" />
                <div className="zwow-sweep" />
                {dots.map((d, i) => (
                  <span key={i} className={`zwow-dot${d.hot ? " hot" : ""}`}
                    style={{ left: `${d.x}%`, top: `${d.y}%`, animationDelay: `${d.delay}s` }} />
                ))}
              </div>

              <div className="zwow-steps">
                {SCAN_STEPS.map((s, i) => {
                  const done = i < step;
                  const active = i === step;
                  return (
                    <div key={i} className="zwow-step" style={{ opacity: done || active ? 1 : 0.4 }}>
                      <span className="ic" style={{
                        background: done ? "#34d399" : "rgba(255,255,255,.1)",
                        color: done ? "#0f2a20" : "rgba(255,255,255,.75)",
                      }}>
                        <Icon name={done ? "Check" : s.icon} className="h-3.5 w-3.5" />
                      </span>
                      {s.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {phase === "reveal" && (
            <div className="zwow-pop">
              <div className="flex items-center gap-4">
                <span className="zwow-float shrink-0">
                  <ZICharacter state={hasAnyData ? "celebrate" : "working"} size="md" animate={!reduce} />
                </span>
                <div>
                  <p className="zwow-eyebrow">הזון שלך מוכן</p>
                  <h1 className="zwow-h1">
                    {hasAnyData ? `${where} — זה מה שכבר מצאתי בשבילך` : `מתחיל לבנות את ${where} בשבילך`}
                  </h1>
                </div>
              </div>

              {hasAnyData ? (
                <>
                  {revealTiles.length > 0 && (
                    <div className="zwow-tiles">
                      {revealTiles.map((t, i) => (
                        <RevealTile key={t.label} value={t.v} label={t.label} icon={t.icon} hot={t.hot} reduce={reduce} delay={i * 90} />
                      ))}
                    </div>
                  )}

                  {/* Hot-map density preview — a visual of the REAL points we found. */}
                  {dotCount > 0 && (
                    <div className="zwow-scan-wrap" style={{ marginTop: 16, height: 150 }}>
                      <div className="zwow-grid" />
                      {dots.map((d, i) => (
                        <span key={i} className={`zwow-dot${d.hot ? " hot" : ""}`}
                          style={{ left: `${d.x}%`, top: `${d.y}%`, animationDelay: `${d.delay}s` }} />
                      ))}
                      <span style={{ position: "absolute", insetInlineEnd: 12, bottom: 10, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>
                        מפת החום של {where}
                      </span>
                    </div>
                  )}

                  {/* Recruitment opportunities — REAL no-broker listings. */}
                  {privateOwners.length > 0 && (
                    <div className="zwow-opps">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-bold">
                          <span style={{ color: "#34d399", display: "inline-flex" }}><Icon name="Sparkles" className="h-4 w-4" /></span>
                          הזדמנויות גיוס — נכסים ללא מתווך
                        </span>
                      </div>
                      <div className="mt-2.5 grid gap-2">
                        {privateOwners.slice(0, 3).map((p, i) => (
                          <div key={i} className="zwow-opp">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold">
                                {p.propertyType || "נכס"}{p.rooms ? ` · ${p.rooms} חד׳` : ""}{p.sqm ? ` · ${p.sqm} מ״ר` : ""}
                              </p>
                              <p className="truncate text-xs" style={{ color: "rgba(255,255,255,.6)" }}>{p.neighborhood || where}</p>
                            </div>
                            <div className="shrink-0 text-left">
                              {priceShort(p.price) && <p className="text-sm font-extrabold">{priceShort(p.price)}</p>}
                              <span className="text-[10px] font-bold" style={{ color: "#34d399" }}>ללא מתווך</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {insight && (
                    <div className="zwow-insight">
                      <span className="mt-0.5 shrink-0" style={{ color: "var(--office-accent,#8b5cf6)", display: "inline-flex" }}><Icon name="Sparkles" className="h-4 w-4" /></span>
                      <span>{insight}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="zwow-insight" style={{ marginTop: 20 }}>
                  <span className="mt-0.5 shrink-0" style={{ color: "var(--office-accent,#8b5cf6)", display: "inline-flex" }}><Icon name="Radar" className="h-4 w-4" /></span>
                  <span>
                    {stats.scanRunning
                      ? `הסריקה של ${where} רצה ברגע זה ברקע — הנכסים, ההזדמנויות ומפת האזור ימלאו כאן וברחבי המערכת אוטומטית.`
                      : `הסריקה של ${where} תרוץ אוטומטית ותתחיל למלא את הזירה בנתונים אמיתיים — נעדכן אותך ברגע שיהיו תוצאות.`}
                  </span>
                </div>
              )}

              <div className="zwow-cta">
                <button type="button" className="primary" onClick={close}>
                  בוא נתחיל לעבוד <Icon name="ArrowLeft" className="h-4 w-4" />
                </button>
                {stats.discoveredListings > 0 && (
                  <Link href="/external-listings" className="ghost" onClick={close}>
                    צפה בכל ההזדמנויות
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A single reveal tile whose number counts up from 0 → real value. */
function RevealTile({ value, label, icon, hot, reduce, delay }: {
  value: number; label: string; icon: string; hot: boolean; reduce: boolean; delay: number;
}) {
  const shown = useCountUp(value, true, reduce);
  return (
    <div className={`zwow-tile${hot ? " hot" : ""} zwow-pop`} style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-center gap-1.5">
        <span style={{ color: hot ? "#34d399" : "rgba(255,255,255,.7)", display: "inline-flex" }}><Icon name={icon} className="h-4 w-4" /></span>
        <span className="num">{ILS.format(shown)}</span>
      </div>
      <p className="lab">{label}</p>
    </div>
  );
}
