// ============================================================================
// 📱 ZONO — PWA Web App Manifest (installability). PHASE 57.0.
// Served at /manifest.webmanifest. Built from the pure mobile-os manifest.
// ============================================================================
import type { MetadataRoute } from "next";
import { buildManifest } from "@/lib/mobile-os";

export default function manifest(): MetadataRoute.Manifest {
  return buildManifest() as MetadataRoute.Manifest;
}
