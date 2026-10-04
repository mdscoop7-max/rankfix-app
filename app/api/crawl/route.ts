import { NextResponse } from "next/server";
import { crawlSite, type CrawlMode } from "@/lib/crawler";
import { getCurrentUser } from "@/lib/auth";

const modes = new Set(["QUICK","STANDARD","DEEP","ECOMMERCE","ENTERPRISE"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in om een volledige crawl te starten." }, { status: 401 });
  try {
    const body = await request.json();
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const mode = typeof body?.mode === "string" && modes.has(body.mode) ? body.mode as CrawlMode : "STANDARD";
    if (!url) return NextResponse.json({ error: "Vul een website URL in." }, { status: 400 });
    const result = await crawlSite(url, mode);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Crawl mislukt." }, { status: 422 });
  }
}
