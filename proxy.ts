import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { testGateDecision } from "./lib/test-gate";

const LOCALE_ROUTE = /^\/(?:(nl|en|fr|es|it|de)(?:\/|$)|$)/;

export function proxy(request: NextRequest) {
  // Test deployments only: no page, API or asset is served without the gate password.
  if (testGateDecision(request.headers.get("authorization"), process.env.RANKFIX_TEST_GATE_PASSWORD) === "challenge") {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="RankFix test", charset="UTF-8"', "Cache-Control": "no-store" },
    });
  }
  const pathname = request.nextUrl.pathname;
  const locale = LOCALE_ROUTE.exec(pathname);
  if (!locale) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set("x-rankfix-pathname", pathname);
  if (locale[1]) headers.set("x-rankfix-language", locale[1]);
  return NextResponse.next({ request: { headers } });
}

// Every route, so the optional test gate covers pages, API routes and assets alike.
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
