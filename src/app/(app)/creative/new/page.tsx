import { redirect } from "next/navigation";
import { isUuid } from "@/lib/utils";

/**
 * Launch ZONO Creative preloaded with a property (or any entity). Validates the
 * id is a real UUID, then opens the entity studio — which loads the property's
 * media + brand profile automatically. No manual UUID/URL (#P3-4).
 * /creative/new?type=property_sale_post&propertyId=<uuid>
 */
export default async function CreativeNewPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; propertyId?: string; entityType?: string; entityId?: string }>;
}) {
  const sp = await searchParams;
  const propertyId = sp.propertyId && isUuid(sp.propertyId) ? sp.propertyId : null;
  const entityType = sp.entityType || (propertyId ? "property" : null);
  const entityId = propertyId ?? (isUuid(sp.entityId) ? sp.entityId : null);
  if (entityType && entityId) redirect(`/creative-studio/${entityType}/${entityId}`);
  redirect("/creative-studio");
}
