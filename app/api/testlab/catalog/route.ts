import {NextRequest,NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {isInternalTester} from "@/lib/scan-access";
import a from "@/tests/fixtures/testlab-96/round-a.json";
import b from "@/tests/fixtures/testlab-96/round-b.json";
import c from "@/tests/fixtures/testlab-96/round-c-nieuw.json";
import d from "@/tests/fixtures/testlab-96/round-d-nieuw.json";
import e from "@/tests/fixtures/testlab-144/round-e-service-retail.json";
import f from "@/tests/fixtures/testlab-144/round-f-service-retail.json";
import commerce from "@/tests/fixtures/testlab-144/catalog-commerce-diverse-20261026.json";
import {scanRuntime} from "@/lib/scan-runtime";

export async function GET(request:NextRequest) {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") {
    return NextResponse.json({error:"QA_ONLY"},{status:404});
  }
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try { user=await getCurrentUser(); } catch { return NextResponse.json({error:"QA_AUTH_UNAVAILABLE"},{status:503}); }
  if (!user || !isInternalTester(user.id)) return NextResponse.json({error:"INTERNAL_TESTER_REQUIRED"},{status:403});
  const catalogId=request.nextUrl.searchParams.get("catalog") || "baseline";
  if(!["baseline","commerce"].includes(catalogId))
    return NextResponse.json({error:"UNKNOWN_TESTLAB_CATALOG"},{status:400});
  const rounds=[a,b,c,d,e,f];
  const sites=catalogId==="commerce"
    ? commerce.sites.map(site=>({
        host:site.hosts[0],name:site.name,country:site.country,
        expected:site.expected,group:site.group,round:site.round,
      }))
    : rounds.flatMap(round=>round.sites.map(site=>({
        host:site.hosts[0],name:site.name,country:site.country,
        expected:site.expected,group:site.group,round:round.id,
      })));
  const keys=new Set(sites.map(site=>site.host.toLowerCase().replace(/^www\./,"")));
  const ecommerceCount=sites.filter(site=>site.expected==="ecommerce").length;
  if(sites.length!==144 || keys.size!==144 || (catalogId==="commerce"&&ecommerceCount!==72))
    return NextResponse.json({error:"CATALOG_INTEGRITY_FAILED"},{status:503});
  return NextResponse.json({
    sites, count:sites.length, catalogId,
    categoryCounts:{webshops:ecommerceCount,other:sites.length-ecommerceCount},
    labels:"proposed_not_independently_verified",
    runtime:scanRuntime(),
    instruction:"Reads public websites only. Does not change customer sites. Start is always manual."
  },{headers:{"Cache-Control":"no-store"}});
}
