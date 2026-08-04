import { NextResponse, type NextRequest } from "next/server";
import { labEnabled } from "@/lib/creative-runtime/lab-runtime";
import { LAB_SESSION_COOKIE } from "../shared";

export const dynamic = "force-dynamic";

// Deterministic test "login": sets a cookie naming a fixture session token
// (alpha-owner / alpha-agent / alpha-inactive / beta-owner / anonymous) and
// bounces back to the workspace. Guarded — 404 outside the test runtime.
const ALLOWED = new Set(["alpha-owner", "alpha-agent", "alpha-inactive", "beta-owner", "anonymous"]);

export async function GET(req: NextRequest) {
  if (!labEnabled()) return new NextResponse("not found", { status: 404 });
  const as = req.nextUrl.searchParams.get("as") ?? "anonymous";
  const token = ALLOWED.has(as) ? as : "anonymous";
  const to = req.nextUrl.searchParams.get("to") === "bulk" ? "/creative-lab/bulk" : "/creative-lab";
  const res = NextResponse.redirect(new URL(to, req.nextUrl.origin));
  res.cookies.set(LAB_SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
