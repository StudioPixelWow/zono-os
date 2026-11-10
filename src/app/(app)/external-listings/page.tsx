// /external-listings — there is no index view for external listings; the list
// lives at /market-intelligence/listings. Many surfaces (dashboard "לכל הנכסים",
// FirstLoginWow, acquisition) still link here, so redirect instead of 404.
import { redirect } from "next/navigation";

export default function ExternalListingsIndexRedirect() {
  redirect("/market-intelligence/listings");
}
