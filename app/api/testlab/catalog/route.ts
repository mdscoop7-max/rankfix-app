import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {isInternalTester} from "@/lib/scan-access";
import a from "@/tests/fixtures/testlab-96/round-a.json";
import b from "@/tests/fixtures/testlab-96/round-b.json";
import c from "@/tests/fixtures/testlab-96/round-c-nieuw.json";
import d from "@/tests/fixtures/testlab-96/round-d-nieuw.json";
import e from "@/tests/fixtures/testlab-144/round-e-service-retail.json";
import f from "@/tests/fixtures/testlab-144/round-f-service-retail.json";
import {scanRuntime} from "@/lib/scan-runtime";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") {
    return NextResponse.json({error:"QA_ONLY"},{status:404});
  }
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try { user=await getCurrentUser(); } catch { return NextResponse.json({error:"QA_AUTH_UNAVAILABLE"},{status:503}); }
  if (!user || !isInternalTester(user.id)) return NextResponse.json({error:"INTERNAL_TESTER_REQUIRED"},{status:403});
  const rounds=[a,b,c,d,e,f];
  const sites=rounds.flatMap(round=>round.sites.map(site=>({
    host:site.hosts[0],name:site.name,country:site.country,
    expected:site.expected,group:site.group,round:round.id,
  })));
  const keys=new Set(sites.map(site=>site.host.toLowerCase().replace(/^www\./,"")));
  if (sites.length!==144 || keys.size!==144) return NextResponse.json({error:"CATALOG_INTEGRITY_FAILED"},{status:503});
  return NextResponse.json({
    sites, count:sites.length, labels:"proposed_not_independently_verified",
    runtime:scanRuntime(),
    instruction:"Reads public websites only. Does not change customer sites. Start is always manual."
  },{headers:{"Cache-Control":"no-store"}});
}
