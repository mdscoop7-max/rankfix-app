import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { decryptToken, githubFetch } from "@/lib/github";
import { validateFix } from "@/lib/seo-fix-validator";

function safeRepo(v:string){ return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v) && !v.includes(".."); }
function safePath(v:string){ return v.length>0 && v.length<240 && !v.startsWith("/") && !v.split("/").includes("..") && !/[<>:"|?*]/.test(v); }
function slug(v:string){ return v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,42)||"seo-fix"; }

async function generateCodeFix(filePath:string,fileContent:string,issue:string,context:string){
  const key=process.env.OPENAI_API_KEY;
  if(!key) throw new Error("OPENAI_API_KEY ontbreekt.");
  const model=process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const input=[
    "You are RankFix AI. Modify this repository file to implement exactly one SEO/GEO fix.",
    "Return ONLY valid JSON: {summary:string,content:string}. content is the COMPLETE replacement file, not a diff.",
    "Preserve behavior and make the smallest safe change. Never invent business facts or add secrets.",
    "Do not modify dependencies or unrelated functionality.",
    "File: "+filePath,
    "Issue: "+issue,
    "Context: "+context.slice(0,6000),
    "CURRENT FILE:",
    fileContent.slice(0,120000)
  ].join("\n\n");
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
    body:JSON.stringify({model,input,max_output_tokens:12000})
  });
  if(!response.ok) throw new Error("AI kon de codefix niet genereren.");
  const data=await response.json();
  const text=typeof data?.output_text==="string"?data.output_text:data?.output?.flatMap((x:any)=>x?.content||[]).map((x:any)=>x?.text||"").join("")||"";
  const clean=text.replace(/^\`\`\`json\s*/i,"").replace(/\s*\`\`\`$/,"").trim();
  const parsed=JSON.parse(clean);
  if(typeof parsed.content!=="string"||typeof parsed.summary!=="string") throw new Error("AI-output is ongeldig.");
  return parsed;
}

export async function POST(request:Request){
  try{
    const user=await getCurrentUser();
    if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
    const GITHUB_FIX_COST = 5;
    if(user.credits<GITHUB_FIX_COST) return NextResponse.json({error:`Minimaal ${GITHUB_FIX_COST} credits nodig voor een GitHub fix. Je hebt ${user.credits}.`},{status:402});
    const body=await request.json();
    const repo=typeof body?.repo==="string"?body.repo.trim():"";
    const path=typeof body?.path==="string"?body.path.trim():"";
    const issue=typeof body?.issue==="string"?body.issue.trim():"";
    const context=typeof body?.context==="string"?body.context:"";
    const baseBranch=typeof body?.baseBranch==="string"&&/^[A-Za-z0-9._/-]{1,120}$/.test(body.baseBranch)?body.baseBranch:"main";
    if(!safeRepo(repo)||!safePath(path)||!issue) return NextResponse.json({error:"Ongeldige repository, file path of fix-omschrijving."},{status:400});
    const connection=await getDb().query("SELECT access_token_encrypted FROM github_connections WHERE user_id=$1",[user.id]);
    if(!connection.rowCount) return NextResponse.json({error:"Verbind eerst GitHub via je dashboard."},{status:409});
    const token=decryptToken(connection.rows[0].access_token_encrypted);
    const file=await githubFetch<any>(token,"/repos/"+repo+"/contents/"+path+"?ref="+encodeURIComponent(baseBranch));
    if(file.type!=="file"||typeof file.content!=="string") return NextResponse.json({error:"Dit bestand kan niet worden bewerkt."},{status:400});
    const current=Buffer.from(file.content.replace(/\n/g,""),"base64").toString("utf8");
    if(current.length>120000) return NextResponse.json({error:"Bestand is te groot voor een veilige AI-codefix."},{status:413});
    const generated=await generateCodeFix(path,current,issue,context);
    if(generated.content.length>180000) return NextResponse.json({error:"AI-output is te groot voor een veilige wijziging."},{status:422});
    if(!generated.content.trim() || /(?:\{\{[^}]+\}\}|\[YOUR_|\bTODO\b)/i.test(generated.content)) return NextResponse.json({error:"AI-output bevat lege inhoud of placeholders."},{status:422});
    const validated=validateFix({issue_id:"GITHUB_CODE_FIX",rule_id:"GITHUB_CODE_FIX",proposed:generated.content,source:"ai",currentIssue:{issue_id:"GITHUB_CODE_FIX",rule_id:"GITHUB_CODE_FIX",status:"FAIL"},currentValue:current});
    if(!validated.validation.valid) return NextResponse.json({error:"AI-codefix is niet door de validatie gekomen.",validation:validated.validation},{status:422});
    const branch="rankfix/"+Date.now()+"-"+slug(issue);
    const baseRef=await githubFetch<any>(token,"/repos/"+repo+"/git/ref/heads/"+encodeURIComponent(baseBranch));
    await githubFetch<any>(token,"/repos/"+repo+"/git/refs",{method:"POST",body:JSON.stringify({ref:"refs/heads/"+branch,sha:baseRef.object.sha})});
    await githubFetch<any>(token,"/repos/"+repo+"/contents/"+path,{
      method:"PUT",
      body:JSON.stringify({message:"fix: RankFix "+slug(issue),content:Buffer.from(generated.content,"utf8").toString("base64"),branch,sha:file.sha})
    });
    const pr=await githubFetch<any>(token,"/repos/"+repo+"/pulls",{
      method:"POST",
      body:JSON.stringify({title:"RankFix: "+generated.summary.slice(0,70),head:branch,base:baseBranch,body:"## RankFix AI fix\n\n"+generated.summary+"\n\nGenerated by RankFix AI. Review the diff before merging.\n\nTarget: "+path})
    });
    const db=getDb();
    const updated=await db.query("UPDATE users SET credits=credits-$1 WHERE id=$2 AND credits>=$1 RETURNING credits",[GITHUB_FIX_COST,user.id]);
    if(!updated.rowCount) return NextResponse.json({error:"Onvoldoende credits."},{status:402});
    await db.query("INSERT INTO credit_transactions (user_id,amount,reason,reference_id) VALUES ($1,$2,'github_fix',$3)",[user.id,-GITHUB_FIX_COST,String(pr.number)]);
    return NextResponse.json({success:true,summary:generated.summary,branch,pr:{number:pr.number,url:pr.html_url,title:pr.title},creditsCharged:GITHUB_FIX_COST,creditsRemaining:updated.rows[0].credits});
  }catch(error){ return NextResponse.json({error:error instanceof Error?error.message:"GitHub fix mislukt."},{status:500}); }
}
