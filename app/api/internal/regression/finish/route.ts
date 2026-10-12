import { NextResponse } from "next/server";
import { regressionGuard } from "@/lib/regression/auth";
import { productionDeps } from "@/lib/regression/deps";
import { finishRegressionRun } from "@/lib/regression/service";

// Compares the run with the baselines, stores totals and sends at most one
// bundled notification when there are real regressions.
export async function POST(request: Request) {
  const denied = regressionGuard(request.headers.get("authorization"));
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const body = await request.json().catch(() => ({}));
  const result = await finishRegressionRun(productionDeps(String(body?.runKey || "")), body?.runKey);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
