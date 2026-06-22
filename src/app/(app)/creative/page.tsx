import { redirect } from "next/navigation";

// ZONO קריאייטיב — canonical short entry. Opens the creative landing directly
// (no UUID required); entity is chosen from a dropdown there.
export default function CreativeEntry() {
  redirect("/creative-studio");
}
