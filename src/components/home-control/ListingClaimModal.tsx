"use client";
// ============================================================================
// ZONO — "היי [שם], מצאנו את הנכסים שלך" claim modal. On first login it asks the
// office to confirm the listings ZONO already observed for its broker (name /
// phone) across the shared market graph. On confirm those listings are assigned
// into the office PERMANENTLY (server copies them) and the page reloads so the
// map, market intelligence and listings populate immediately — no scrape needed.
// Fires once: the server records the decision (claimed / dismissed) so it never
// nags again. Portal → <body>, RTL, premium.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ZICharacter } from "@/components/characters/ZICharacter";
import { Icon } from "@/components/dashboard/Icon";

interface ClaimSample { id: string; propertyType: string | null; neighborhood: string | null; price: number | null; imageUrl: string | null }
interface ClaimState { status: string; brokerName: string | null; count: number; sample: ClaimSample[] }

const priceShort = (p: number | null): string | null => {
  if (p == null || p <= 0) return null;
  if (p >= 1_000_000) return `₪${(p / 1_000_000).toFixed(1)}M`;
  if (p >= 1000) return `₪${Math.round(p / 1000)}K`;
  return `₪${p}`;
};

export function ListingClaimModal({ ownerFirstName }: { ownerFirstName?: string }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<ClaimState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "confirm" | "dismiss">(null);
  const [done, setDone] = useState<{ count: number } | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    setMounted(true);
    if (asked.current) return;
    asked.current = true;
    (async () => {
      try {
        const res = await fetch("/api/activation/listing-claim", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { ok: boolean } & ClaimState;
        if (j.ok && j.status === "available" && j.count > 0) {
          setData(j);
          setOpen(true);
          try { document.body.style.overflow = "hidden"; } catch { /* ignore */ }
        }
      } catch { /* silent — never blocks the dashboard */ }
    })();
    return () => { try { document.body.style.overflow = ""; } catch { /* ignore */ } };
  }, []);

  const close = () => { setOpen(false); try { document.body.style.overflow = ""; } catch { /* ignore */ } };

  const confirm = async () => {
    setBusy("confirm");
    try {
      const res = await fetch("/api/activation/listing-claim", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm" }),
      });
      const j = (await res.json()) as { ok: boolean; count: number };
      if (j.ok) {
        setDone({ count: j.count ?? data?.count ?? 0 });
        // Let the success beat land, then refresh so map/market-intel populate.
        setTimeout(() => { close(); router.refresh(); }, 1800);
        return;
      }
    } catch { /* fall through */ }
    setBusy(null);
  };

  const dismiss = async () => {
    setBusy("dismiss");
    try {
      await fetch("/api/activation/listing-claim", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss" }),
      });
    } catch { /* ignore */ }
    close();
  };

  if (!mounted || !open || !data) return null;
  const first = (ownerFirstName || (data.brokerName ?? "").split(/\s+/)[0] || "").trim();

  return createPortal(
    <div dir="rtl" role="dialog" aria-modal="true" className="lcm-overlay">
      <style>{`
        .lcm-overlay{position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;padding:16px;
          background:rgba(8,6,20,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:lcmFade .3s ease both}
        .lcm-card{position:relative;width:100%;max-width:560px;max-height:calc(100dvh - 32px);overflow:auto;border-radius:28px;color:#fff;
          box-shadow:0 40px 120px rgba(76,29,149,.55),0 0 0 1px rgba(255,255,255,.06);
          background:radial-gradient(120% 90% at 12% 0%,#2b1a63 0%,#180f38 46%,#0f0a26 100%);animation:lcmPop .45s cubic-bezier(.22,.61,.36,1) both}
        .lcm-pad{padding:30px 26px 26px}
        .lcm-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:rgba(196,181,253,.85)}
        .lcm-h1{margin-top:8px;font-size:25px;line-height:1.2;font-weight:800;text-wrap:balance}
        .lcm-sub{margin-top:10px;font-size:15px;line-height:1.6;color:rgba(255,255,255,.82)}
        .lcm-count{display:inline-flex;align-items:baseline;gap:6px;margin-top:2px}
        .lcm-count b{font-size:20px;color:#fff}
        .lcm-grid{margin-top:20px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .lcm-tile{border-radius:14px;overflow:hidden;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
        .lcm-ph{position:relative;aspect-ratio:4/3;background:rgba(255,255,255,.05)}
        .lcm-ph .price{position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.7);border-radius:8px;padding:2px 7px;font-size:11px;font-weight:800}
        .lcm-meta{padding:7px 9px;font-size:11px;color:rgba(255,255,255,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lcm-cta{margin-top:24px;display:flex;flex-wrap:wrap;gap:10px}
        .lcm-primary{flex:1;min-width:200px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;cursor:pointer;border-radius:16px;
          padding:15px 18px;font-size:16px;font-weight:800;background:linear-gradient(90deg,#7c3aed,#a855f7);color:#fff}
        .lcm-primary:disabled{opacity:.7;cursor:default}
        .lcm-ghost{display:flex;align-items:center;justify-content:center;border-radius:16px;padding:15px 18px;font-size:14px;font-weight:700;
          color:rgba(255,255,255,.85);text-decoration:none;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);cursor:pointer;border:0}
        .lcm-note{margin-top:14px;font-size:11.5px;color:rgba(255,255,255,.55);line-height:1.5}
        .lcm-float{animation:lcmFloat 3.4s ease-in-out infinite}
        @keyframes lcmFade{from{opacity:0}to{opacity:1}}
        @keyframes lcmPop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes lcmFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @media(prefers-reduced-motion:reduce){.lcm-overlay,.lcm-card,.lcm-float{animation:none}}
      `}</style>
      <div className="lcm-card">
        <div className="lcm-pad">
          {done ? (
            <div style={{ textAlign: "center", padding: "18px 6px" }}>
              <span className="lcm-float" style={{ display: "inline-block" }}><ZICharacter state="celebrate" size="lg" /></span>
              <h1 className="lcm-h1" style={{ marginTop: 14 }}>מעולה! {done.count} נכסים שויכו אליך 🎉</h1>
              <p className="lcm-sub">הנכסים שלך כבר במערכת — טוען את המפה והמודיעין…</p>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span className="lcm-float" style={{ flex: "none" }}><ZICharacter state="pointing" size="lg" /></span>
                <div>
                  <p className="lcm-eyebrow">ZI זיהה אותך</p>
                  <h1 className="lcm-h1">היי {first || "וברוך הבא"}, אנחנו מכירים אותך!</h1>
                  <p className="lcm-sub">
                    כבר מצאתי <span className="lcm-count"><b>{data.count}</b> נכסים</span> שמפורסמים על שמך באזור.
                    רוצה שאשייך אותם למערכת שלך?
                  </p>
                </div>
              </div>

              {data.sample.length > 0 && (
                <div className="lcm-grid">
                  {data.sample.slice(0, 6).map((s) => (
                    <div key={s.id} className="lcm-tile">
                      <div className="lcm-ph">
                        {s.imageUrl ? (
                          <Image src={s.imageUrl} alt="" fill sizes="180px" style={{ objectFit: "cover" }} unoptimized />
                        ) : (
                          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "rgba(255,255,255,.35)" }}><Icon name="Building2" size={26} /></div>
                        )}
                        {priceShort(s.price) && <span className="price">{priceShort(s.price)}</span>}
                      </div>
                      <div className="lcm-meta">{s.neighborhood || "—"}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="lcm-cta">
                <button type="button" className="lcm-primary" onClick={confirm} disabled={busy !== null}>
                  {busy === "confirm" ? "משייך…" : <>כן, שייך אותם אליי <Icon name="ArrowLeft" className="h-4 w-4" /></>}
                </button>
                <button type="button" className="lcm-ghost" onClick={dismiss} disabled={busy !== null}>
                  {busy === "dismiss" ? "…" : "לא, אלה לא שלי"}
                </button>
              </div>
              <p className="lcm-note">
                השיוך מוסיף את הנכסים למערכת שלך לצמיתות — הם יופיעו במפה, במודיעין השוק וברשימת הנכסים. תמיד אפשר לשנות מאוחר יותר.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
