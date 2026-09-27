import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { auditSite } from "@/lib/site-audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in om websites te vergelijken." }, { status: 401 });
  try {
    const body = await request.json();
    const website = typeof body?.website === "string" ? body.website.trim() : "";
    const competitor = typeof body?.competitor === "string" ? body.competitor.trim() : "";
    if (!website || !competitor) return NextResponse.json({ error: "Vul je website en een concurrent in." }, { status: 400 });
    const [own, other] = await Promise.all([auditSite(website, "QUICK"), auditSite(competitor, "QUICK")]);
    const active = (a: typeof own) => a.issues.filter(i => i.status === "FAIL" || i.status === "WARNING");
    const ownIssues = active(own), competitorIssues = active(other);
    const competitorPasses = new Set(other.issues.filter(i => i.status === "PASS").map(i => i.rule_id));
    const opportunities = ownIssues.filter(i => competitorPasses.has(i.rule_id)).slice(0, 8).map(i => ({
      rule_id:i.rule_id,title:i.title,severity:i.severity,recommendation:i.recommendation
    }));
    return NextResponse.json({
      website:{url:own.finalUrl,scores:own.scores,issues:ownIssues.length,pages:own.crawl.pages},
      competitor:{url:other.finalUrl,scores:other.scores,issues:competitorIssues.length,pages:other.crawl.pages},
      opportunities
    });
  } catch (error) {
    return NextResponse.json({ error:"De vergelijking kon niet worden uitgevoerd.", code:error instanceof Error?error.message:"COMPARE_FAILED" }, { status:502 });
  }
}
