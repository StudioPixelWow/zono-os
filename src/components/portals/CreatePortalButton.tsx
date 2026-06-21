"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Button, Spinner } from "@/components/ui/Button";
import { createClientPortalAction, approvePortalAction } from "@/lib/client-portals/actions";
import type { PortalType } from "@/lib/client-portals/service";

/**
 * Drop-in "create client portal" control for an entity detail page (buyer /
 * seller / property / lead / deal). Creates a curated portal, lets the agent
 * approve it, and surfaces a copyable public link. Review-only; nothing sent.
 */
export function CreatePortalButton({ entityType, entityId, portalType, label }: {
  entityType: string; entityId: string; portalType: PortalType; label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [portalId, setPortalId] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const create = () => {
    setNote(null); setLink(null);
    startTransition(async () => {
      const r = await createClientPortalAction(entityType, entityId, portalType);
      if (r.error) { setNote(r.error); return; }
      setPortalId(r.portalId ?? null);
      if (r.slug) setLink(`${window.location.origin}/portal/${r.slug}`);
      setNote(r.message ?? null);
      router.refresh();
    });
  };

  const approve = () => {
    if (!portalId) return;
    startTransition(async () => {
      const r = await approvePortalAction(portalId);
      setNote(r.error ?? r.message ?? null);
      if (r.ok) setApproved(true);
      router.refresh();
    });
  };

  const copy = () => { if (link) navigator.clipboard?.writeText(link).then(() => setNote("הקישור הועתק")); };

  return (
    <div className="bg-card border-line rounded-[16px] border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={create} loading={pending && !portalId} leadingIcon={<Icon name="Send" size={14} />}>{label ?? "צור פורטל לקוח"}</Button>
        {portalId && !approved && <Button size="sm" variant="secondary" onClick={approve} disabled={pending}>אשר והפעל</Button>}
        {link && <Button size="sm" variant="secondary" onClick={copy} disabled={pending}>העתק קישור</Button>}
        <Link href="/portals" className="text-brand-strong text-[12px] font-bold">כל הפורטלים ←</Link>
        {pending && <Spinner size={14} />}
      </div>
      {note && <p className="text-muted mt-2 text-[12px] font-semibold break-all">{note}</p>}
      {link && <p className="text-brand-strong mt-1 text-[12px] break-all">{link}</p>}
      {portalId && !approved && <p className="text-warning mt-1 text-[11px]">שים לב: הפורטל בטיוטה — לחץ ״אשר והפעל״ כדי שהקישור יציג תוכן.</p>}
    </div>
  );
}
