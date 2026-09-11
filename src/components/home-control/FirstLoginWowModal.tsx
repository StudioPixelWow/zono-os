"use client";
// ============================================================================
// ZONO — First-Login WOW Modal. The dramatic full-screen takeover a brand-new
// office sees ONCE on first login: the ZI character greets the owner by name,
// runs a live "scanning your zone" sequence, then reveals — with counting-up
// numbers, a stylized hot-map, and real recruitment opportunities (no-broker
// listings) — everything ZONO already knows about the city they chose.
//
// LIVE: a fresh office usually lands while the onboarding scan (+ its full
// intelligence chain) is still running, so the reveal POLLS /api/activation/
// zone-live and animates the real numbers UP as they arrive — turning a cold,
// never-scanned city into a "watch ZONO discover your zone in real time" moment
// instead of an empty screen.
//
// TRUTH GUARANTEE: every number shown is a REAL count from the zone snapshot /
// city discovery. The scan labels and the hot-map dots are visual staging only —
// they never assert a value. A metric with 0 is omitted; while the zone is still
// empty the reveal shows an honest "scanning right now" state (never demo data).
//
// Plays ONCE (localStorage-gated per org), fully skippable, and collapses to a
// static reveal under prefers-reduced-motion. Portal → <body>, RTL, premium.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { ZICharacter } from "@/components/characters/ZICharacter";
import type { ZoneSnapshot, ZonePrivateListing } from "@/lib/activation/zone-snapshot";
import type { CityDiscovery } from "@/lib/activation/activation";

const ILS = new Intl.NumberFormat("he-IL");
const priceShort = (p: number | null): string | null => {
  if (p == null || p <= 0) return null;
  if (p >= 1_000_000) return `₪${(p / 1_000_000).toFixed(p >= 10_000_000 ? 0 : 1)}M`;
  if (p >= 1000) return `₪${Math.round(p / 1000)}K`;
  return `₪${ILS.format(p)}`;
};

type Phase = "greet" | "scan" | "reveal";

interface LiveStats {
  discoveredListings: number; noBrokerCount: number; neighborhoods: number;
  mapPoints: number; brokersTotal: number; verifiedOffices: number; listingsTotal: number;
}
interface LiveState {
  stats: LiveStats;
  privateOwners: ZonePrivateListing[];
  insight: string | null;
  scanRunning: boolean;
}

const SCAN_STEPS: { icon: string; label: string }[] = [
  { icon: "Radar", label: "סורק את הזון שלך" },
  { icon: "Map", label: "מזהה שכונות" },
  { icon: "Building2", label: "ממפה נכסים באזור" },
  { icon: "Sparkles", label: "מאתר נכסים ללא מתווך" },
  { icon: "Users", label: "ממפה מתווכים ומשרדים פעילים" },
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

/** Count-up that animates from the PREVIOUS value to the new target (so live
 *  updates tick up smoothly instead of snapping back to 0), or lands instantly
 *  under reduced motion. */
function useCountUp(target: number, reduce: boolean): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (reduce) { fromRef.current = target; setVal(target); return; }
    const from = fromRef.current;
    if (target === from) return;
    const start = performance.now();
    const dur = 750;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = Math.round(from + (target - from) * eased);
      setVal(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce]);
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

  // Live state — seeded from the server-rendered props, then kept fresh by polling.
  const [live, setLive] = useState<LiveState>(() => ({
    stats: {
      discoveredListings: discovery?.discoveredListings ?? 0,
      noBrokerCount: discovery?.noBrokerCount ?? 0,
      neighborhoods: discovery?.neighborhoods ?? 0,
      mapPoints: discovery?.mapPoints ?? 0,
      brokersTotal: zone?.census?.brokersTotal ?? 0,
      verifiedOffices: zone?.census?.verifiedOffices ?? 0,
      listingsTotal: zone?.census?.listingsTotal ?? 0,
    },
    privateOwners: zone?.privateOwners ?? [],
    insight: zone?.insights?.[0] ?? null,
    scanRunning: discovery?.scanRunning ?? false,
  }));

  const stats = live.stats;
  const privateOwners = live.privateOwners;
  const insight = live.insight;
  const hasAnyData =
    stats.discoveredListings > 0 || stats.noBrokerCount > 0 || stats.brokersTotal > 0 ||
    stats.verifiedOffices > 0 || stats.neighborhoods > 0 || stats.listingsTotal > 0 ||
    privateOwners.length > 0;

  // Merge a poll result into live state — counts only ever move UP (a transient
  // empty read never wipes numbers we already showed); non-empty owners/insight win.
  const mergeLive = useCallback((next: {
    stats?: Partial<LiveStats>; privateOwners?: ZonePrivateListing[]; insight?: string | null; scanRunning?: boolean;
  }) => {
    setLive((prev) => {
      const s = prev.stats;
      const n: Partial<LiveStats> = next.stats ?? {};
      return {
        stats: {
          discoveredListings: Math.max(s.discoveredListings, n.discoveredListings ?? 0),
          noBrokerCount: Math.max(s.noBrokerCount, n.noBrokerCount ?? 0),
          neighborhoods: Math.max(s.neighborhoods, n.neighborhoods ?? 0),
          mapPoints: Math.max(s.mapPoints, n.mapPoints ?? 0),
          brokersTotal: Math.max(s.brokersTotal, n.brokersTotal ?? 0),
          verifiedOffices: Math.max(s.verifiedOffices, n.verifiedOffices ?? 0),
          listingsTotal: Math.max(s.listingsTotal, n.listingsTotal ?? 0),
        },
        privateOwners: (next.privateOwners && next.privateOwners.length) ? next.privateOwners : prev.privateOwners,
        insight: next.insight ?? prev.insight,
        scanRunning: next.scanRunning ?? prev.scanRunning,
      };
    });
  }, []);

  // Mount + one-time gate + reduced-motion detection + phase timeline.
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
    // ZoneScanReveal's own animation (it shows its static revealed state instead).
    try { window.localStorage.setItem(`zono_zone_revealed_v1_${orgId}`, "1"); } catch { /* ignore */ }

    if (reduce) {
      setPhase("reveal");
      setStep(SCAN_STEPS.length);
    } else {
      const push = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
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

  // LIVE POLLING — while the modal is open, refresh the real zone snapshot so the
  // numbers fill in as the onboarding scan + intelligence chain complete. Stops
  // when the scan has settled with data, or after a bounded window.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 40;   // ~40 × 4s ≈ up to ~2.5 min of live catch-up
    let timer = 0;

    const tick = async () => {
      attempts += 1;
      try {
        const res = await fetch("/api/activation/zone-live", { cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          if (!cancelled && j && j.stats) {
            mergeLive({ stats: j.stats, privateOwners: j.privateOwners, insight: j.insight, scanRunning: !!j.scanRunning });
          }
          // Settled: scan finished AND we have listings → stop polling.
          if (!cancelled && j && j.scanRunning === false && j.stats && j.stats.discoveredListings > 0) return;
        }
      } catch { /* transient — keep trying */ }
      if (!cancelled && attempts < MAX_ATTEMPTS) timer = window.setTimeout(tick, 4000);
    };
    // First poll shortly after open, so the scan has a beat to write initial rows.
    timer = window.setTimeout(tick, 2500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, mergeLive]);

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
  const rnd = seeded((orgId ? orgId.length * 7919 : 101) + 517);
  const dots = Array.from({ length: Math.max(dotCount, 8) }, (_, i) => ({
    x: 6 + rnd() * 88,
    y: 10 + rnd() * 80,
    hot: i % 4 === 0,
    delay: rnd() * 2,
  }));

  const revealTiles = [
    { key: "listings", v: stats.discoveredListings, label: "נכסים באזור", icon: "Building2", hot: false },
    { key: "nobroker", v: stats.noBrokerCount, label: "ללא מתווך — הזדמנות גיוס", icon: "Sparkles", hot: true },
    { key: "brokers", v: stats.brokersTotal, label: "מתווכים פעילים", icon: "Users", hot: false },
    { key: "offices", v: stats.verifiedOffices, label: "משרדים מזוהים", icon: "Landmark", hot: false },
    { key: "hoods", v: stats.neighborhoods, label: "שכונות שמופו", icon: "Map", hot: false },
    { key: "onmap", v: stats.mapPoints, label: "כבר על המפה", icon: "MapPin", hot: false },
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
        .zwow-live{margin-top:14px;display:inline-flex;align-items:center;gap:8px;border-radius:9999px;padding:6px 12px;font-size:12px;font-weight:700;color:#c7f9e5;background:rgba(52,211,153,.12);box-shadow:inset 0 0 0 1px rgba(52,211,153,.35);}
        .zwow-live .pulse{width:8px;height:8px;border-radius:9999px;background:#34d399;animation:zwowBlink 1.2s ease-in-out infinite;}
        .zwow-cta{margin-top:22px;display:flex;flex-wrap:wrap;gap:10px;}
        .zwow-cta .primary{flex:1;min-width:180px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;cursor:pointer;
          border-radius:16px;padding:14px 18px;font-size:15px;font-weight:800;background:var(--office-accent,#8b5cf6);color:var(--office-accent-ink,#fff);}
        .zwow-cta .ghost{display:flex;align-items:center;justify-content:center;border-radius:16px;padding:14px 18px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);}
        @keyframes zwowFade{from{opacity:0}to{opacity:1}}
        @keyframes zwowPop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes zwowFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes zwowSweep{to{transform:rotate(360deg)}}
        @keyframes zwowPing{0%{box-shadow:0 0 0 0 rgba(255,255,255,.4)}70%{box-shadow:0 0 0 14px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}
        @keyframes zwowBlink{0%,100%{opacity:1}50%{opacity:.3}}
        .zwow-pop{animation:zwowPop .5s cubic-bezier(.22,.61,.36,1) both;}
        @media(prefers-reduced-motion:reduce){
          .zwow-overlay,.zwow-card,.zwow-pop{animation:none;}
          .zwow-float{animation:none;}.zwow-sweep,.zwow-dot,.zwow-live .pulse{animation:none;}
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
                  <ZICharacter state={hasAnyData ? "celebrate" : "scanning"} size="md" animate={!reduce} />
                </span>
                <div>
                  <p className="zwow-eyebrow">{hasAnyData ? "הזון שלך מוכן" : "בונה את הזון שלך"}</p>
                  <h1 className="zwow-h1">
                    {hasAnyData ? `${where} — זה מה שכבר מצאתי בשבילך` : `סורק עכשיו את ${where} בשבילך…`}
                  </h1>
                </div>
              </div>

              {hasAnyData ? (
                <>
                  {revealTiles.length > 0 && (
                    <div className="zwow-tiles">
                      {revealTiles.map((t, i) => (
                        <RevealTile key={t.key} value={t.v} label={t.label} icon={t.icon} hot={t.hot} reduce={reduce} delay={i * 90} />
                      ))}
                    </div>
                  )}

                  {/* Hot-map density preview — a visual of the REAL points we found. */}
                  {dotCount > 0 && (
                    <div className="zwow-scan-wrap" style={{ marginTop: 16, height: 150 }}>
                      <div className="zwow-grid" />
                      {dots.slice(0, dotCount).map((d, i) => (
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

                  {live.scanRunning && (
                    <div className="zwow-live"><span className="pulse" />ZONO ממשיכה לסרוק — עוד נכסים והזדמנויות ייכנסו כאן בזמן אמת</div>
                  )}
                </>
              ) : (
                <>
                  <div className="zwow-scan-wrap" style={{ marginTop: 20 }}>
                    <div className="zwow-grid" />
                    <div className="zwow-sweep" />
                    {dots.map((d, i) => (
                      <span key={i} className={`zwow-dot${d.hot ? " hot" : ""}`}
                        style={{ left: `${d.x}%`, top: `${d.y}%`, animationDelay: `${d.delay}s` }} />
                    ))}
                  </div>
                  <div className="zwow-live"><span className="pulse" />
                    סורק את {where} ברגע זה — הנכסים, ההזדמנויות ומפת האזור יופיעו כאן בזמן אמת
                  </div>
                </>
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

/** A single reveal tile whose number counts up (from its previous value) to the
 *  current real value — so live poll updates tick up smoothly. */
function RevealTile({ value, label, icon, hot, reduce, delay }: {
  value: number; label: string; icon: string; hot: boolean; reduce: boolean; delay: number;
}) {
  const shown = useCountUp(value, reduce);
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
