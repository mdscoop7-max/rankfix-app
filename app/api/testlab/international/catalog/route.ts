import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {isInternalTester} from "@/lib/scan-access";
import plan from "@/tests/fixtures/testlab-international/round-g-professions.json";
import a from "@/tests/fixtures/testlab-96/round-a.json";
import b from "@/tests/fixtures/testlab-96/round-b.json";
import c from "@/tests/fixtures/testlab-96/round-c-nieuw.json";
import d from "@/tests/fixtures/testlab-96/round-d-nieuw.json";
import e from "@/tests/fixtures/testlab-144/round-e-service-retail.json";
import f from "@/tests/fixtures/testlab-144/round-f-service-retail.json";
import {scanRuntime} from "@/lib/scan-runtime";

// Separate catalog. Does not modify the immutable 144-site historical baseline.
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") {
    return NextResponse.json({error:"QA_ONLY"},{status:404});
  }
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try { user=await getCurrentUser(); } catch { return NextResponse.json({error:"QA_AUTH_UNAVAILABLE"},{status:503}); }
  if (!user || !isInternalTester(user.id)) return NextResponse.json({error:"INTERNAL_TESTER_REQUIRED"},{status:403});
  const sites=plan.sites.map(site=>({
    host:site.hosts[0],name:site.name,country:site.country,
    expected:site.expected,group:site.group,round:plan.id,
  }));
  const normalize=(host:string)=>host.toLowerCase().replace(/^www\./,"");
  const existing=[a,b,c,d,e,f].flatMap(round=>round.sites.map(s=>normalize(s.hosts[0])));
  const fresh=sites.map(s=>normalize(s.host));
  if (sites.length!==28 || new Set(fresh).size!==28 ||
      fresh.some(host=>existing.includes(host)) || new Set(sites.map(s=>s.country)).size!==14) {
    return NextResponse.json({error:"CATALOG_INTEGRITY_FAILED"},{status:503});
  }
  return NextResponse.json({
    sites,count:sites.length,labels:"proposed_not_independently_verified",
    runtime:scanRuntime(),
    instruction:"Public, read-only websites. Manual start only. Separate from the historical 144-site TestLab."
  },{headers:{"Cache-Control":"no-store"}});
}
