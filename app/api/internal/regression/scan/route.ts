import { NextResponse } from "next/server";
import { regressionGuard } from "@/lib/regression/auth";
import { productionDeps } from "@/lib/regression/deps";
import { scanRegressionSite } from "@/lib/regression/service";

// One site per invocation keeps every call inside the function limit and at
// most one browser per call; the runner calls sites one after another.
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = regressionGuard(request.headers.get("authorization"));
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const body = await request.json().catch(() => ({}));
  const runKey = String(body?.runKey || "");
  const result = await scanRegressionSite(productionDeps(runKey, String(body?.siteId || "")), body?.runKey, body?.siteId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
