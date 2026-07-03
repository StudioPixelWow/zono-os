// ============================================================================
// 🛒 ZONO — Buyer Portal — entry. 32.3. Redirects to the personal dashboard.
// ============================================================================
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function BuyerPortalIndex() { redirect("/buyer-portal/dashboard"); }
