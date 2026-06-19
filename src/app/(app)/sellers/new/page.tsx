"use client";

import { use } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Seller360Form } from "../Seller360Form";
import { createSeller360Action } from "@/lib/sellers/actions";
import type { Seller360Input } from "@/lib/sellers/types";

export default function NewSellerPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = use(searchParams);

  async function onSubmit(input: Seller360Input) {
    return createSeller360Action(input, propertyId ?? null);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <Link
          href={propertyId ? `/properties/${propertyId}` : "/sellers"}
          className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold"
        >
          <Icon name="ChevronRight" size={16} />
          {propertyId ? "חזרה לנכס" : "חזרה למוכרים"}
        </Link>
        <h1 className="text-ink mt-2 text-2xl font-black">מוכר חדש — פרופיל 360</h1>
      </div>

      <Seller360Form
        submitLabel={propertyId ? "צור וקשר לנכס" : "צור מוכר"}
        cancelHref={propertyId ? `/properties/${propertyId}` : "/sellers"}
        contextNote={
          propertyId
            ? "המוכר ייווצר ויקושר אוטומטית לנכס כבעלים ומקבל החלטות."
            : "ניתן לקשר נכסים בהמשך דרך עמוד הנכס."
        }
        onSubmit={onSubmit}
      />
    </div>
  );
}
