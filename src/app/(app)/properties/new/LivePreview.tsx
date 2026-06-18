"use client";

import Image from "next/image";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { formatShekels } from "@/lib/utils";
import {
  PROPERTY_STATUS_LABELS,
  PROPERTY_STATUS_TONES,
  PROPERTY_TYPE_LABELS,
} from "@/lib/properties/labels";
import type { PropertyInput } from "@/lib/properties/types";

const TAG_LABELS: Record<string, string> = {
  new: "חדש",
  exclusive: "בלעדי",
  opportunity: "בהזדמנות",
  premium: "פרימיום",
  sold: "נמכר",
};

export function LivePreview({
  form,
  primaryImageUrl,
  agentName,
}: {
  form: PropertyInput;
  primaryImageUrl: string | null;
  agentName: string;
}) {
  const place = [form.neighborhood, form.city].filter(Boolean).join(", ") || "—";
  const desc = form.marketingDescription || form.description || "";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted text-xs font-bold">כך המודעה תיראה למתעניינים</p>
      <div className="bg-card border-line overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)]">
        <div className="relative h-40 w-full bg-gradient-to-br from-violet-200 via-purple-100 to-indigo-200">
          {primaryImageUrl && (
            <Image src={primaryImageUrl} alt="" fill className="object-cover" unoptimized />
          )}
          <div className="absolute inset-x-3 top-3 flex items-center justify-between">
            {form.listingTag ? (
              <span className="bg-brand rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                {TAG_LABELS[form.listingTag] ?? form.listingTag}
              </span>
            ) : (
              <span />
            )}
            <Badge tone={PROPERTY_STATUS_TONES[form.status]} size="sm">
              {PROPERTY_STATUS_LABELS[form.status]}
            </Badge>
          </div>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <p className="text-brand-strong text-lg font-black">
            {form.price ? formatShekels(form.price) : "מחיר לא הוזן"}
          </p>
          <h3 className="text-ink text-base font-extrabold leading-snug">
            {form.title?.trim() || "כותרת הנכס"}
          </h3>
          <p className="text-muted text-sm">
            {PROPERTY_TYPE_LABELS[form.type]} · {place}
          </p>
          <div className="text-muted flex items-center gap-3 text-xs font-medium">
            <span>{form.rooms ?? "—"} חד׳</span>
            <span className="bg-line h-3 w-px" />
            <span>{form.sizeSqm ?? "—"} מ״ר</span>
            <span className="bg-line h-3 w-px" />
            <span>קומה {form.floor ?? "—"}</span>
            {form.hasParking && (
              <>
                <span className="bg-line h-3 w-px" />
                <span>חניה</span>
              </>
            )}
          </div>
          {desc && <p className="text-muted line-clamp-3 text-xs leading-relaxed">{desc}</p>}
          <div className="border-line mt-1 flex items-center gap-2 border-t pt-3">
            <span className="from-brand to-brand-light grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br text-xs font-black text-white">
              {agentName.charAt(0)}
            </span>
            <span className="text-ink text-xs font-bold">{agentName}</span>
            <Icon name="MessageCircle" size={14} className="text-muted ms-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
