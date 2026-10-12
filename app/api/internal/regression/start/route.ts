import { NextResponse } from "next/server";
import { regressionGuard } from "@/lib/regression/auth";
import { productionDeps } from "@/lib/regression/deps";
import { startRegressionRun } from "@/lib/regression/service";

// Internal, secret-protected and read-only. Starts (or resumes) one nightly
// regression run and returns the approved site list.
export async function POST(request: Request) {
  const denied = regressionGuard(request.headers.get("authorization"));
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const body = await request.json().catch(() => ({}));
  const result = await startRegressionRun(productionDeps(String(body?.runKey || "")), body?.runKey);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
