import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { auditSite } from "@/lib/site-audit";
import type { CrawlMode } from "@/lib/crawler";

const modes: CrawlMode[] = ["QUICK","STANDARD","DEEP","ECOMMERCE","ENTERPRISE"];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in om een site-brede audit uit te voeren." }, { status: 401 });

  try {
    const body = await request.json();
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const mode = modes.includes(body?.mode) ? body.mode as CrawlMode : "STANDARD";
    if (!url) return NextResponse.json({ error: "Vul een website URL in." }, { status: 400 });
    const audit = await auditSite(url, mode);
    return NextResponse.json(audit);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Site audit failed";
    return NextResponse.json({ error: "De site-brede audit kon niet worden uitgevoerd.", code: message }, { status: 502 });
  }
}
