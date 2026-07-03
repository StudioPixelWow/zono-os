// ============================================================================
// 🌍 ZONO — Area Portal — robots.txt. 32.5. Part: SEO.
// ============================================================================
import { areaRobotsTxt } from "@/lib/area-portal";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return new Response(areaRobotsTxt(origin), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
