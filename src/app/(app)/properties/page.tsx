// ============================================================================
// /properties — legacy mixed experience REMOVED.
// ----------------------------------------------------------------------------
// The old single page mixed personal CRM, office inventory and external market
// listings via tabs. That is now split into three independent workspaces:
//   🏠 /my-properties  🏢 /office-inventory  🌍 /market-intelligence
// This route redirects to the personal workspace so old links/bookmarks keep
// working. The shared view components in this folder (PropertiesListView,
// PropertiesOSView, ExternalListingsView) are reused by the new workspaces.
// The detail (/properties/[id]) and create (/properties/new) routes are intact.
// ============================================================================
import { redirect } from "next/navigation";

export default function PropertiesIndexRedirect() {
  redirect("/my-properties");
}
