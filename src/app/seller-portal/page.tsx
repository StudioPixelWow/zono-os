// ============================================================================
// 🏷️ ZONO — Seller Portal — entry. 32.4. Redirects to the personal dashboard.
// ============================================================================
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function SellerPortalIndex() { redirect("/seller-portal/dashboard"); }
