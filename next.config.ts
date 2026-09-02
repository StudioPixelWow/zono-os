import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Supabase Storage public URLs (property-media bucket).
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },
  // Clean URL for the standalone marketing / signup landing page.
  // The page itself is a self-contained static file at public/start.html
  // (its own fonts + styles; intentionally bypasses the app's root layout).
  // /start        → the landing (email capture, "stage 1")
  // /start.html   → also works directly
  async rewrites() {
    return [{ source: "/start", destination: "/start.html" }];
  },
};

export default nextConfig;
