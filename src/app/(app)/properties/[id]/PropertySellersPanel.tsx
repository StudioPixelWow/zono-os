"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  linkSellerToPropertyAction,
  searchSellersAction,
  setPropertySellerRoleAction,
  unlinkSellerFromPropertyAction,
  type SellerSearchResult,
} from "@/lib/sellers/actions";
import type { PropertySellerView } from "@/lib/sellers/service360";
import type { SellerReadiness } from "@/lib/sellers/propertySellers";

const RELATIONSHIP_LABELS: Record<string, string> = {
  owner: "בעלים", co_owner: "בעלים שותף", decision_maker: "מקבל החלטות", representative: "נציג",
  power_of_attorney: "מיופה כוח", lawyer: "עו״ד", family_member: "בן משפחה", investor: "משקיע", other: "אחר",
};
const field = "bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none transition";

export function PropertySellersPanel({
  propertyId,
  sellers,
  readiness,
}: {
  propertyId: string;
  sellers: PropertySellerView[];
  readiness: SellerReadiness;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SellerSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    start(async () => { const r = await fn(); if (r?.error) setError(r.error); else router.refresh(); });
  };
  const search = () => start(async () => setResults(await searchSellersAction(query)));
  const link = (sellerId: string) =>
    run(() => linkSellerToPropertyAction({ propertyId, sellerId, relationshipType: "owner", isPrimary: sellers.length === 0, isDecisionMaker: sellers.length === 0, canSign: sellers.length === 0 }));

  return (
    <div className="flex flex-col gap-5">
      {/* Readiness */}
      <div className={cn("flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-semibold", readiness.ready ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
        <Icon name={readiness.ready ? "UserCheck" : "AlertTriangle"} size={18} />
        {readiness.ready ? "מוכנות מוכר תקינה — ניתן לפרסם." : `חסר לפרסום: ${readiness.reasons.join(" · ")}`}
      </div>

      {/* Linked sellers */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-ink text-sm font-extrabold">בעלים / מוכרים מקושרים</p>
          <Link href={`/sellers/new?propertyId=${propertyId}`}><Button size="sm" leadingIcon={<Icon name="Plus" size={15} />}>מוכר חדש</Button></Link>
        </div>
        {sellers.length === 0 ? (
          <p className="text-muted bg-surface rounded-2xl px-4 py-6 text-center text-sm">אין מוכרים מקושרים. חפש מוכר קיים או צור מוכר חדש.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sellers.map((s) => (
              <li key={s.linkId} className="border-line rounded-2xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link href={`/sellers/${s.sellerId}`} className="text-ink hover:text-brand text-sm font-bold">{s.name}</Link>
                    <span className="text-muted text-xs">{RELATIONSHIP_LABELS[s.relationshipType] ?? s.relationshipType}{s.ownershipPercentage != null ? ` · ${s.ownershipPercentage}%` : ""}</span>
                    {s.trustScore != null && <span className="text-muted text-[11px]">אמון {s.trustScore}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {s.isPrimary ? <Badge tone="brand" size="sm">ראשי</Badge> : <button type="button" className="text-muted hover:text-brand text-[11px]" onClick={() => run(() => setPropertySellerRoleAction(s.linkId, propertyId, { is_primary: true }))}>הפוך לראשי</button>}
                    <button type="button" className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", s.isDecisionMaker ? "bg-brand-soft text-brand-strong" : "bg-surface text-muted")} onClick={() => run(() => setPropertySellerRoleAction(s.linkId, propertyId, { is_decision_maker: !s.isDecisionMaker }))}>מקבל החלטות</button>
                    <button type="button" className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", s.canSign ? "bg-brand-soft text-brand-strong" : "bg-surface text-muted")} onClick={() => run(() => setPropertySellerRoleAction(s.linkId, propertyId, { can_sign: !s.canSign }))}>מורשה חתימה</button>
                    <button type="button" className="text-muted hover:text-danger" aria-label="הסר" onClick={() => run(() => unlinkSellerFromPropertyAction(s.linkId, propertyId))}><Icon name="Minus" size={15} /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Search & link existing */}
      <div className="bg-surface rounded-2xl p-4">
        <p className="text-ink mb-2 text-sm font-bold">קשר מוכר קיים</p>
        <div className="flex gap-2">
          <input className={field} placeholder="חיפוש לפי שם / טלפון / אימייל" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          <Button size="sm" variant="secondary" onClick={search} disabled={pending}>חפש</Button>
        </div>
        {results.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {results.map((r) => (
              <li key={r.id} className="bg-card border-line flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                <span className="text-ink font-semibold">{r.fullName} <span className="text-muted text-xs">{r.phone ?? ""}</span></span>
                <Button size="sm" onClick={() => link(r.id)} disabled={pending}>קשר</Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
    </div>
  );
}
