import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { githubOAuthConfiguration } from "@/lib/github-oauth-navigation";

export async function GET(request: Request) {
  if (!await getCurrentUser()) return NextResponse.json({ ready: false }, { status: 401 });
  return NextResponse.json(githubOAuthConfiguration(new URL(request.url).origin, process.env), { headers: { "Cache-Control": "no-store" } });
}
