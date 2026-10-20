import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isDatabaseFreeQaPreview } from "@/lib/database-free-qa";

export async function GET() {
  // QA preview never contacts the account database. This is not an authenticated user.
  if (isDatabaseFreeQaPreview()) return NextResponse.json({ user: null, qaPreview: true, accountLoginAvailable: false }, { headers: { "Cache-Control": "no-store" } });
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // A database or session-service outage must not look like an invalid login.
    // Do not include internal errors or sensitive DB details in the response.
    console.error("Auth session lookup failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: "SESSION_UNAVAILABLE", message: "De sessiecontrole is tijdelijk niet beschikbaar. Probeer opnieuw." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
