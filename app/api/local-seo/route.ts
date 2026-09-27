import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { auditSite } from "@/lib/site-audit";

export async function POST(request: Request) {
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:"Log in om een Local SEO scan uit te voeren."},{status:401});
 try{
  const body=await request.json();const url=typeof body?.url==="string"?body.url.trim():"";
  if(!url)return NextResponse.json({error:"Vul een website URL in."},{status:400});
  const audit=await auditSite(url,"QUICK");
  const localPages=audit.page_types.local_business||0;
  const localRule=audit.issues.find(i=>i.rule_id==="SITE_LOCAL_BUSINESS_IDENTITY");
  const schemaRule=audit.issues.find(i=>i.rule_id==="SITE_STRUCTURED_DATA_MISSING");
  const checks=[
   {id:"local-signals",title:"Lokale bedrijfssignalen",status:localPages>0?"PASS":"WARNING",detail:localPages>0?`${localPages} lokale bedrijfspagina('s) herkend.`:"Geen pagina met voldoende lokale bedrijfssignalen herkend. Controleer of naam, locatie en contactinformatie duidelijk zichtbaar zijn."},
   {id:"local-schema",title:"LocalBusiness structured data",status:localRule?.status||"NOT_APPLICABLE",detail:localRule?.evidence.examples[0]?.details||localRule?.description||"Niet van toepassing."},
   {id:"structured-data",title:"Structured data",status:schemaRule?.status||"NOT_APPLICABLE",detail:schemaRule?.evidence.examples[0]?.details||schemaRule?.description||"Niet van toepassing."}
  ];
  const penalties=checks.reduce((n,c)=>n+(c.status==="FAIL"?30:c.status==="WARNING"?15:0),0);
  return NextResponse.json({url:audit.finalUrl,score:Math.max(0,100-penalties),checks,crawl:audit.crawl,notice:"RankFix beoordeelt alleen signalen die op de website zelf aantoonbaar zijn. Google Business Profile, reviews en externe directories zijn nog niet gekoppeld."});
 }catch(error){return NextResponse.json({error:"De Local SEO scan kon niet worden uitgevoerd.",code:error instanceof Error?error.message:"LOCAL_SCAN_FAILED"},{status:502})}
}
