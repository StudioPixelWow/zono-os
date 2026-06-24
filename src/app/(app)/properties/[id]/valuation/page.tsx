import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Property-scoped valuation entry. Hands off to the wizard pre-filled from the
 * property (the wizard reads ?propertyId and prefills location + specs).
 */
export default async function PropertyValuationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/valuation/new?propertyId=${id}`);
}
