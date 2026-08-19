"use client";
// ============================================================================
// ZONO — Buyer detail · "קישור הלקוח" card. Shows the persistent customer portal
// link (one URL that stays useful over time), a copy button, and a revoke/rotate
// action. The link + revocation are resolved by the org-scoped server actions;
// this component holds no secret and never renders CRM data.
// ============================================================================
import { useState, useEffect, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { getBuyerPortalLinkAction, revokeBuyerPortalAction } from "@/lib/customer-portal/portal-actions";

export function BuyerPortalLinkCard({ buyerId }: { buyerId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    getBuyerPortalLinkAction(buyerId).then((r) => { if (alive && r.ok && r.url) setUrl(r.url); }).catch(() => { /* silent */ });
    return () => { alive = false; };
  }, [buyerId]);

  const copy = () => {
    if (!url) return;
    try { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const revoke = () => start(async () => {
    const r = await revokeBuyerPortalAction(buyerId);
    if (r.ok && r.url) { setUrl(r.url); setRevoked(true); setTimeout(() => setRevoked(false), 2000); }
  });

  return (
    <div className="bg-card border-line rounded-[20px] border p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-ink text-sm font-extrabold">קישור הלקוח</p>
        <Icon name="Link" size={16} />
      </div>
      <p className="text-muted mb-3 text-xs">קישור אישי ומאובטח לפורטל הנכסים של הלקוח — נשאר בתוקף לאורך זמן. אפשר לשלוח בוואטסאפ.</p>
      {url ? (
        <>
          <div className="bg-surface text-muted mb-3 truncate rounded-xl px-3 py-2 text-xs" dir="ltr">{url}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copy} type="button" className="bg-brand rounded-xl px-4 py-2 text-sm font-bold text-white">{copied ? "הועתק ✓" : "העתקת קישור"}</button>
            <button onClick={revoke} disabled={pending} type="button" className="border-line text-muted rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50">{revoked ? "רוענן ✓" : "ביטול קישור קודם"}</button>
          </div>
        </>
      ) : (
        <p className="text-muted text-sm">טוען קישור…</p>
      )}
    </div>
  );
}
