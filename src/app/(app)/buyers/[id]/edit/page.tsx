import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { getBuyerById } from "@/lib/buyers/repository";
import { updateBuyerAction } from "@/lib/buyers/actions";
import { buyerPreferences } from "@/lib/buyers/labels";
import type { BuyerInput } from "@/lib/buyers/types";
import { BuyerForm } from "../../BuyerForm";

export const dynamic = "force-dynamic";

export default async function EditBuyerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const b = await getBuyerById(id);
  if (!b) notFound();

  const prefs = buyerPreferences(b);
  const initial: Partial<BuyerInput> = {
    fullName: b.full_name,
    phone: b.phone,
    email: b.email,
    preferredAreas: b.preferred_areas,
    budgetMin: b.budget_min,
    budgetMax: b.budget_max,
    roomsMin: b.rooms_min,
    roomsMax: b.rooms_max,
    preferredTypes: b.preferred_types,
    dealKind: prefs.deal_kind ?? null,
    source: prefs.source ?? null,
    temperature: b.temperature,
    mustHaveElevator: b.must_have_elevator,
    mustHaveParking: b.must_have_parking,
    mustHaveSafeRoom: b.must_have_safe_room,
    notes: b.notes,
  };

  async function onSubmit(input: BuyerInput) {
    "use server";
    return updateBuyerAction(id, input);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href={`/buyers/${id}`}
          className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold"
        >
          <Icon name="ChevronRight" size={16} />
          חזרה לקונה
        </Link>
        <h1 className="text-ink mt-2 text-2xl font-black">עריכת קונה</h1>
      </div>

      <BuyerForm
        initial={initial}
        submitLabel="שמור שינויים"
        cancelHref={`/buyers/${id}`}
        onSubmit={onSubmit}
      />
    </div>
  );
}
