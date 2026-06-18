import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { createPropertyAction } from "@/lib/properties/actions";
import { PropertyForm } from "../PropertyForm";

export const dynamic = "force-dynamic";

export default function NewPropertyPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/properties"
          className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold"
        >
          <Icon name="ChevronRight" size={16} />
          חזרה לנכסים
        </Link>
        <h1 className="text-ink mt-2 text-2xl font-black">נכס חדש</h1>
      </div>

      <PropertyForm
        submitLabel="צור נכס"
        cancelHref="/properties"
        onSubmit={createPropertyAction}
      />
    </div>
  );
}
