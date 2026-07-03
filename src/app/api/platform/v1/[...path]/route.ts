// ============================================================================
// 🔌 ZONO Platform API — v1 catch-all gateway route. 31.0.
// Authenticates the API key, enforces scope + rate limit, dispatches to the
// existing services, audits. GET = reads; POST = AI + approval-gated actions.
// ============================================================================
import { NextResponse } from "next/server";
import { handleApiRequest } from "@/lib/platform-api/server/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ipOf(req: Request): string | null {
  const h = req.headers.get("x-forwarded-for");
  return h ? h.split(",")[0].trim() : null;
}

async function run(method: "GET" | "POST", req: Request) {
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (method === "POST") { try { body = (await req.json()) as Record<string, unknown>; } catch { body = {}; } }
  const { status, json } = await handleApiRequest(method, url, req.headers.get("authorization"), ipOf(req), body);
  return NextResponse.json(json, { status });
}

export async function GET(req: Request) { return run("GET", req); }
export async function POST(req: Request) { return run("POST", req); }
