import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login vereist." }, { status: 401 });

  const { id } = await params;
  await ensureDatabase();

  const result = await getDb().query(
    "SELECT id,scanned_url,final_url,overall_score,seo_score,geo_score,created_at,result FROM scans WHERE id=$1 AND user_id=$2 LIMIT 1",
    [id, user.id]
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Scan niet gevonden." }, { status: 404 });
  }

  const scan=result.rows[0];
  let hostname="";
  try{hostname=new URL(scan.final_url||scan.scanned_url).hostname.toLowerCase().replace(/^www\./,"")}catch{}
  let previous=null;
  if(hostname){
    const candidates=await getDb().query(
      "SELECT id,scanned_url,final_url,overall_score,seo_score,geo_score,created_at,result FROM scans WHERE user_id=$1 AND id<>$2 AND created_at<$3 ORDER BY created_at DESC LIMIT 30",
      [user.id,id,scan.created_at]
    );
    previous=candidates.rows.find((row:any)=>{try{return new URL(row.final_url||row.scanned_url).hostname.toLowerCase().replace(/^www\./,"")===hostname}catch{return false}})||null;
  }
  const issueMap=(value:any)=>{
    const checks=[...(value?.seo?.checks||[]),...(value?.geo?.checks||[])];
    const map=new Map<string,string>();
    for(const check of checks){
      const key=String(check.issue_id||check.rule_id||check.title||"").trim().toLowerCase();
      if(key) map.set(key,String(check.status||"").toLowerCase());
    }
    return map;
  };
  let comparison=null;
  if(previous){
    const now=issueMap(scan.result),before=issueMap(previous.result);
    const isOpen=(s?:string)=>s==="fail"||s==="warning";
    comparison={previous_scan_id:previous.id,previous_created_at:previous.created_at,previous_score:previous.overall_score,
      score_change:Number(scan.overall_score||0)-Number(previous.overall_score||0),
      improved:[...before].filter(([k,s])=>isOpen(s)&&!isOpen(now.get(k))).map(([k])=>k),
      new_issues:[...now].filter(([k,s])=>isOpen(s)&&!isOpen(before.get(k))).map(([k])=>k),
      still_open:[...now].filter(([k,s])=>isOpen(s)&&isOpen(before.get(k))).map(([k])=>k)
    };
  }
  return NextResponse.json({ scan, comparison });
}
