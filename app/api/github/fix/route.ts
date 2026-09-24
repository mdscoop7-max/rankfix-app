import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { decryptToken, githubFetch } from "@/lib/github";
import { validateFix } from "@/lib/seo-fix-validator";
import { validateGithubFix } from "@/lib/github-fix-validator";

function safeRepo(v:string){ return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v) && !v.includes(".."); }
function safePath(v:string){ return v.length>0 && v.length<240 && !v.startsWith("/") && !v.split("/").includes("..") && !/[<>:"|?*]/.test(v); }

async function chooseRepository(token:string,requested:string,url:string){
  if(requested && safeRepo(requested)) return requested;
  const repos=await githubFetch<any[]>(token,"/user/repos?per_page=100&sort=updated&direction=desc");
  if(!Array.isArray(repos)||!repos.length) throw new Error("Geen GitHub-repository gevonden. Verbind een repository met RankFix.");
  const host=new URL(url).hostname.toLowerCase().replace(/^www\./,"");
  const tokens=host.split(".").filter((x)=>x.length>2);
  const scored=repos.map((r:any)=>{ const name=String(r.full_name||"").toLowerCase(); const hits=tokens.filter((t)=>name.includes(t)).length; return {name:r.full_name,score:hits}; }).sort((a,b)=>b.score-a.score);
  return scored[0]?.name || repos[0].full_name;
}

async function chooseFile(token:string,repo:string,branch:string,requested:string,issue:string){
  if(requested && safePath(requested)) return requested;
  const issueText=issue.toLowerCase();
  const preferred=issueText.includes("social")||issueText.includes("open graph")
    ? ["templates/index.html","index.html","app/layout.tsx","src/app/layout.tsx","pages/_document.tsx","app/page.tsx","src/app/page.tsx"]
    : issueText.includes("canonical")
      ? ["templates/index.html","index.html","app/layout.tsx","src/app/layout.tsx","pages/_document.tsx","app/page.tsx","src/app/page.tsx"]
      : ["templates/index.html","index.html","app/layout.tsx","src/app/layout.tsx","pages/_document.tsx","app/page.tsx","src/app/page.tsx"];
  for(const candidate of preferred){
    try{ const f=await githubFetch<any>(token,"/repos/"+repo+"/contents/"+candidate+"?ref="+encodeURIComponent(branch)); if(f.type==="file"&&typeof f.content==="string") return candidate; }catch{}
  }
  const tree=await githubFetch<any>(token,"/repos/"+repo+"/git/trees/"+encodeURIComponent(branch)+"?recursive=1");
  const files=Array.isArray(tree?.tree)?tree.tree.filter((x:any)=>x.type==="blob"&&typeof x.path==="string"&&safePath(x.path)):[];
  const ranked=files.map((f:any)=>{ const p=f.path.toLowerCase(); let score=0; if(/(index|layout|document)/.test(p)) score+=5; if(/\.(html?|tsx|jsx|vue|php)$/.test(p)) score+=3; if(issueText.includes("social")&&/(head|layout|index|document)/.test(p)) score+=5; if(issueText.includes("canonical")&&/(head|layout|index|document)/.test(p)) score+=5; if(p.includes("template")) score+=2; return {path:f.path,score}; }).sort((a:any,b:any)=>b.score-a.score);
  if(!ranked[0]) throw new Error("RankFix kon geen geschikt bestand vinden voor deze fix.");
  return ranked[0].path;
}
function slug(v:string){ return v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,42)||"seo-fix"; }
function normalizeHostname(value:string){
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; }
}
function normalizeScanUrl(value:string){
  try {
    const url=new URL(value);
    url.hash="";
    url.hostname=url.hostname.toLowerCase().replace(/^www\./,"");
    url.pathname=url.pathname.replace(/\/+$/,"")||"/";
    return url.toString();
  } catch { return value.trim().replace(/\/+$/,""); }
}

function validateCanonicalTarget(proposed:string,targetUrl:string): string[] {
  const errors:string[]=[];
  const canonical=proposed.match(/alternates\s*:\s*\{[\s\S]*?canonical\s*:\s*[\"']([^\"']+)[\"']/i)?.[1]
    || proposed.match(/<link\s+rel=[\"']canonical[\"']\s+href=[\"']([^\"']+)[\"']/i)?.[1]
    || "";
  if(!canonical) return errors;
  const targetHost=normalizeHostname(targetUrl);
  const canonicalHost=normalizeHostname(canonical);
  if(!targetHost || !canonicalHost || canonicalHost!==targetHost){
    errors.push("Canonical-URL wijst naar een ander domein dan de gescande site.");
  }
  return errors;
}
function validateRequestedFixCompletion(current:string, proposed:string, issue:string): { errors:string[]; currentAlreadySatisfied:boolean } {
  const text=issue.toLowerCase();
  const errors:string[]=[];
  const wantsOgTitle=/og[: -]?title|open graph.*title/.test(text);
  const wantsOgDescription=/og[: -]?description|open graph.*description/.test(text);
  const wantsOgImage=/og[: -]?image|open graph.*image/.test(text);
  const hasOgTitle=(v:string)=>/(?:property|name)\s*=\s*["']og:title["'][^>]*content\s*=\s*["'][^"']+["']/i.test(v)||/openGraph\s*:\s*\{[\s\S]*?title\s*:\s*["'][^"']+["']/i.test(v);
  const hasOgDescription=(v:string)=>/(?:property|name)\s*=\s*["']og:description["'][^>]*content\s*=\s*["'][^"']+["']/i.test(v)||/openGraph\s*:\s*\{[\s\S]*?description\s*:\s*["'][^"']+["']/i.test(v);
  const hasOgImage=(v:string)=>/(?:property|name)\s*=\s*["']og:image["'][^>]*content\s*=\s*["'][^"']+["']/i.test(v)||/openGraph\s*:\s*\{[\s\S]*?(?:images|image)\s*:\s*[^}]+/i.test(v);
  const checks=[[wantsOgTitle,hasOgTitle,"og:title"],[wantsOgDescription,hasOgDescription,"og:description"],[wantsOgImage,hasOgImage,"og:image"]] as const;
  let requestedCount=0; let currentSatisfied=0;
  for(const [requested,checker,label] of checks){ if(!requested) continue; requestedCount++; if(checker(current)) currentSatisfied++; if(!checker(proposed)) errors.push("De gevraagde verbetering voor "+label+" staat niet in de voorgestelde code."); }
  return {errors,currentAlreadySatisfied:requestedCount>0&&currentSatisfied===requestedCount};
}


async function generateCodeFix(filePath:string,fileContent:string,issue:string,context:string){
  const key=process.env.OPENAI_API_KEY?.trim();
  if(!key) throw new Error("OPENAI_API_KEY ontbreekt in de Render runtime. Controleer Environment Variables van rankfix-app en deploy opnieuw.");
  const model=process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
  const input=[
    "You are RankFix AI. Modify this repository file to implement exactly one SEO/GEO fix.",
    "Return ONLY valid JSON: {summary:string,content:string}. content is the COMPLETE replacement file, not a diff.",
    "Preserve behavior and make the smallest safe change. Never invent business facts, branding, URLs, image files, or add secrets.",
    "Do not change existing site identity, brand name, metadata title, or metadata description unless the issue explicitly requests a rebrand.",
    "If the scan context contains an existing live-site OG image URL, you may use that exact URL for og:image; do not invent a different image URL.",
    "Do not modify dependencies or unrelated functionality.",
    "File: "+filePath,
    "Issue: "+issue,
    "Context: "+context.slice(0,6000),
    "CURRENT FILE:",
    fileContent.slice(0,120000)
  ].join("\n\n");
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
    body:JSON.stringify({model,input,max_output_tokens:12000})
  });
  if(!response.ok){
    const errorText=await response.text();
    let detail="";
    try{
      const parsed=JSON.parse(errorText);
      detail=typeof parsed?.error?.message==="string"?parsed.error.message:errorText.slice(0,500);
    }catch{
      detail=errorText.slice(0,500);
    }
    throw new Error(`OpenAI API fout (${response.status}): ${detail}`);
  }
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
    const configuredCost = Math.max(0, Number.parseInt(process.env.GITHUB_FIX_COST || "5", 10) || 5);
    const freeTestEmails = (process.env.GITHUB_FIX_FREE_TEST_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const currentEmail = String(user.email || "").trim().toLowerCase();
    const isConfiguredFreeTestUser = freeTestEmails.includes(currentEmail);
    const isTestAccount = currentEmail === "mdscoop7@gmail.com";
    const GITHUB_FIX_COST = isConfiguredFreeTestUser || isTestAccount ? 0 : configuredCost;
    if(GITHUB_FIX_COST > 0 && user.credits < GITHUB_FIX_COST) return NextResponse.json({error:`Minimaal ${GITHUB_FIX_COST} credits nodig voor een GitHub fix. Je hebt ${user.credits}.`},{status:402});
    const body=await request.json();
    const requestedRepo=typeof body?.repo==="string"?body.repo.trim():"";
    const requestedPath=typeof body?.path==="string"?body.path.trim():"";
    const issue=typeof body?.issue==="string"?body.issue.trim():"";
    const context=typeof body?.context==="string"?body.context:"";
    const baseBranch=typeof body?.baseBranch==="string"&&/^[A-Za-z0-9._/-]{1,120}$/.test(body.baseBranch)?body.baseBranch:"main";
    if((requestedRepo&&!safeRepo(requestedRepo))||(requestedPath&&!safePath(requestedPath))||!issue) return NextResponse.json({error:"Ongeldige fixgegevens."},{status:400});
    await ensureDatabase();
    const connection=await getDb().query("SELECT access_token_encrypted FROM github_connections WHERE user_id=$1",[user.id]);
    if(!connection.rowCount) return NextResponse.json({error:"Verbind eerst GitHub via je dashboard."},{status:409});
    const token=decryptToken(connection.rows[0].access_token_encrypted);
    const repo=await chooseRepository(token,requestedRepo,typeof body?.url==="string"?body.url:"https://example.com");
    const path=await chooseFile(token,repo,baseBranch,requestedPath,issue);
    const file=await githubFetch<any>(token,"/repos/"+repo+"/contents/"+path+"?ref="+encodeURIComponent(baseBranch));
    if(file.type!=="file"||typeof file.content!=="string") return NextResponse.json({error:"Dit bestand kan niet worden bewerkt."},{status:400});
    const current=Buffer.from(file.content.replace(/\n/g,""),"base64").toString("utf8");
    if(current.length>120000) return NextResponse.json({error:"Bestand is te groot voor een veilige AI-codefix."},{status:413});
    const generated=await generateCodeFix(path,current,issue,context);
    if(generated.content.length>180000) return NextResponse.json({error:"AI-output is te groot voor een veilige wijziging."},{status:422});
    if(!generated.content.trim() || /(?:\[YOUR_[^\]]*\]|\bTODO\b|CHANGE_ME|REPLACE_ME|INSERT_[A-Z_]+)/i.test(generated.content)) return NextResponse.json({error:"AI-output bevat lege inhoud of placeholders."},{status:422});
    // GitHub fixes contain a complete source file, not a single SEO field.
    // The SEO value validator is intentionally not applied to the whole file,
    // because it can mistake unrelated source-code text for placeholders/field markup.
    const githubValidation=validateGithubFix({current,proposed:generated.content,filePath:path,issue});
    const canonicalErrors=validateCanonicalTarget(generated.content,typeof body?.url==="string"?body.url:"");
    if(canonicalErrors.length) githubValidation.errors.push(...canonicalErrors);

    const completion=validateRequestedFixCompletion(current,generated.content,issue);
    if(completion.errors.length) githubValidation.errors.push(...completion.errors);
    if(!githubValidation.valid) return NextResponse.json({error:"AI-codefix is geblokkeerd door de GitHub veiligheidscontrole.",validation:githubValidation},{status:422});

    if(completion.currentAlreadySatisfied){
      return NextResponse.json({success:true,alreadyApplied:true,status:"already_ok",summary:"Deze verbetering is al aanwezig. RankFix hoefde niets aan te passen.",repository:repo,path,creditsCharged:0,creditsRemaining:user.credits});
    }

    const normalizeFile=(value:string)=>value.replace(/\r\n/g,"\n").replace(/[ \t]+$/gm,"").trim();
    if(normalizeFile(current)===normalizeFile(generated.content)){
      return NextResponse.json({success:false,status:"fix_not_applied",error:"RankFix kon de gevraagde verbetering niet aantoonbaar in het bestand plaatsen. Er is niets gewijzigd en er zijn geen credits gebruikt.",repository:repo,path,creditsCharged:0,creditsRemaining:user.credits},{status:422});
    }

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
    let creditsRemaining=user.credits;
    if(GITHUB_FIX_COST>0){
      const updated=await db.query("UPDATE users SET credits=credits-$1 WHERE id=$2 AND credits>=$1 RETURNING credits",[GITHUB_FIX_COST,user.id]);
      if(!updated.rowCount) return NextResponse.json({error:"Onvoldoende credits."},{status:402});
      creditsRemaining=updated.rows[0].credits;
      await db.query("INSERT INTO credit_transactions (user_id,amount,reason,reference_id) VALUES ($1,$2,'github_fix',$3)",[user.id,-GITHUB_FIX_COST,String(pr.number)]);
    }

    const scannedUrl = typeof body?.url === "string" ? normalizeScanUrl(body.url) : "";
    const issueId = String(body?.issue_id || "").trim();
    if (scannedUrl && issueId) {
      await db.query(
        "INSERT INTO pending_fixes (user_id,scanned_url,issue_id,status,repository,file_path,pr_number) VALUES ($1,$2,$3,'PREPARED',$4,$5,$6)",
        [user.id,scannedUrl,issueId,repo,path,Number(pr.number)||null]
      );
    }

    return NextResponse.json({success:true,summary:generated.summary,repository:repo,path,branch,pr:{number:pr.number,url:pr.html_url,title:pr.title},creditsCharged:GITHUB_FIX_COST,creditsRemaining});
  }catch(error){ return NextResponse.json({error:error instanceof Error?error.message:"GitHub fix mislukt."},{status:500}); }
}
