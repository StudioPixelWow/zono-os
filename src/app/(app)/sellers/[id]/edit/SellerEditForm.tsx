"use client";

import { Seller360Form } from "../../Seller360Form";
import { updateSeller360Action } from "@/lib/sellers/actions";
import type { Seller360Input } from "@/lib/sellers/types";

/**
 * Client wrapper for editing an existing seller. Submits the real
 * `updateSeller360Action`, which writes to Supabase and redirects back to the
 * seller detail page on success. No mock data — `initial` is the live row.
 */
export function SellerEditForm({
  id,
  initial,
}: {
  id: string;
  initial: Partial<Seller360Input>;
}) {
  async function onSubmit(input: Seller360Input) {
    return updateSeller360Action(id, input);
  }

  return (
    <Seller360Form
      initial={initial}
      submitLabel="שמור שינויים"
      cancelHref={`/sellers/${id}`}
      contextNote="עריכת פרופיל מוכר קיים — השינויים יישמרו ויעדכנו את מודיעין המוכר."
      onSubmit={onSubmit}
    />
  );
}
