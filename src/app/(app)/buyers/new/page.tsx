import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { createBuyerAction } from "@/lib/buyers/actions";
import type { BuyerInput } from "@/lib/buyers/types";
import { BuyerForm } from "../BuyerForm";

export const dynamic = "force-dynamic";

export default function NewBuyerPage() {
  async function onSubmit(input: BuyerInput) {
    "use server";
    return createBuyerAction(input);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/buyers"
          className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold"
        >
          <Icon name="ChevronRight" size={16} />
          חזרה לקונים
        </Link>
        <h1 className="text-ink mt-2 text-2xl font-black">קונה חדש</h1>
      </div>

      <BuyerForm submitLabel="צור קונה" cancelHref="/buyers" onSubmit={onSubmit} />
    </div>
  );
}
