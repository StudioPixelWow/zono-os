// ============================================================================
// 🔌 ZONO Platform API — OpenAPI 3.1 document. 31.0. Part 7.
// Public docs endpoint (no auth) describing every exposed endpoint + bearer auth.
// ============================================================================
import { NextResponse } from "next/server";
import { buildOpenApi } from "@/lib/platform-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return NextResponse.json(buildOpenApi(origin));
}
