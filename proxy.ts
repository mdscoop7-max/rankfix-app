import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const language = request.nextUrl.pathname.split("/")[1];
  const headers = new Headers(request.headers);
  if (/^(nl|en|fr|es|it|de)$/.test(language)) headers.set("x-rankfix-language", language);
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/:locale(nl|en|fr|es|it|de)/:path*"] };
